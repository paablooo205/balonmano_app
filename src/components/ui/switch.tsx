import { cn } from "@/lib/utils";

/** Interruptor tipo iOS: relleno verde = presente/on, gris = ausente/off. */
export function Switch({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
        checked
          ? "border-[var(--color-success)] bg-[var(--color-success)]"
          : "border-[var(--color-border)] bg-[var(--color-card-hover)]",
        className,
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}
