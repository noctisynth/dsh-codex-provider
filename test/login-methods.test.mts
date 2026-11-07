import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AuthorizationDeclinedError,
  type AuthorizationNotice,
  type AuthorizationSession,
} from '@deepseek-ai/dsh-authorization'
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import native, { Cancellation, ChatGptClient, createHostId, type LoginAttempt } from '../index.cjs'
import { Accounts } from '../plugin/accounts.ts'
import { Operations } from '../plugin/operations.ts'
import { sessionRecord } from './session-fixture.mts'

test('shared authorization keeps SIWC separate while browser and device replace one legacy account', async () => {
  const siwc = sessionRecord()
  let record: CredentialRecord = {
    kind: 'grant',
    payload: { hostId: createHostId(), accounts: [] },
  }
  let writes = 0
  const credentials = {
    readRecord: async () => record,
    modifyRecord: async (
      _key: unknown,
      mutate: (current: CredentialRecord) => Promise<CredentialRecord | undefined>,
    ) => {
      writes++
      record = (await mutate(record)) ?? record
      return record
    },
  } as unknown as CredentialProvider
  const client = new ChatGptClient({})
  const operations = new Operations()
  const opened: string[] = []
  const notices: AuthorizationNotice[] = []
  const accounts = new Accounts(credentials, client, operations, async (url) => {
    opened.push(url)
  })
  let method = 'siwc'
  let fail = false
  client.beginLogin = async (_host, _previous, _cancellation, selected) => {
    assert.equal(selected, method)
    const opaque =
      method === 'siwc'
        ? siwc
        : JSON.stringify({
            ...JSON.parse(siwc),
            login_method: method,
            client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
            account_id: 'synthetic-workspace',
            access_token: `replacement-${method}`,
          })
    return {
      authorizationUrl:
        method === 'codex-device'
          ? 'https://auth.openai.com/codex/device'
          : 'https://example.invalid/authorize',
      userCode: method === 'codex-device' ? 'TEST-1234' : undefined,
      canRetry: false,
      complete: async () => {
        if (fail) throw new Error('synthetic exchange failure')
        return { record: opaque, account: native.describeSession(opaque) }
      },
      cancel() {},
    } as unknown as LoginAttempt
  }
  const authorize = () =>
    accounts.authorize({
      method: 'oauth',
      async commit() {},
      signal: new AbortController().signal,
      prompt: async (prompt) => (prompt.message === 'Choose a sign-in method' ? method : 'add'),
      notify: (notice) => {
        notices.push(notice)
      },
    } as AuthorizationSession)
  await authorize()
  assert.equal((await accounts.summary()).accounts.length, 1)
  method = 'codex-browser'
  await authorize()
  const browser = await accounts.summary()
  assert.equal(browser.accounts.length, 2)
  const legacyId = browser.active
  method = 'codex-device'
  await authorize()
  const device = await accounts.summary()
  assert.equal(device.accounts.length, 2)
  assert.equal(device.active, legacyId)
  assert.equal(
    device.accounts.find((account) => account.id === legacyId)?.loginMethod,
    'codex-device',
  )
  const saved = await accounts.read()
  assert.ok(saved?.accounts.includes(siwc))
  assert.ok(
    notices.some(
      (notice) =>
        notice.code === 'TEST-1234' && notice.url === 'https://auth.openai.com/codex/device',
    ),
  )
  assert.equal(opened.length, 3)
  const before = JSON.stringify(record)
  fail = true
  await assert.rejects(authorize(), /synthetic exchange failure/)
  assert.equal(JSON.stringify(record), before)
  assert.ok(legacyId)
  await accounts.select(legacyId)
  const logout = await accounts.logout(legacyId, new Cancellation())
  assert.equal(logout.localOnly, true)
  assert.equal(logout.revocationConfirmed, false)
  assert.equal(
    (await accounts.summary()).accounts.find((account) => account.id === legacyId)?.hasCredentials,
    false,
  )
  assert.ok((await accounts.read())?.accounts.includes(siwc))
  const beforeBack = JSON.stringify(record)
  const writesBeforeBack = writes
  const openedBeforeBack = opened.length
  client.beginLogin = async () => assert.fail('Returning must not start native sign-in')
  let prompts = 0
  await assert.rejects(
    accounts.authorize({
      method: 'oauth',
      signal: new AbortController().signal,
      async commit() {},
      notify() {},
      async prompt(request) {
        assert.equal(request.kind, 'select')
        prompts++
        if (prompts === 1) return 'add'
        if (prompts === 2) {
          assert.ok(request.options.some((option) => option.id === 'back'))
          return 'back'
        }
        assert.equal(request.message, 'Choose an account')
        throw new AuthorizationDeclinedError()
      },
    }),
    AuthorizationDeclinedError,
  )
  assert.equal(prompts, 3)
  assert.equal(JSON.stringify(record), beforeBack)
  assert.equal(writes, writesBeforeBack)
  assert.equal(opened.length, openedBeforeBack)
  record = { kind: 'grant', payload: { hostId: createHostId(), accounts: [] } }
  const empty = JSON.stringify(record)
  await assert.rejects(
    accounts.authorize({
      method: 'oauth',
      signal: new AbortController().signal,
      async commit() {},
      notify() {},
      prompt: async () => 'back',
    }),
    AuthorizationDeclinedError,
  )
  assert.equal(JSON.stringify(record), empty)
  assert.equal(writes, writesBeforeBack)
  assert.equal(opened.length, openedBeforeBack)
  operations.dispose()
})
