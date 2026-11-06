import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { Context, Service } from '@deepseek-ai/cordis'
import type { CredentialRecord, CredentialKey } from '@deepseek-ai/dsh-credentials'
import { AuthorizationService } from '@deepseek-ai/dsh-authorization'
import { serverResponseSchema } from '@deepseek-ai/dsh-client-connection'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { AccountStatus } from '../shared/account-ui.ts'
import { Accounts, accountsKey } from '../plugin/accounts.ts'
import { mountAccountUi } from '../plugin/account-ui.ts'
import { Operations } from '../plugin/operations.ts'
import { ChatGptClient, createHostId } from '../index.cjs'
import { sessionRecord } from './session-fixture.mts'

test('the host UI derives optional avatar fallbacks, keeps credentials private and cancels authorization selection', async () => {
  const ctx = new Context()
  const opaque = JSON.stringify({
    ...JSON.parse(sessionRecord()),
    email: ' MyEmailAddress@example.com ',
    picture: 'https://example.invalid/avatar.png',
  })
  const withoutEmail = JSON.stringify({ ...JSON.parse(sessionRecord()), client_id: 'test-no-email', email: undefined })
  let record: CredentialRecord = { kind: 'grant', payload: { hostId: createHostId(), accounts: [opaque, withoutEmail] } }
  class Credentials extends Service {
    constructor(ctx: Context) { super(ctx, 'credentials') }
    async readRecord() { return record }
    async describeRecord() { return { configured: true, kind: 'grant', writable: true } }
    async modifyRecord(key: CredentialKey, mutate: (current: CredentialRecord) => Promise<CredentialRecord | undefined>) {
      record = await mutate(record) ?? record
      ctx.emit('credentials/record-updated', key)
      return record
    }
  }
  const routes = new Map<string, (request: Request) => Response | Promise<Response>>()
  ctx.provide('connection', { fetch: { register(route) {
    routes.set(route.path, route.fetch)
    return () => { routes.delete(route.path) }
  } } } as HostConnectionHandle)
  const credentials = ctx.plugin(Credentials)
  const authorization = ctx.plugin(AuthorizationService)
  await Promise.all([credentials.await(), authorization.await()])
  const flow = ctx.authorization.registerFlow({
    key: accountsKey, label: 'ChatGPT', methods: [{ id: 'oauth', label: 'Login' }],
    async run(session) {
      await session.prompt({ kind: 'select', message: 'Choose account', options: [{ id: 'add', label: 'Add account' }] })
      throw new Error('Cancelled selection must never continue')
    },
  })
  const operations = new Operations()
  let preferenceFailure: Error | undefined
  const mounted = ctx.plugin({
    inject: ['credentials', 'authorization', 'connection'],
    apply(child: Context) {
      mountAccountUi(child, new Accounts(child.credentials, new ChatGptClient({}), operations), operations, async () => { if (preferenceFailure) throw preferenceFailure })
    },
  })
  await mounted.await()
  async function rpc(action: string, payload: unknown = null) {
    const handler = routes.get(`/api/codex-provider/${action}`)
    assert.ok(handler)
    const response = await handler(new Request(`http://localhost/api/codex-provider/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'test', method: `codex-provider/${action}`, payload }),
    }))
    return serverResponseSchema.parse(await response.json()).result
  }
  preferenceFailure = Object.assign(new Error('synthetic-private-config-path'), { code: 'EPERM', syscall: 'rename' })
  const blocked = await rpc('preference', { key: 'codexReview', value: true })
  assert.ok(!blocked.ok)
  assert.equal(blocked.error.code, 'settings-file-unavailable')
  assert.match(blocked.error.message, /编辑器/)
  assert.doesNotMatch(JSON.stringify(blocked), /synthetic-private-config-path/)
  preferenceFailure = undefined
  try {
    const result = await rpc('status')
    assert.ok(result.ok)
    const accountSummary = (result.value as AccountStatus).accounts
    // The digest is Gravatar's published normalization test vector.
    assert.equal(accountSummary[0].gravatarPicture, 'https://gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee?s=96&d=404&r=g')
    assert.equal(accountSummary[0].picture, 'https://example.invalid/avatar.png')
    assert.equal(accountSummary[1].gravatarPicture, undefined)
    assert.deepEqual((record.payload as { accounts: string[] }).accounts, [opaque, withoutEmail])
    assert.equal(JSON.stringify(result).includes('access_token'), false)
    assert.equal(JSON.stringify(result).includes('refresh_token'), false)
    assert.equal(JSON.stringify(result).includes(opaque), false)
    assert.equal((await rpc('login')).ok, true)
    await setImmediate()
    const waiting = await rpc('status')
    assert.ok(waiting.ok)
    assert.equal((waiting.value as AccountStatus).login.prompt?.options[0].id, 'add')
    const invalid = await rpc('answer', { id: 'not-offered' })
    assert.equal(invalid.ok, false)
    assert.equal((await rpc('cancel')).ok, true)
    await setImmediate()
    const cancelled = await rpc('status')
    assert.ok(cancelled.ok)
    assert.equal((cancelled.value as AccountStatus).login.running, false)
    await mounted.dispose()
    assert.equal(routes.size, 0)
  } finally {
    await mounted.dispose()
    flow()
    await authorization.dispose()
    await credentials.dispose()
    operations.dispose()
  }
})
