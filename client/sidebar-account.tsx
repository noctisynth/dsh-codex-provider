import type { Context } from '@deepseek-ai/cordis'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
import type {
  ConfigForm,
  SettingsLauncherOwnerProps,
} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ArrowLeftRight, LogOut, RefreshCw, Settings } from 'lucide-react'
import { useRef, useState } from 'react'
import type { AccountStatus } from '../shared/account-ui.ts'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import { AccountAvatar } from './account-avatar.tsx'
import { cn } from './lib/utils.ts'
import { localeNamespace } from './locales/index.ts'
import { LogoutConfirmation } from './logout-confirmation.tsx'
import { OpenAiLogo } from './openai-logo.tsx'
import { setPreference } from './preferences.ts'
import { quotaWindow } from './quota-format.ts'
import { buttonVariants } from './ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx'
import { useAccountSettings } from './use-account-settings.ts'
import { useQuota, useQuotaInterval } from './use-quota.ts'

export function ChatGptLauncher({
  rpc,
  form,
  wide,
  openSettings,
  settingsShortcut,
  t,
}: SettingsLauncherOwnerProps & {
  rpc: ClientConnectionRpc
  form: ConfigForm<SidebarPreference>
  t: Translate
}) {
  const { status, busy, error, act } = useAccountSettings(rpc)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preferenceError, setPreferenceError] = useState('')
  const [logout, setLogout] = useState<AccountStatus['accounts'][number] | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = useRef<'settings' | 'logout' | null>(null)
  const account = status?.accounts.find(
    (account) => account.id === status.active && account.hasCredentials,
  )
  const label = account?.name || account?.email || 'ChatGPT'
  const quotaMinutes = useQuotaInterval(form)
  const {
    quota,
    loading,
    error: quotaError,
    refresh,
  } = useQuota(rpc, account?.capabilities.quota ? account.id : undefined, quotaMinutes)
  const quotaSummary = quota?.windows
    .filter((window) => window.name === 'Codex')
    .map((window) => `${quotaWindow(window, t)} ${Math.round(window.remainingPercent)}%`)
    .join(' · ')
  const subtitle = quotaSummary
    ? `${t('Remaining')} ${quotaSummary}`
    : quotaError
      ? t('Usage unavailable')
      : 'ChatGPT'
  const failure = preferenceError || error
  async function restoreDeepSeek() {
    setSaving(true)
    setPreferenceError('')
    try {
      await setPreference(rpc, 'sidebarAccount', 'deepseek')
    } catch (cause) {
      setPreferenceError(
        cause instanceof Error
          ? cause.message
          : 'Could not save the sidebar preference. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          ref={trigger}
          aria-label={t('{name}, account menu', { name: label })}
          title={wide ? (quotaSummary ? subtitle : undefined) : `${label} · ${subtitle}`}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'cp:box-border cp:min-w-0 cp:rounded-[var(--dsw-radius-md)] cp:text-foreground',
            wide
              ? 'cp:mx-0.5 cp:h-11 cp:w-[calc(100%-4px)] cp:justify-start cp:gap-2 cp:p-1.5 cp:has-[>svg]:px-1.5'
              : 'cp:mx-auto cp:size-9 cp:justify-center cp:gap-0 cp:p-0 cp:has-[>svg]:px-0',
          )}
        >
          {account ? (
            <AccountAvatar
              name={account.name}
              email={account.email}
              picture={account.picture}
              gravatarPicture={account.gravatarPicture}
              className='cp:size-6 cp:text-xs'
            />
          ) : (
            <OpenAiLogo size={24} className='cp:size-6' />
          )}
          {wide && (
            <span className='cp:min-w-0 cp:flex-1 cp:text-left'>
              <span className='cp:block cp:truncate cp:text-sm cp:leading-5 cp:font-medium'>
                {label}
              </span>
              <span className='cp:block cp:truncate cp:text-xs cp:leading-4 cp:font-normal cp:text-muted-foreground'>
                {account
                  ? subtitle
                  : status
                    ? t('Open settings to sign in')
                    : t('Loading accounts')}
              </span>
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          finalFocus={() => {
            const action = selected.current
            selected.current = null
            if (!action) return true
            trigger.current?.focus()
            if (action === 'settings') openSettings()
            else if (account) setLogout(account)
            return false
          }}
        >
          {account?.capabilities.quota && (
            <DropdownMenuItem
              disabled={loading}
              closeOnClick={false}
              onClick={() => void refresh?.()}
            >
              <RefreshCw aria-hidden='true' />
              {t('Refresh usage')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            aria-keyshortcuts={settingsShortcut?.aria}
            onClick={() => {
              selected.current = 'settings'
            }}
          >
            <Settings aria-hidden='true' />
            {t('Settings')}
            {settingsShortcut && (
              <span className='cp:ml-auto cp:pl-4 cp:text-xs cp:text-muted-foreground'>
                {settingsShortcut.keys.join(' ')}
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={saving}
            closeOnClick={false}
            onClick={() => {
              void restoreDeepSeek()
            }}
          >
            <ArrowLeftRight aria-hidden='true' />
            {t('Show DeepSeek account')}
          </DropdownMenuItem>
          {account && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                disabled={busy}
                onClick={() => {
                  selected.current = 'logout'
                }}
              >
                <LogOut aria-hidden='true' />
                {t('Sign out')}
              </DropdownMenuItem>
            </>
          )}
          {failure && (
            <p
              role='alert'
              className='cp:mx-2.5 cp:my-2 cp:max-w-56 cp:text-xs cp:leading-relaxed cp:text-destructive'
            >
              {t(failure)}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {logout && (
        <LogoutConfirmation
          t={t}
          account={logout}
          close={() => setLogout(null)}
          confirm={() => {
            setLogout(null)
            void act('logout', { id: logout.id }).then((success) => {
              if (!success) setOpen(true)
            })
          }}
        />
      )}
    </>
  )
}

export function mountSidebarAccount(
  ctx: Context,
  rpc: ClientConnectionRpc,
  form: ConfigForm<SidebarPreference>,
) {
  ctx.slots.inject('settings.launcher', () => {
    let dispose: (() => void) | undefined
    const sync = () => {
      if (form.getSnapshot().value?.sidebarAccount === 'chatgpt') {
        dispose ??= ctx.slots.register(
          {
            name: 'settings.launcher',
            locale: localeNamespace,
            priority: -1,
            inject: () => ({ rpc, form }),
          },
          ChatGptLauncher,
        )
      } else {
        const release = dispose
        dispose = undefined
        release?.()
      }
    }
    const unsubscribe = form.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      dispose?.()
    }
  })
}
