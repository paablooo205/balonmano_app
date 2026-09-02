import { X } from "lucide-react";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { distribucionPorZona, eficaciaConDetalle } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Panel local (no navega de pantalla) con el mini-desglose de un jugador
 * en este partido: eficacia y zonas de tiro, juego abierto/7m separados
 * igual que el resto del dashboard. Overlay propio en tema claro (mismo
 * `card-surface` que el resto de esta ficha) — no el `Modal` compartido del
 * proyecto, para no acoplar esta pantalla a su contrato de `title`/`footer`.
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
  const eficaciaJuego = eficaciaConDetalle(propios, { soloPenalti: false });
  const eficaciaPenalti = eficaciaConDetalle(propios, { soloPenalti: true });
  const tirosJuego = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti);
  const tirosPenalti = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);
  const golesZonasJuego = distribucionPorZona(tirosJuego.filter((e) => e.resultado === "gol"));
  const golesZonasPenalti = distribucionPorZona(tirosPenalti.filter((e) => e.resultado === "gol"));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-4" onClick={onCerrar}>
      <div
        className="card-surface flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-b-none p-4 md:max-w-md md:rounded-b-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="stat-number text-sm text-[var(--color-text-muted)]">#{jugador.dorsal ?? "—"} </span>
            <span className="text-sm font-medium text-[var(--color-text)]">{jugador.nombre}</span>
          </div>
          <button aria-label="Cerrar" onClick={onCerrar} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BloqueTiro
            titulo="Juego abierto"
            detalle={eficaciaJuego}
            zonas={zonasJuego}
            total={tirosJuego.length}
            aciertosPorZona={golesZonasJuego}
            etiquetaAcierto="goles"
          />
          <BloqueTiro
            titulo="7 metros"
            detalle={eficaciaPenalti}
            zonas={zonasPenalti}
            total={tirosPenalti.length}
            aciertosPorZona={golesZonasPenalti}
            etiquetaAcierto="goles"
          />
        </div>
      </div>
    </div>
  );
}
