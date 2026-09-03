import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { resultadoPartido, marcadorNumerico, resumenResultados, RESULTADO_BADGE } from "@/lib/partidoStats";
import { agruparPorPartido, cargarEventosEquipo } from "@/lib/eventos";
import { toISODate } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { AsistenciaRow, EventosRow, JugadoresRow, PartidosRow, SesionesRow } from "@/types/database";

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Resultado = "victoria" | "empate" | "derrota";

const COLOR_BG: Record<Resultado, string> = {
  victoria: "bg-[var(--color-ink)]",
  empate: "bg-[var(--color-text-faint)]",
  derrota: "bg-[var(--color-accent)]",
};
const COLOR_TEXTO: Record<Resultado, string> = {
  victoria: "text-[var(--color-ink)]",
  empate: "text-[var(--color-text-faint)]",
  derrota: "text-[var(--color-accent)]",
};

function diasEntre(desdeISO: string, hastaISO: string): number {
  return Math.round(
    (new Date(hastaISO + "T00:00:00").getTime() - new Date(desdeISO + "T00:00:00").getTime()) / 86_400_000,
  );
}

/** Fecha real de un registro de asistencia: la de su sesión o la de su partido. */
function fechaDeAsistencia(reg: AsistenciaRow, sesiones: SesionesRow[], partidos: PartidosRow[]): string | null {
  if (reg.sesion_id) return sesiones.find((s) => s.id === reg.sesion_id)?.fecha ?? null;
  if (reg.partido_id) return partidos.find((p) => p.id === reg.partido_id)?.fecha ?? null;
  return null;
}

