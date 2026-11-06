import type { Context, Volatile, Fiber } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-web'
import type { SearchMode } from '../shared/features.ts'

export const searchProviderId = 'chatgpt'

/** Own scalar edits and the reversible selection of the shared DSH search source. */
export class Preferences {
  private tail: Promise<unknown> = Promise.resolve()
  private ctx: Context
  private owner: Fiber
  private previous: Volatile<string | undefined>

  constructor(ctx: Context, owner: Fiber, previous: Volatile<string | undefined>) {
    this.ctx = ctx
    this.owner = owner
    this.previous = previous
  }

  private namespace(name?: string): string {
    const entry = this.ctx.configEditor.entries().find(entry => name
      ? entry.options.name === name || entry.options.name === `cordis:${name}`
      : entry.fiber?.uid === this.owner.uid)
    if (!entry?.options.id) throw new Error('找不到可编辑的宿主配置。')
    return entry.options.id
  }

  set(payload: unknown): Promise<void> {
    const job = this.tail.then(() => this.write(payload))
    this.tail = job.catch(() => {})
    return job
  }

  private async write(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object' || !('key' in payload) || !('value' in payload)) throw new Error('设置参数无效。')
    const { key, value } = payload
    if (!(key === 'sidebarAccount' && (value === 'deepseek' || value === 'chatgpt')
      || key === 'codexReview' && typeof value === 'boolean'
      || key === 'searchMode' && typeof value === 'string' && ['off', 'chatgpt', 'all'].includes(value))) throw new Error('设置值无效。')
    const ns = this.namespace()
    if (key !== 'searchMode') { await this.ctx.settings.update(ns, { [key]: value }); return }
    const current = this.ctx.settings.describe().find(row => row.ns === ns)?.value as { searchMode?: SearchMode } | undefined
    const wasAll = current?.searchMode === 'all'
    if (value === 'all' && !wasAll) {
      const webNs = this.namespace('@deepseek-ai/dsh-web')
      const web = this.ctx.settings.describe().find(row => row.ns === webNs)?.value as { searchProvider?: string }
      const old = web.searchProvider ?? ''
      await this.ctx.settings.update(webNs, { searchProvider: searchProviderId })
      try { await this.ctx.settings.update(ns, { searchMode: value, previousSearchProvider: old }) }
      catch (error) { await this.restoreSource(old); throw error }
    } else {
      const restored = wasAll && value !== 'all' && await this.restoreSource(this.previous.get())
      try { await this.ctx.settings.update(ns, { searchMode: value }) }
      catch (error) {
        if (restored) await this.ctx.settings.update(this.namespace('@deepseek-ai/dsh-web'), { searchProvider: searchProviderId })
        throw error
      }
    }
  }

  async selectSource(): Promise<void> {
    const ns = this.namespace('@deepseek-ai/dsh-web')
    const current = this.ctx.settings.describe().find(row => row.ns === ns)?.value as { searchProvider?: string }
    if ((current?.searchProvider ?? '') === (this.previous.get() ?? '')) await this.ctx.settings.update(ns, { searchProvider: searchProviderId })
  }

  async restoreSource(previous = this.previous.get()): Promise<boolean> {
    const ns = this.namespace('@deepseek-ai/dsh-web')
    const current = this.ctx.settings.describe().find(row => row.ns === ns)?.value as { searchProvider?: string }
    if (current?.searchProvider !== searchProviderId) return false
    await this.ctx.settings.mutate(ns, previous ? [{ op: 'set', path: ['searchProvider'], value: previous }]
      : [{ op: 'unset', path: ['searchProvider'] }])
    return true
  }
}
