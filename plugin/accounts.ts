import { createHash } from 'node:crypto'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import open from 'open'
import native from '../index.cjs'
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import type { ChatGptClient, Cancellation, LoginAttempt, LoginResult } from '../index.cjs'
import type { Operations } from './operations.ts'

interface Vault { hostId: string; active?: string; accounts: string[] }

function vaultOf(record: CredentialRecord | undefined): Vault | undefined {
  if (!record) return undefined
  if (record.kind !== 'grant') throw new LlmError('ChatGPT 凭据记录类型无效。', 'AUTH')
  return record.payload as Vault
}

function requiredVault(record: CredentialRecord | undefined): Vault {
  const vault = vaultOf(record)
  if (!vault) throw new LlmError('请先在设置 → ChatGPT 中登录。', 'AUTH')
  return vault
}

export const accountsKey = credentialKey('codex-provider', 'accounts')

/** The DSH credential provider is the only persistent writer. */
export class Accounts {
  credentials: CredentialProvider
  client: ChatGptClient
  operations: Operations

  constructor(credentials: CredentialProvider, client: ChatGptClient, operations: Operations) {
    this.credentials = credentials
    this.client = client
    this.operations = operations
  }

  async read() {
    return vaultOf(await this.credentials.readRecord(accountsKey))
  }

  async summary() {
    const vault = await this.read()
    return {
      active: vault?.active,
      accounts: (vault?.accounts ?? []).map(record => {
        const { clientId, email, name, picture, hasCredentials, planUsageAuthorized } = native.describeSession(record)
        const normalizedEmail = email?.trim().toLowerCase()
        const gravatarPicture = normalizedEmail
          ? `https://gravatar.com/avatar/${createHash('sha256').update(normalizedEmail).digest('hex')}?s=96&d=404&r=g`
          : undefined
        return { clientId, email, name, picture, gravatarPicture, hasCredentials, planUsageAuthorized }
      }),
    }
  }

  async select(clientId: string): Promise<void> {
    await this.credentials.modifyRecord(accountsKey, async current => {
      const vault = requiredVault(current)
      if (!vault?.accounts.some(record => native.describeSession(record).clientId === clientId)) {
        throw new LlmError('未找到该 ChatGPT 注册。', 'AUTH')
      }
      return { kind: 'grant', payload: { ...vault, active: clientId } }
    })
  }

  async logout(clientId: string, cancellation: Cancellation): Promise<boolean> {
    let confirmed = false
    await this.credentials.modifyRecord(accountsKey, async current => {
      const vault = requiredVault(current)
      const index = vault.accounts.findIndex(record => native.describeSession(record).clientId === clientId)
      if (index < 0) throw new LlmError('未找到该 ChatGPT 注册。', 'AUTH')
      const result = await this.client.logoutSession(vault.accounts[index], cancellation)
      confirmed = result.revocationConfirmed
      const accounts = [...vault.accounts]
      accounts[index] = result.record
      return { kind: 'grant', payload: { ...vault, accounts } }
    })
    return confirmed
  }

  async selected(cancellation: Cancellation): Promise<string> {
    let selected = ''
    let signedOut = false
    await this.credentials.modifyRecord(accountsKey, async (current) => {
      const vault = requiredVault(current)
      const record = vault.accounts.find(record => native.describeSession(record).clientId === vault.active)
      if (!record || !native.describeSession(record).hasCredentials) {
        throw new LlmError('请先在设置 → ChatGPT 中登录。', 'AUTH')
      }
      const renewed = await this.client.renewSession(record, cancellation)
      selected = renewed.record
      signedOut = !renewed.account.hasCredentials
      if (selected === record) return undefined
      return { kind: 'grant', payload: {
        ...vault, accounts: vault.accounts.map(value => value === record ? selected : value),
      } }
    })
    // A terminal refresh failure must commit its cleared tokens before reporting failure.
    if (signedOut) throw new LlmError('ChatGPT 登录已失效，请在设置 → ChatGPT 中重新登录。', 'INVALID_CREDENTIAL')
    return selected
  }

  async authorize(session: AuthorizationSession): Promise<void> {
    const operation = this.operations.start(session.signal)
    let attempt: LoginAttempt | undefined
    try {
      // Persist the stable host identity before constructing the first OAuth URL.
      const initialized = await this.credentials.modifyRecord(accountsKey, async current => {
        session.signal.throwIfAborted()
        return current ?? { kind: 'grant', payload: { hostId: native.createHostId(), accounts: [] } }
      })
      const vault = requiredVault(initialized)
      let previous: string | undefined
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
      let result: LoginResult
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
      await this.credentials.modifyRecord(accountsKey, async current => {
        session.signal.throwIfAborted()
        const latest = requiredVault(current)
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
