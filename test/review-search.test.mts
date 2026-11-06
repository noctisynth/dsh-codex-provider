import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { ApprovalService } from '@deepseek-ai/dsh-user-approval'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import { LlmRuntime, LlmAdapter, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { ChatGptClient, describeSession } from '../index.cjs'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import type { Accounts } from '../plugin/accounts.ts'
import { Operations } from '../plugin/operations.ts'
import { mountApproval } from '../plugin/approval.ts'
import { reviewContext } from '../plugin/review-context.ts'
import { chatGptSearch } from '../plugin/web-search.ts'
import { sessionRecord } from './session-fixture.mts'

function fixture(provider: string) {
  const events: { seq: number; type: string; data: Record<string, unknown> }[] = [
    { seq: 0, type: 'user/message', data: {} },
    { seq: 1, type: 'step/start', data: {} },
    { seq: 2, type: 'tool/call', data: { callId: 'pending', name: 'bash', arguments: '{"command":"Get-ChildItem"}' } },
  ]
  const tool = { name: 'bash', description: 'Run a command', parameters: { type: 'object' } }
  const session = {
    header: { origin: 'user' }, surface: { nodes: [0] },
    snapshotEvents: () => events, requestHeader: () => ({ config: { provider, model: 'parent-model' }, tools: [tool] }),
    eventAt: (seq: number) => events[seq], isOwnSeq: () => true,
    deriveEventMessage: () => ({ role: 'user', source: { kind: 'user', rpcId: 'synthetic-user' }, content: [{ type: 'text', text: 'Inspect workspace filenames. Do not delete anything.' }] }),
    append(type: string, data: Record<string, unknown>) { events.push({ seq: events.length, type, data }) },
  }
  return { events, tool, request: { agent: { session }, toolName: 'bash', callId: 'pending', reason: { en: 'Read filenames' } } }
}

test('host approval uses independent ChatGPT routing, exact pending context and closed failure outcomes', async () => {
  const ctx = new Context()
  const llm = ctx.plugin(LlmRuntime); await llm.await()
  let enabled = true, preset = 'workspace-write', policy = 'ask', answer = '{"risk":"low","decision":"allow"}'
  const calls: GenerateOptions[] = []
  class Reviewer extends LlmAdapter {
    providerInfo() { return { id: 'openai-codex', name: 'ChatGPT' } }
    async listModels() { return [{ id: 'codex-auto-review', name: 'Reviewer', provider: 'openai-codex' }] }
    async *stream(options: GenerateOptions) {
      calls.push(options)
      yield { type: 'block-start', index: 0, blockType: 'text' } as const
      yield { type: 'text-delta', index: 0, text: answer } as const
      yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } } as const
      yield { type: 'finish', reason: { kind: 'stop' } } as const
    }
  }
  ctx.provide('permissionPresets', { current: () => preset } as never)
  ctx.provide('workingDirectory', { ensure: async () => 'synthetic-workspace' } as never)
  ctx.provide('tools', { schemas: () => [fixture('deepseek').tool] } as never)
  const approval = new ApprovalService(ctx, { policy: 'ask' })
  Object.assign(approval, { approvalProjectionHandle: { stateOf: () => ({ turnOpen: true, policy }) } })
  const off = ctx.llm.registerAdapter(['openai-codex'], new Reviewer())
  const manual = ctx.on('approval/request', async () => 'rejected')
  const review = ctx.plugin({ inject: ['llm', 'permissionPresets', 'tools', 'workingDirectory'], apply(scope: Context) { mountApproval(scope, { reviewModel: async () => ({ id: 'codex-auto-review' }) } as ChatGptAdapter, () => enabled) } })
  await review.await()
  try {
    for (const provider of ['deepseek', 'minimax']) {
      const source = fixture(provider)
      assert.equal(await approval.request(source.request as never), 'allowed-once')
      assert.deepEqual(source.events.slice(-2).map(event => event.type), ['approval/asked', 'approval/decided'])
      assert.equal(preset, 'workspace-write')
      assert.equal(calls.at(-1)?.model, 'codex-auto-review')
      assert.equal(calls.at(-1)?.purpose, 'auto-review')
      assert.match(JSON.stringify(calls.at(-1)?.messages), /user-instruction/)
    }
    answer = '{"risk":"medium","decision":"deny","reason":"Unauthorized deletion"}'
    assert.equal(await approval.request(fixture('deepseek').request as never), 'rejected')
    answer = '{"risk":"high","decision":"allow"}'
    assert.equal(await approval.request(fixture('deepseek').request as never), 'unavailable')
    const count = calls.length
    policy = 'never'
    assert.equal(await approval.request(fixture('deepseek').request as never), 'rejected')
    policy = 'ask'; enabled = false
    assert.equal(await approval.request(fixture('deepseek').request as never), 'rejected')
    enabled = true; preset = 'auto'
    assert.equal(await approval.request(fixture('deepseek').request as never), 'rejected')
    preset = 'workspace-write'
    const abort = new AbortController(); abort.abort()
    assert.equal(await approval.request({ ...fixture('deepseek').request, signal: abort.signal } as never), 'cancelled')
    assert.equal(calls.length, count)
    const missing = fixture('deepseek'); missing.request.callId = 'old-call'
    assert.equal(await approval.request(missing.request as never), 'unavailable')
    const ptc = fixture('minimax')
    ptc.events[2] = { seq: 2, type: 'tool/ptc-dispatch-start', data: { subCallId: 'pending', name: 'bash', arguments: { command: 'Get-ChildItem' } } }
    assert.deepEqual((await reviewContext(ctx, ptc.request as never, new AbortController().signal)).pending.arguments, { command: 'Get-ChildItem' })
    ptc.events.push({ seq: 3, type: 'tool/ptc-dispatch', data: { subCallId: 'pending' } })
    await assert.rejects(reviewContext(ctx, ptc.request as never, new AbortController().signal), /已经完成/)
    await review.dispose(); answer = '{"risk":"low","decision":"allow"}'
    assert.equal(await approval.request(fixture('deepseek').request as never), 'rejected')
  } finally { await review.dispose(); manual(); off(); await llm.dispose() }
})

