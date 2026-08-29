import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985]",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-accent)] text-white shadow-[0_10px_24px_-10px_rgba(225,18,37,0.7)] hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-hover)]",
        secondary:
          "bg-[var(--color-card)] text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-ink)]/30",
        ink: "bg-[var(--color-ink)] text-white hover:bg-[var(--color-ink)]/90",
        ghost: "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
        destructive: "bg-[var(--color-accent-dim)] text-[var(--color-accent-hover)] hover:bg-red-100",
      },
      size: {
        default: "h-12 px-5 text-base",
        sm: "h-9 px-3 text-sm",
        lg: "h-14 px-6 text-lg",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
