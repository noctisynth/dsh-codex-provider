import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { ArrowRight, Check, Plus } from 'lucide-react'
import { useState } from 'react'
import type { AccountStatus } from '../shared/account-ui.ts'
import { loginMethodLabel } from '../shared/login-methods.ts'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import { AccountAvatar } from './account-avatar.tsx'
import { AccountQuota } from './account-quota.tsx'
import { FeatureSettings } from './feature-settings.tsx'
import { cn } from './lib/utils.ts'
import { LoginPanel } from './login-panel.tsx'
import { LogoutConfirmation } from './logout-confirmation.tsx'
import { OpenAiLogo } from './openai-logo.tsx'
import { Button } from './ui/button.tsx'
import { Skeleton } from './ui/skeleton.tsx'
import { useAccountSettings } from './use-account-settings.ts'
import { useQuotaInterval } from './use-quota.ts'

type Account = AccountStatus['accounts'][number]

function accountDescription(account: Account, t: Translate) {
  if (!account.hasCredentials) return t('Signed out · Sign in again to continue')
  if (!account.planUsageAuthorized) return t('Model access not granted')
  return account.name && account.email ? account.email : t('Connected')
}

export function AccountSettings({
  rpc,
  preference,
  embedded,
  t,
}: {
  rpc: ClientConnectionRpc
  preference: ConfigForm<SidebarPreference>
  embedded: boolean
  t: Translate
}) {
  const { status, busy, notice, error, act } = useAccountSettings(rpc)
  const quotaMinutes = useQuotaInterval(preference)
  const [logout, setLogout] = useState<Account | null>(null)
  const running = status?.login.running === true
  const accounts = status?.accounts ?? []
  const failure = error || status?.login.error
  return (
    <section
      data-codex-provider=''
      aria-label={t('ChatGPT accounts')}
      aria-busy={!status || busy}
      className={cn(
        'cp:box-border cp:[&_*]:box-border cp:w-full cp:max-w-3xl cp:text-sm cp:leading-relaxed cp:text-foreground cp:[&_button]:font-[inherit]',
        embedded ? 'cp:py-2' : 'cp:py-4',
      )}
    >
      <header className='cp:mb-7 cp:flex cp:flex-wrap cp:items-center cp:justify-between cp:gap-3'>
        <div className='cp:flex cp:items-center cp:gap-3'>
          <div className='cp:flex cp:shrink-0 cp:items-center cp:justify-center cp:rounded-xl cp:bg-muted cp:p-1.5'>
            <OpenAiLogo size={48} />
          </div>
          <div>
            <h2 className='cp:m-0 cp:text-lg cp:font-semibold cp:tracking-tight'>ChatGPT</h2>
            <p className='cp:mt-1 cp:mb-0 cp:text-sm cp:text-muted-foreground'>
              {t('Manage accounts for Codex models.')}
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
          {t('Add account')}
        </Button>
      </header>
      {!status && (
        <div role='status' className='cp:space-y-3 cp:py-5' aria-label={t('Loading accounts')}>
          <Skeleton className='cp:h-4 cp:w-40' />
          <Skeleton className='cp:h-3 cp:w-56 cp:max-w-full' />
        </div>
      )}
      {status && accounts.length === 0 && !running && (
        <div className='cp:rounded-xl cp:bg-muted/50 cp:px-6 cp:py-8'>
          <h3 className='cp:m-0 cp:text-base cp:font-medium'>
            {t('Connect your ChatGPT account')}
          </h3>
          <p className='cp:mt-2 cp:mb-5 cp:text-muted-foreground'>
            {t('Complete sign-in in your browser to use Codex in conversations.')}
          </p>
          <Button
            size='sm'
            aria-label={t('Sign in with ChatGPT')}
            disabled={busy}
            onClick={() => act('login')}
          >
            {t('Sign in with ChatGPT')}
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
                    {account.name || account.email || t('ChatGPT account')}
                  </span>
                  <span className='cp:shrink-0 cp:rounded-md cp:bg-muted cp:px-1.5 cp:py-0.5 cp:text-[10px] cp:leading-4 cp:font-normal cp:text-muted-foreground'>
                    {t(loginMethodLabel(account.loginMethod))}
                  </span>
                  {account.hasCredentials &&
                    account.planUsageAuthorized &&
                    status?.active === account.id && (
                      <Check
                        aria-label={t('Currently selected')}
                        className='cp:size-3 cp:shrink-0 cp:text-muted-foreground'
                      />
                    )}
                </div>
                <div className='cp:mt-1 cp:flex cp:items-center cp:gap-1.5 cp:text-xs cp:text-muted-foreground'>
                  {accountDescription(account, t)}
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
                    {t('Sign in again')}
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
                        {t('Switch account')}
                      </Button>
                    )}
                    <Button
                      size='sm'
                      variant='ghost'
                      className='cp:text-destructive cp:hover:bg-destructive/10 cp:hover:text-destructive'
                      disabled={busy || running}
                      onClick={() => setLogout(account)}
                    >
                      {t('Sign out')}
                    </Button>
                  </>
                )}
              </div>
              {account.hasCredentials && account.capabilities.quota && (
                <AccountQuota id={account.id} rpc={rpc} t={t} minutes={quotaMinutes} />
              )}
            </div>
          ))}
        </div>
      )}
      {running && status && (
        <LoginPanel
          t={t}
          login={status.login}
          accounts={accounts}
          busy={busy}
          answer={(id) => void act('answer', { id })}
          cancel={() => void act('cancel')}
        />
      )}
      {notice && (
        <p role='status' className='cp:mt-3 cp:mb-0 cp:text-xs cp:text-muted-foreground'>
          {t(notice)}
        </p>
      )}
      {failure && (
        <p role='alert' className='cp:mt-3 cp:mb-0 cp:text-sm cp:text-destructive'>
          {t(failure)}
        </p>
      )}
      <p className='cp:mt-5 cp:mb-0 cp:text-xs cp:text-muted-foreground'>
        {t('Change models and reasoning effort from the conversation model menu.')}
      </p>
      <FeatureSettings
        form={preference}
        rpc={rpc}
        t={t}
        capabilities={accounts.find((account) => account.id === status?.active)?.capabilities}
      />
      {logout && (
        <LogoutConfirmation
          t={t}
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
