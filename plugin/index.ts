import type { Context, Volatile } from '@deepseek-ai/cordis'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-web'
import z from '@deepseek-ai/schemastery'
import native from '../index.cjs'
import type { SearchMode } from '../shared/features.ts'
import { mountAccountUi } from './account-ui.ts'
import { Accounts, accountsKey } from './accounts.ts'
import { ChatGptAdapter, provider } from './adapter.ts'
import { mountApproval } from './approval.ts'
import { Operations } from './operations.ts'
import { Preferences } from './preferences.ts'
import { chatGptSearch } from './web-search.ts'

export const name = 'codex-provider'
export const inject = ['llm', 'credentials', 'authorization', 'attachments']
export const Config = z.object({
  sidebarAccount: z.union(['deepseek', 'chatgpt']).default('deepseek').volatile(),
  codexReview: z.boolean().default(false).volatile(),
  searchMode: z.union(['off', 'chatgpt', 'all']).default('off').volatile(),
  previousSearchProvider: z.string().hidden().volatile(),
})

export interface Config {
  sidebarAccount: Volatile<'deepseek' | 'chatgpt'>
  codexReview: Volatile<boolean>
  searchMode: Volatile<SearchMode>
  previousSearchProvider: Volatile<string | undefined>
}

export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  const operations = new Operations()
  const client = new native.ChatGptClient(attributionHeaders())
  const accounts = new Accounts(ctx.credentials, client, operations)
  ctx.effect(() => () => operations.dispose())
  ctx.effect(() =>
    ctx.authorization.registerFlow({
      key: accountsKey,
      label: 'ChatGPT',
      methods: [{ id: 'oauth', label: 'Sign in with your ChatGPT account' }],
      run: (session) => accounts.authorize(session),
    }),
  )
  const adapter = new ChatGptAdapter(client, accounts, operations, ctx.attachments, () =>
    config.searchMode.get(),
  )
  ctx.on('credentials/record-updated', (key) => {
    if (key === accountsKey) adapter.invalidateCatalog()
  })
  ctx.llm.registerAdapter([provider], adapter)
  ctx.inject(['approval', 'permissionPresets', 'tools', 'workingDirectory'], (child) => {
    mountApproval(child, adapter, () => config.codexReview.get())
  })
  let savePreference = async (_payload: unknown): Promise<void> => {
    throw new Error('Host settings are not ready.')
  }
  ctx.inject(['settings', 'configEditor'], (child) => {
    const preferences = new Preferences(child, ctx.fiber, config.previousSearchProvider)
    savePreference = (payload) => preferences.set(payload)
    child.inject(['web'], (scope) => {
      scope.web.registerSearchProvider(
        chatGptSearch(adapter, () => config.searchMode.get() === 'all'),
      )
      scope.effect(async () => {
        if (config.searchMode.get() === 'all') await preferences.selectSource()
        return async () => {
          if (ctx.root.fiber.state === 2 && config.searchMode.get() === 'all')
            await preferences.restoreSource()
        }
      })
    })
  })
  ctx.inject(['connection', 'authorization'], (child) => {
    mountAccountUi(child, accounts, operations, (payload) => savePreference(payload))
  })
}
