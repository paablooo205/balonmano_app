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
  etiquetaAcierto,
}: {
  titulo: string;
  detalle: EficaciaDetalle;
  zonas: Record<number, number>;
  total: number;
  /** Aciertos por zona (gol para tiro propio, parada para portería) — ver
   * `MapaCalorPorteria`. El llamante decide qué cuenta como acierto. */
  aciertosPorZona: Record<number, number>;
  /** Qué representa el numerador de "aciertosPorZona" — p.ej. "goles" o
   * "paradas". Se muestra junto al mapa de calor porque "0/1" por sí solo
   * es ambiguo: sin esta etiqueta no se sabe si el 0 son paradas (y por
   * tanto ese tiro fue gol) o goles. */
  etiquetaAcierto: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-faint)]">{titulo}</div>
      {detalle ? (
        <div className="mb-2 text-sm text-[var(--color-text-muted)]">
          El <span className="stat-number text-lg text-[var(--color-ink)]">{detalle.pct}%</span> de los tiros han sido {etiquetaAcierto} ({detalle.aciertos} de {detalle.intentos})
        </div>
      ) : (
        <div className="mb-2 text-sm text-[var(--color-text-faint)]">Sin tiros.</div>
      )}
      <MapaCalorPorteria conteosPorZona={zonas} total={total} aciertosPorZona={aciertosPorZona} />
      <div className="mt-1.5 text-[8px] text-[var(--color-text-faint)]">Cada zona: {etiquetaAcierto} / tiros a esa zona</div>
    </div>
  );
}
