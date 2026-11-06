import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import { Accounts } from '../plugin/accounts.ts'
import { Context, Service } from '@deepseek-ai/cordis'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { Operations } from '../plugin/operations.ts'
import { ChatGptClient, describeSession } from '../index.cjs'
import { sessionRecord } from './session-fixture.mts'

test('model checks share the account catalog until credentials change, and a failed load can be retried', async () => {
  const record = sessionRecord()
  const account = describeSession(record)
  let stored: CredentialRecord = { kind: 'grant', payload: { hostId: 'fixture', active: account.clientId, accounts: [record] } }
  class Credentials extends Service {
    constructor(ctx: Context) { super(ctx, 'credentials') }
    async readRecord() { return stored }
    async modifyRecord(_key: CredentialKey, mutate: (value: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) {
      stored = await mutate(stored) ?? stored
      return stored
    }
  }
  const ctx = new Context()
  const credentials = ctx.plugin(Credentials)
  await credentials.await()
  const client = new ChatGptClient({})
  let requests = 0
  let fail = false
  client.listModels = async () => {
    requests++
    if (fail) throw new Error('catalog unavailable')
    return [{ id: 'model-a', name: 'Model A' }, { id: 'model-b', name: 'Model B' }]
  }
  const operations = new Operations()
  const accounts = new Accounts(ctx.credentials, client, operations)
  const adapter = new ChatGptAdapter(client, accounts, operations)
  try {
    const [first, second] = await Promise.all([adapter.listModels(), adapter.listModels()])
    assert.deepEqual(first, second)
    assert.deepEqual(first.map(model => model.id), ['model-a', 'model-b'])
    await adapter.listModels()
    assert.equal(requests, 1)
    adapter.invalidateCatalog()
    fail = true
    await assert.rejects(adapter.listModels(), /catalog unavailable/)
    fail = false
    await adapter.listModels()
    assert.equal(requests, 3)
  } finally { operations.dispose(); await credentials.dispose() }
})
