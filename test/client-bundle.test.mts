import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { createElement, type ComponentType } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { AccountStatus } from '../shared/account-ui.ts'

test('the shipped settings preserve account actions, host React sharing and stylesheet disposal', async () => {
  let loaded: { id: string; factory: (require: NodeRequire) => { apply(ctx: unknown): void } } | undefined
  const style = { dataset: {}, textContent: '', remove() { removed = true } }
  let removed = false
  let dispose: (() => void) | undefined
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    AbortController, setTimeout, clearTimeout,
    document: { createElement: () => style, head: { append(value: unknown) { assert.equal(value, style) } } },
    window: { __ModuleLoader__: { load(value: typeof loaded) { loaded = value } } },
  })
  assert.ok(loaded)
  assert.equal(loaded.id, 'dsh-codex-provider')
  const hostRequire = createRequire(import.meta.url)
  const plugin = loaded.factory(((name: string) => {
    assert.ok(['react', 'react/jsx-runtime'].includes(name), `unexpected browser dependency: ${name}`)
    return hostRequire(name)
  }) as NodeRequire)
  const slots: { name: string; id?: string; key?: string }[] = []
  const requests: { method: string; payload: unknown }[] = []
  let running = false
  let accounts: AccountStatus['accounts'] = []
  const rpc: ClientConnectionRpc = { async call(_channel, method, payload) {
    requests.push({ method, payload })
    // Match Connection's JSON wire boundary and the Host's real envelope validator.
    clientRequestSchema.parse(JSON.parse(JSON.stringify({ type: 'client-request', rpcId: 'test', method, payload })))
    if (method.endsWith('/login')) running = true
    return { ok: true, value: method.endsWith('/status') ? { accounts, login: { running } } : method.endsWith('/logout') ? { revocationConfirmed: false } : null }
  } }
  let component: ComponentType<{ rpc: ClientConnectionRpc; embedded: boolean }> | undefined
  plugin.apply({
    effect: (mount: () => () => void) => { dispose = mount() },
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
    const button = view.root.findAllByType('button').find(button => button.props['aria-label'] === '使用 ChatGPT 登录')
    assert.ok(button)
    await act(async () => { await button.props.onClick() })
    assert.equal(requests.find(request => request.method.endsWith('/login'))?.payload, null)
  } finally { await act(async () => { view?.unmount() }) }
  assert.equal(requests.find(request => request.method.endsWith('/cancel'))?.payload, null)
  running = false
  accounts = [{ clientId: 'synthetic-account', email: 'demo@example.com', hasCredentials: true, planUsageAuthorized: true }]
  try {
    await act(async () => { view = create(createElement(Settings, { rpc, embedded: true })) })
    assert.ok(view)
    const select = view.root.findAllByType('button').find(button => button.props.children === '切换账号')
    assert.ok(select)
    await act(async () => { await select.props.onClick() })
    assert.equal(JSON.stringify(requests.find(request => request.method.endsWith('/select'))?.payload), JSON.stringify({ id: 'synthetic-account' }))
    const logout = view.root.findAllByType('button').find(button => Array.isArray(button.props.children) && button.props.children.includes('退出登录'))
    assert.ok(logout)
    await act(async () => { await logout.props.onClick() })
    assert.equal(JSON.stringify(requests.find(request => request.method.endsWith('/logout'))?.payload), JSON.stringify({ id: 'synthetic-account' }))
    assert.match(JSON.stringify(view.toJSON()), /本地凭据已清除，未能确认远端授权撤销/)
  } finally { await act(async () => { view?.unmount() }) }
  assert.match(style.textContent, /--cp-spacing/)
  dispose?.()
  assert.equal(removed, true)
})
