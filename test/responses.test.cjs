const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ChatGptClient, Cancellation } = require('../index.js')
const { sessionRecord } = require('./session-fixture.cjs')

const request = JSON.stringify({ model: 'test-model', input: [{ role: 'user', content: 'test' }] })

test('native object stream rejects a cancelled read without inference', async () => {
  const cancellation = new Cancellation()
  cancellation.cancel()
  const stream = new ChatGptClient().streamResponse(sessionRecord(), request, cancellation)
  assert.ok(stream instanceof ReadableStream)
  const reader = stream.getReader()
  await assert.rejects(reader.read(), /request cancelled/)
  reader.releaseLock()
})

test('missing ChatGPT plan permission is rejected before creating an inference stream', () => {
  const record = JSON.parse(sessionRecord())
  record.scopes = ['openid']
  assert.throws(() => new ChatGptClient().streamResponse(JSON.stringify(record), request, new Cancellation()), /not authorized/)
})
