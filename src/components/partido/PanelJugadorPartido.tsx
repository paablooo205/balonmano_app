import { X } from "lucide-react";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { distribucionPorZona, eficaciaConDetalle } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Panel local (no navega de pantalla) con el mini-desglose de un jugador
 * en este partido: eficacia y zonas de tiro, juego abierto/7m separados
 * igual que el resto del dashboard. Overlay propio en oscuro — el `Modal`
 * compartido del proyecto es tema claro, no encaja aquí.
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-4" onClick={onCerrar}>
      <div
        className="flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-2xl border border-white/[.09] bg-[#15151a] p-4 md:max-w-md md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="stat-number text-sm text-white/60">#{jugador.dorsal ?? "—"} </span>
            <span className="text-sm font-medium text-white">{jugador.nombre}</span>
          </div>
          <button aria-label="Cerrar" onClick={onCerrar} className="text-white/50 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BloqueTiro titulo="Juego abierto" detalle={eficaciaJuego} zonas={zonasJuego} total={tirosJuego.length} />
          <BloqueTiro titulo="7 metros" detalle={eficaciaPenalti} zonas={zonasPenalti} total={tirosPenalti.length} />
        </div>
      </div>
    </div>
  );
}
