import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
import { useEffect, useId, useRef } from 'react'
import type { AccountStatus } from '../shared/account-ui.ts'
import { Button } from './ui/button.tsx'

export function LogoutConfirmation({
  account,
  close,
  confirm,
  t,
}: {
  account: AccountStatus['accounts'][number]
  close(): void
  confirm(): void
  t: Translate
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  const description = useId()
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const finish = (action: () => void) => {
    dialog.current?.close()
    action()
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby={title}
      aria-describedby={description}
      onClose={close}
      className='cp:box-border cp:w-[calc(100%-2rem)] cp:max-w-sm cp:rounded-2xl cp:border cp:border-solid cp:border-border cp:bg-background cp:p-6 cp:text-foreground cp:shadow-xl cp:backdrop:bg-black/60'
    >
      <h3 id={title} className='cp:m-0 cp:text-base cp:font-semibold'>
        {t('Sign out of this account?')}
      </h3>
      <p
        id={description}
        className='cp:mt-3 cp:mb-6 cp:break-words cp:text-sm cp:leading-relaxed cp:text-muted-foreground'
      >
        {t(
          'After signing out of {account}, model requests using this account will stop. You can sign in again at any time.',
          { account: account.email ?? 'ChatGPT' },
        )}
      </p>
      <div className='cp:flex cp:justify-end cp:gap-2'>
        <Button autoFocus size='sm' variant='outline' onClick={() => finish(close)}>
          {t('Cancel')}
        </Button>
        <Button size='sm' variant='destructive' onClick={() => finish(confirm)}>
          {t('Confirm sign out')}
        </Button>
      </div>
    </dialog>
  )
}
