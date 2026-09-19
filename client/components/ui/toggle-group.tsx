import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Segmented control built on Base UI's `ToggleGroup` + `Toggle`, which supply the
 * composite roving-focus keyboard behaviour (arrow keys, Home/End) for free.
 */

const toggleGroupVariants = cva(
  "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
);

const toggleGroupItemVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-clip-padding font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm dark:aria-pressed:bg-input/60 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        default: "h-7 px-2.5 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-6 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn(toggleGroupVariants({ className }))}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleGroupItemVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(toggleGroupItemVariants({ size, className }))}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem, toggleGroupItemVariants, toggleGroupVariants };