export function ProgresoPage() {
  const { equipo, equipoId } = useEquipo();
  const [partidos, setPartidos] = useState<PartidosRow[]>([]);
  const [asistencia, setAsistencia] = useState<AsistenciaRow[]>([]);
  const [sesiones, setSesiones] = useState<SesionesRow[]>([]);
  const [jugadores, setJugadores] = useState<JugadoresRow[]>([]);
  const [eventos, setEventos] = useState<EventosRow[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const [{ data: p }, { data: a }, { data: s }, { data: j }, ev] = await Promise.all([
        supabase.from("partidos").select("*").eq("equipo_id", equipoId).order("fecha", { ascending: true }),
        supabase.from("asistencia").select("*").eq("equipo_id", equipoId),
        supabase.from("sesiones").select("*").eq("equipo_id", equipoId),
        supabase.from("jugadores").select("*").eq("equipo_id", equipoId),
        cargarEventosEquipo(equipoId),
      ]);
      setPartidos(p ?? []);
      setAsistencia(a ?? []);
      setSesiones(s ?? []);
      setJugadores(j ?? []);
      setEventos(ev);
      setCargando(false);
    })();
  }, [equipoId]);

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }

  const hoyISO = toISODate(new Date());
  const eventosPorPartido = agruparPorPartido(eventos);

  // --- Resultados / jornadas ---------------------------------------------
  const jornadas = partidos
    .map((partido) => ({ partido, marcador: marcadorNumerico(partido, eventosPorPartido.get(partido.id) ?? []) }))
    .filter((x): x is { partido: PartidosRow; marcador: { favor: number; contra: number } } => x.marcador !== null);

  const { g, e, p: perd } = resumenResultados(partidos, eventosPorPartido);
  const puntos = g * 2 + e;
  const totalFavor = jornadas.reduce((sum, x) => sum + x.marcador.favor, 0);
  const totalContra = jornadas.reduce((sum, x) => sum + x.marcador.contra, 0);
  const diferencia = totalFavor - totalContra;
  const avgFavor = jornadas.length > 0 ? totalFavor / jornadas.length : 0;
  const avgContra = jornadas.length > 0 ? totalContra / jornadas.length : 0;
  const winPct = g + e + perd > 0 ? Math.round((g / (g + e + perd)) * 100) : 0;
  const maxAbsDiff = jornadas.reduce((max, x) => Math.max(max, Math.abs(x.marcador.favor - x.marcador.contra)), 0);
  const racha = jornadas.slice(-8);

  // --- Juego vs 7 metros ---------------------------------------------------
  let favorJuego = 0;
  let favor7m = 0;
  for (const evento of eventos) {
    if (evento.tipo === "tiro" && evento.equipo_origen === "propio" && evento.resultado === "gol") {
      if (evento.es_penalti) favor7m++;
      else favorJuego++;
    }
  }
  const totalGolesEnDirecto = favorJuego + favor7m;
  const pctJuego = totalGolesEnDirecto > 0 ? Math.round((favorJuego / totalGolesEnDirecto) * 100) : 0;
  const pct7m = totalGolesEnDirecto > 0 ? 100 - pctJuego : 0;

  // --- Asistencia por mes ---------------------------------------------------
  const porMes = new Map<string, { presentes: number; total: number }>();
  for (const reg of asistencia.filter((a) => a.sesion_id)) {
    const fecha = fechaDeAsistencia(reg, sesiones, partidos);
    if (!fecha) continue;
    const clave = fecha.slice(0, 7);
    const actual = porMes.get(clave) ?? { presentes: 0, total: 0 };
    actual.total++;
    if (reg.presente) actual.presentes++;
    porMes.set(clave, actual);
  }
  const mesesOrdenados = Array.from(porMes.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clave, v]) => ({
      clave,
      label: MESES_CORTO[parseInt(clave.slice(5, 7), 10) - 1],
      pct: Math.round((v.presentes / v.total) * 100),
    }));
  const mediaAsistencia =
    mesesOrdenados.length > 0 ? Math.round(mesesOrdenados.reduce((sum, m) => sum + m.pct, 0) / mesesOrdenados.length) : 0;
  const sesionesConAsistencia = new Set(asistencia.filter((a) => a.sesion_id).map((a) => a.sesion_id)).size;

  // --- Máximos goleadores ---------------------------------------------------
  const golesPorJugador = new Map<string, number>();
  for (const evento of eventos) {
    if (!evento.jugador_id) continue;
    if (evento.tipo === "tiro" && evento.equipo_origen === "propio" && evento.resultado === "gol") {
      golesPorJugador.set(evento.jugador_id, (golesPorJugador.get(evento.jugador_id) ?? 0) + 1);
    }
  }
  const topGoleadores = Array.from(golesPorJugador.entries())
    .map(([jugadorId, goles]) => ({ jugador: jugadores.find((j) => j.id === jugadorId), goles }))
    .filter((x): x is { jugador: JugadoresRow; goles: number } => x.jugador !== undefined)
    .sort((a, b) => b.goles - a.goles)
    .slice(0, 5);

  // --- Enfermería ---------------------------------------------------
  const lesionados: { jugador: JugadoresRow; dias: number; notas: string | null }[] = [];
  for (const jugador of jugadores) {
    const registros = asistencia
      .filter((a) => a.jugador_id === jugador.id && a.sesion_id)
      .map((a) => ({ registro: a, fecha: fechaDeAsistencia(a, sesiones, partidos) }))
      .filter((x): x is { registro: AsistenciaRow; fecha: string } => x.fecha !== null)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultimo = registros[0];
    if (ultimo && !ultimo.registro.presente && ultimo.registro.motivo_ausencia === "lesion") {
      lesionados.push({
        jugador,
        dias: diasEntre(ultimo.fecha, hoyISO),
        notas: ultimo.registro.notas_adicionales,
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="hero-band">
        <div className="hero-eyebrow">{equipo?.temporada ?? "Temporada"}</div>
        <h1 className="hero-title mt-0.5">Progreso</h1>
        <div className="mt-4 flex border-t border-white/12 pt-4">
          <div className="flex-1">
            <div className="stat-number text-2xl text-white">{puntos}</div>
            <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">Puntos</div>
          </div>
          <div className="flex-1">
            <div className="stat-number text-2xl text-white">
              {g}-{e}-{perd}
            </div>
            <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">G · E · P</div>
          </div>
          <div className="flex-1">
            <div className={cn("stat-number text-2xl", diferencia >= 0 ? "text-[var(--color-accent)]" : "text-white")}>
              {diferencia > 0 ? "+" : ""}
              {diferencia}
            </div>
            <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">Dif.</div>
          </div>
          <div className="flex-1">
            <div className="stat-number text-2xl text-white">{jornadas.length}</div>
            <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">Partidos</div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            Diferencia por jornada
          </span>
          {jornadas.length > 0 && (
            <span className="text-[11px] text-[var(--color-text-faint)]">{g}/{jornadas.length} victorias</span>
          )}
        </div>
        <div className="card-surface p-4">
          {jornadas.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">Todavía no hay partidos con resultado.</p>
          ) : (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {jornadas.map(({ partido, marcador }, i) => {
                  const diff = marcador.favor - marcador.contra;
                  const tipo: Resultado = diff > 0 ? "victoria" : diff < 0 ? "derrota" : "empate";
                  const alturaPx = maxAbsDiff > 0 ? Math.round((Math.abs(diff) / maxAbsDiff) * 40) : 0;
                  return (
                    <div key={partido.id} className="flex w-11 shrink-0 flex-col items-center">
                      <div className={cn("font-display text-[11px] font-bold", COLOR_TEXTO[tipo])}>
                        {diff > 0 ? `+${diff}` : diff}
                      </div>
                      <div className="flex h-[50px] w-full items-end justify-center">
                        {diff > 0 && (
                          <div className={cn("w-[70%] rounded-t", COLOR_BG[tipo])} style={{ height: alturaPx }} />
                        )}
                      </div>
                      <div className="h-[2px] w-full bg-[var(--color-border)]" />
                      <div className="flex h-[50px] w-full items-start justify-center">
                        {diff < 0 && (
                          <div className={cn("w-[70%] rounded-b", COLOR_BG[tipo])} style={{ height: alturaPx }} />
                        )}
                      </div>
                      <div className="mt-1.5 text-[9px] text-[var(--color-text-faint)]">
                        {marcador.favor}-{marcador.contra}
                      </div>
                      <div className="mt-1 text-[9px] font-semibold text-[var(--color-text-muted)]">J{i + 1}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3.5 flex gap-4 border-t border-[var(--color-border)] pt-3.5">
                <div className="flex-1">
                  <div className="font-display text-xl font-bold text-[var(--color-ink)]">{avgFavor.toFixed(1)}</div>
                  <div className="mt-1 text-[10px] text-[var(--color-text-faint)]">Goles a favor / partido</div>
                </div>
                <div className="flex-1">
                  <div className="font-display text-xl font-bold text-[var(--color-ink)]">{avgContra.toFixed(1)}</div>
                  <div className="mt-1 text-[10px] text-[var(--color-text-faint)]">En contra / partido</div>
                </div>
                <div className="flex-1">
                  <div className="font-display text-xl font-bold text-[var(--color-accent)]">{winPct}%</div>
                  <div className="mt-1 text-[10px] text-[var(--color-text-faint)]">Victorias</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {racha.length > 0 && (
        <div>
          <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            Racha
          </div>
          <div className="flex gap-1.5">
            {racha.map(({ partido, marcador }) => {
              const r = resultadoPartido(partido, eventosPorPartido.get(partido.id) ?? [])!;
              const badge = RESULTADO_BADGE[r];
              return (
                <div key={partido.id} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className="flex h-9 w-full items-center justify-center rounded-[9px] text-[15px] font-bold text-white"
                    style={{ background: badge.bg }}
                  >
                    {badge.letra}
                  </div>
                  <span className="text-[9px] text-[var(--color-text-faint)]">
                    {marcador.favor}-{marcador.contra}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
          Juego vs 7 metros
        </div>
        <div className="card-surface flex flex-col gap-3 p-4">
          {totalGolesEnDirecto === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Todavía no hay goles registrados con el marcador en directo.
            </p>
          ) : (
            <>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm">Goles de juego</span>
                  <span className="font-display text-sm font-bold">{pctJuego}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-card-hover)]">
                  <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pctJuego}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-sm">Goles de 7 metros</span>
                  <span className="font-display text-sm font-bold">{pct7m}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-card-hover)]">
                  <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct7m}%` }} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            Asistencia por mes
          </span>
          {mesesOrdenados.length > 0 && (
            <span className="text-[11px] text-[var(--color-text-faint)]">media {mediaAsistencia}%</span>
          )}
        </div>
        <div className="rounded-[18px] bg-[var(--color-accent)] px-4 pb-4 pt-[18px]">
          {mesesOrdenados.length === 0 ? (
            <p className="text-sm text-white/85">Todavía no hay registros de asistencia.</p>
          ) : (
            <>
              <div className="flex h-[92px] items-end gap-2">
                {mesesOrdenados.map((m) => (
                  <div key={m.clave} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="font-display text-[11px] font-bold text-black/75">{m.pct}%</span>
                    <div
                      className="w-full rounded-t-[6px] bg-[var(--color-ink)]"
                      style={{ height: `${Math.max(4, Math.round(m.pct * 0.56))}px`, opacity: m.pct >= 85 ? 1 : m.pct >= 75 ? 0.62 : 0.32 }}
                    />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-white/75">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 border-t border-white/28 pt-3 text-xs text-white/85">
                {sesionesConAsistencia} de {sesiones.length} sesiones registradas
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
          Máximos goleadores
        </div>
        <div className="card-surface flex flex-col gap-3.5 p-4">
          {topGoleadores.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Todavía no hay goles registrados con el marcador en directo.
            </p>
          ) : (
            topGoleadores.map((x, i) => (
              <div key={x.jugador.id} className="flex items-center gap-3">
                <span className="w-3.5 shrink-0 font-display text-[13px] font-bold text-[var(--color-text-faint)]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm">{x.jugador.nombre}</span>
                    <span
                      className={cn(
                        "font-display shrink-0 text-[15px] font-bold",
                        i === 0 ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]",
                      )}
                    >
                      {x.goles}
                    </span>
                  </div>
                  <div className="h-[5px] overflow-hidden rounded-full bg-[var(--color-card-hover)]">
                    <div
                      className={cn("h-full rounded-full", i === 0 ? "bg-[var(--color-accent)]" : "bg-[var(--color-ink)]")}
                      style={{ width: `${Math.round((x.goles / topGoleadores[0].goles) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
            Enfermería
          </span>
          <span className="text-[11px] text-[var(--color-text-faint)]">
            {jugadores.length - lesionados.length} disponibles
          </span>
        </div>
        {lesionados.length === 0 ? (
          <div className="card-surface p-4 text-center text-sm text-[var(--color-text-muted)]">
            Sin bajas por lesión.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {lesionados.map((x) => (
              <div key={x.jugador.id} className="card-surface flex items-center gap-3 p-3">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-card-hover)] font-display text-[13px] font-bold">
                  {x.jugador.dorsal ? `#${x.jugador.dorsal}` : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{x.jugador.nombre}</div>
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {x.notas ? `${x.notas} · ` : ""}Lleva {x.dias} día{x.dias === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="shrink-0 rounded-[7px] bg-[var(--color-accent)] px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white">
                  Lesión
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
