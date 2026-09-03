import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, FileText, Plus, Trophy, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { urlFirmada } from "@/lib/storage";
import { useEquipo } from "@/hooks/useEquipo";
import { useEntrenador } from "@/hooks/useEntrenador";
import { microcicloDeFecha, mesocicloDeMicrociclo } from "@/hooks/useCalendarData";
import { RESULTADO_BADGE, marcadorPartido, resultadoPartido, resumenResultados } from "@/lib/partidoStats";
import { agruparPorPartido, cargarEventosEquipo } from "@/lib/eventos";
import { crearSesionRapida } from "@/lib/sesiones";
import { DIAS_SEMANA, MESES, getWeekDates, toISODate } from "@/lib/calendar";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type {
  AsistenciaRow,
  DiaSemana,
  EventosRow,
  HorarioRecurrenteRow,
  JugadoresRow,
  MesociclosRow,
  MicrociclosRow,
  ObservacionesRow,
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
  const [eventosPorPartido, setEventosPorPartido] = useState<Map<string, EventosRow[]>>(new Map());
  const [observaciones, setObservaciones] = useState<ObservacionesRow[]>([]);
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [cargando, setCargando] = useState(true);

  async function cargarObservaciones() {
    const { data } = await supabase
      .from("observaciones")
      .select("*")
      .eq("equipo_id", equipoId)
      .order("created_at", { ascending: false });
    setObservaciones(data ?? []);
  }

  useEffect(() => {
    (async () => {
      setCargando(true);
      const [s, p, h, mc, ms, j, a, ev] = await Promise.all([
        supabase.from("sesiones").select("*").eq("equipo_id", equipoId),
        supabase.from("partidos").select("*").eq("equipo_id", equipoId).order("fecha", { ascending: false }),
        supabase.from("horario_recurrente").select("*").eq("equipo_id", equipoId),
        supabase.from("microciclos").select("*").eq("equipo_id", equipoId),
        supabase.from("mesociclos").select("*").eq("equipo_id", equipoId),
        supabase.from("jugadores").select("*").eq("equipo_id", equipoId),
        supabase.from("asistencia").select("*").eq("equipo_id", equipoId),
        cargarEventosEquipo(equipoId),
      ]);
      setSesiones(s.data ?? []);
      setPartidos(p.data ?? []);
      setHorario(h.data ?? []);
      setMicrociclos(mc.data ?? []);
      setMesociclos(ms.data ?? []);
      setJugadores(j.data ?? []);
      setAsistencia(a.data ?? []);
      setEventosPorPartido(agruparPorPartido(ev));
      setCargando(false);
    })();
    cargarObservaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  async function borrarObservacion(id: string) {
    if (!confirm("¿Borrar esta nota?")) return;
    await supabase.from("observaciones").delete().eq("id", id);
    cargarObservaciones();
  }

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
  const ultimosResultados = partidos.filter((p) => resultadoPartido(p, eventosPorPartido.get(p.id) ?? []) !== null).slice(0, 4);
  const record = resumenResultados(partidos, eventosPorPartido);

  const diasSemana = getWeekDates(hoy).map(toISODate);
  const entrenamientosSemana = sesiones.filter((s) => diasSemana.includes(s.fecha)).length;
  const partidosSemana = partidos.filter((p) => diasSemana.includes(p.fecha)).length;
  const asistenciaEntreno = asistencia.filter((a) => a.sesion_id);
  const asistenciaMedia =
    asistenciaEntreno.length > 0
      ? Math.round((asistenciaEntreno.filter((a) => a.presente).length / asistenciaEntreno.length) * 100)
      : null;

  // Fecha de cada evento (para ordenar la asistencia de un jugador cronológicamente).
  const fechaDeEvento = new Map<string, string>();
  for (const s of sesiones) fechaDeEvento.set(s.id, s.fecha);
  for (const p of partidos) fechaDeEvento.set(p.id, p.fecha);

  const alertas: { dot: string; texto: string; sub: string; partidoId?: string }[] = [];
  for (const j of jugadores) {
    const registros = asistencia
      .filter((a) => a.jugador_id === j.id && a.sesion_id)
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

  const partidosSinConvocatoria = partidos.filter((p) => !asistencia.some((a) => a.partido_id === p.id));
  for (const p of partidosSinConvocatoria) {
    alertas.push({
      dot: "var(--color-warning)",
      texto: `Convocatoria pendiente: vs ${p.rival}`,
      sub: `${new Date(p.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} — hazla antes de registrar el partido en directo`,
      partidoId: p.id,
    });
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
        fichasOficialesUrl={equipo?.fichas_oficiales_url ?? null}
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
              {proximoPartido.hora && (
                <div className="text-[11px] text-[var(--color-text-muted)]">{proximoPartido.hora.slice(0, 5)}</div>
              )}
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
              const eventosP = eventosPorPartido.get(p.id) ?? [];
              const r = resultadoPartido(p, eventosP)!;
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
                  <span className="stat-number shrink-0 text-lg">{marcadorPartido(p, eventosP)}</span>
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
        {alertas.length === 0 && observaciones.length === 0 ? (
          <div className="mb-2 flex items-center gap-3 rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ddc8a]" />
            <div className="text-[13px] font-medium text-white">Sin incidencias — todo al día</div>
          </div>
        ) : (
          <div className="mb-2 flex flex-col gap-2">
            {alertas.map((a, i) => {
              const contenido = (
                <>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.dot }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-white">{a.texto}</div>
                    <div className="mt-0.5 truncate text-[11px] text-white/50">{a.sub}</div>
                  </div>
                </>
              );
              return a.partidoId ? (
                <button
                  key={i}
                  onClick={() => navigate(`/equipos/${equipoId}/partido/${a.partidoId}?vista=convocatoria`)}
                  className="flex w-full items-center gap-3 rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5 text-left"
                >
                  {contenido}
                  <ChevronRight size={18} className="shrink-0 text-white/40" />
                </button>
              ) : (
                <div key={i} className="flex items-center gap-3 rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5">
                  {contenido}
                </div>
              );
            })}
            {observaciones.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/35" />
                <div className="min-w-0 flex-1 text-[13px] font-medium text-white">{o.texto}</div>
                <button
                  onClick={() => borrarObservacion(o.id)}
                  aria-label="Borrar nota"
                  className="shrink-0 text-white/40 hover:text-white/70"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setNotaAbierta(true)}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          <Plus size={16} /> Añadir nota
        </button>
      </div>

      <NotaModal
        open={notaAbierta}
        onClose={() => setNotaAbierta(false)}
        equipoId={equipoId}
        onGuardada={() => {
          setNotaAbierta(false);
          cargarObservaciones();
        }}
      />
    </div>
  );
}

function NotaModal({
  open,
  onClose,
  equipoId,
  onGuardada,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  onGuardada: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) setTexto("");
  }, [open]);

  async function guardar() {
    if (!texto.trim()) return;
    setGuardando(true);
    const { error } = await supabase.from("observaciones").insert({ equipo_id: equipoId, texto: texto.trim() });
    setGuardando(false);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    onGuardada();
  }

  return (
    <Modal open={open} onClose={onClose} title="Añadir nota">
      <Textarea
        placeholder="Escribe una observación..."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="min-h-24"
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={guardando || !texto.trim()}>
          {guardando ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </Modal>
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
  fichasOficialesUrl,
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
  fichasOficialesUrl: string | null;
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
        {fichasOficialesUrl && (
          <button
            onClick={async () => {
              try {
                window.open(await urlFirmada(fichasOficialesUrl), "_blank", "noopener,noreferrer");
              } catch {
                alert("No se pudo abrir el archivo.");
              }
            }}
            className="card-surface mt-2 flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-[var(--color-ink)]"
          >
            <FileText size={16} /> Fichas oficiales
          </button>
        )}
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
