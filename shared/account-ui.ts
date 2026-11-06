import type { AccountInfo } from '../index.cjs'

export interface LoginPrompt {
  message: string
  options: readonly { id: string; label: string; description?: string }[]
}

export interface LoginState {
  running: boolean
  notice?: string
  prompt?: LoginPrompt
  error?: string
}

export interface AccountStatus {
  active?: string
  accounts: (Pick<AccountInfo, 'clientId' | 'email' | 'name' | 'picture' | 'hasCredentials' | 'planUsageAuthorized'> & {
    gravatarPicture?: string
  })[]
  login: LoginState
}

export interface AccountActions {
  status: AccountStatus
  login: null
  answer: null
  cancel: null
  select: { revocationConfirmed?: boolean }
  logout: { revocationConfirmed: boolean }
}