test('search modes isolate auxiliary requests and shared search preserves completed sources', async () => {
  let mode: 'off' | 'chatgpt' | 'all' = 'off'
  const record = sessionRecord(), account = describeSession(record)
  const accounts = { read: async () => ({ active: account.clientId, accounts: [record] }), selected: async () => record } as unknown as Accounts
  const client = new ChatGptClient({}), operations = new Operations()
  const adapter = new ChatGptAdapter(client, accounts, operations, undefined, () => mode)
  const requests: Record<string, unknown>[] = []
  client.listModels = async () => [{ id: 'visible', name: 'Visible' }, { id: 'codex-auto-review', name: 'Reviewer', hidden: true }]
  let searched = true
  client.streamResponse = (_record, json) => {
    requests.push(JSON.parse(json))
    return new ReadableStream({ start(controller) {
      controller.enqueue({ type: 'block-start', index: 0, blockType: 'text' })
      controller.enqueue({ type: 'block-end', index: 0, block: { type: 'text', text: 'Search answer' } })
      controller.enqueue({ type: 'finish', reason: { kind: 'stop' }, replayState: { response: { trailing: searched ? [{ type: 'web_search_call', status: 'completed', action: { sources: [{ url: 'https://example.com/', title: 'Source' }, { url: 'javascript:bad' }, { url: 'https://example.com/' }] } }] : [] } } })
      controller.close()
    } })
  }
  try {
    assert.deepEqual((await adapter.listModels()).map(model => model.id), ['visible'])
    assert.equal((await adapter.reviewModel()).id, 'codex-auto-review')
    for (mode of ['off', 'chatgpt', 'all'] as const) {
      for await (const _ of adapter.stream({ provider: 'openai-codex', model: 'visible', messages: [] })) {}
      assert.equal(requests.at(-1)?.webSearch, mode !== 'off')
      for await (const _ of adapter.stream({ provider: 'openai-codex', model: 'visible', messages: [], purpose: 'auto-review' })) {}
      assert.equal(requests.at(-1)?.webSearch, false)
    }
    const search = chatGptSearch(adapter, () => mode === 'all')
    assert.equal(await search.ready!(undefined), true)
    const result = await search.search({ query: 'synthetic search' }, new AbortController().signal)
    assert.equal(result.content, 'Search answer')
    assert.deepEqual(result.sources, [{ url: 'https://example.com/', title: 'Source' }])
    assert.equal(requests.at(-1)?.searchOnly, true)
    const ctx = new Context(), web = ctx.plugin(WebRuntime, { searchProvider: 'chatgpt' })
    await web.await()
    const unregister = ctx.web.registerSearchProvider(search)
    try {
      const capped = await ctx.web.search({ query: 'synthetic search', maxResults: 0 }, new AbortController().signal)
      assert.deepEqual(capped.sources, [])
      assert.equal(capped.truncated, true)
    } finally { unregister(); await web.dispose() }
    searched = false
    await assert.rejects(search.search({ query: 'synthetic search' }, new AbortController().signal), /未执行/)
    mode = 'off'
    await assert.rejects(search.search({ query: 'synthetic search' }, new AbortController().signal), /未开启/)
  } finally { operations.dispose() }
})
