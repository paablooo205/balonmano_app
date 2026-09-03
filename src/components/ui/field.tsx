import * as React from "react";
import { cn } from "@/lib/utils";

const controlClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 py-2.5 text-base text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)] disabled:opacity-70";

/** Variante compacta para barras de búsqueda/filtro. */
const pillClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-card-hover)] px-4 py-2.5 text-base text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { pill?: boolean }
>(({ className, pill, ...props }, ref) => (
  <input ref={ref} className={cn(pill ? pillClass : controlClass, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(controlClass, "min-h-24 resize-y", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(controlClass, "appearance-none", className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block text-sm", className)}>
      <span className="mb-1.5 block text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
