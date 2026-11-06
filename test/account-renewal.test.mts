import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { type TestContext, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import {
  LocalCredentialProvider,
  parseCredentialsDocument,
} from '@deepseek-ai/dsh-credentials-local'
import { Cancellation, ChatGptClient, describeSession } from '../index.cjs'
import { Accounts, accountsKey } from '../plugin/accounts.ts'
import { Operations } from '../plugin/operations.ts'
import { sessionRecord } from './session-fixture.mts'

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'codex-renewal-'))
  assert.equal(dirname(directory), resolve(tmpdir()))
  const filename = join(directory, 'credentials.yaml')
  const ctx = new Context()
  const mounted = ctx.plugin(LocalCredentialProvider, { path: filename, watch: false })
  await mounted.await()
  const client = new ChatGptClient({})
  const operations = new Operations()
  t.after(async () => {
    operations.dispose()
    await mounted.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  const record = sessionRecord()
  const original = JSON.parse(record)
  const other = JSON.stringify({ ...original, client_id: 'other-issued-client' })
  const vault = { hostId: original.host_id, active: original.client_id, accounts: [record, other] }
  await ctx.credentials.modifyRecord(accountsKey, async () => ({ kind: 'grant', payload: vault }))
  const accounts = new Accounts(ctx.credentials, client, operations)
  const readSaved = async () =>
    parseCredentialsDocument(await readFile(filename, 'utf8'), filename).records.get(accountsKey)
  return { ctx, client, accounts, record, original, other, readSaved }
}

test('terminal renewal persists signed-out state before rejection and reuses its registration for login', async (t) => {
  const { client, accounts, record, original, other, readSaved } = await setup(t)
  const cancellation = new Cancellation()
  cancellation.cancel()
  const cleared = await client.logoutSession(record, cancellation)
  let renewals = 0
  client.renewSession = async () => {
    renewals++
    return { record: cleared.record, account: describeSession(cleared.record) }
  }

  await assert.rejects(accounts.selected(new Cancellation()), { code: 'INVALID_CREDENTIAL' })
  const saved = await readSaved()
  assert.ok(saved?.kind === 'grant')
  const vault = saved.payload as { hostId: string; active: string; accounts: string[] }
  assert.equal(vault.active, original.client_id)
  assert.equal(vault.hostId, original.host_id)
  assert.equal(vault.accounts[1], other)
  const session = JSON.parse(vault.accounts[0])
  for (const field of ['access_token', 'refresh_token', 'id_token', 'nonce'])
    assert.equal(session[field], '')
  assert.equal(session.client_id, original.client_id)
  assert.equal(session.subject, original.subject)
  assert.equal((await accounts.summary()).accounts[0].hasCredentials, false)
  await assert.rejects(accounts.selected(new Cancellation()), { code: 'AUTH' })
  assert.equal(renewals, 1)

  const stopped = new Error('synthetic login boundary')
  client.beginLogin = async (hostId, previous) => {
    assert.equal(hostId, original.host_id)
    assert.ok(previous)
    assert.equal(describeSession(previous).clientId, original.client_id)
    assert.equal(describeSession(previous).hasCredentials, false)
    throw stopped
  }
  await assert.rejects(
    accounts.authorize({
      signal: new AbortController().signal,
      prompt: async () => original.client_id,
      notify() {},
    } as unknown as AuthorizationSession),
    (error) => error === stopped,
  )
})

test('temporary renewal failures and failed persistence leave stored credentials unchanged', async (t) => {
  const { ctx, client, accounts, record, readSaved } = await setup(t)
  const before = await readSaved()
  const unavailable = new Error('synthetic network failure')
  client.renewSession = async () => {
    throw unavailable
  }
  await assert.rejects(accounts.selected(new Cancellation()), (error) => error === unavailable)
  assert.deepEqual(await readSaved(), before)
  assert.equal((await accounts.summary()).accounts[0].hasCredentials, true)

  const cancellation = new Cancellation()
  cancellation.cancel()
  const cleared = await client.logoutSession(record, cancellation)
  client.renewSession = async () => ({
    record: cleared.record,
    account: describeSession(cleared.record),
  })
  const cannotSave = new Error('synthetic persistence failure')
  // Fail after the real provider executes the mutation, before it can commit a replacement.
  const modify = ctx.credentials.modifyRecord.bind(ctx.credentials)
  ctx.credentials.modifyRecord = (key, mutate) =>
    modify(key, async (current) => {
      await mutate(current)
      throw cannotSave
    })
  await assert.rejects(accounts.selected(new Cancellation()), (error) => error === cannotSave)
  assert.deepEqual(await readSaved(), before)
})
