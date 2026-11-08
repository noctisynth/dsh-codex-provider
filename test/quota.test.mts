import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import en from '../client/locales/en.ts'
import zh from '../client/locales/zh.ts'
import { quotaPlan, quotaReset } from '../client/quota-format.ts'
import { quotaStore } from '../client/quota-store.ts'
import { localeFixture } from './locale-fixture.mts'

test('quota countdowns follow the host locale and Pro tier names share one label', async () => {
  const locale = await localeFixture('zh')
  locale.register('codex-provider', { zh, en })
  const t = locale.bind('codex-provider')
  for (const plan of ['pro', 'prolite', 'proplus']) assert.equal(quotaPlan(plan), 'Pro')
  assert.equal(quotaPlan('plus'), 'Plus')
  assert.equal(quotaPlan('unknown'), 'unknown')
  assert.equal(quotaReset(486000, 0, t), '5天15小时 后重置')
  assert.equal(quotaReset(3720, 0, t), '1小时2分钟 后重置')
  assert.equal(quotaReset(60, 0, t), '1分钟 后重置')
  assert.equal(quotaReset(0, 0, t), '即将重置')
  assert.equal(quotaReset(0, 100000, t), '即将重置')
  locale.setLocale('en')
  assert.equal(quotaReset(3720, 0, t), 'Resets in 1h 2m')
})

test('quota consumers share requests, respect polling settings and cancel on last unmount', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const events = new EventTarget()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let visibilityState = 'visible'
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get visibilityState() {
        return visibilityState
      },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    },
  })
  const requests: { id: string; signal: AbortSignal; resolve(value: unknown): void }[] = []
  const rpc = {
    call(_base: string, _route: string, payload: { id: string }, signal: AbortSignal) {
      return new Promise((resolve) => requests.push({ id: payload.id, signal, resolve }))
    },
  } as unknown as ClientConnectionRpc
  const usage = { plan: 'prolite', windows: [], unlimitedCredits: false }
  const complete = async (index: number) => {
    requests[index].resolve({ ok: true, value: usage })
    await Promise.resolve()
  }
  const store = quotaStore(rpc, 'account-a')
  const stops: (() => void)[] = []
  try {
    assert.equal(quotaStore(rpc, 'account-a'), store)
    assert.notEqual(quotaStore(rpc, 'account-b'), store)
    const stopSettings = store.watch(1)
    const stopSidebar = store.watch(1)
    stops.push(stopSettings, stopSidebar)
    assert.equal(requests.length, 1)
    t.mock.timers.tick(120000)
    await store.refresh()
    assert.equal(requests.length, 1, 'in-flight request is shared')
    await complete(0)
    assert.deepEqual(store.snapshot().quota, usage)
    t.mock.timers.tick(60000)
    assert.equal(requests.length, 2)
    await complete(1)
    visibilityState = 'hidden'
    t.mock.timers.tick(60000)
    assert.equal(requests.length, 2)
    visibilityState = 'visible'
    events.dispatchEvent(new Event('visibilitychange'))
    assert.equal(requests.length, 3)
    await complete(2)
    const stopOff = store.watch(0)
    stops.push(stopOff)
    t.mock.timers.tick(900000)
    events.dispatchEvent(new Event('visibilitychange'))
    assert.equal(requests.length, 3, 'off stops automatic queries')
    const manual = store.refresh()
    assert.equal(requests.length, 4)
    requests[3].resolve({ ok: false })
    await manual
    assert.equal(store.snapshot().error, true)
    assert.equal(store.snapshot().quota, null, 'failed query cannot look like current quota')
    void store.refresh()
    stopSettings()
    stops.shift()
    assert.equal(requests[4].signal.aborted, false)
    stopSidebar()
    stops.shift()
    assert.equal(requests[4].signal.aborted, false)
    stopOff()
    stops.shift()
    assert.equal(requests[4].signal.aborted, true)
    await complete(4)
    assert.equal(
      store.snapshot().quota,
      null,
      'late completion cannot resurrect an unmounted account',
    )
    t.mock.timers.tick(900000)
    events.dispatchEvent(new Event('visibilitychange'))
    assert.equal(requests.length, 5)
  } finally {
    stops.forEach((stop) => {
      stop()
    })
    if (original) Object.defineProperty(globalThis, 'document', original)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
