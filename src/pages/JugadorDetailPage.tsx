import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { JugadorFormModal } from "@/components/equipo/JugadorFormModal";
import { eficaciaLanzamiento, minutosJugados } from "@/lib/partidoStats";
import type { AsistenciaRow, JugadoresRow, PartidosRow, SesionesRow } from "@/types/database";

export function JugadorDetailPage() {
  const { equipoId } = useEquipo();
  const { jugadorId } = useParams<{ jugadorId: string }>();
  const navigate = useNavigate();
  const [jugador, setJugador] = useState<JugadoresRow | null>(null);
  const [partidos, setPartidos] = useState<PartidosRow[]>([]);
  const [asistencia, setAsistencia] = useState<AsistenciaRow[]>([]);
  const [sesiones, setSesiones] = useState<SesionesRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);

  async function cargar() {
    if (!jugadorId) return;
    setCargando(true);
    const [j, p, a, s] = await Promise.all([
      supabase.from("jugadores").select("*").eq("id", jugadorId).maybeSingle(),
      supabase.from("partidos").select("*").eq("equipo_id", equipoId),
      supabase.from("asistencia").select("*").eq("equipo_id", equipoId).eq("jugador_id", jugadorId),
      supabase.from("sesiones").select("*").eq("equipo_id", equipoId),
    ]);
    setJugador(j.data ?? null);
    setPartidos(p.data ?? []);
    setAsistencia(a.data ?? []);
    setSesiones(s.data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId, jugadorId]);

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }
  if (!jugador) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Jugador/a no encontrado.</div>;
  }

  // Goles y demás: eventos de los partidos atribuidos a este jugador.
  let goles = 0;
  let exclusiones = 0;
  let balonesPerdidos = 0;
  let minutosTotales = 0;
  let partidosConMinutos = 0;
  const partidosConEventoDelJugador = new Set<string>();
  const todosLosEventos = partidos.flatMap((p) => p.estadisticas.eventos ?? []);
  for (const p of partidos) {
    const eventosPartido = p.estadisticas.eventos ?? [];
    for (const e of eventosPartido) {
      if (e.jugador_id !== jugador.id) continue;
      partidosConEventoDelJugador.add(p.id);
      if (e.tipo === "gol_favor" || e.tipo === "siete_metido") goles++;
      if (e.tipo === "balon_perdido") balonesPerdidos++;
      if (e.tipo === "exclusion_2min") exclusiones++;
    }
    const minParaEstePartido = minutosJugados(eventosPartido, jugador.id);
    if (minParaEstePartido > 0) {
      minutosTotales += minParaEstePartido;
      partidosConMinutos++;
    }
  }
  const partidosJugados = partidosConEventoDelJugador.size;
  const eficaciaLanzamientoPct = eficaciaLanzamiento(todosLosEventos, jugador.id);
  const perdidasPorPartido = partidosJugados > 0 ? (balonesPerdidos / partidosJugados).toFixed(1) : null;
  const minutosPorPartido = partidosConMinutos > 0 ? Math.round(minutosTotales / partidosConMinutos) : null;

  // Asistencia a entrenamientos (solo sesiones, no partidos), ordenada por fecha del evento.
  const fechaDeSesion = new Map<string, string>();
  for (const s of sesiones) fechaDeSesion.set(s.id, s.fecha);
  const registrosEntreno = asistencia
    .filter((a) => a.sesion_id)
    .map((a) => ({ ...a, fecha: fechaDeSesion.get(a.sesion_id!) ?? "" }))
    .filter((a) => a.fecha)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const presentes = registrosEntreno.filter((a) => a.presente).length;
  const asistenciaPct = registrosEntreno.length > 0 ? Math.round((presentes / registrosEntreno.length) * 100) : null;
  const ultimas10 = registrosEntreno.slice(0, 10);

  function colorRegistro(a: AsistenciaRow): string {
    if (a.presente) return "var(--color-success)";
    if (a.motivo_ausencia === "justificado") return "var(--color-warning)";
    if (a.motivo_ausencia === "lesion") return "var(--color-text-faint)";
    return "var(--color-accent)";
  }

  const edad = jugador.año_nacimiento ? `${new Date().getFullYear() - jugador.año_nacimiento} años` : null;

  const stats = [
    { k: "Goles", v: String(goles) },
    { k: "Partidos", v: String(partidosJugados) },
    { k: "Asistencias", v: String(presentes) },
    { k: "Exclusiones", v: String(exclusiones) },
  ];

  const bars = [
    { k: "Eficacia de lanzamiento", v: eficaciaLanzamientoPct !== null ? `${eficaciaLanzamientoPct}%` : "—", w: eficaciaLanzamientoPct ?? 0 },
    { k: "Minutos por partido", v: minutosPorPartido !== null ? `${minutosPorPartido}'` : "—", w: minutosPorPartido ? Math.min(100, (minutosPorPartido / 60) * 100) : 0 },
    { k: "Pérdidas por partido", v: perdidasPorPartido ?? "—", w: perdidasPorPartido ? Math.min(100, Number(perdidasPorPartido) * 20) : 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[var(--color-ink)] px-5 pb-6 pt-5" style={{ borderRadius: "1.25rem" }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(`/equipos/${equipoId}/equipo`)}
            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <ChevronLeft size={16} className="text-[var(--color-accent)]" /> Plantilla
          </button>
          <button
            onClick={() => setEditando(true)}
            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <Pencil size={16} /> Editar
          </button>
        </div>
        <div className="flex items-end gap-4">
          <div className="stat-number shrink-0 text-[4.25rem] leading-[0.85] text-[var(--color-accent)]">
            {jugador.dorsal ?? "—"}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="hero-title truncate text-[1.6rem]">{jugador.nombre}</div>
            <div className="mt-1.5 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">
              {[jugador.puesto, edad].filter(Boolean).join(" · ") || "Sin datos"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((s) => (
          <div key={s.k} className="card-surface p-4">
            <div className="stat-number text-[28px]">{s.v}</div>
            <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
              {s.k}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Asistencia a entrenamientos
        </div>
        <div className="card-surface p-4">
          {asistenciaPct !== null ? (
            <>
              <div className="mb-3.5 flex items-end justify-between">
                <div className="stat-number text-[2.375rem] leading-none text-[var(--color-accent)]">{asistenciaPct}%</div>
                <div className="text-right text-xs text-[var(--color-text-muted)]">
                  {presentes} de {registrosEntreno.length} sesiones
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div
                  className="h-2 rounded-full bg-[var(--color-accent)]"
                  style={{ width: `${asistenciaPct}%` }}
                />
              </div>
              <div className="mt-4 flex gap-1">
                {ultimas10.map((a) => (
                  <div key={a.id} className="h-[30px] flex-1 rounded-md" style={{ backgroundColor: colorRegistro(a) }} />
                ))}
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
                Últimas {ultimas10.length} sesiones
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">Todavía no hay registros de asistencia.</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Rendimiento
        </div>
        <div className="flex flex-col gap-2.5">
          {bars.map((b) => (
            <div key={b.k} className="card-surface p-3.5">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="text-sm">{b.k}</span>
                <span className="stat-number text-base">{b.v}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div className="h-1.5 rounded-full bg-[var(--color-ink)]" style={{ width: `${b.w}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <JugadorFormModal
        open={editando}
        onClose={() => setEditando(false)}
        equipoId={equipoId}
        jugador={jugador}
        onSaved={() => {
          setEditando(false);
          cargar();
        }}
        onDeleted={() => navigate(`/equipos/${equipoId}/equipo`)}
      />
    </div>
  );
}
