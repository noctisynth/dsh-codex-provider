import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import { Accounts } from '../plugin/accounts.ts'
import { Context, Service } from '@deepseek-ai/cordis'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { Operations } from '../plugin/operations.ts'
import { ChatGptClient, describeSession } from '../index.cjs'
import { LlmRuntime, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { setImmediate } from 'node:timers/promises'
import { sessionRecord } from './session-fixture.mts'

test('catalog metadata drives effort selection and shares reads across lookup and cancellation', async () => {
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
  const llm = ctx.plugin(LlmRuntime)
  await Promise.all([credentials.await(), llm.await()])
  const client = new ChatGptClient({})
  let requests = 0
  let fail = false
  let gate: Promise<void> | undefined
  client.listModels = async () => {
    requests++
    if (fail) throw new Error('catalog unavailable')
    if (gate) await gate
    return [{ id: 'model-a', name: 'Model A', reasoning: {
      defaultEffort: 'low', efforts: [{ id: 'low', name: 'low' }, { id: 'high', name: 'high' }],
    } }, { id: 'model-b', name: 'Model B' }]
  }
  const operations = new Operations()
  const accounts = new Accounts(ctx.credentials, client, operations)
  const adapter = new ChatGptAdapter(client, accounts, operations)
  const registration = ctx.llm.registerAdapter(['openai-codex'], adapter)
  try {
    const [first, second] = await Promise.all([adapter.listModels(), adapter.listModels()])
    assert.deepEqual(first, second)
    assert.deepEqual(first.map(model => model.id), ['model-a', 'model-b'])
    await adapter.listModels()
    const route = { provider: 'openai-codex', model: 'model-a' }
    assert.equal((await ctx.llm.resolveModelInfo(route.provider, route.model)).reasoning?.efforts[1].id, 'high')
    assert.equal((await ctx.llm.resolveCallConfig(route)).reasoningEffort, 'low')
    assert.equal((await ctx.llm.resolveCallConfig({ ...route, reasoningEffort: ReasoningEffortId('high') })).reasoningEffort, 'high')
    assert.equal((await ctx.llm.resolveModelInfo(route.provider, 'model-b')).reasoning, undefined)
    await assert.rejects(ctx.llm.resolveCallConfig({ ...route, reasoningEffort: ReasoningEffortId('invented') }), /reasoning|effort/i)
    assert.equal(requests, 1)
    adapter.invalidateCatalog()
    fail = true
    await assert.rejects(adapter.listModels(), /catalog unavailable/)
    fail = false
    await adapter.listModels()
    assert.equal(requests, 3)
    adapter.invalidateCatalog()
    let resume: (() => void) | undefined
    gate = new Promise(resolve => { resume = resolve })
    const abort = new AbortController()
    const pending = adapter.resolveModel(route.provider, route.model, abort.signal)
    await setImmediate()
    abort.abort(new Error('lookup cancelled'))
    await assert.rejects(pending, /lookup cancelled/)
    resume?.()
    assert.equal((await adapter.listModels())[0].id, 'model-a')
    assert.equal(requests, 4)
  } finally { registration(); operations.dispose(); await llm.dispose(); await credentials.dispose() }
})
