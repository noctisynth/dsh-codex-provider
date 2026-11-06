import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import open from 'open'
import native from '../index.js'

export const accountsKey = credentialKey('codex-provider', 'accounts')

/** The DSH credential provider is the only persistent writer. */
export class Accounts {
  constructor(credentials, client, operations) {
    this.credentials = credentials
    this.client = client
    this.operations = operations
  }

  async read() {
    return (await this.credentials.readRecord(accountsKey))?.payload
  }

  async selected(cancellation) {
    let selected
    await this.credentials.modifyRecord(accountsKey, async (current) => {
      const vault = current?.payload
      const record = vault?.accounts.find(record => native.describeSession(record).clientId === vault.active)
      if (!record || !native.describeSession(record).hasCredentials) {
        throw new LlmError('请先在凭据设置中登录 ChatGPT。', 'AUTH')
      }
      const renewed = await this.client.renewSession(record, cancellation)
      selected = renewed.record
      if (selected === record) return undefined
      return { kind: 'grant', payload: {
        ...vault, accounts: vault.accounts.map(value => value === record ? selected : value),
      } }
    })
    return selected
  }

  async authorize(session) {
    const operation = this.operations.start(session.signal)
    let attempt
    try {
      // Persist the stable host identity before constructing the first OAuth URL.
      await this.credentials.modifyRecord(accountsKey, current => {
        session.signal.throwIfAborted()
        return current ?? { kind: 'grant', payload: { hostId: native.createHostId(), accounts: [] } }
      })
      const vault = await this.read()
      let previous
      if (vault.accounts.length) {
        const choice = await session.prompt({
          kind: 'select', message: '选择 ChatGPT 注册，或添加账号',
          options: [
            ...vault.accounts.map(record => {
              const account = native.describeSession(record)
              return { id: account.clientId, label: account.email ?? 'ChatGPT 账号', description: account.clientId }
            }),
            { id: 'add', label: '添加 ChatGPT 账号' },
          ],
        })
        if (choice !== 'add') previous = vault.accounts.find(record => native.describeSession(record).clientId === choice)
      }
      attempt = await this.client.beginLogin(vault.hostId, previous, operation.cancellation)
      let result
      for (;;) {
        session.signal.throwIfAborted()
        session.notify({ message: '请在系统浏览器中完成 ChatGPT 官方登录。' })
        await open(attempt.authorizationUrl)
        try {
          result = await attempt.complete()
          break
        } catch (error) {
          if (!attempt.canRetry) throw error
          const answer = await session.prompt({ kind: 'select', message: '授权码已失效，是否重新登录？', options: [
            { id: 'retry', label: '重新登录' }, { id: 'cancel', label: '取消' },
          ] })
          if (answer !== 'retry') throw error
          await attempt.retry()
        }
      }
      await this.credentials.modifyRecord(accountsKey, current => {
        session.signal.throwIfAborted()
        const latest = current.payload
        const accounts = latest.accounts.filter(record => native.describeSession(record).clientId !== result.account.clientId)
        accounts.push(result.record)
        return { kind: 'grant', payload: { ...latest, accounts, active: result.account.clientId } }
      })
      session.notify({ message: result.account.planUsageAuthorized
        ? 'ChatGPT 登录完成。'
        : '登录完成，但未授予 ChatGPT 订阅用量权限，暂时无法调用模型。' })
    } finally {
      attempt?.cancel()
      operation.close()
    }
  }
}
