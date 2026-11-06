import { useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ClientConnectionRpc, ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { AccountActions, AccountStatus } from '../shared/account-ui.ts'

export const inject = ['slots', 'connection']

function AccountSettings({ rpc, embedded }: { rpc: ClientConnectionRpc; embedded: boolean }) {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const ownedLogin = useRef(false)

  const call = async <A extends keyof AccountActions>(action: A, payload: { id: string } | null = null, signal?: AbortSignal): Promise<AccountActions[A]> => {
    const result = await rpc.call('/api', `codex-provider/${action}`, payload, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value as AccountActions[A]
  }

  useEffect(() => {
    const lifetime = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const value = await call('status', null, lifetime.signal)
        if (lifetime.signal.aborted) return
        setStatus(value)
        if (!value.login.running) ownedLogin.current = false
        if (value.login.running) timer = setTimeout(load, 700)
      } catch (error) { if (!lifetime.signal.aborted) setError(error instanceof Error ? error.message : '无法读取 ChatGPT 状态。') }
    }
    void load()
    return () => {
      lifetime.abort()
      clearTimeout(timer)
    }
  }, [rpc, busy])

  useEffect(() => () => {
    if (ownedLogin.current) void call('cancel').catch(() => {})
  }, [rpc])

  async function act(action: Exclude<keyof AccountActions, 'status'>, payload?: { id: string }): Promise<void> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const value = await call(action, payload)
      if (action === 'login') ownedLogin.current = true
      if (action === 'logout') setNotice((value as AccountActions['logout']).revocationConfirmed
        ? '已退出 ChatGPT。'
        : '本地凭据已清除，未能确认远端授权撤销。')
    } catch (error) { setError(error instanceof Error ? error.message : 'ChatGPT 操作失败。') }
    finally { setBusy(false) }
  }

  const running = status?.login.running === true
  return <section style={{ padding: embedded ? '12px 0' : '20px 0', color: 'inherit' }}>
    <h2>ChatGPT</h2>
    <p>使用 ChatGPT 官方账号登录，再从 DSH 的模型选择器选择 ChatGPT 模型。</p>
    {status?.accounts.map(account => <div key={account.clientId} style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)', padding: '12px 0' }}>
      <strong>{account.email ?? 'ChatGPT 账号'}</strong>
      {status.active === account.clientId && <span> · 当前账号</span>}
      <div style={{ fontSize: 12, overflowWrap: 'anywhere', opacity: 0.7 }}>{account.clientId}</div>
      <p>{!account.hasCredentials ? '已退出登录' : account.planUsageAuthorized ? '已授权订阅用量' : '未授予订阅用量权限'}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        {account.hasCredentials && status.active !== account.clientId && <button disabled={busy || running} onClick={() => act('select', { id: account.clientId })}>切换至此账号</button>}
        {account.hasCredentials && <button disabled={busy || running} onClick={() => act('logout', { id: account.clientId })}>退出登录</button>}
      </div>
    </div>)}
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      <button disabled={busy || running || !status} onClick={() => act('login')}>使用 ChatGPT 登录 / 添加账号</button>
      {running && <button disabled={busy} onClick={() => act('cancel')}>取消登录</button>}
    </div>
    {status?.login.prompt && <fieldset style={{ marginTop: 16 }}>
      <legend>{status.login.prompt.message}</legend>
      {status.login.prompt.options.map(option => <button key={option.id} disabled={busy} onClick={() => act('answer', { id: option.id })} style={{ display: 'block', margin: '8px 0' }}>
        {option.label}{option.description ? ` · ${option.description}` : ''}
      </button>)}
    </fieldset>}
    <p role="status">{notice || status?.login.notice || (status?.accounts.length === 0 ? '尚未登录 ChatGPT。' : '')}</p>
    {(error || status?.login.error) && <p role="alert">{error || status?.login.error}</p>}
  </section>
}

export function apply(ctx: Context): void {
  const rpc = (ctx.get('connection') as ConnectionHandle).rpc
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-provider', order: 15,
    label: () => 'ChatGPT', inject: () => ({ rpc, embedded: false }),
  }, AccountSettings))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: 'dsh-codex-provider',
    inject: () => ({ rpc, embedded: true }),
  }, AccountSettings))
}
