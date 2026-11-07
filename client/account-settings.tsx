import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { ArrowRight, Check, Plus } from 'lucide-react'
import { useState } from 'react'
import type { AccountStatus } from '../shared/account-ui.ts'
import { loginMethodLabel } from '../shared/login-methods.ts'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import { AccountAvatar } from './account-avatar.tsx'
import { FeatureSettings } from './feature-settings.tsx'
import { LoginPanel } from './login-panel.tsx'
import { LogoutConfirmation } from './logout-confirmation.tsx'
import { OpenAiLogo } from './openai-logo.tsx'
import { Button } from './ui/button.tsx'
import { Skeleton } from './ui/skeleton.tsx'
import { useAccountSettings } from './use-account-settings.ts'

type Account = AccountStatus['accounts'][number]

export function AccountSettings({
  rpc,
  preference,
  embedded,
}: {
  rpc: ClientConnectionRpc
  preference: ConfigForm<SidebarPreference>
  embedded: boolean
}) {
  const { status, busy, notice, error, act } = useAccountSettings(rpc)
  const [logout, setLogout] = useState<Account | null>(null)
  const running = status?.login.running === true
  const accounts = status?.accounts ?? []
  const failure = error || status?.login.error
  return (
    <section
      data-codex-provider=''
      aria-label='ChatGPT 账号设置'
      aria-busy={!status || busy}
      className={`cp:box-border cp:[&_*]:box-border cp:w-full cp:max-w-3xl cp:text-sm cp:leading-relaxed cp:text-foreground cp:[&_button]:font-[inherit] ${embedded ? 'cp:py-2' : 'cp:py-4'}`}
    >
      <header className='cp:mb-7 cp:flex cp:flex-wrap cp:items-center cp:justify-between cp:gap-3'>
        <div className='cp:flex cp:items-center cp:gap-3'>
          <div className='cp:flex cp:shrink-0 cp:items-center cp:justify-center cp:rounded-xl cp:bg-muted cp:p-1.5'>
            <OpenAiLogo size={48} />
          </div>
          <div>
            <h2 className='cp:m-0 cp:text-lg cp:font-semibold cp:tracking-tight'>ChatGPT</h2>
            <p className='cp:mt-1 cp:mb-0 cp:text-sm cp:text-muted-foreground'>
              管理用于 Codex 模型的账号。
            </p>
          </div>
        </div>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || running || !status}
          onClick={() => act('login')}
        >
          <Plus aria-hidden='true' />
          添加账号
        </Button>
      </header>
      {!status && (
        <div role='status' className='cp:space-y-3 cp:py-5' aria-label='正在读取账号'>
          <Skeleton className='cp:h-4 cp:w-40' />
          <Skeleton className='cp:h-3 cp:w-56 cp:max-w-full' />
        </div>
      )}
      {status && accounts.length === 0 && !running && (
        <div className='cp:rounded-xl cp:bg-muted/50 cp:px-6 cp:py-8'>
          <h3 className='cp:m-0 cp:text-base cp:font-medium'>连接你的 ChatGPT 账号</h3>
          <p className='cp:mt-2 cp:mb-5 cp:text-muted-foreground'>
            在浏览器中完成授权，即可在对话中使用 Codex。
          </p>
          <Button
            size='sm'
            aria-label='使用 ChatGPT 登录'
            disabled={busy}
            onClick={() => act('login')}
          >
            使用 ChatGPT 登录
            <ArrowRight aria-hidden='true' />
          </Button>
        </div>
      )}
      {!!accounts.length && (
        <div className='cp:border-y cp:border-solid cp:border-x-0 cp:border-border'>
          {accounts.map((account) => (
            <div
              key={account.id}
              className='cp:flex cp:flex-wrap cp:items-center cp:gap-3 cp:border-0 cp:border-b cp:border-solid cp:border-border cp:py-5 cp:last:border-b-0'
            >
              <AccountAvatar
                name={account.name}
                email={account.email}
                picture={account.picture}
                gravatarPicture={account.gravatarPicture}
              />
              <div className='cp:min-w-0 cp:flex-1 cp:basis-40'>
                <div className='cp:flex cp:flex-wrap cp:items-center cp:gap-2'>
                  <span className='cp:break-all cp:font-medium'>
                    {account.name || account.email || 'ChatGPT 账号'}
                  </span>
                  <span className='cp:shrink-0 cp:rounded-md cp:bg-muted cp:px-1.5 cp:py-0.5 cp:text-[10px] cp:leading-4 cp:font-normal cp:text-muted-foreground'>
                    {loginMethodLabel(account.loginMethod)}
                  </span>
                  {account.hasCredentials &&
                    account.planUsageAuthorized &&
                    status?.active === account.id && (
                      <Check
                        aria-label='当前使用'
                        className='cp:size-3 cp:shrink-0 cp:text-muted-foreground'
                      />
                    )}
                </div>
                <div className='cp:mt-1 cp:flex cp:items-center cp:gap-1.5 cp:text-xs cp:text-muted-foreground'>
                  {!account.hasCredentials
                    ? '已退出 · 重新登录后可用'
                    : !account.planUsageAuthorized
                      ? '未授权模型使用权限'
                      : account.name && account.email
                        ? account.email
                        : '已连接'}
                </div>
              </div>
              <div className='cp:flex cp:items-center cp:gap-2'>
                {!account.hasCredentials ? (
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy || running}
                    onClick={() => act('login')}
                  >
                    重新登录
                  </Button>
                ) : (
                  <>
                    {status?.active !== account.id && (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={busy || running}
                        onClick={() => act('select', { id: account.id })}
                      >
                        切换账号
                      </Button>
                    )}
                    <Button
                      size='sm'
                      variant='ghost'
                      className='cp:text-destructive cp:hover:bg-destructive/10 cp:hover:text-destructive'
                      disabled={busy || running}
                      onClick={() => setLogout(account)}
                    >
                      退出登录
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {running && status && (
        <LoginPanel
          login={status.login}
          accounts={accounts}
          busy={busy}
          answer={(id) => void act('answer', { id })}
          cancel={() => void act('cancel')}
        />
      )}
      {notice && (
        <p role='status' className='cp:mt-3 cp:mb-0 cp:text-xs cp:text-muted-foreground'>
          {notice}
        </p>
      )}
      {failure && (
        <p role='alert' className='cp:mt-3 cp:mb-0 cp:text-sm cp:text-destructive'>
          {failure}
        </p>
      )}
      <p className='cp:mt-5 cp:mb-0 cp:text-xs cp:text-muted-foreground'>
        模型与推理强度在对话的模型菜单中切换。
      </p>
      <FeatureSettings form={preference} rpc={rpc} />
      {logout && (
        <LogoutConfirmation
          account={logout}
          close={() => setLogout(null)}
          confirm={() => {
            setLogout(null)
            void act('logout', { id: logout.id })
          }}
        />
      )}
    </section>
  )
}
