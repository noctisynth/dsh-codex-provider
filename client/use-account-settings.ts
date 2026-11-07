import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AccountActions, AccountStatus } from '../shared/account-ui.ts'

const accountStatusChanged = 'codex-provider:accounts-changed'

export function useAccountSettings(rpc: ClientConnectionRpc) {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [revision, refresh] = useState(0)
  const ownedLogin = useRef(false)
  const call = useCallback(
    async <A extends keyof AccountActions>(
      action: A,
      payload: { id: string } | null = null,
      signal?: AbortSignal,
    ): Promise<AccountActions[A]> => {
      const result = await rpc.call('/api', `codex-provider/${action}`, payload, signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value as AccountActions[A]
    },
    [rpc],
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision deliberately invalidates the account query after a user action.
  useEffect(() => {
    const lifetime = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const value = await call('status', null, lifetime.signal)
        if (lifetime.signal.aborted) return
        setStatus(value)
        const completed = ownedLogin.current && !value.login.running
        if (!value.login.running) ownedLogin.current = false
        if (completed) window.dispatchEvent(new Event(accountStatusChanged))
        if (value.login.running) timer = setTimeout(load, 700)
      } catch (error) {
        if (!lifetime.signal.aborted)
          setError(error instanceof Error ? error.message : 'Could not load accounts.')
      }
    }
    void load()
    return () => {
      lifetime.abort()
      clearTimeout(timer)
    }
  }, [call, revision])
  useEffect(() => {
    const resume = () => {
      setNotice('')
      setError('')
      refresh((value) => value + 1)
    }
    const visible = () => {
      if (document.visibilityState === 'visible') resume()
    }
    const changed = () => refresh((value) => value + 1)
    window.addEventListener('focus', resume)
    window.addEventListener(accountStatusChanged, changed)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('focus', resume)
      window.removeEventListener(accountStatusChanged, changed)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(
    () => () => {
      if (ownedLogin.current) void call('cancel').catch(() => {})
    },
    [call],
  )
  async function act(
    action: Exclude<keyof AccountActions, 'status'>,
    payload?: { id: string },
  ): Promise<boolean> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const value = await call(action, payload)
      if (action === 'login') ownedLogin.current = true
      if (action === 'logout') {
        const logout = value as AccountActions['logout']
        if (logout.revocationConfirmed || logout.localOnly) setNotice('Signed out.')
        else {
          setError('Local credentials were cleared, but remote revocation could not be confirmed.')
          return false
        }
      }
      return true
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The operation failed. Please try again.')
      return false
    } finally {
      setBusy(false)
      window.dispatchEvent(new Event(accountStatusChanged))
    }
  }
  return { status, busy, notice, error, act }
}
