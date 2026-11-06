import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.ts";
import { Slot } from "@radix-ui/react-slot";

const buttonVariants = cva(
  "cp:border cp:border-solid cp:border-transparent cp:cursor-pointer cp:inline-flex cp:shrink-0 cp:items-center cp:justify-center cp:gap-2 cp:rounded-md cp:text-sm cp:font-medium cp:whitespace-nowrap cp:transition-all cp:outline-none cp:focus-visible:border-ring cp:focus-visible:ring-[3px] cp:focus-visible:ring-ring/50 cp:disabled:pointer-events-none cp:disabled:opacity-50 cp:aria-invalid:border-destructive cp:aria-invalid:ring-destructive/20 cp:dark:aria-invalid:ring-destructive/40 cp:[&_svg]:pointer-events-none cp:[&_svg]:shrink-0 cp:[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "cp:bg-primary cp:text-primary-foreground cp:hover:bg-primary/90",
        destructive:
          "cp:bg-destructive cp:text-white cp:hover:bg-destructive/90 cp:focus-visible:ring-destructive/20 cp:dark:bg-destructive/60 cp:dark:focus-visible:ring-destructive/40",
        outline:
          "cp:border-border cp:bg-background cp:text-foreground cp:shadow-xs cp:hover:bg-accent cp:hover:text-accent-foreground cp:dark:border-input cp:dark:bg-input/30 cp:dark:hover:bg-input/50",
        secondary: "cp:bg-secondary cp:text-secondary-foreground cp:hover:bg-secondary/80",
        ghost:
          "cp:bg-transparent cp:text-foreground cp:hover:bg-accent cp:hover:text-accent-foreground cp:dark:hover:bg-accent/50",
        link: "cp:text-primary cp:underline-offset-4 cp:hover:underline",
      },
      size: {
        default: "cp:h-9 cp:px-4 cp:py-2 cp:has-[>svg]:px-3",
        xs: "cp:h-6 cp:gap-1 cp:rounded-md cp:px-2 cp:text-xs cp:has-[>svg]:px-1.5 cp:[&_svg:not([class*='size-'])]:size-3",
        sm: "cp:h-8 cp:gap-1.5 cp:rounded-md cp:px-3 cp:has-[>svg]:px-2.5",
        lg: "cp:h-10 cp:rounded-md cp:px-6 cp:has-[>svg]:px-4",
        icon: "cp:size-9",
        "icon-xs": "cp:size-6 cp:rounded-md cp:[&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "cp:size-8",
        "icon-lg": "cp:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }>(function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}, ref) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});

export { Button, buttonVariants };
