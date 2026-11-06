import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ChatGptClient, Cancellation } from '../index.cjs'
import { sessionRecord } from './session-fixture.mts'

const request = JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }] })

test('native object stream rejects a cancelled read without inference', async () => {
  const cancellation = new Cancellation()
  cancellation.cancel()
  const stream = new ChatGptClient({}).streamResponse(sessionRecord(), request, cancellation)
  assert.ok(stream instanceof ReadableStream)
  const reader = stream.getReader()
  await assert.rejects(reader.read(), /request cancelled/)
  reader.releaseLock()
})

test('missing ChatGPT plan permission is rejected before creating an inference stream', () => {
  const record = JSON.parse(sessionRecord())
  record.scopes = ['openid']
  assert.throws(() => new ChatGptClient({}).streamResponse(JSON.stringify(record), request, new Cancellation()), /not authorized/)
})
