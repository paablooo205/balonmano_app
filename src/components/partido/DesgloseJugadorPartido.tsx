import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { distribucionPorZona, eficaciaConDetalle, esPortero, perdidas, porcentajeParadas, robos } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Mini-desglose de un jugador en un ámbito de eventos ya acotado (un
 * partido, o toda la temporada de ese jugador): eficacia y zonas de tiro
 * (juego abierto/7m separados), más pérdidas/robos. Si el jugador es
 * portero, los dos bloques muestran paradas sobre los tiros del rival que
 * le llegaron, no sus tiros propios (casi inexistentes) — mismo criterio
 * que `FichaTecnica.tsx`. Sin chrome de pantalla propio — lo envuelven
 * `PanelJugadorPartido` (modal) y la ficha técnica de jugador (embebido en
 * la página), para no mantener dos copias del mismo desglose.
 */
export function DesgloseJugadorPartido({ jugador, eventos }: { jugador: JugadoresRow; eventos: EventosRow[] }) {
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
    <div>
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
  );
}
