import { MapaCalorPorteria } from "@/components/partido/MapaCalorPorteria";
import type { EficaciaDetalle } from "@/lib/partidoStats";

/** Título + %/recuento honesto + mapa de calor — compartido por
 * `FichaTecnica.tsx` (tiro propio / nuestra portería) y
 * `PanelJugadorPartido.tsx` (mismo desglose a nivel de un jugador). Tema
 * claro estándar (`card-surface` en el contenedor que lo envuelve, no aquí);
 * `MapaCalorPorteria` es la única excepción — sigue siendo su propio widget
 * oscuro autocontenido, por diseño, sin cambios. */
export function BloqueTiro({
  titulo,
  detalle,
  zonas,
  total,
  aciertosPorZona,
}: {
  titulo: string;
  detalle: EficaciaDetalle;
  zonas: Record<number, number>;
  total: number;
  /** Aciertos por zona (gol para tiro propio, parada para portería) — ver
   * `MapaCalorPorteria`. El llamante decide qué cuenta como acierto. */
  aciertosPorZona: Record<number, number>;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-faint)]">{titulo}</div>
      {detalle ? (
        <div className="mb-2 text-sm text-[var(--color-text-muted)]">
          <span className="stat-number text-lg text-[var(--color-ink)]">{detalle.pct}%</span> ({detalle.aciertos} de {detalle.intentos})
        </div>
      ) : (
        <div className="mb-2 text-sm text-[var(--color-text-faint)]">Sin tiros.</div>
      )}
      <MapaCalorPorteria conteosPorZona={zonas} total={total} aciertosPorZona={aciertosPorZona} />
    </div>
  );
}
