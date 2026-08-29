import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useEquipo } from "@/hooks/useEquipo";

/**
 * Cabecera de sección tipo "hero band": tinta oscura (o roja con
 * variant="accent"), eyebrow con el nombre del equipo, título condensado
 * grande. Patrón tomado directamente del diseño de Claude Design.
 */
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  action,
  onBack,
  backLabel,
  variant = "ink",
}: {
  title: ReactNode;
  /** Por defecto, el nombre del equipo activo. */
  eyebrow?: ReactNode;
  /** Línea pequeña bajo el título (ej. fecha, duración). */
  subtitle?: ReactNode;
  action?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  variant?: "ink" | "accent";
}) {
  const { equipo } = useEquipo();

  return (
    <div className="hero-band" data-variant={variant}>
      {onBack && (
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
        >
          <ChevronLeft size={16} className={variant === "accent" ? "text-white" : "text-[var(--color-accent)]"} />
          {backLabel}
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="hero-eyebrow">{eyebrow ?? equipo?.nombre ?? "Coras"}</div>
          <h1 className="hero-title mt-0.5 truncate">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-white/55">{subtitle}</div>}
        </div>
        {action && <div className="shrink-0 pb-0.5">{action}</div>}
      </div>
    </div>
  );
}
