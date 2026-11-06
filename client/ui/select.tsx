import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils.ts'

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = forwardRef<ComponentRef<typeof SelectPrimitive.Trigger>, ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(function SelectTrigger({ className, children, ...props }, ref) {
  return <SelectPrimitive.Trigger ref={ref} {...props} className={cn('cp:flex cp:h-8 cp:shrink-0 cp:cursor-pointer cp:items-center cp:justify-between cp:gap-2 cp:rounded-md cp:border-0 cp:bg-transparent cp:px-3 cp:text-sm cp:text-foreground cp:font-normal cp:hover:bg-accent cp:focus-visible:outline-none cp:focus-visible:ring-2 cp:focus-visible:ring-ring cp:disabled:pointer-events-none cp:disabled:opacity-50', className)}>
    {children}<SelectPrimitive.Icon asChild><ChevronDown className="cp:size-3.5 cp:text-muted-foreground" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
})

export function SelectContent({ container, className, children, ...props }: ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { container?: HTMLElement | null }) {
  return <SelectPrimitive.Portal container={container}>
    <SelectPrimitive.Content position="popper" sideOffset={6} align="end" collisionPadding={8} onEscapeKeyDown={event => event.stopPropagation()} {...props}
      className={cn('cp:z-50 cp:box-border cp:min-w-40 cp:max-h-[var(--radix-select-content-available-height)] cp:overflow-y-auto cp:rounded-xl cp:border cp:border-solid cp:border-border cp:bg-background cp:p-1 cp:text-sm cp:text-foreground cp:shadow-lg cp:outline-none', className)}>
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
}

export function SelectItem({ className, children, ...props }: ComponentPropsWithoutRef<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item {...props} className={cn('cp:relative cp:flex cp:cursor-default cp:select-none cp:items-center cp:rounded-lg cp:py-2 cp:pr-8 cp:pl-2.5 cp:outline-none cp:data-[highlighted]:bg-accent cp:data-[disabled]:pointer-events-none cp:data-[disabled]:opacity-50', className)}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="cp:absolute cp:right-2.5 cp:flex cp:items-center"><Check className="cp:size-3.5" /></SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
}
