import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import native from '../index.js'
import { Accounts, accountsKey } from './accounts.mjs'
import { ChatGptAdapter, provider } from './adapter.mjs'
import { Operations } from './operations.mjs'

export const name = 'codex-provider'
export const inject = ['llm', 'credentials', 'authorization']

export function apply(ctx) {
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
  ctx.effect(() => ctx.llm.registerAdapter([provider], new ChatGptAdapter(client, accounts, operations)))
}
