import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/field";
import { calcularAsistenciaJugador } from "@/lib/asistencia";
import type { AsistenciaRow, JugadoresRow, SesionesRow } from "@/types/database";

const ESTADOS: { key: "presentes" | "justificados" | "injustificados" | "lesiones"; label: string; color: string }[] = [
  { key: "presentes", label: "Presente", color: "var(--color-success)" },
  { key: "justificados", label: "Justificada", color: "var(--color-warning)" },
  { key: "injustificados", label: "Injustificada", color: "var(--color-accent)" },
  { key: "lesiones", label: "Lesión", color: "var(--color-text-faint)" },
];

export function BuscadorAsistencia({
  jugadores,
  asistencia,
  sesiones,
}: {
  jugadores: JugadoresRow[];
  asistencia: AsistenciaRow[];
  sesiones: SesionesRow[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<JugadoresRow | null>(null);

  const coincidencias =
    !seleccionado && busqueda.trim()
      ? jugadores.filter((j) => j.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())).slice(0, 5)
      : [];

  function limpiar() {
    setBusqueda("");
    setSeleccionado(null);
  }

  const stats = seleccionado ? calcularAsistenciaJugador(asistencia, sesiones, seleccionado.id) : null;

  return (
    <div>
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
        Asistencia por jugador
      </div>
      <div className="card-surface p-4">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            pill
            placeholder="Buscar jugador..."
            value={seleccionado ? seleccionado.nombre : busqueda}
            onChange={(e) => {
              setSeleccionado(null);
              setBusqueda(e.target.value);
            }}
            readOnly={!!seleccionado}
            className="pl-10 pr-10"
          />
          {(busqueda || seleccionado) && (
            <button
              onClick={limpiar}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {coincidencias.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {coincidencias.map((j) => (
              <button
                key={j.id}
                onClick={() => {
                  setSeleccionado(j);
                  setBusqueda("");
                }}
                className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-card-hover)]"
              >
                {j.nombre}
              </button>
            ))}
          </div>
        )}

        {!seleccionado && busqueda.trim() && coincidencias.length === 0 && (
          <p className="mt-2 px-1 text-sm text-[var(--color-text-muted)]">Ningún jugador coincide.</p>
        )}

        {seleccionado && stats && (
          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            {stats.total > 0 ? (
              <>
                <div className="flex items-end justify-between">
                  <div className="stat-number text-[2rem] leading-none text-[var(--color-accent)]">{stats.pct}%</div>
                  <div className="text-right text-xs text-[var(--color-text-muted)]">
                    {stats.presentes} de {stats.total} sesiones
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {ESTADOS.map((e) => (
                    <div key={e.key} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                      {stats[e.key]} {e.label.toLowerCase()}
                    </div>
                  ))}
                </div>
                {stats.llegadasTarde > 0 && (
                  <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                    Llegó tarde a {stats.llegadasTarde} de {stats.presentes} sesiones
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">Todavía no hay registros de asistencia.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
