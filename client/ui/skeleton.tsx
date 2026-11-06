import { cn } from '../lib/utils.ts'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      className={cn('cp:animate-pulse cp:rounded-md cp:bg-accent', className)}
      {...props}
    />
  )
}

export { Skeleton }
