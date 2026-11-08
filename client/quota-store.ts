import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Quota } from '../index.cjs'

interface QuotaSnapshot {
  quota: Quota | null
  loading: boolean
  error: boolean
}

/** One live query and timer per connection/account, shared by the sidebar and settings. */
export class QuotaStore {
  private state: QuotaSnapshot = { quota: null, loading: true, error: false }
  private listeners = new Set<() => void>()
  private users = 0
  private controller?: AbortController
  private timer?: ReturnType<typeof setInterval>
  private minutes = 0
  private rpc: ClientConnectionRpc
  private id: string

  constructor(rpc: ClientConnectionRpc, id: string) {
    this.rpc = rpc
    this.id = id
  }

  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private update(state: QuotaSnapshot) {
    this.state = state
    this.listeners.forEach((listener) => {
      listener()
    })
  }

  refresh = async () => {
    if (this.controller) return
    const controller = new AbortController()
    this.controller = controller
    this.update({ ...this.state, loading: true, error: false })
    try {
      const result = await this.rpc.call(
        '/api',
        'codex-provider/quota',
        { id: this.id },
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (!result.ok) throw new Error('Quota unavailable')
      this.update({ quota: result.value as Quota, loading: false, error: false })
    } catch {
      if (!controller.signal.aborted) this.update({ quota: null, loading: false, error: true })
    } finally {
      if (this.controller === controller) this.controller = undefined
    }
  }

  watch(minutes: number) {
    this.minutes = minutes
    if (this.users++ === 0) void this.refresh()
    clearInterval(this.timer)
    this.timer =
      minutes > 0
        ? setInterval(() => {
            if (document.visibilityState === 'visible') void this.refresh()
          }, minutes * 60000)
        : undefined
    // Only the first consumer owns the visibility listener.
    if (this.users === 1) document.addEventListener('visibilitychange', this.onVisible)
    return () => {
      if (--this.users) return
      clearInterval(this.timer)
      document.removeEventListener('visibilitychange', this.onVisible)
      this.controller?.abort()
      this.controller = undefined
      this.state = { quota: null, loading: true, error: false }
    }
  }

  private onVisible = () => {
    if (this.minutes > 0 && document.visibilityState === 'visible') void this.refresh()
  }
}

const stores = new WeakMap<ClientConnectionRpc, Map<string, QuotaStore>>()
export function quotaStore(rpc: ClientConnectionRpc, id: string) {
  let accounts = stores.get(rpc)
  if (!accounts) {
    accounts = new Map()
    stores.set(rpc, accounts)
  }
  let store = accounts.get(id)
  if (!store) {
    store = new QuotaStore(rpc, id)
    accounts.set(id, store)
  }
  return store
}
