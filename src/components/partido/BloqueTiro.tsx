import { MapaCalorPorteria } from "@/components/partido/MapaCalorPorteria";
import type { EficaciaDetalle } from "@/lib/partidoStats";

/** Título + %/recuento honesto + mapa de calor — compartido por
 * `FichaTecnica.tsx` (tiro propio / nuestra portería) y
 * `PanelJugadorPartido.tsx` (mismo desglose a nivel de un jugador). Mismo
 * tema oscuro en ambos sitios, no hay variante clara de este bloque. */
export function BloqueTiro({
  titulo,
  detalle,
  zonas,
  total,
}: {
  titulo: string;
  detalle: EficaciaDetalle;
  zonas: Record<number, number>;
  total: number;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">{titulo}</div>
      {detalle ? (
        <div className="mb-2 text-sm text-white/70">
          <span className="stat-number text-lg text-white">{detalle.pct}%</span> ({detalle.aciertos} de {detalle.intentos})
        </div>
      ) : (
        <div className="mb-2 text-sm text-white/35">Sin tiros.</div>
      )}
      <MapaCalorPorteria conteosPorZona={zonas} total={total} />
    </div>
  );
}
