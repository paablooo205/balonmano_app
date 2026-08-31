import { cn } from "@/lib/utils";
import { ETIQUETAS_ORIGEN, ORIGENES } from "@/lib/partidoStats";
import type { OrigenLanzamiento } from "@/types/database";

/**
 * Fila de chips para marcar desde dónde se lanzó un tiro — dato aparte de la
 * zona de portería (a dónde entra). Se preselecciona según el puesto del
 * jugador (`origenPorPuesto` en partidoStats.ts, en el llamante) y queda fijo
 * hasta que se cambie a mano. Reutilizable en los mismos contextos que
 * `CuadriculaPorteria`.
 */
export function OrigenChips({
  valor,
  onCambiar,
}: {
  valor: OrigenLanzamiento | null;
  onCambiar: (o: OrigenLanzamiento) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ORIGENES.map((o) => (
        <button
          key={o}
          onClick={() => onCambiar(o)}
          className={cn(
            // h-11 (44px): objetivo táctil mínimo — se toca en cada tiro
            // cuando el origen preseleccionado por puesto no es el real.
            "flex h-11 items-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
            valor === o ? "bg-[var(--color-accent)] text-white" : "bg-white/[.08] text-white/60",
          )}
        >
          {ETIQUETAS_ORIGEN[o]}
        </button>
      ))}
    </div>
  );
}
