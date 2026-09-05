import { useState } from "react";
import { Download, X } from "lucide-react";
import { DesgloseJugadorPartido } from "@/components/partido/DesgloseJugadorPartido";
import { descargarPdf } from "@/lib/pdf/descargarPdf";
import { InformeJugadorPartidoPdf } from "@/lib/pdf/InformeJugadorPartidoPdf";
import { cargarEscudoPdf } from "@/lib/pdf/escudoPdf";
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

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
  partido,
  eventos,
  onCerrar,
}: {
  jugador: JugadoresRow;
  partido: PartidosRow;
  eventos: EventosRow[];
  onCerrar: () => void;
}) {
  const [descargando, setDescargando] = useState(false);

  async function descargarInformePdf() {
    setDescargando(true);
    try {
      const escudo = await cargarEscudoPdf().catch(() => null);
      await descargarPdf(
        `informe-${jugador.nombre}-vs-${partido.rival}-${partido.fecha}`,
        <InformeJugadorPartidoPdf jugador={jugador} partido={partido} eventos={eventos} escudo={escudo} />,
      );
    } catch (err) {
      alert("No se pudo generar el PDF: " + (err as Error).message);
    } finally {
      setDescargando(false);
    }
  }

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
          <div className="flex items-center gap-3">
            <button
              aria-label="Descargar PDF"
              onClick={descargarInformePdf}
              disabled={descargando}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] disabled:opacity-50"
            >
              <Download size={18} />
            </button>
            <button aria-label="Cerrar" onClick={onCerrar} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              <X size={20} />
            </button>
          </div>
        </div>
        <DesgloseJugadorPartido jugador={jugador} eventos={eventos} />
      </div>
    </div>
  );
}
