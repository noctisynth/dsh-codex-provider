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
  const windowEvents = new EventTarget()
  const documentEvents = new EventTarget()
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    AbortController, setTimeout, clearTimeout,
    document: { visibilityState: 'visible', addEventListener: documentEvents.addEventListener.bind(documentEvents), removeEventListener: documentEvents.removeEventListener.bind(documentEvents), createElement: () => style, head: { append(value: unknown) { assert.equal(value, style) } } },
    window: { addEventListener: windowEvents.addEventListener.bind(windowEvents), removeEventListener: windowEvents.removeEventListener.bind(windowEvents), __ModuleLoader__: { load(value: typeof loaded) { loaded = value } } },
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
  assert.ok(slots.some(entry => entry.name === 'settings.section.icon' && entry.id === 'codex-provider'))
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
  accounts = [{ clientId: 'synthetic-account', email: 'demo@example.com', name: 'Example User', picture: 'https://example.invalid/avatar.png', gravatarPicture: 'https://example.invalid/gravatar.png', hasCredentials: true, planUsageAuthorized: true }]
  try {
    await act(async () => { view = create(createElement(Settings, { rpc, embedded: true }), { createNodeMock: element => element.type === 'dialog' ? { showModal() {} } : null }) })
    assert.ok(view)
    assert.match(JSON.stringify(view.toJSON()), /Example User/)
    const avatar = view.root.findByType('img')
    assert.equal(avatar.props.referrerPolicy, 'no-referrer')
    assert.equal(avatar.props.src, accounts[0].picture)
    await act(async () => { avatar.props.onError() })
    const gravatar = view.root.findByType('img')
    assert.equal(gravatar.props.src, accounts[0].gravatarPicture)
    await act(async () => { gravatar.props.onError() })
    assert.equal(view.root.findAllByType('img').length, 0)
    assert.ok(view.root.findAllByType('div').some(element => element.props.children === 'E'))
    accounts = accounts.map(account => ({ ...account, picture: undefined, name: undefined, gravatarPicture: 'https://example.invalid/another-gravatar.png' }))
    await act(async () => { windowEvents.dispatchEvent(new Event('focus')) })
    const fallbackOnly = view.root.findByType('img')
    assert.equal(fallbackOnly.props.src, accounts[0].gravatarPicture)
    await act(async () => { fallbackOnly.props.onError() })
    assert.equal(view.root.findAllByType('img').length, 0)
    assert.ok(view.root.findAllByType('div').some(element => element.props.children === 'd'))
    const select = view.root.findAllByType('button').find(button => button.props.children === '切换账号')
    assert.ok(select)
    await act(async () => { await select.props.onClick() })
    assert.equal(JSON.stringify(requests.find(request => request.method.endsWith('/select'))?.payload), JSON.stringify({ id: 'synthetic-account' }))
    const logout = view.root.findAllByType('button').find(button => button.props.children === '退出登录')
    assert.ok(logout)
    await act(async () => { await logout.props.onClick() })
    assert.equal(requests.filter(request => request.method.endsWith('/logout')).length, 0)
    const cancel = view.root.findAllByType('button').find(button => button.props.children === '取消')
    assert.ok(cancel)
    await act(async () => { cancel.props.onClick() })
    assert.equal(view.root.findAllByType('dialog').length, 0)
    await act(async () => { logout.props.onClick() })
    const confirm = view.root.findAllByType('button').find(button => button.props.children === '确认退出')
    assert.ok(confirm)
    await act(async () => { confirm.props.onClick() })
    assert.equal(JSON.stringify(requests.find(request => request.method.endsWith('/logout'))?.payload), JSON.stringify({ id: 'synthetic-account' }))
    assert.match(JSON.stringify(view.toJSON()), /本地凭据已清除，未能确认远端授权撤销/)
    accounts = accounts.map(account => ({ ...account, hasCredentials: false }))
    await act(async () => { windowEvents.dispatchEvent(new Event('focus')) })
    assert.match(JSON.stringify(view.toJSON()), /重新登录后可用/)
    assert.doesNotMatch(JSON.stringify(view.toJSON()), /当前使用|synthetic-account|注册信息/)
  } finally { await act(async () => { view?.unmount() }) }
  assert.match(style.textContent, /--cp-spacing/)
  dispose?.()
  assert.equal(removed, true)
})
