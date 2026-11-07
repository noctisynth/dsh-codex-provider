import { ArrowRight, KeyRound, LoaderCircle, Monitor, Plus, RotateCw } from 'lucide-react'
import type { AccountStatus, LoginState } from '../shared/account-ui.ts'
import { loginMethodLabel } from '../shared/login-methods.ts'
import { AccountAvatar } from './account-avatar.tsx'
import { OpenAiLogo } from './openai-logo.tsx'
import { Button } from './ui/button.tsx'

export function LoginPanel({
  login,
  accounts,
  busy,
  answer,
  cancel,
}: {
  login: LoginState
  accounts: AccountStatus['accounts']
  busy: boolean
  answer(id: string): void
  cancel(): void
}) {
  const prompt = login.prompt
  const add = prompt?.options.find((option) => option.id === 'add')
  const choices = prompt?.options.filter((option) => option.id !== 'add' && option.id !== 'cancel')
  const title = add
    ? '连接 ChatGPT'
    : (prompt?.message ?? (login.device ? '输入设备码' : '在浏览器中继续'))
  const description = add
    ? '重新登录已有账号，或添加新账号。'
    : prompt
      ? undefined
      : login.device
        ? '打开验证页面，输入以下验证码。'
        : '完成登录后，这里会自动更新。'

  return (
    <section
      aria-label='ChatGPT 登录'
      className='cp:mt-5 cp:overflow-hidden cp:rounded-xl cp:border cp:border-solid cp:border-border'
    >
      <div role='status' className='cp:flex cp:items-start cp:gap-3 cp:px-4 cp:pt-4 cp:pb-3'>
        {!prompt && (
          <LoaderCircle
            aria-hidden='true'
            className='cp:mt-0.5 cp:size-4 cp:shrink-0 cp:animate-spin cp:text-muted-foreground cp:motion-reduce:animate-none'
          />
        )}
        <div>
          <h3 className='cp:m-0 cp:text-sm cp:leading-5 cp:font-medium'>{title}</h3>
          {description && (
            <p className='cp:mt-1 cp:mb-0 cp:text-xs cp:leading-[18px] cp:text-muted-foreground'>
              {description}
            </p>
          )}
        </div>
      </div>
      {choices && (
        <div className='cp:space-y-1 cp:px-2 cp:pb-2'>
          {choices.map((option) => {
            const account = accounts.find((account) => account.id === option.id)
            const Icon =
              option.id === 'codex-browser'
                ? Monitor
                : option.id === 'codex-device'
                  ? KeyRound
                  : RotateCw
            const label = account
              ? `重新登录 ${account.name || account.email || '此账号'}`
              : option.label
            const detail = account
              ? [account.name && account.email, loginMethodLabel(account.loginMethod)]
                  .filter(Boolean)
                  .join(' · ')
              : option.description
            return (
              <Button
                key={option.id}
                size='sm'
                variant='ghost'
                disabled={busy}
                onClick={() => answer(option.id)}
                className='cp:group cp:h-auto cp:min-h-14 cp:w-full cp:justify-start cp:gap-3 cp:rounded-lg cp:px-3 cp:py-2.5 cp:text-left cp:font-normal cp:whitespace-normal cp:has-[>svg]:pr-5 cp:has-[>svg]:pl-3'
              >
                {account ? (
                  <AccountAvatar {...account} className='cp:size-8' />
                ) : (
                  <span className='cp:flex cp:size-8 cp:shrink-0 cp:items-center cp:justify-center cp:rounded-lg cp:bg-muted/60 cp:text-muted-foreground'>
                    {option.id === 'siwc' ? (
                      <OpenAiLogo size={20} className='cp:size-5' />
                    ) : (
                      <Icon className='cp:size-4' />
                    )}
                  </span>
                )}
                <span className='cp:min-w-0 cp:flex-1 cp:break-words'>
                  <span className='cp:block cp:leading-5 cp:font-medium'>{label}</span>
                  {detail && (
                    <span className='cp:mt-0.5 cp:block cp:text-xs cp:leading-[18px] cp:text-muted-foreground'>
                      {detail}
                    </span>
                  )}
                </span>
                <ArrowRight
                  aria-hidden='true'
                  className='cp:size-4 cp:text-muted-foreground cp:transition-transform cp:duration-150 cp:group-hover:translate-x-1 cp:group-focus-visible:translate-x-1 cp:motion-reduce:transition-none cp:motion-reduce:transform-none'
                />
              </Button>
            )
          })}
        </div>
      )}
      {login.device && (
        <div className='cp:flex cp:flex-wrap cp:items-center cp:justify-between cp:gap-3 cp:px-4 cp:pb-4'>
          <code className='cp:select-all cp:rounded-lg cp:bg-muted/50 cp:px-4 cp:py-2 cp:font-mono cp:text-lg cp:tracking-widest'>
            {login.device.code}
          </code>
          <a
            href={login.device.url}
            target='_blank'
            rel='noreferrer'
            className='cp:text-xs cp:text-foreground cp:underline cp:underline-offset-4'
          >
            打开验证页面
          </a>
        </div>
      )}
      <div className='cp:flex cp:items-center cp:justify-end cp:gap-3 cp:border-0 cp:border-t cp:border-solid cp:border-border cp:bg-muted/20 cp:px-4 cp:py-3'>
        {add && (
          <Button
            size='sm'
            variant='secondary'
            className='cp:mr-auto'
            disabled={busy}
            onClick={() => answer(add.id)}
          >
            <Plus aria-hidden='true' />
            添加新账号
          </Button>
        )}
        <Button size='sm' variant='outline' disabled={busy} onClick={cancel}>
          取消登录
        </Button>
      </div>
    </section>
  )
}
