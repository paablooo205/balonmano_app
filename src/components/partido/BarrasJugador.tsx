import { desgloseResultados } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Sustituye a la antigua tabla "Por jugador": una barra horizontal por
 * jugador, dividida en gol/fuera/parado (poste queda fuera de la barra,
 * decisión explícita — un jugador con solo postes se ve con la barra
 * vacía salvo su contorno). Ordenadas de más a menos goles. Tocar una fila
 * dispara `onSeleccionar` — este componente no decide qué pasa después.
 */
export function BarrasJugador({
  jugadores,
  eventos,
  onSeleccionar,
}: {
  jugadores: JugadoresRow[];
  eventos: EventosRow[];
  onSeleccionar: (jugador: JugadoresRow) => void;
}) {
  const jugadoresConDatos = new Set(eventos.filter((e) => e.jugador_id).map((e) => e.jugador_id));
  const filas = jugadores
    .filter((j) => jugadoresConDatos.has(j.id))
    .map((j) => {
      const propios = eventos.filter((e) => e.jugador_id === j.id && e.tipo === "tiro" && e.equipo_origen === "propio");
      const { gol, parado, fuera } = desgloseResultados(propios);
      return { jugador: j, gol, parado, fuera, total: gol + parado + fuera };
    })
    .sort((a, b) => b.gol - a.gol);

  if (filas.length === 0) return null;

  return (
    <div>
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Por jugador</div>
      <div className="card-surface p-4">
        <div className="flex flex-col gap-2">
          {filas.map((f) => (
            <button
              key={f.jugador.id}
              onClick={() => onSeleccionar(f.jugador)}
              className="flex items-center gap-2 rounded-[3px] bg-[var(--color-bg)] px-2.5 py-2 text-left"
            >
              <span className="stat-number w-5 shrink-0 text-sm text-[var(--color-text-muted)]">{f.jugador.dorsal ?? "—"}</span>
              <span className="w-20 shrink-0 truncate text-xs text-[var(--color-text)]">{f.jugador.nombre}</span>
              <div className="flex h-4 flex-1 overflow-hidden rounded-[3px] bg-[var(--color-border)]">
                {f.total > 0 && (
                  <>
                    <div style={{ width: `${(f.gol / f.total) * 100}%`, background: "var(--color-success)" }} />
                    <div style={{ width: `${(f.fuera / f.total) * 100}%`, background: "var(--color-accent)" }} />
                    <div style={{ width: `${(f.parado / f.total) * 100}%`, background: "#3d8ad6" }} />
                  </>
                )}
              </div>
              <span className="stat-number w-4 shrink-0 text-right text-xs text-[var(--color-ink)]">{f.gol}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-3 text-[9px] text-[var(--color-text-faint)]">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
            Gol
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
            Fuera
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#3d8ad6" }} />
            Parado
          </span>
        </div>
      </div>
    </div>
  );
}
