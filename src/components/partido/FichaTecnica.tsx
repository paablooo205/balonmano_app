import { contar, eficaciaLanzamiento, golesContra, golesFavor, marcadorPartido } from "@/lib/partidoStats";
import type { JugadoresRow, PartidosRow } from "@/types/database";

export function FichaTecnica({ partido, jugadores }: { partido: PartidosRow; jugadores: JugadoresRow[] }) {
  const eventos = partido.estadisticas.eventos ?? [];
  const favor = golesFavor(eventos);
  const contra = golesContra(eventos);
  const eficacia = eficaciaLanzamiento(eventos);
  const hayEventos = eventos.length > 0;

  const stats: { label: string; valor: number | string }[] = [
    { label: "Goles a favor", valor: favor },
    { label: "Goles en contra", valor: contra },
    { label: "Paradas portero", valor: contar(eventos, "parada_portero") },
    { label: "Balones ganados", valor: contar(eventos, "balon_ganado") },
    { label: "Balones perdidos", valor: contar(eventos, "balon_perdido") },
    { label: "Tiros fallados", valor: contar(eventos, "tiro_fallado") },
    { label: "7m provocados", valor: contar(eventos, "siete_provocado") },
    { label: "7m cometidos", valor: contar(eventos, "siete_cometido") },
    { label: "7m fallados", valor: contar(eventos, "siete_fallado") },
    { label: "Exclusiones", valor: contar(eventos, "exclusion_2min") },
    { label: "Eficacia de tiro", valor: eficacia !== null ? `${eficacia}%` : "—" },
  ];

  const goleadas = eventos
    .filter((e) => e.tipo === "gol_favor" || e.tipo === "gol_contra" || e.tipo === "siete_metido")
    .sort((a, b) => (a.minuto ?? 0) - (b.minuto ?? 0) || a.creado_en.localeCompare(b.creado_en));

  return (
    <div className="flex flex-col gap-4">
      <div className="card-surface p-4 text-center">
        <div className="text-sm text-[var(--color-text-muted)]">
          Resultado {hayEventos && <span className="text-[var(--color-text-muted)]">(de los toques en vivo)</span>}
        </div>
        <div className="stat-number text-3xl">{marcadorPartido(partido)}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card-surface p-4">
            <div className="stat-number text-2xl">{s.valor}</div>
            <div className="text-sm text-[var(--color-text-muted)]">{s.label}</div>
          </div>
        ))}
      </div>

      {goleadas.length > 0 && (
        <div className="card-surface p-4">
          <div className="mb-3 text-sm font-medium text-[var(--color-accent)]">Goles por minuto</div>
          <div className="flex flex-col gap-1.5">
            {goleadas.map((e) => {
              const jugador = e.jugador_id ? jugadores.find((j) => j.id === e.jugador_id) : null;
              const esPropio = e.tipo !== "gol_contra";
              return (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="w-10 shrink-0 font-mono text-[var(--color-text-muted)]">
                    {e.minuto !== null ? `${e.minuto}'` : "—"}
                  </span>
                  <span className={esPropio ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>
                    {esPropio
                      ? jugador
                        ? `Gol de ${jugador.nombre}${e.tipo === "siete_metido" ? " (7m)" : ""}`
                        : `Gol propio${e.tipo === "siete_metido" ? " (7m)" : ""}`
                      : `Gol de ${partido.rival}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(partido.problemas_detectados || partido.acciones_siguiente_semana || partido.notas_adicionales) && (
        <div className="card-surface flex flex-col gap-3 p-4">
          {partido.problemas_detectados && (
            <div>
              <div className="text-sm font-medium text-[var(--color-accent)]">Problemas detectados</div>
              <p className="whitespace-pre-line text-sm">{partido.problemas_detectados}</p>
            </div>
          )}
          {partido.acciones_siguiente_semana && (
            <div>
              <div className="text-sm font-medium text-[var(--color-accent)]">Acciones para la semana siguiente</div>
              <p className="whitespace-pre-line text-sm">{partido.acciones_siguiente_semana}</p>
            </div>
          )}
          {partido.notas_adicionales && (
            <div>
              <div className="text-sm font-medium text-[var(--color-accent)]">Notas adicionales</div>
              <p className="whitespace-pre-line text-sm">{partido.notas_adicionales}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
