import {
  ACCIONES_PERDIDA_EXCLUSION,
  BOTONES_TIRO_RIVAL,
  contarBotonTiro,
  contarTabla,
  eficaciaLanzamiento,
  golesContra,
  golesFavor,
  marcadorPartido,
  sieteFallados,
  tirosFallados,
} from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

export function FichaTecnica({
  partido,
  jugadores,
  eventos,
}: {
  partido: PartidosRow;
  jugadores: JugadoresRow[];
  eventos: EventosRow[];
}) {
  const favor = golesFavor(eventos);
  const contra = golesContra(eventos);
  const eficacia = eficaciaLanzamiento(eventos);
  const hayEventos = eventos.length > 0;

  const buscarPerdidaExclusion = (label: string) => ACCIONES_PERDIDA_EXCLUSION.find((a) => a.label === label)!;
  const buscarTiroRival = (label: string) => BOTONES_TIRO_RIVAL.find((b) => b.label === label)!;
  const stats: { label: string; valor: number | string }[] = [
    { label: "Goles a favor", valor: favor },
    { label: "Goles en contra", valor: contra },
    { label: "Paradas portero", valor: contarBotonTiro(eventos, buscarTiroRival("Parada")) },
    { label: "Balones ganados", valor: contarTabla(eventos, buscarPerdidaExclusion("Balón ganado")) },
    { label: "Balones perdidos", valor: contarTabla(eventos, buscarPerdidaExclusion("Balón perdido")) },
    { label: "Tiros fallados", valor: tirosFallados(eventos) },
    { label: "7m fallados", valor: sieteFallados(eventos) },
    { label: "Exclusiones", valor: contarTabla(eventos, buscarPerdidaExclusion("Exclusión 2'")) },
    { label: "Eficacia de tiro", valor: eficacia !== null ? `${eficacia}%` : "—" },
  ];

  const goleadas = eventos
    .filter((e) => e.tipo === "tiro" && e.resultado === "gol")
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));

  return (
    <div className="flex flex-col gap-4">
      <div className="card-surface p-4 text-center">
        <div className="text-sm text-[var(--color-text-muted)]">
          Resultado {hayEventos && <span className="text-[var(--color-text-muted)]">(de los toques en vivo)</span>}
        </div>
        <div className="stat-number text-3xl">{marcadorPartido(partido, eventos)}</div>
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
          <div className="mb-3 text-sm font-medium text-[var(--color-accent)]">Goles</div>
          <div className="flex flex-col gap-1.5">
            {goleadas.map((e) => {
              const jugador = e.jugador_id ? jugadores.find((j) => j.id === e.jugador_id) : null;
              const esPropio = e.equipo_origen === "propio";
              return (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={esPropio ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>
                    {esPropio
                      ? jugador
                        ? `Gol de ${jugador.nombre}${e.es_penalti ? " (7m)" : ""}`
                        : `Gol propio${e.es_penalti ? " (7m)" : ""}`
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
