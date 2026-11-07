import type { Context, Fiber, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-config-editor'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-web'
import type { ImageDetail, SearchMode } from '../shared/features.ts'

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
    const entry = this.ctx.configEditor
      .entries()
      .find((entry) =>
        name
          ? entry.options.name === name || entry.options.name === `cordis:${name}`
          : entry.fiber?.uid === this.owner.uid,
      )
    if (!entry?.options.id) throw new Error('No editable host configuration was found.')
    return entry.options.id
  }

  set(payload: unknown): Promise<void> {
    const job = this.tail.then(() => this.write(payload))
    this.tail = job.catch(() => {})
    return job
  }

  private async write(payload: unknown): Promise<void> {
    const { key, value } = parsePreference(payload)
    const ns = this.namespace()
    if (key !== 'searchMode') {
      await this.ctx.settings.update(ns, { [key]: value })
      return
    }
    const current = this.ctx.settings.describe().find((row) => row.ns === ns)?.value as
      | { searchMode?: SearchMode }
      | undefined
    const wasAll = current?.searchMode === 'all'
    if (value === 'all' && !wasAll) {
      const webNs = this.namespace('@deepseek-ai/dsh-web')
      const web = this.ctx.settings.describe().find((row) => row.ns === webNs)?.value as {
        searchProvider?: string
      }
      const old = web.searchProvider ?? ''
      await this.ctx.settings.update(webNs, { searchProvider: searchProviderId })
      try {
        await this.ctx.settings.update(ns, { searchMode: value, previousSearchProvider: old })
      } catch (error) {
        await this.restoreSource(old)
        throw error
      }
    } else {
      const restored = wasAll && value !== 'all' && (await this.restoreSource(this.previous.get()))
      try {
        await this.ctx.settings.update(ns, { searchMode: value })
      } catch (error) {
        if (restored)
          await this.ctx.settings.update(this.namespace('@deepseek-ai/dsh-web'), {
            searchProvider: searchProviderId,
          })
        throw error
      }
    }
  }

  async selectSource(): Promise<void> {
    const ns = this.namespace('@deepseek-ai/dsh-web')
    const current = this.ctx.settings.describe().find((row) => row.ns === ns)?.value as {
      searchProvider?: string
    }
    if ((current?.searchProvider ?? '') === (this.previous.get() ?? ''))
      await this.ctx.settings.update(ns, { searchProvider: searchProviderId })
  }

  async restoreSource(previous = this.previous.get()): Promise<boolean> {
    const ns = this.namespace('@deepseek-ai/dsh-web')
    const current = this.ctx.settings.describe().find((row) => row.ns === ns)?.value as {
      searchProvider?: string
    }
    if (current?.searchProvider !== searchProviderId) return false
    await this.ctx.settings.mutate(
      ns,
      previous
        ? [{ op: 'set', path: ['searchProvider'], value: previous }]
        : [{ op: 'unset', path: ['searchProvider'] }],
    )
    return true
  }
}

type PreferenceChange =
  | { key: 'sidebarAccount'; value: 'deepseek' | 'chatgpt' }
  | { key: 'codexReview'; value: boolean }
  | { key: 'searchMode'; value: SearchMode }
  | { key: 'imageDetail'; value: ImageDetail }

function parsePreference(payload: unknown): PreferenceChange {
  if (!payload || typeof payload !== 'object' || !('key' in payload) || !('value' in payload))
    throw new Error('Invalid settings parameters.')
  const { key, value } = payload
  switch (key) {
    case 'imageDetail':
      if (value === 'auto' || value === 'low' || value === 'high' || value === 'original')
        return { key, value }
      break
    case 'sidebarAccount':
      if (value === 'deepseek' || value === 'chatgpt') return { key, value }
      break
    case 'codexReview':
      if (typeof value === 'boolean') return { key, value }
      break
    case 'searchMode':
      if (value === 'off' || value === 'chatgpt' || value === 'all') return { key, value }
      break
  }
  throw new Error('Invalid setting value.')
}
