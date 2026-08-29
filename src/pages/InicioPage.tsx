import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { useEntrenador } from "@/hooks/useEntrenador";
import { microcicloDeFecha, mesocicloDeMicrociclo } from "@/hooks/useCalendarData";
import { RESULTADO_BADGE, marcadorPartido, resultadoPartido, resumenResultados } from "@/lib/partidoStats";
import { crearSesionRapida } from "@/lib/sesiones";
import { DIAS_SEMANA, MESES, getWeekDates, toISODate } from "@/lib/calendar";
import type {
  AsistenciaRow,
  DiaSemana,
  HorarioRecurrenteRow,
  JugadoresRow,
  MesociclosRow,
  MicrociclosRow,
  PartidosRow,
  SesionesRow,
} from "@/types/database";

export function InicioPage() {
  const { equipo, equipoId } = useEquipo();
  const { nombre: nombreEntrenador } = useEntrenador();
  const navigate = useNavigate();
  const [sesiones, setSesiones] = useState<SesionesRow[]>([]);
  const [partidos, setPartidos] = useState<PartidosRow[]>([]);
  const [horario, setHorario] = useState<HorarioRecurrenteRow[]>([]);
  const [microciclos, setMicrociclos] = useState<MicrociclosRow[]>([]);
  const [mesociclos, setMesociclos] = useState<MesociclosRow[]>([]);
  const [jugadores, setJugadores] = useState<JugadoresRow[]>([]);
  const [asistencia, setAsistencia] = useState<AsistenciaRow[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const [s, p, h, mc, ms, j, a] = await Promise.all([
        supabase.from("sesiones").select("*").eq("equipo_id", equipoId),
        supabase.from("partidos").select("*").eq("equipo_id", equipoId).order("fecha", { ascending: false }),
        supabase.from("horario_recurrente").select("*").eq("equipo_id", equipoId),
        supabase.from("microciclos").select("*").eq("equipo_id", equipoId),
        supabase.from("mesociclos").select("*").eq("equipo_id", equipoId),
        supabase.from("jugadores").select("*").eq("equipo_id", equipoId),
        supabase.from("asistencia").select("*").eq("equipo_id", equipoId),
      ]);
      setSesiones(s.data ?? []);
      setPartidos(p.data ?? []);
      setHorario(h.data ?? []);
      setMicrociclos(mc.data ?? []);
      setMesociclos(ms.data ?? []);
      setJugadores(j.data ?? []);
      setAsistencia(a.data ?? []);
      setCargando(false);
    })();
  }, [equipoId]);

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }

  const hoy = new Date();
  const hoyISO = toISODate(hoy);
  const sesionHoy = sesiones.find((s) => s.fecha === hoyISO) ?? null;
  const partidoHoy = partidos.find((p) => p.fecha === hoyISO) ?? null;
  const slotHoy = horario.find((h) => h.dia_semana === hoy.getDay()) ?? null;
  const microcicloHoy = microcicloDeFecha(microciclos, hoyISO);
  const mesocicloHoy = mesocicloDeMicrociclo(mesociclos, microcicloHoy);
  const proximoPartido = partidos.filter((p) => p.fecha >= hoyISO).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const ultimosResultados = partidos.filter((p) => resultadoPartido(p) !== null).slice(0, 4);
  const record = resumenResultados(partidos);

  const diasSemana = getWeekDates(hoy).map(toISODate);
  const entrenamientosSemana = sesiones.filter((s) => diasSemana.includes(s.fecha)).length;
  const partidosSemana = partidos.filter((p) => diasSemana.includes(p.fecha)).length;
  const asistenciaMedia =
    asistencia.length > 0 ? Math.round((asistencia.filter((a) => a.presente).length / asistencia.length) * 100) : null;

  // Fecha de cada evento (para ordenar la asistencia de un jugador cronológicamente).
  const fechaDeEvento = new Map<string, string>();
  for (const s of sesiones) fechaDeEvento.set(s.id, s.fecha);
  for (const p of partidos) fechaDeEvento.set(p.id, p.fecha);

  const alertas: { dot: string; texto: string; sub: string }[] = [];
  for (const j of jugadores) {
    const registros = asistencia
      .filter((a) => a.jugador_id === j.id)
      .map((a) => ({ ...a, fecha: fechaDeEvento.get(a.sesion_id ?? a.partido_id ?? "") ?? "" }))
      .filter((a) => a.fecha)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    if (registros[0] && registros[0].presente === false && registros[0].motivo_ausencia === "lesion") {
      alertas.push({
        dot: "var(--color-accent)",
        texto: `${j.nombre} — baja por lesión`,
        sub: registros[0].notas_adicionales ?? "Revisar disponibilidad para el próximo evento",
      });
      continue;
    }
    let seguidas = 0;
    for (const r of registros) {
      if (r.presente === false) seguidas++;
      else break;
    }
    if (seguidas >= 3) {
      alertas.push({
        dot: "var(--color-warning)",
        texto: `${j.nombre} acumula ${seguidas} faltas seguidas`,
        sub: "Revisar motivo antes de la próxima convocatoria",
      });
    }
  }

  const todayLong = `${DIAS_SEMANA[hoy.getDay()].toLowerCase()} ${hoy.getDate()} de ${MESES[hoy.getMonth()].toLowerCase()}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="hero-band">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="hero-eyebrow">{equipo?.nombre ?? "Coras"}</div>
            <h1 className="hero-title mt-1 text-[1.9rem]">
              Hola, {nombreEntrenador ?? "míster"}
            </h1>
            <div className="mt-1.5 text-[13px] text-white/55">{todayLong}</div>
          </div>
          {(record.g > 0 || record.e > 0 || record.p > 0) && (
            <div className="shrink-0 text-right">
              <div className="stat-number text-[22px] text-white">
                {record.g} · {record.e} · {record.p}
              </div>
              <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.12em] text-white/50">G · E · P</div>
            </div>
          )}
        </div>
      </div>

      <TarjetaHoy
        sesionHoy={sesionHoy}
        partidoHoy={partidoHoy}
        slotHoy={slotHoy}
        mesociclo={mesocicloHoy}
        microciclo={microcicloHoy}
        microcicloId={microcicloHoy?.id ?? null}
        equipoId={equipoId}
        diaSemana={hoy.getDay() as DiaSemana}
        fechaISO={hoyISO}
        asistenciaMarcada={sesionHoy ? asistencia.filter((a) => a.sesion_id === sesionHoy.id).length : 0}
        totalJugadores={jugadores.length}
        navigate={navigate}
      />

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Próximo partido
        </div>
        {proximoPartido ? (
          <button
            onClick={() => navigate(`/equipos/${equipoId}/partido/${proximoPartido.id}`)}
            className="card-surface flex w-full items-center gap-3 p-4 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">{proximoPartido.rival}</div>
              <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                {proximoPartido.casa_fuera === "casa" ? "Casa" : proximoPartido.casa_fuera === "fuera" ? "Fuera" : "Sede sin confirmar"}
                {proximoPartido.competicion ? ` · ${proximoPartido.competicion}` : ""}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="stat-number text-lg text-[var(--color-accent)]">
                {new Date(proximoPartido.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-[var(--color-text-muted)]" />
          </button>
        ) : (
          <div className="card-surface p-4 text-center text-sm text-[var(--color-text-muted)]">
            No hay partidos programados.
          </div>
        )}
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Últimos resultados
        </div>
        {ultimosResultados.length === 0 ? (
          <div className="card-surface p-4 text-center text-sm text-[var(--color-text-muted)]">
            Todavía no hay partidos jugados.
          </div>
        ) : (
          <div className="card-surface divide-y divide-[var(--color-border)] overflow-hidden p-0">
            {ultimosResultados.map((p) => {
              const r = resultadoPartido(p)!;
              const badge = RESULTADO_BADGE[r];
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/equipos/${equipoId}/partido/${p.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: badge.bg }}
                  >
                    {badge.letra}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.rival}</div>
                    <div className="mt-1 truncate text-xs text-[var(--color-text-faint)]">
                      {p.casa_fuera === "casa" ? "Casa" : p.casa_fuera === "fuera" ? "Fuera" : "—"}
                      {p.competicion ? ` · ${p.competicion}` : ""}
                    </div>
                  </div>
                  <span className="stat-number shrink-0 text-lg">{marcadorPartido(p)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Esta semana
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <KpiCard valor={String(entrenamientosSemana)} label="Entrenamientos" color="var(--color-ink)" />
          <KpiCard valor={String(partidosSemana)} label="Partidos" color="var(--color-accent)" />
          <KpiCard valor={asistenciaMedia !== null ? `${asistenciaMedia}%` : "—"} label="Asistencia media" color="var(--color-ink)" />
          <KpiCard valor={String(alertas.filter((a) => a.dot === "var(--color-accent)").length)} label="Bajas activas" color="var(--color-accent)" />
        </div>
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Atención
        </div>
        {alertas.length === 0 ? (
          <div className="flex items-center gap-3 rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ddc8a]" />
            <div className="text-[13px] font-medium text-white">Sin incidencias — todo al día</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {alertas.map((a, i) => (
              <div key={i} className="flex items-center gap-3 rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.dot }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-white">{a.texto}</div>
                  <div className="mt-0.5 truncate text-[11px] text-white/50">{a.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ valor, label, color }: { valor: string; label: string; color: string }) {
  return (
    <div className="card-surface p-4">
      <div className="stat-number text-[28px]" style={{ color }}>
        {valor}
      </div>
      <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
        {label}
      </div>
    </div>
  );
}

function TarjetaHoy({
  sesionHoy,
  partidoHoy,
  slotHoy,
  mesociclo,
  microciclo,
  microcicloId,
  equipoId,
  diaSemana,
  fechaISO,
  asistenciaMarcada,
  totalJugadores,
  navigate,
}: {
  sesionHoy: SesionesRow | null;
  partidoHoy: PartidosRow | null;
  slotHoy: HorarioRecurrenteRow | null;
  mesociclo: MesociclosRow | null;
  microciclo: MicrociclosRow | null;
  microcicloId: string | null;
  equipoId: string;
  diaSemana: DiaSemana;
  fechaISO: string;
  asistenciaMarcada: number;
  totalJugadores: number;
  navigate: (to: string) => void;
}) {
  const [creando, setCreando] = useState(false);
  const label = (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">Hoy</div>
  );

  if (partidoHoy) {
    return (
      <div>
        {label}
        <button
          onClick={() => navigate(`/equipos/${equipoId}/partido/${partidoHoy.id}`)}
          className="w-full overflow-hidden rounded-[22px] bg-[var(--color-accent)] text-left shadow-[0_14px_30px_-18px_rgba(0,0,0,.5)]"
        >
          <div className="flex flex-col gap-3.5 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/78">
                Partido{partidoHoy.competicion ? ` · ${partidoHoy.competicion}` : ""}
              </span>
              <Trophy size={20} className="text-white" />
            </div>
            <div className="text-[22px] font-semibold leading-[1.15] text-white">vs {partidoHoy.rival}</div>
            <div className="text-[13px] text-white/80">
              {partidoHoy.casa_fuera === "casa" ? "En casa" : partidoHoy.casa_fuera === "fuera" ? "Fuera" : "Sede sin confirmar"}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2.5 bg-white/[.09] px-5 py-3.5">
            <span className="text-[13px] font-semibold text-white">Ver ficha del partido</span>
          </div>
        </button>
      </div>
    );
  }

  // Igual que en el calendario: si hay sesión creada la usamos, y si no pero
  // hoy toca entreno por el horario recurrente, se muestra exactamente igual
  // — marcarla como "planificada" es opcional para el entrenador, así que su
  // existencia como fila en la base de datos no debe cambiar lo que se ve.
  if (sesionHoy || slotHoy) {
    const titulo =
      microciclo?.objetivo ||
      mesociclo?.objetivo ||
      sesionHoy?.bloques.find((b) => b.objetivo)?.objetivo ||
      mesociclo?.nombre ||
      "Entrenamiento";
    const hora = slotHoy?.hora_inicio.slice(0, 5);
    const duracion = sesionHoy?.duracion_min ?? (slotHoy ? diffMinutos(slotHoy.hora_inicio, slotHoy.hora_fin) : null);
    const tareas = sesionHoy?.bloques.length ?? 0;

    async function abrir() {
      if (sesionHoy) {
        navigate(`/equipos/${equipoId}/sesion/${sesionHoy.id}`);
        return;
      }
      setCreando(true);
      try {
        const nueva = await crearSesionRapida({ equipoId, fecha: fechaISO, diaSemana, microcicloId, duracionMin: duracion });
        navigate(`/equipos/${equipoId}/sesion/${nueva.id}`);
      } catch (err) {
        alert("No se pudo abrir el entrenamiento: " + (err as Error).message);
      } finally {
        setCreando(false);
      }
    }

    return (
      <div>
        {label}
        <button
          onClick={abrir}
          disabled={creando}
          className="w-full overflow-hidden rounded-[22px] bg-[var(--color-ink)] text-left shadow-[0_14px_30px_-18px_rgba(0,0,0,.5)] disabled:opacity-60"
        >
          <div className="flex flex-col gap-3.5 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
                Entrenamiento
              </span>
              {hora && <span className="stat-number text-2xl text-white">{hora}</span>}
            </div>
            <div className="text-[22px] font-semibold leading-[1.15] text-white">{titulo}</div>
            <div className="text-[13px] text-white/60">
              {duracion ? `${duracion} min · ` : ""}
              {tareas} tarea(s)
            </div>
          </div>
          <div className="flex items-center justify-between gap-2.5 bg-white/[.09] px-5 py-3.5">
            <span className="text-[13px] font-semibold text-white">Abrir sesión y pasar lista</span>
            <span className="text-xs text-white/60">
              {asistenciaMarcada > 0 ? `${asistenciaMarcada}/${totalJugadores} marcados` : "Lista sin pasar"}
            </span>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div>
      {label}
      <div className="card-surface p-4">
        <div className="text-sm font-semibold">Día libre</div>
        <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">Sin sesión programada para hoy.</div>
      </div>
    </div>
  );
}

function diffMinutos(inicio: string, fin: string): number {
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}
