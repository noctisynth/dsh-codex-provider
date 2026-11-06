import type { ComponentProps } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "../lib/utils.ts";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          "cp:box-border cp:z-50 cp:min-w-52 cp:max-w-[calc(100vw-1rem)] cp:rounded-xl cp:border cp:border-solid cp:border-border cp:bg-background cp:p-1 cp:text-sm cp:text-foreground cp:shadow-lg cp:outline-none",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  variant,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: "destructive" }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "cp:relative cp:flex cp:cursor-default cp:select-none cp:items-center cp:gap-2 cp:rounded-lg cp:px-2.5 cp:py-2 cp:outline-none cp:data-[highlighted]:bg-accent cp:data-[disabled]:pointer-events-none cp:data-[disabled]:opacity-50 cp:[&_svg]:size-4 cp:[&_svg]:shrink-0",
        variant === "destructive" && "cp:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="cp:mx-1 cp:my-1 cp:h-px cp:bg-border" />;
}
