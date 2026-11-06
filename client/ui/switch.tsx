import { Switch as Primitive } from '@base-ui/react/switch'
import type { ComponentProps } from 'react'
import { cn } from '../lib/utils.ts'

export function Switch({
  className,
  ...props
}: Omit<ComponentProps<typeof Primitive.Root>, 'className'> & { className?: string }) {
  return (
    <Primitive.Root
      render={<button type='button' />}
      nativeButton
      {...props}
      className={cn(
        'cp:inline-flex cp:h-5 cp:w-9 cp:shrink-0 cp:cursor-pointer cp:items-center cp:rounded-full cp:border cp:border-solid cp:border-transparent cp:p-0.5 cp:transition-colors cp:data-checked:bg-primary cp:data-unchecked:bg-accent cp:focus-visible:outline-none cp:focus-visible:ring-2 cp:focus-visible:ring-ring cp:disabled:cursor-not-allowed cp:disabled:opacity-50',
        className,
      )}
    >
      <Primitive.Thumb className='cp:pointer-events-none cp:block cp:size-3.5 cp:rounded-full cp:bg-foreground cp:transition-transform cp:data-checked:translate-x-4 cp:data-checked:bg-primary-foreground cp:motion-reduce:transition-none' />
    </Primitive.Root>
  )
}
