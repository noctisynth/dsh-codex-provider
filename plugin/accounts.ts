import { createHash } from 'node:crypto'
import {
  AuthorizationDeclinedError,
  type AuthorizationSession,
} from '@deepseek-ai/dsh-authorization'
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
  if (record.kind !== 'grant') throw new LlmError('Invalid ChatGPT credential record type.', 'AUTH')
  return record.payload as Vault
}

function requiredVault(record: CredentialRecord | undefined): Vault {
  const vault = vaultOf(record)
  if (!vault) throw new LlmError('Sign in from Settings → ChatGPT first.', 'AUTH')
  return vault
}

async function chooseLogin(session: AuthorizationSession, vault: Pick<Vault, 'accounts'>) {
  for (;;) {
    let previous: string | undefined
    if (vault.accounts.length) {
      const choice = await session.prompt({
        kind: 'select',
        message: 'Choose an account',
        options: [
          ...vault.accounts.map((record) => {
            const account = native.describeSession(record)
            return {
              id: account.id,
              label: account.email ?? 'ChatGPT account',
              description: loginMethodLabel(account.loginMethod),
            }
          }),
          { id: 'add', label: 'Add ChatGPT account' },
        ],
      })
      if (choice !== 'add')
        previous = vault.accounts.find((record) => native.describeSession(record).id === choice)
    }
    if (previous) return { previous, method: native.describeSession(previous).loginMethod }
    const method = await session.prompt({
      kind: 'select',
      message: 'Choose a sign-in method',
      options: [...loginMethods, { id: 'back', label: 'Back' }],
    })
    if (method !== 'back') return { previous: undefined, method }
    if (!vault.accounts.length) throw new AuthorizationDeclinedError()
  }
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
        throw new LlmError('ChatGPT account not found.', 'AUTH')
      }
      return { kind: 'grant', payload: { ...vault, active: id } }
    })
  }

  async logout(id: string, cancellation: Cancellation) {
    let outcome = { revocationConfirmed: false, localOnly: false }
    await this.credentials.modifyRecord(accountsKey, async (current) => {
      const vault = requiredVault(current)
      const index = vault.accounts.findIndex((record) => native.describeSession(record).id === id)
      if (index < 0) throw new LlmError('ChatGPT account not found.', 'AUTH')
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
        throw new LlmError('Sign in from Settings → ChatGPT first.', 'AUTH')
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
        'Your ChatGPT sign-in has expired. Sign in again from Settings → ChatGPT.',
        'INVALID_CREDENTIAL',
      )
    return selected
  }

  async authorize(session: AuthorizationSession): Promise<void> {
    const operation = this.operations.start(session.signal)
    let attempt: LoginAttempt | undefined
    try {
      const available = await this.read()
      const { previous, method } = await chooseLogin(session, {
        accounts: available?.accounts ?? [],
      })
      // Persist the stable host identity before constructing the first OAuth URL.
      const initialized = await this.credentials.modifyRecord(accountsKey, async (current) => {
        session.signal.throwIfAborted()
        return (
          current ?? { kind: 'grant', payload: { hostId: native.createHostId(), accounts: [] } }
        )
      })
      const vault = requiredVault(initialized)
      attempt = await this.client.beginLogin(vault.hostId, previous, operation.cancellation, method)
      let result: LoginResult
      for (;;) {
        session.signal.throwIfAborted()
        session.notify(
          attempt.userCode
            ? {
                message: 'Open the verification page and enter the code below to sign in.',
                url: attempt.authorizationUrl,
                code: attempt.userCode,
              }
            : { message: 'Complete ChatGPT sign-in in your system browser.' },
        )
        await this.openBrowser(attempt.authorizationUrl)
        try {
          result = await attempt.complete()
          break
        } catch (error) {
          if (!attempt.canRetry) throw error
          const answer = await session.prompt({
            kind: 'select',
            message: 'The authorization code expired. Sign in again?',
            options: [
              { id: 'retry', label: 'Sign in again' },
              { id: 'cancel', label: 'Cancel' },
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
          ? 'ChatGPT sign-in completed.'
          : 'Signed in without permission to use your ChatGPT plan. Model requests are unavailable.',
      })
    } finally {
      attempt?.cancel()
      operation.close()
    }
  }
}
