import type { Context } from '@deepseek-ai/cordis'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type {
  ConfigForm,
  SettingsLauncherOwnerProps,
} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ArrowLeftRight, LogOut, Settings } from 'lucide-react'
import { useRef, useState } from 'react'
import type { AccountStatus } from '../shared/account-ui.ts'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import { AccountAvatar } from './account-avatar.tsx'
import { cn } from './lib/utils.ts'
import { LogoutConfirmation } from './logout-confirmation.tsx'
import { OpenAiLogo } from './openai-logo.tsx'
import { setPreference } from './preferences.ts'
import { buttonVariants } from './ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx'
import { useAccountSettings } from './use-account-settings.ts'

export function ChatGptLauncher({
  rpc,
  wide,
  openSettings,
  settingsShortcut,
}: SettingsLauncherOwnerProps & { rpc: ClientConnectionRpc; form: ConfigForm<SidebarPreference> }) {
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
  const failure = preferenceError || error
  async function restoreDeepSeek() {
    setSaving(true)
    setPreferenceError('')
    try {
      await setPreference(rpc, 'sidebarAccount', 'deepseek')
    } catch (cause) {
      setPreferenceError(
        cause instanceof Error ? cause.message : '未能保存侧边栏显示设置，请重试。',
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
          aria-label={`${label}，账号菜单`}
          title={wide ? undefined : `${label} · ChatGPT`}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            `cp:box-border cp:min-w-0 cp:rounded-[var(--dsw-radius-md)] cp:text-foreground ${wide ? 'cp:mx-0.5 cp:h-11 cp:w-[calc(100%-4px)] cp:justify-start cp:gap-2 cp:p-1.5 cp:has-[>svg]:px-1.5' : 'cp:mx-auto cp:size-9 cp:justify-center cp:gap-0 cp:p-0 cp:has-[>svg]:px-0'}`,
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
                {account ? 'ChatGPT' : status ? '前往设置登录' : '正在读取账号'}
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
          <DropdownMenuItem
            aria-keyshortcuts={settingsShortcut?.aria}
            onClick={() => {
              selected.current = 'settings'
            }}
          >
            <Settings aria-hidden='true' />
            设置
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
            显示 DeepSeek 账号
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
                退出登录
              </DropdownMenuItem>
            </>
          )}
          {failure && (
            <p
              role='alert'
              className='cp:mx-2.5 cp:my-2 cp:max-w-56 cp:text-xs cp:leading-relaxed cp:text-destructive'
            >
              {failure}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {logout && (
        <LogoutConfirmation
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
          { name: 'settings.launcher', priority: -1, inject: () => ({ rpc, form }) },
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
