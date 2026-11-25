import { Input as BaseInput } from '@base-ui/react/input'
import { cn } from '../lib/utils.ts'

export function Input({ className, ...props }: BaseInput.Props) {
  return (
    <BaseInput
      className={cn(
        'cp:h-8 cp:min-w-0 cp:w-full cp:rounded-md cp:border cp:border-solid cp:border-input cp:bg-background cp:px-2.5 cp:text-sm cp:text-foreground cp:placeholder:text-muted-foreground cp:focus-visible:outline-none cp:focus-visible:ring-2 cp:focus-visible:ring-ring cp:disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
