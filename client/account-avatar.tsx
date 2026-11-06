import { useState } from 'react'
import { cn } from './lib/utils.ts'

export function AccountAvatar({
  name,
  email,
  picture,
  gravatarPicture,
  className,
}: {
  name?: string | null
  email?: string | null
  picture?: string | null
  gravatarPicture?: string
  className?: string
}) {
  const [failed, setFailed] = useState<string[]>([])
  const source = [picture, gravatarPicture].find((url) => url && !failed.includes(url))
  const initial = Array.from(name?.trim() || email?.trim() || '?')[0]
  return (
    <div
      className={cn(
        'cp:flex cp:size-9 cp:shrink-0 cp:items-center cp:justify-center cp:overflow-hidden cp:rounded-full cp:bg-muted cp:text-sm cp:font-medium cp:text-muted-foreground',
        className,
      )}
    >
      {source ? (
        <img
          key={source}
          src={source}
          alt=''
          referrerPolicy='no-referrer'
          className='cp:size-full cp:object-cover'
          onError={() => setFailed((previous) => [...previous, source])}
        />
      ) : (
        initial
      )}
    </div>
  )
}
