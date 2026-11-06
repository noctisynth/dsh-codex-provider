import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { createElement, type ComponentType } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'

test('the shipped settings entry sends valid payloads when login and cancellation have no arguments', async () => {
  let loaded: { id: string; factory: (require: NodeRequire) => { apply(ctx: unknown): void } } | undefined
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    AbortController, setTimeout, clearTimeout,
    window: { __ModuleLoader__: { load(value: typeof loaded) { loaded = value } } },
  })
  assert.ok(loaded)
  assert.equal(loaded.id, 'dsh-codex-provider')
  const plugin = loaded.factory(createRequire(import.meta.url))
  const slots: { name: string; id?: string; key?: string }[] = []
  const requests: { method: string; payload: unknown }[] = []
  let running = false
  const rpc: ClientConnectionRpc = { async call(_channel, method, payload) {
    requests.push({ method, payload })
    // Match Connection's JSON wire boundary and the Host's real envelope validator.
    clientRequestSchema.parse(JSON.parse(JSON.stringify({ type: 'client-request', rpcId: 'test', method, payload })))
    if (method.endsWith('/login')) running = true
    return { ok: true, value: method.endsWith('/status') ? { accounts: [], login: { running } } : null }
  } }
  let component: ComponentType<{ rpc: ClientConnectionRpc; embedded: boolean }> | undefined
  plugin.apply({
    get: () => ({ rpc }),
    slots: { inject: (_name: string, mount: () => void) => mount(), register: (entry: typeof slots[number], value: typeof component) => { slots.push(entry); component = value } },
  })
  assert.ok(slots.some(entry => entry.name === 'settings.section' && entry.id === 'codex-provider'))
  assert.ok(slots.some(entry => entry.name === 'plugins.bundle.config' && entry.key === 'dsh-codex-provider'))
  assert.ok(component)
  const Settings = component
  let view: ReactTestRenderer | undefined
  try {
    await act(async () => { view = create(createElement(Settings, { rpc, embedded: false })) })
    assert.ok(view)
    const button = view.root.findAllByType('button').find(button => button.props.children === '使用 ChatGPT 登录 / 添加账号')
    assert.ok(button)
    await act(async () => { await button.props.onClick() })
    assert.equal(requests.find(request => request.method.endsWith('/login'))?.payload, null)
  } finally { await act(async () => { view?.unmount() }) }
  assert.equal(requests.find(request => request.method.endsWith('/cancel'))?.payload, null)
})
