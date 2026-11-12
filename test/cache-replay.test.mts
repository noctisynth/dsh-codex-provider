import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import {
  AssistantStreamAccumulator,
  BlockAssembler,
  LlmRuntime,
  type ReplayEnvelope,
  type StreamChunk,
  ToolCallId,
} from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import native from '../index.cjs'
import type { Accounts } from '../plugin/accounts.ts'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import { Operations } from '../plugin/operations.ts'
import { sessionRecord } from './session-fixture.mts'

// Native mapping/digest validation is covered by Rust; this checks the real host's opaque round trip.
test('ordered response replay survives host assembly, session restoration and adapter projection', async () => {
  const callId = ToolCallId('synthetic-call')
  const tool = { type: 'tool-call', id: callId, name: 'lookup', arguments: '{ "key": 1 }' } as const
  const reasoning = { type: 'reasoning', text: 'Synthetic summary' } as const
  const text = { type: 'text', text: 'Synthetic answer' } as const
  const replay: ReplayEnvelope = {
    response: {
      format: 'dsh-codex-provider/responses-v2',
      contentDigest: 'synthetic-digest',
      items: [
        { type: 'reasoning', id: 'rs', summary: [], encrypted_content: 'synthetic-opaque' },
        {
          type: 'function_call',
          id: 'fc',
          call_id: callId,
          name: tool.name,
          arguments: tool.arguments,
        },
        { type: 'message', id: 'msg', phase: 'final_answer', role: 'assistant', content: [] },
      ],
    },
  }
  const chunks: StreamChunk[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'tool-call-delta',
      index: 0,
      id: callId,
      name: tool.name,
      argumentsDelta: tool.arguments,
    },
    { type: 'block-end', index: 0, block: tool },
    { type: 'block-start', index: 1, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 1, text: reasoning.text },
    { type: 'block-end', index: 1, block: reasoning },
    { type: 'block-start', index: 2, blockType: 'text' },
    { type: 'text-delta', index: 2, text: text.text },
    { type: 'block-end', index: 2, block: text },
    { type: 'finish', reason: { kind: 'tool-calls' }, replayState: replay },
  ]
  const assembler = new BlockAssembler()
  const accumulator = new AssistantStreamAccumulator()
  for (const [time, chunk] of chunks.entries())
    assembler.push(accumulator.push({ time, chunk }).chunk)
  assert.deepEqual(assembler.blocks(), [tool, reasoning, text])
  assert.deepEqual(assembler.replayState, replay)
  const session = Session.create(SessionId('synthetic-replay-session'))
  const event = session.append(
    'assistant/message',
    {
      turn: 1,
      step: 1,
      message: assembler.message({
        provider: 'openai-codex',
        model: 'test',
        replayState: assembler.replayState,
      }),
      stream: [...accumulator.snapshot()],
    },
    { surfaceOp: 'append' },
  )
  const restored = Session.create(
    session.id,
    JSON.parse(JSON.stringify([event])),
    JSON.parse(JSON.stringify(session.header)),
  )
  const messages = restored.deriveMessages()
  const restoredMessage = messages[0]
  assert.ok(restoredMessage?.role === 'assistant')
  assert.deepEqual(restoredMessage.content, [tool, reasoning, text])
  assert.deepEqual(restoredMessage.source.replayState, replay)

  const ctx = new Context()
  const llm = ctx.plugin(LlmRuntime)
  await llm.await()
  const operations = new Operations()
  const client = new native.ChatGptClient({})
  let observed = false
  client.streamResponse = (_record, json) => {
    const request = JSON.parse(json)
    assert.deepEqual(request.messages[0].content, [tool, reasoning, text])
    assert.deepEqual(request.messages[0].source.replayState, replay)
    observed = true
    return new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'finish', reason: { kind: 'stop' } })
        controller.close()
      },
    })
  }
  const adapter = new ChatGptAdapter(
    client,
    { selected: async () => sessionRecord() } as unknown as Accounts,
    operations,
  )
  adapter.listModels = async () => [{ id: 'test', name: 'Test', provider: 'openai-codex' }]
  const off = ctx.llm.registerAdapter(['openai-codex'], adapter)
  try {
    for await (const chunk of ctx.llm.stream({
      provider: 'openai-codex',
      model: 'test',
      sessionId: restored.id,
      messages,
    }))
      assert.equal(chunk.type, 'finish')
    assert.equal(observed, true)
  } finally {
    off()
    operations.dispose()
    await llm.dispose()
  }
})
