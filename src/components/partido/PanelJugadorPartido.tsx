import { X } from "lucide-react";
import { DesgloseJugadorPartido } from "@/components/partido/DesgloseJugadorPartido";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Overlay modal local (no navega de pantalla) que envuelve
 * `DesgloseJugadorPartido` con la cabecera (dorsal/nombre/cerrar) y el
 * chrome de modal — mismo contenido exacto que la vista de "partido
 * concreto" de la ficha técnica de jugador, que embebe el mismo
 * `DesgloseJugadorPartido` sin este chrome. Overlay propio en tema claro
 * (mismo `card-surface` que el resto de esta ficha) — no el `Modal`
 * compartido del proyecto, para no acoplar esta pantalla a su contrato de
 * `title`/`footer`.
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
        <DesgloseJugadorPartido jugador={jugador} eventos={eventos} />
      </div>
    </div>
  );
}
