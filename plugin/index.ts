import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import native from '../index.cjs'
import { Accounts, accountsKey } from './accounts.ts'
import { ChatGptAdapter, provider } from './adapter.ts'
import { Operations } from './operations.ts'
import { mountAccountUi } from './account-ui.ts'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'

export const name = 'codex-provider'
export const inject = ['llm', 'credentials', 'authorization', 'attachments']
export const Config = z.object({
  sidebarAccount: z.union(['deepseek', 'chatgpt']).default('deepseek').volatile(),
})

export function apply(ctx: Context): void {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  const operations = new Operations()
  const client = new native.ChatGptClient(attributionHeaders())
  const accounts = new Accounts(ctx.credentials, client, operations)
  ctx.effect(() => () => operations.dispose())
  ctx.effect(() => ctx.authorization.registerFlow({
    key: accountsKey,
    label: 'ChatGPT',
    methods: [{ id: 'oauth', label: '使用 ChatGPT 官方账号登录' }],
    run: session => accounts.authorize(session),
  }))
  const adapter = new ChatGptAdapter(client, accounts, operations, ctx.attachments)
  ctx.on('credentials/record-updated', key => {
    if (key === accountsKey) adapter.invalidateCatalog()
  })
  ctx.llm.registerAdapter([provider], adapter)
  ctx.inject(['connection', 'authorization'], child => {
    mountAccountUi(child, accounts, operations)
  })
}
