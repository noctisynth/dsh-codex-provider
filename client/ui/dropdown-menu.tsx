import { Menu } from '@base-ui/react/menu'
import type { ComponentProps } from 'react'
import { cn } from '../lib/utils.ts'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger

export function DropdownMenuContent({
  className,
  ...props
}: Omit<ComponentProps<typeof Menu.Popup>, 'className'> & { className?: string }) {
  return (
    <Menu.Portal>
      <Menu.Positioner side='top' align='start' sideOffset={6} className='cp:z-50'>
        <Menu.Popup
          {...props}
          className={cn(
            'cp:box-border cp:min-w-52 cp:max-w-[calc(100vw-1rem)] cp:rounded-xl cp:border cp:border-solid cp:border-border cp:bg-background cp:p-1 cp:text-sm cp:text-foreground cp:shadow-lg cp:outline-none',
            className,
          )}
        />
      </Menu.Positioner>
    </Menu.Portal>
  )
}

export function DropdownMenuItem({
  className,
  variant,
  ...props
}: Omit<ComponentProps<typeof Menu.Item>, 'className'> & {
  className?: string
  variant?: 'destructive'
}) {
  return (
    <Menu.Item
      {...props}
      className={cn(
        'cp:relative cp:flex cp:cursor-default cp:select-none cp:items-center cp:gap-2 cp:rounded-lg cp:px-2.5 cp:py-2 cp:outline-none cp:data-highlighted:bg-accent cp:data-disabled:pointer-events-none cp:data-disabled:opacity-50 cp:[&_svg]:size-4 cp:[&_svg]:shrink-0',
        variant === 'destructive' && 'cp:text-destructive',
        className,
      )}
    />
  )
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className='cp:mx-1 cp:my-1 cp:h-px cp:bg-border' />
}
