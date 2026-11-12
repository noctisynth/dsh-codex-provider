import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import {
  createMessage,
  type GenerateOptions,
  LlmRuntime,
  type ToolHistory,
  type ToolSchema,
} from '@deepseek-ai/dsh-llm'
import native from '../index.cjs'
import type { Accounts } from '../plugin/accounts.ts'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import { Operations } from '../plugin/operations.ts'
import { sessionRecord } from './session-fixture.mts'

const provider = 'openai-codex'
const toolA: ToolSchema = { name: 'A', description: 'Initial tool', parameters: { type: 'object' } }
const toolB: ToolSchema = { name: 'B', description: 'Added tool', parameters: { type: 'object' } }
const initialSystem = createMessage({
  role: 'system',
  source: { kind: 'system-prompt' },
  content: [{ type: 'text', text: 'Initial application instructions' }],
})
const user = createMessage({
  role: 'user',
  source: { kind: 'user' },
  content: [{ type: 'text', text: 'Synthetic request' }],
})
const addition = createMessage({
  role: 'developer',
  source: { kind: 'user' },
  content: [{ type: 'tool-addition', toolName: 'B' }],
})
const updatedSystem = createMessage({
  role: 'system',
  source: { kind: 'system-prompt' },
  content: [{ type: 'text', text: 'Complete updated application instructions' }],
})
const messages = [initialSystem, user, addition, updatedSystem]
const history: ToolHistory = {
  tools: [toolA],
  updates: [{ messageId: addition.id, additions: [toolB] }],
}

type ObservedRequest = GenerateOptions<string> & {
  systemPromptUpdate: boolean
  toolUpdates: boolean
  cachePreservingReasoning: boolean
  webSearch: boolean
  imageDetail: string
}

async function fixture() {
  const siwc = sessionRecord()
  const legacy = (method: string) =>
    JSON.stringify({
      ...JSON.parse(siwc),
      login_method: method,
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
      account_id: 'synthetic-workspace',
      scopes: [],
    })
  let record = legacy('codex-browser')
  const ctx = new Context()
  const llm = ctx.plugin(LlmRuntime)
  await llm.await()
  const operations = new Operations()
  const client = new native.ChatGptClient({})
  let catalogReads = 0
  client.listModels = async (selected) => {
    catalogReads++
    const supported = native.describeSession(selected).loginMethod !== 'siwc'
    return [
      ...['gpt-5.6-sol', 'future-model-slug'].map((id) => ({
        id,
        name: id,
        supportsSystemMessageUpdates: supported,
        supportsAdditionalTools: supported,
      })),
      { id: 'gpt-6.1-sol', name: 'Missing catalog mode' },
      {
        id: 'disabled-mode',
        name: 'Explicit false',
        supportsSystemMessageUpdates: false,
        supportsAdditionalTools: false,
      },
      {
        id: 'system-only',
        name: 'Independent system capability',
        supportsSystemMessageUpdates: supported,
        supportsAdditionalTools: false,
      },
      {
        id: 'tools-only',
        name: 'Independent tool capability',
        supportsSystemMessageUpdates: false,
        supportsAdditionalTools: supported,
      },
    ]
  }
  const requests: ObservedRequest[] = []
  client.streamResponse = (_record, json) => {
    requests.push(JSON.parse(json))
    return new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'finish', reason: { kind: 'stop' } })
        controller.close()
      },
    })
  }
  const accounts = {
    selected: async () => record,
    read: async () => ({ active: native.describeSession(record).id, accounts: [record] }),
  } as unknown as Accounts
  const adapter = new ChatGptAdapter(client, accounts, operations)
  const unregister = ctx.llm.registerAdapter([provider], adapter)
  return {
    adapter,
    requests,
    catalogReads: () => catalogReads,
    select(method: 'siwc' | 'codex-browser' | 'codex-device', invalidate = true) {
      record = method === 'siwc' ? siwc : legacy(method)
      if (invalidate) adapter.invalidateCatalog()
    },
    async send(overrides: Partial<GenerateOptions> = {}) {
      for await (const chunk of ctx.llm.stream({
        provider,
        model: 'future-model-slug',
        messages,
        tools: [toolA, toolB],
        toolHistory: history,
        ...overrides,
      })) {
        assert.equal(chunk.type, 'finish')
        if (chunk.type === 'finish') assert.deepEqual(chunk.reason, { kind: 'stop' })
      }
      const request = requests.at(-1)
      assert.ok(request)
      return request
    },
    async close() {
      unregister()
      operations.dispose()
      await llm.dispose()
    },
    llm: ctx.llm,
  }
}

