import { Select as Primitive } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef } from 'react'
import { cn } from '../lib/utils.ts'

export const Select = Primitive.Root
export const SelectValue = Primitive.Value

export const SelectTrigger = forwardRef<
  ComponentRef<typeof Primitive.Trigger>,
  Omit<ComponentPropsWithoutRef<typeof Primitive.Trigger>, 'className'> & { className?: string }
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <Primitive.Trigger
      ref={ref}
      {...props}
      className={cn(
        'cp:flex cp:h-8 cp:shrink-0 cp:cursor-pointer cp:items-center cp:justify-between cp:gap-2 cp:rounded-md cp:border-0 cp:bg-transparent cp:px-3 cp:text-sm cp:text-foreground cp:font-normal cp:hover:bg-accent cp:focus-visible:outline-none cp:focus-visible:ring-2 cp:focus-visible:ring-ring cp:disabled:pointer-events-none cp:disabled:opacity-50',
        className,
      )}
    >
      {children}
      <Primitive.Icon>
        <ChevronDown className='cp:size-3.5 cp:text-muted-foreground' />
      </Primitive.Icon>
    </Primitive.Trigger>
  )
})

export function SelectContent({
  container,
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof Primitive.Popup>, 'className'> & {
  container?: HTMLElement | null
  className?: string
}) {
  return (
    <Primitive.Portal container={container ?? undefined}>
      <Primitive.Positioner
        sideOffset={6}
        align='end'
        alignItemWithTrigger={false}
        className='cp:z-50'
      >
        <Primitive.Popup
          {...props}
          className={cn(
            'cp:box-border cp:min-w-40 cp:max-h-[var(--available-height)] cp:overflow-y-auto cp:rounded-xl cp:border cp:border-solid cp:border-border cp:bg-background cp:p-1 cp:text-sm cp:text-foreground cp:shadow-lg cp:outline-none',
            className,
          )}
        >
          <Primitive.List>{children}</Primitive.List>
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof Primitive.Item>, 'className'> & { className?: string }) {
  return (
    <Primitive.Item
      {...props}
      className={cn(
        'cp:relative cp:flex cp:cursor-default cp:select-none cp:items-center cp:rounded-lg cp:py-2 cp:pr-8 cp:pl-2.5 cp:outline-none cp:data-highlighted:bg-accent cp:data-disabled:pointer-events-none cp:data-disabled:opacity-50',
        className,
      )}
    >
      <Primitive.ItemText>{children}</Primitive.ItemText>
      <Primitive.ItemIndicator className='cp:absolute cp:right-2.5 cp:flex cp:items-center'>
        <Check className='cp:size-3.5' />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  )
}
