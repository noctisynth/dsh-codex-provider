import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { ChatGptClient } from '../index.cjs'
import type { Accounts } from '../plugin/accounts.ts'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import { type ProviderErrorEvent, providerError } from '../plugin/errors.ts'
import { Operations } from '../plugin/operations.ts'
import { sessionRecord } from './session-fixture.mts'

test('native provider facts survive the adapter and real DSH failure normalization', async () => {
  const ctx = new Context()
  const llm = ctx.plugin(LlmRuntime)
  await llm.await()
  const client = new ChatGptClient({})
  const operations = new Operations()
  const accounts = { selected: async () => sessionRecord() } as unknown as Accounts
  const adapter = new ChatGptAdapter(client, accounts, operations)
  adapter.listModels = async () => [{ id: 'fixture', name: 'Fixture', provider: 'openai-codex' }]
  const registration = ctx.llm.registerAdapter(['openai-codex'], adapter)
  const scenarios: [ProviderErrorEvent['error'], string][] = [
    [
      {
        kind: 'api',
        status: 400,
        code: 'context_length_exceeded',
        param: 'input',
        message: 'Context exceeded',
        requestId: 'req-fixture',
      },
      'CONTEXT_WINDOW_EXCEEDED',
    ],
    [
      {
        kind: 'api',
        code: 'subscription_sharing_usage_limit_exceeded',
        message: 'Usage exhausted',
      },
      'QUOTA',
    ],
    [{ kind: 'api', status: 401, message: 'Identity was rejected' }, 'AUTH'],
    [{ kind: 'api', status: 429, message: 'Slow down' }, 'RATE_LIMIT'],
    [
      { kind: 'api', code: 'subscription_sharing_usage_unavailable', message: 'Usage unavailable' },
      'SERVER',
    ],
    [{ kind: 'api', status: 400, message: 'Unsupported service_tier: fast' }, 'PROVIDER_ERROR'],
    [{ kind: 'transport', message: 'Network request failed' }, 'TRANSPORT'],
    [{ kind: 'timeout', message: 'OpenAI network request failed' }, 'TIMEOUT'],
    [{ kind: 'protocol', message: 'Invalid or interrupted OpenAI event stream' }, 'PROVIDER_ERROR'],
  ]
  try {
    for (const [error, code] of scenarios) {
      const event: ProviderErrorEvent = { type: 'provider-error', error }
      client.streamResponse = () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(event)
            controller.close()
          },
        })
      const chunks: StreamChunk[] = []
      for await (const chunk of ctx.llm.stream({
        provider: 'openai-codex',
        model: 'fixture',
        messages: [],
      }))
        chunks.push(chunk)
      assert.equal(chunks.length, 1)
      const finish = chunks[0]
      assert.equal(finish.type, 'finish')
      assert.ok(finish.type === 'finish' && finish.reason.kind === 'error')
      assert.equal(finish.reason.failure.code, code)
      assert.equal(finish.reason.failure.message, error.message)
      assert.equal(finish.reason.failure.status, error.status)
      assert.equal(finish.reason.failure.requestId, error.requestId)
      assert.equal((providerError(event).cause as ProviderErrorEvent['error']).param, error.param)
    }
  } finally {
    registration()
    operations.dispose()
    await llm.dispose()
  }
})

test('real native missing-scope failure reaches DSH as AUTH without network access', async () => {
  const ctx = new Context()
  const llm = ctx.plugin(LlmRuntime)
  await llm.await()
  const record = JSON.parse(sessionRecord())
  record.scopes = ['openid']
  const operations = new Operations()
  const accounts = { selected: async () => JSON.stringify(record) } as unknown as Accounts
  const adapter = new ChatGptAdapter(new ChatGptClient({}), accounts, operations)
  adapter.listModels = async () => [{ id: 'fixture', name: 'Fixture', provider: 'openai-codex' }]
  const registration = ctx.llm.registerAdapter(['openai-codex'], adapter)
  try {
    const chunks: StreamChunk[] = []
    for await (const chunk of ctx.llm.stream({
      provider: 'openai-codex',
      model: 'fixture',
      messages: [],
    }))
      chunks.push(chunk)
    assert.equal(chunks.length, 1)
    const finish = chunks[0]
    assert.ok(finish.type === 'finish' && finish.reason.kind === 'error')
    assert.equal(finish.reason.failure.code, 'AUTH')
    assert.match(finish.reason.failure.message, /not authorized/)
  } finally {
    registration()
    operations.dispose()
    await llm.dispose()
  }
})
