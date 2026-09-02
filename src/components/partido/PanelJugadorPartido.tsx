import { X } from "lucide-react";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { distribucionPorZona, eficaciaConDetalle, esPortero, perdidas, porcentajeParadas, robos } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Panel local (no navega de pantalla) con el mini-desglose de un jugador
 * en este partido: eficacia y zonas de tiro, juego abierto/7m separados
 * igual que el resto del dashboard, más pérdidas/robos. Overlay propio en
 * tema claro (mismo `card-surface` que el resto de esta ficha) — no el
 * `Modal` compartido del proyecto, para no acoplar esta pantalla a su
 * contrato de `title`/`footer`.
 *
 * Si el jugador es portero, los dos bloques muestran paradas sobre los
 * tiros del rival que le llegaron (no sus propios tiros, que son casi
 * inexistentes) — mismo criterio que `FichaTecnica.tsx`.
 */
export function PanelJugadorPartido({
  jugador,
  eventos,
  onCerrar,
}: {
  jugador: JugadoresRow;
  eventos: EventosRow[];
  onCerrar: () => void;
}) {
  const propios = eventos.filter((e) => e.jugador_id === jugador.id);
  const portero = esPortero(jugador.puesto);
  const equipoOrigenRelevante = portero ? "rival" : "propio";
  const resultadoAcierto = portero ? "parado" : "gol";

  const tirosJuego = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === equipoOrigenRelevante && !e.es_penalti);
  const tirosPenalti = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === equipoOrigenRelevante && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);
  const aciertosZonasJuego = distribucionPorZona(tirosJuego.filter((e) => e.resultado === resultadoAcierto));
  const aciertosZonasPenalti = distribucionPorZona(tirosPenalti.filter((e) => e.resultado === resultadoAcierto));

  const detalleJuego = portero
    ? porcentajeParadas(propios, { soloPenalti: false })
    : eficaciaConDetalle(propios, { soloPenalti: false });
  const detallePenalti = portero
    ? porcentajeParadas(propios, { soloPenalti: true })
    : eficaciaConDetalle(propios, { soloPenalti: true });

  const etiquetaAcierto = portero ? "paradas" : "goles";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-4" onClick={onCerrar}>
      <div
        className="card-surface flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-b-none p-4 md:max-w-md md:rounded-b-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div>
            <span className="stat-number text-sm text-[var(--color-text-muted)]">#{jugador.dorsal ?? "—"} </span>
            <span className="text-sm font-medium text-[var(--color-text)]">{jugador.nombre}</span>
          </div>
          <button aria-label="Cerrar" onClick={onCerrar} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={20} />
          </button>
        </div>
        <div className="mb-3 flex gap-4 text-xs text-[var(--color-text-muted)]">
          <span>
            <span className="stat-number text-[var(--color-ink)]">{perdidas(propios)}</span> pérdidas
          </span>
          <span>
            <span className="stat-number text-[var(--color-ink)]">{robos(propios)}</span> robos
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BloqueTiro
            titulo="Juego abierto"
            detalle={detalleJuego}
            zonas={zonasJuego}
            total={tirosJuego.length}
            aciertosPorZona={aciertosZonasJuego}
            etiquetaAcierto={etiquetaAcierto}
          />
          <BloqueTiro
            titulo="7 metros"
            detalle={detallePenalti}
            zonas={zonasPenalti}
            total={tirosPenalti.length}
            aciertosPorZona={aciertosZonasPenalti}
            etiquetaAcierto={etiquetaAcierto}
          />
        </div>
      </div>
    </div>
  );
}
