import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { Socket } from 'node:net'
import { test } from 'node:test'
import { Cancellation, ChatGptClient, isValidModelProxy } from '../index.cjs'
import { sessionRecord } from './session-fixture.mts'

async function proxyFixture() {
  const requests: string[] = []
  const sockets = new Set<Socket>()
  let holdConnection = false
  const server = createServer().on('connect', (request, socket: Socket) => {
    assert.equal(request.headers.authorization, undefined)
    requests.push(request.url ?? '')
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    if (!holdConnection) socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    waitForConnect(signal: AbortSignal) {
      holdConnection = true
      return once(server, 'connect', { signal })
    },
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

test('the model proxy accepts only plain HTTP(S) addresses or a blank value', () => {
  for (const url of [
    '',
    ' \n ',
    'http://127.0.0.1:7890',
    'https://proxy.invalid',
    'http://[::1]:7890/',
  ])
    assert.equal(isValidModelProxy(url), true, url)
  for (const url of [
    '127.0.0.1:7890',
    'http://',
    'http:///proxy.invalid',
    'http://proxy.invalid:0',
    'socks5://proxy.invalid',
    'https://user:secret@proxy.invalid',
    'http://proxy.invalid/abc/..',
    'http://proxy.invalid?token=secret',
    'https://proxy.invalid#secret',
  ])
    assert.equal(isValidModelProxy(url), false, url)
})

test('native Responses use the selected proxy on both routes, with no fallback and unchanged catalog routing', {
  timeout: 10_000,
}, async (t) => {
  const baseline = await proxyFixture()
  t.after(() => baseline.close())
  const proxy = await proxyFixture()
  t.after(() => proxy.close())
  const updated = await proxyFixture()
  t.after(() => updated.close())
  const original = { HTTPS_PROXY: process.env.HTTPS_PROXY, NO_PROXY: process.env.NO_PROXY }
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  process.env.HTTPS_PROXY = baseline.url
  process.env.NO_PROXY = 'example.invalid'
  const client = new ChatGptClient({})
  const siwc = sessionRecord()
  const codex = JSON.stringify({
    ...JSON.parse(siwc),
    login_method: 'codex-browser',
    client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
    account_id: 'synthetic-workspace',
  })
  const request = JSON.stringify({
    model: 'synthetic-model',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Synthetic fixture' }] }],
  })
  async function infer(record: string, proxyAddress?: string) {
    const cancellation = new Cancellation()
    const timeout = setTimeout(() => cancellation.cancel(), 2000)
    const reader = client.streamResponse(record, request, cancellation, proxyAddress).getReader()
    try {
      const { value } = await reader.read()
      assert.equal(value?.type, 'provider-error')
      return value.error
    } finally {
      clearTimeout(timeout)
      cancellation.cancel()
      await reader.cancel()
    }
  }
  for (const record of [siwc, codex]) {
    const error = await infer(record, proxy.url)
    assert.equal(error.kind, 'transport')
    assert.match(error.message, /through the model proxy/)
  }
  assert.deepEqual(proxy.requests, ['api.openai.com:443', 'chatgpt.com:443'])
  assert.deepEqual(baseline.requests, [])
  assert.equal((await infer(siwc, 'invalid')).kind, 'protocol')
  assert.deepEqual(baseline.requests, [])
  assert.equal((await infer(codex, updated.url)).kind, 'transport')
  assert.deepEqual(updated.requests, ['chatgpt.com:443'])
  assert.deepEqual(proxy.requests, ['api.openai.com:443', 'chatgpt.com:443'])

  const catalogCancel = new Cancellation()
  const catalogTimeout = setTimeout(() => catalogCancel.cancel(), 2000)
  try {
    await assert.rejects(client.listModels(siwc, catalogCancel), /OpenAI network request failed/)
  } finally {
    clearTimeout(catalogTimeout)
  }
  assert.equal((await infer(codex, '')).kind, 'transport')
  assert.deepEqual(baseline.requests, ['api.openai.com:443', 'chatgpt.com:443'])

  const connected = proxy.waitForConnect(AbortSignal.timeout(2000))
  const cancellation = new Cancellation()
  const reader = client.streamResponse(siwc, request, cancellation, proxy.url).getReader()
  const pending = reader.read()
  const rejection = assert.rejects(pending, /cancelled/i)
  try {
    await connected
  } finally {
    cancellation.cancel()
    await rejection
  }
  assert.deepEqual(baseline.requests, ['api.openai.com:443', 'chatgpt.com:443'])
})