test('formal runtime preserves history positions, deferred additions, removal and schema reset', async () => {
  const f = await fixture()
  try {
    const metadata = await f.llm.resolveModelInfo(provider, 'future-model-slug')
    assert.equal(metadata.systemPromptUpdate, 'in-history')
    assert.equal(metadata.toolUpdate, 'addition-only')
    const initial = await f.send({
      messages: [initialSystem, user],
      tools: [toolA],
      toolHistory: { tools: [toolA], updates: [] },
    })
    assert.deepEqual(initial.tools, [toolA])
    const added = await f.send({ system: 'Static one-shot instruction' })
    assert.equal(added.systemPromptUpdate, true)
    assert.equal(added.toolUpdates, true)
    assert.deepEqual(added.tools, [toolA, { ...toolB, deferLoading: true }])
    assert.deepEqual(added.messages, messages)
    assert.deepEqual(added.messages[2].content, [{ type: 'tool-addition', toolName: 'B' }])
    assert.equal(added.system, 'Static one-shot instruction')
    assert.equal(added.cachePreservingReasoning, false)
    assert.equal(added.webSearch, false)
    assert.equal(added.imageDetail, 'auto')
    assert.deepEqual(await f.send({ system: 'Static one-shot instruction' }), added)

    const removal = createMessage({
      role: 'developer',
      source: { kind: 'user' },
      content: [{ type: 'tool-removal', toolName: 'B' }],
    })
    const removed = await f.send({
      tools: [toolA],
      messages: [...messages, removal],
      toolHistory: {
        tools: [toolA],
        updates: [...history.updates, { messageId: removal.id, additions: [] }],
      },
    })
    assert.deepEqual(removed.tools, [toolA])
    assert.deepEqual(removed.messages, [initialSystem, user, updatedSystem])
    const revisedB = {
      ...toolB,
      parameters: { type: 'object', properties: { revision: { type: 'number' } } },
    }
    const reset = await f.send({
      tools: [toolA, revisedB],
      toolHistory: { tools: [toolA, revisedB], updates: [] },
    })
    assert.deepEqual(reset.tools, [toolA, revisedB])
    assert.deepEqual(reset.messages, [initialSystem, user, updatedSystem])
    assert.equal(reset.tools?.[1].deferLoading, undefined)
    assert.equal(f.catalogReads(), 1)
  } finally {
    await f.close()
  }
})

test('route and separate catalog capabilities gate all models and disable auxiliary updates', async () => {
  const f = await fixture()
  try {
    for (const method of ['codex-browser', 'codex-device'] as const) {
      f.select(method)
      for (const model of ['gpt-5.6-sol', 'future-model-slug']) {
        const metadata = await f.llm.resolveModelInfo(provider, model)
        assert.equal(metadata.systemPromptUpdate, 'in-history')
        assert.equal(metadata.toolUpdate, 'addition-only')
        const request = await f.send({ model })
        assert.equal(request.systemPromptUpdate, true)
        assert.equal(request.toolUpdates, true)
      }
    }
    for (const model of ['gpt-6.1-sol', 'disabled-mode']) {
      const metadata = await f.llm.resolveModelInfo(provider, model)
      assert.equal(metadata.systemPromptUpdate, undefined)
      assert.equal(metadata.toolUpdate, undefined)
      const request = await f.send({ model })
      assert.equal(request.systemPromptUpdate, false)
      assert.equal(request.toolUpdates, false)
      assert.deepEqual(request.tools, [toolA, toolB])
      assert.deepEqual(request.messages, [initialSystem, user, updatedSystem])
    }
    for (const [model, system, tools] of [
      ['system-only', true, false],
      ['tools-only', false, true],
    ] as const) {
      const metadata = await f.llm.resolveModelInfo(provider, model)
      assert.equal(metadata.systemPromptUpdate, system ? 'in-history' : undefined)
      assert.equal(metadata.toolUpdate, tools ? 'addition-only' : undefined)
      const request = await f.send({ model })
      assert.equal(request.systemPromptUpdate, system)
      assert.equal(request.toolUpdates, tools)
    }

    // A stale legacy catalog cannot enable updates on the actual selected SIWC route.
    f.select('siwc', false)
    const siwc = await f.send()
    assert.equal(siwc.systemPromptUpdate, false)
    assert.equal(siwc.toolUpdates, false)
    assert.deepEqual(siwc.tools, [toolA, toolB])
    assert.deepEqual(siwc.messages, [initialSystem, user, updatedSystem])
    f.select('siwc')
    const metadata = await f.llm.resolveModelInfo(provider, 'future-model-slug')
    assert.equal(metadata.systemPromptUpdate, undefined)
    assert.equal(metadata.toolUpdate, undefined)

    f.select('codex-browser')
    const before = f.catalogReads()
    for (const purpose of ['auto-review', 'compaction', 'title', 'web-search']) {
      for await (const _ of f.adapter.stream({
        provider,
        model: 'future-model-slug',
        purpose,
        messages,
        tools: [toolA, { ...toolB, deferLoading: true }],
        toolHistory: history,
      })) {
        /* consume without resolving the catalog for auxiliary requests */
      }
      const request = f.requests.at(-1)
      assert.ok(request)
      assert.equal(request.systemPromptUpdate, false)
      assert.equal(request.toolUpdates, false)
      assert.equal(request.cachePreservingReasoning, false)
      assert.deepEqual(request.tools, [toolA, toolB])
      assert.deepEqual(request.messages, [initialSystem, user, updatedSystem])
    }
    assert.equal(f.catalogReads(), before)
  } finally {
    await f.close()
  }
})
