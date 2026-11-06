import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.ts";

const alertVariants = cva(
  "cp:relative cp:grid cp:w-full cp:grid-cols-[0_1fr] cp:items-start cp:gap-y-0.5 cp:rounded-lg cp:border cp:border-solid cp:border-border cp:px-4 cp:py-3 cp:text-sm cp:has-[>svg]:grid-cols-[calc(var(--cp-spacing)*4)_1fr] cp:has-[>svg]:gap-x-3 cp:[&>svg]:size-4 cp:[&>svg]:translate-y-0.5 cp:[&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "cp:bg-card cp:text-card-foreground",
        destructive:
          "cp:bg-card cp:text-destructive cp:*:data-[slot=alert-description]:text-destructive/90 cp:[&>svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "cp:col-start-2 cp:line-clamp-1 cp:min-h-4 cp:font-medium cp:tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "cp:col-start-2 cp:grid cp:justify-items-start cp:gap-1 cp:text-sm cp:text-muted-foreground cp:[&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
