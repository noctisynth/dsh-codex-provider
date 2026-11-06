import { createHash } from 'node:crypto'
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import open from 'open'
import type { Cancellation, ChatGptClient, LoginAttempt, LoginResult } from '../index.cjs'
import native from '../index.cjs'
import { loginMethodLabel, loginMethods } from '../shared/login-methods.ts'
import type { Operations } from './operations.ts'

interface Vault {
  hostId: string
  active?: string
  accounts: string[]
}

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
  private openBrowser: (url: string) => Promise<unknown>

  constructor(
    credentials: CredentialProvider,
    client: ChatGptClient,
    operations: Operations,
    openBrowser: (url: string) => Promise<unknown> = open,
  ) {
    this.credentials = credentials
    this.client = client
    this.operations = operations
    this.openBrowser = openBrowser
  }

  async read() {
    return vaultOf(await this.credentials.readRecord(accountsKey))
  }

  async summary() {
    const vault = await this.read()
    return {
      active: vault?.active,
      accounts: (vault?.accounts ?? []).map((record) => {
        const { id, loginMethod, email, name, picture, hasCredentials, planUsageAuthorized } =
          native.describeSession(record)
        const normalizedEmail = email?.trim().toLowerCase()
        const gravatarPicture = normalizedEmail
          ? `https://gravatar.com/avatar/${createHash('sha256').update(normalizedEmail).digest('hex')}?s=96&d=404&r=g`
          : undefined
        return {
          id,
          loginMethod,
          email,
          name,
          picture,
          gravatarPicture,
          hasCredentials,
          planUsageAuthorized,
        }
      }),
    }
  }

  async select(id: string): Promise<void> {
    await this.credentials.modifyRecord(accountsKey, async (current) => {
      const vault = requiredVault(current)
      if (!vault?.accounts.some((record) => native.describeSession(record).id === id)) {
        throw new LlmError('未找到该 ChatGPT 注册。', 'AUTH')
      }
      return { kind: 'grant', payload: { ...vault, active: id } }
    })
  }

  async logout(id: string, cancellation: Cancellation) {
    let outcome = { revocationConfirmed: false, localOnly: false }
    await this.credentials.modifyRecord(accountsKey, async (current) => {
      const vault = requiredVault(current)
      const index = vault.accounts.findIndex((record) => native.describeSession(record).id === id)
      if (index < 0) throw new LlmError('未找到该 ChatGPT 注册。', 'AUTH')
      const result = await this.client.logoutSession(vault.accounts[index], cancellation)
      outcome = { revocationConfirmed: result.revocationConfirmed, localOnly: result.localOnly }
      const accounts = [...vault.accounts]
      accounts[index] = result.record
      return { kind: 'grant', payload: { ...vault, accounts } }
    })
    return outcome
  }

  async selected(cancellation: Cancellation): Promise<string> {
    let selected = ''
    let signedOut = false
    await this.credentials.modifyRecord(accountsKey, async (current) => {
      const vault = requiredVault(current)
      const record = vault.accounts.find(
        (record) => native.describeSession(record).id === vault.active,
      )
      if (!record || !native.describeSession(record).hasCredentials) {
        throw new LlmError('请先在设置 → ChatGPT 中登录。', 'AUTH')
      }
      const renewed = await this.client.renewSession(record, cancellation)
      selected = renewed.record
      signedOut = !renewed.account.hasCredentials
      if (selected === record) return undefined
      return {
        kind: 'grant',
        payload: {
          ...vault,
          accounts: vault.accounts.map((value) => (value === record ? selected : value)),
        },
      }
    })
    // A terminal refresh failure must commit its cleared tokens before reporting failure.
    if (signedOut)
      throw new LlmError(
        'ChatGPT 登录已失效，请在设置 → ChatGPT 中重新登录。',
        'INVALID_CREDENTIAL',
      )
    return selected
  }

  async authorize(session: AuthorizationSession): Promise<void> {
    const operation = this.operations.start(session.signal)
    let attempt: LoginAttempt | undefined
    try {
      // Persist the stable host identity before constructing the first OAuth URL.
      const initialized = await this.credentials.modifyRecord(accountsKey, async (current) => {
        session.signal.throwIfAborted()
        return (
          current ?? { kind: 'grant', payload: { hostId: native.createHostId(), accounts: [] } }
        )
      })
      const vault = requiredVault(initialized)
      let previous: string | undefined
      if (vault.accounts.length) {
        const choice = await session.prompt({
          kind: 'select',
          message: '选择 ChatGPT 注册，或添加账号',
          options: [
            ...vault.accounts.map((record) => {
              const account = native.describeSession(record)
              return {
                id: account.id,
                label: account.email ?? 'ChatGPT 账号',
                description: loginMethodLabel(account.loginMethod),
              }
            }),
            { id: 'add', label: '添加 ChatGPT 账号' },
          ],
        })
        if (choice !== 'add')
          previous = vault.accounts.find((record) => native.describeSession(record).id === choice)
      }
      const method = previous
        ? native.describeSession(previous).loginMethod
        : await session.prompt({ kind: 'select', message: '选择登录方式', options: loginMethods })
      attempt = await this.client.beginLogin(vault.hostId, previous, operation.cancellation, method)
      let result: LoginResult
      for (;;) {
        session.signal.throwIfAborted()
        session.notify(
          attempt.userCode
            ? {
                message: '请打开验证页面，输入下方设备码完成登录。',
                url: attempt.authorizationUrl,
                code: attempt.userCode,
              }
            : { message: '请在系统浏览器中完成 ChatGPT 登录。' },
        )
        await this.openBrowser(attempt.authorizationUrl)
        try {
          result = await attempt.complete()
          break
        } catch (error) {
          if (!attempt.canRetry) throw error
          const answer = await session.prompt({
            kind: 'select',
            message: '授权码已失效，是否重新登录？',
            options: [
              { id: 'retry', label: '重新登录' },
              { id: 'cancel', label: '取消' },
            ],
          })
          if (answer !== 'retry') throw error
          await attempt.retry()
        }
      }
      await this.credentials.modifyRecord(accountsKey, async (current) => {
        session.signal.throwIfAborted()
        const latest = requiredVault(current)
        const accounts = latest.accounts.filter(
          (record) => native.describeSession(record).id !== result.account.id,
        )
        accounts.push(result.record)
        return { kind: 'grant', payload: { ...latest, accounts, active: result.account.id } }
      })
      session.notify({
        message: result.account.planUsageAuthorized
          ? 'ChatGPT 登录完成。'
          : '登录完成，但未授予 ChatGPT 订阅用量权限，暂时无法调用模型。',
      })
    } finally {
      attempt?.cancel()
      operation.close()
    }
  }
}
