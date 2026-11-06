import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.ts";
import { Slot } from "@radix-ui/react-slot";

const badgeVariants = cva(
  "cp:inline-flex cp:w-fit cp:shrink-0 cp:items-center cp:justify-center cp:gap-1 cp:overflow-hidden cp:rounded-full cp:border cp:border-solid cp:border-border cp:border-transparent cp:px-2 cp:py-0.5 cp:text-xs cp:font-medium cp:whitespace-nowrap cp:transition-[color,box-shadow] cp:focus-visible:border-ring cp:focus-visible:ring-[3px] cp:focus-visible:ring-ring/50 cp:aria-invalid:border-destructive cp:aria-invalid:ring-destructive/20 cp:dark:aria-invalid:ring-destructive/40 cp:[&>svg]:pointer-events-none cp:[&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "cp:bg-primary cp:text-primary-foreground cp:[a&]:hover:bg-primary/90",
        secondary: "cp:bg-secondary cp:text-secondary-foreground cp:[a&]:hover:bg-secondary/90",
        destructive:
          "cp:bg-destructive cp:text-white cp:focus-visible:ring-destructive/20 cp:dark:bg-destructive/60 cp:dark:focus-visible:ring-destructive/40 cp:[a&]:hover:bg-destructive/90",
        outline:
          "cp:border-border cp:text-foreground cp:[a&]:hover:bg-accent cp:[a&]:hover:text-accent-foreground",
        ghost: "cp:[a&]:hover:bg-accent cp:[a&]:hover:text-accent-foreground",
        link: "cp:text-primary cp:underline-offset-4 cp:[a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
