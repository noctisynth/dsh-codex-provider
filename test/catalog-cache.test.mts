import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { Context, Service } from '@deepseek-ai/cordis'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { LlmRuntime, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { ChatGptClient, describeSession } from '../index.cjs'
import { Accounts } from '../plugin/accounts.ts'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import { Operations } from '../plugin/operations.ts'
import { sessionRecord } from './session-fixture.mts'

test('catalog metadata supplies capacity and efforts and shares reads across lookup and cancellation', async () => {
  const record = sessionRecord()
  const account = describeSession(record)
  let stored: CredentialRecord = {
    kind: 'grant',
    payload: { hostId: 'fixture', active: account.clientId, accounts: [record] },
  }
  class Credentials extends Service {
    constructor(ctx: Context) {
      super(ctx, 'credentials')
    }
    async readRecord() {
      return stored
    }
    async modifyRecord(
      _key: CredentialKey,
      mutate: (value: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
    ) {
      stored = (await mutate(stored)) ?? stored
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
    return [
      {
        id: 'model-a',
        name: 'Model A',
        contextWindow: 272000,
        reasoning: {
          defaultEffort: 'low',
          efforts: [
            ...['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((id) => ({
              id,
              name: id,
            })),
            {
              id: 'future-level',
              name: 'Future display name',
              description: 'Provider description',
            },
          ],
        },
      },
      { id: 'model-b', name: 'Model B' },
    ]
  }
  const operations = new Operations()
  const accounts = new Accounts(ctx.credentials, client, operations)
  const adapter = new ChatGptAdapter(client, accounts, operations)
  const registration = ctx.llm.registerAdapter(['openai-codex'], adapter)
  try {
    const [first, second] = await Promise.all([adapter.listModels(), adapter.listModels()])
    assert.deepEqual(first, second)
    assert.deepEqual(
      first.map((model) => model.id),
      ['model-a', 'model-b'],
    )
    assert.deepEqual(first[0].context, { contextWindow: 272000 })
    assert.equal(first[1].context, undefined)
    await adapter.listModels()
    const route = { provider: 'openai-codex', model: 'model-a' }
    const resolved = await ctx.llm.resolveModelInfo(route.provider, route.model)
    assert.deepEqual(resolved.context, { contextWindow: 272000 })
    const reasoning = resolved.reasoning
    assert.deepEqual(
      reasoning?.efforts.map(({ id, name }) => [id, name]),
      [
        ['none', '无'],
        ['minimal', '极低'],
        ['low', '轻度'],
        ['medium', '中'],
        ['high', '高'],
        ['xhigh', '极高'],
        ['max', 'Max'],
        ['future-level', 'Future display name'],
      ],
    )
    assert.equal(reasoning?.efforts.at(-1)?.description, 'Provider description')
    assert.equal((await ctx.llm.resolveCallConfig(route)).reasoningEffort, 'low')
    assert.equal(
      (await ctx.llm.resolveCallConfig({ ...route, reasoningEffort: ReasoningEffortId('high') }))
        .reasoningEffort,
      'high',
    )
    assert.equal(
      (await ctx.llm.resolveCallConfig({ ...route, reasoningEffort: ReasoningEffortId('max') }))
        .reasoningEffort,
      'max',
    )
    assert.equal((await ctx.llm.resolveModelInfo(route.provider, 'model-b')).reasoning, undefined)
    assert.equal((await ctx.llm.resolveModelInfo(route.provider, 'model-b')).context, undefined)
    await assert.rejects(
      ctx.llm.resolveCallConfig({ ...route, reasoningEffort: ReasoningEffortId('ultra') }),
      {
        code: 'UNSUPPORTED_REASONING_EFFORT',
        message:
          'provider "openai-codex" model "model-a" does not support reasoning effort "ultra"',
      },
    )
    assert.equal(requests, 1)
    adapter.invalidateCatalog()
    fail = true
    await assert.rejects(adapter.listModels(), /catalog unavailable/)
    fail = false
    await adapter.listModels()
    assert.equal(requests, 3)
    adapter.invalidateCatalog()
    let resume: (() => void) | undefined
    gate = new Promise((resolve) => {
      resume = resolve
    })
    const abort = new AbortController()
    const pending = adapter.resolveModel(route.provider, route.model, abort.signal)
    await setImmediate()
    abort.abort(new Error('lookup cancelled'))
    await assert.rejects(pending, /lookup cancelled/)
    resume?.()
    assert.equal((await adapter.listModels())[0].id, 'model-a')
    assert.equal(requests, 4)
  } finally {
    registration()
    operations.dispose()
    await llm.dispose()
    await credentials.dispose()
  }
})
