import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import native from '../index.cjs'
import type { Accounts } from '../plugin/accounts.ts'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import { Operations } from '../plugin/operations.ts'
import { sessionRecord } from './session-fixture.mts'

test('DSH session identity survives a restored header and fresh adapters, while standalone calls omit it', async () => {
  const ctx = new Context()
  const llm = ctx.plugin(LlmRuntime)
  await llm.await()
  const record = sessionRecord()
  const accounts = { selected: async () => record } as unknown as Accounts
  const session = Session.create(SessionId('synthetic-cache-session'))
  const header = JSON.parse(JSON.stringify(session.header))
  const restored = Session.create(SessionId(header.id), [], header)
  assert.equal(restored.id, session.id)
  const observed: (string | undefined)[] = []
  try {
    for (const id of [session.id, restored.id, SessionId('synthetic-fork'), undefined]) {
      const client = new native.ChatGptClient({})
      client.streamResponse = (_record, json) => {
        const request = JSON.parse(json)
        observed.push(request.sessionId)
        assert.equal(Object.hasOwn(request, 'sessionId'), id !== undefined)
        return new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'finish', reason: { kind: 'stop' } })
            controller.close()
          },
        })
      }
      const operations = new Operations()
      const adapter = new ChatGptAdapter(client, accounts, operations)
      adapter.listModels = async () => [{ id: 'test', name: 'Test', provider: 'openai-codex' }]
      const unregister = ctx.llm.registerAdapter(['openai-codex'], adapter)
      try {
        for await (const chunk of ctx.llm.stream({
          provider: 'openai-codex',
          model: 'test',
          sessionId: id,
          messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        }))
          assert.equal(chunk.type, 'finish')
      } finally {
        unregister()
        operations.dispose()
      }
    }
    assert.deepEqual(observed, [session.id, session.id, 'synthetic-fork', undefined])
  } finally {
    await llm.dispose()
  }
})
