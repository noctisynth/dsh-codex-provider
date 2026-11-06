import { useEffect, useId, useRef } from 'react'
import type { AccountStatus } from '../shared/account-ui.ts'
import { Button } from './ui/button.tsx'

export function LogoutConfirmation({
  account,
  close,
  confirm,
}: {
  account: AccountStatus['accounts'][number]
  close(): void
  confirm(): void
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
        退出这个账号？
      </h3>
      <p
        id={description}
        className='cp:mt-3 cp:mb-6 cp:break-words cp:text-sm cp:leading-relaxed cp:text-muted-foreground'
      >
        退出 {account.email ?? 'ChatGPT'} 后，使用此账号的模型请求将停止。你可以随时重新登录。
      </p>
      <div className='cp:flex cp:justify-end cp:gap-2'>
        <Button autoFocus size='sm' variant='outline' onClick={() => finish(close)}>
          取消
        </Button>
        <Button size='sm' variant='destructive' onClick={() => finish(confirm)}>
          确认退出
        </Button>
      </div>
    </dialog>
  )
}
