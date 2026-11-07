import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import native from '../index.cjs'
import type { Accounts } from '../plugin/accounts.ts'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import { Operations } from '../plugin/operations.ts'
import { chatGptSearch } from '../plugin/web-search.ts'
import { sessionRecord } from './session-fixture.mts'

test('native route capabilities govern search, account switches and local legacy logout', async () => {
  const siwc = sessionRecord()
  const legacy = (method: string) =>
    JSON.stringify({
      ...JSON.parse(siwc),
      login_method: method,
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
      account_id: 'synthetic-workspace',
      scopes: [],
    })
  const browser = legacy('codex-browser')
  const device = legacy('codex-device')
  const siwcCapabilities = native.describeSession(siwc).capabilities
  const legacyCapabilities = native.describeSession(browser).capabilities
  assert.deepEqual(native.describeSession(device).capabilities, legacyCapabilities)
  assert.equal(siwcCapabilities.webSearch, true)
  assert.equal(siwcCapabilities.remoteRevocation, true)
  assert.equal(legacyCapabilities.webSearch, false)
  assert.equal(legacyCapabilities.remoteRevocation, false)
  for (const capabilities of [siwcCapabilities, legacyCapabilities]) {
    assert.ok(Object.values(capabilities).every((value) => typeof value === 'boolean'))
    assert.equal(capabilities.quota, false)
    assert.equal(capabilities.imageGeneration, false)
    assert.equal(capabilities.connectors, false)
  }

  let current = siwc
  const accounts = {
    read: async () => ({ active: native.describeSession(current).id, accounts: [current] }),
    selected: async () => current,
  } as unknown as Accounts
  const client = new native.ChatGptClient({})
  client.listModels = async () => [{ id: 'test', name: 'Test' }]
  const requests: { webSearch: boolean }[] = []
  client.streamResponse = (_record, json) => {
    requests.push(JSON.parse(json))
    return new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'finish', reason: { kind: 'stop' } })
        controller.close()
      },
    })
  }
  const operations = new Operations()
  const adapter = new ChatGptAdapter(client, accounts, operations, undefined, () => 'all')
  const search = chatGptSearch(adapter, () => true)
  assert.ok(search.ready)
  const ctx = new Context()
  const llm = ctx.plugin(LlmRuntime)
  await llm.await()
  const unregister = ctx.llm.registerAdapter(['openai-codex'], adapter)
  try {
    for (const record of [siwc, browser, device, siwc]) {
      current = record
      const supported = native.describeSession(record).capabilities.webSearch
      assert.equal(await adapter.hasCredentials(), true)
      assert.equal(await search.ready(undefined), supported)
      for await (const chunk of ctx.llm.stream({
        provider: 'openai-codex',
        model: 'test',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      }))
        assert.equal(chunk.type, 'finish')
      assert.equal(requests.at(-1)?.webSearch, supported)
      if (!supported) {
        const before = requests.length
        await assert.rejects(async () => {
          for await (const _ of adapter.search('synthetic query')) {
            /* consume */
          }
        }, /Built-in web search is not available/)
        assert.equal(requests.length, before)
      }
    }
    const cancellation = new native.Cancellation()
    const rawClient = new native.ChatGptClient({})
    const reader = rawClient
      .streamResponse(
        browser,
        JSON.stringify({
          model: 'test',
          messages: [],
          webSearch: true,
        }),
        cancellation,
      )
      .getReader()
    try {
      const { value } = await reader.read()
      assert.equal(value.type, 'provider-error')
      assert.match(value.error.message, /Built-in web search is not available/)
    } finally {
      cancellation.cancel()
      await reader.cancel()
      reader.releaseLock()
    }
    const result = await rawClient.logoutSession(device, new native.Cancellation())
    assert.equal(result.localOnly, true)
    assert.equal(result.revocationConfirmed, false)
    assert.equal(native.describeSession(result.record).hasCredentials, false)
  } finally {
    unregister()
    operations.dispose()
    await llm.dispose()
  }
})
