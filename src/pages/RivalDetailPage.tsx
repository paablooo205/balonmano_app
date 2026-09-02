import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select } from "@/components/ui/field";
import { AnilloDonut } from "@/components/partido/AnilloDonut";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { FichaTecnica } from "@/components/partido/FichaTecnica";
import {
  RESULTADO_BADGE,
  desgloseResultados,
  distribucionPorZona,
  eficaciaConDetalle,
  marcadorNumerico,
  marcadorPartido,
  porcentajeParadas,
  resultadoPartido,
} from "@/lib/partidoStats";
import { agruparPorPartido, cargarEventosEquipo } from "@/lib/eventos";
import type { EventosRow, JugadoresRow, PartidosRow, RivalesRow } from "@/types/database";

export function RivalDetailPage() {
  const { equipoId } = useEquipo();
  const { rivalId } = useParams<{ rivalId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rival, setRival] = useState<RivalesRow | null>(null);
  const [partidos, setPartidos] = useState<PartidosRow[]>([]);
  const [jugadores, setJugadores] = useState<JugadoresRow[]>([]);
  const [eventos, setEventos] = useState<EventosRow[]>([]);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    if (!rivalId) return;
    setCargando(true);
    const [r, p, j, ev] = await Promise.all([
      supabase.from("rivales").select("*").eq("id", rivalId).maybeSingle(),
      supabase.from("partidos").select("*").eq("equipo_id", equipoId),
      supabase.from("jugadores").select("*").eq("equipo_id", equipoId),
      cargarEventosEquipo(equipoId),
    ]);
    setRival(r.data ?? null);
    setPartidos(p.data ?? []);
    setJugadores(j.data ?? []);
    setEventos(ev);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId, rivalId]);

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }
  if (!rival) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Rival no encontrado.</div>;
  }

  const partidosVsRival = partidos
    .filter((p) => p.rival_id === rival.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const ambito = searchParams.get("partido") ?? "todos";
  const ambitoValido = ambito === "todos" || partidosVsRival.some((p) => p.id === ambito) ? ambito : "todos";

  const eventosPorPartido = agruparPorPartido(eventos);
  const partidoIdsVsRival = new Set(partidosVsRival.map((p) => p.id));
  const eventosVsRival = eventos.filter((e) => e.partido_id !== null && partidoIdsVsRival.has(e.partido_id));

  // --- Historial: victorias/derrotas/empates y goles acumulados, partido a partido ---
  let victorias = 0;
  let empates = 0;
  let derrotas = 0;
  let golesFavorTotal = 0;
  let golesContraTotal = 0;
  // Solo cuentan los partidos con resultado ya resuelto (mismo criterio que
  // ProgresoPage.tsx) — un partido programado sin jugar todavía no debe
  // sumar a "Partidos" mientras Victorias/Empates/Derrotas y goles solo
  // cuentan los jugados, o la cabecera parecería un 0-0 catastrófico.
  let partidosConResultado = 0;
  for (const p of partidosVsRival) {
    const eventosP = eventosPorPartido.get(p.id) ?? [];
    const resultado = resultadoPartido(p, eventosP);
    if (resultado === null) continue;
    partidosConResultado++;
    if (resultado === "victoria") victorias++;
    else if (resultado === "empate") empates++;
    else if (resultado === "derrota") derrotas++;
    const marcador = marcadorNumerico(p, eventosP);
    if (marcador) {
      golesFavorTotal += marcador.favor;
      golesContraTotal += marcador.contra;
    }
  }

  // --- Nuestra eficacia de tiro contra este rival, acumulada ---
  const tirosJuego = eventosVsRival.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti);
  const tirosPenalti = eventosVsRival.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);
  const golesZonasJuego = distribucionPorZona(tirosJuego.filter((e) => e.resultado === "gol"));
  const golesZonasPenalti = distribucionPorZona(tirosPenalti.filter((e) => e.resultado === "gol"));
  const desgloseJuego = desgloseResultados(tirosJuego);
  const desglosePenalti = desgloseResultados(tirosPenalti);
  const pctJuego = tirosJuego.length > 0 ? Math.round((desgloseJuego.gol / tirosJuego.length) * 100) : null;
  const pctPenalti = tirosPenalti.length > 0 ? Math.round((desglosePenalti.gol / tirosPenalti.length) * 100) : null;

  // --- Dónde nos tira este rival, acumulado (misma lógica que el bloque
  // "Nuestra portería" de FichaTecnica.tsx, sin filtrar por jugador) ---
  const tirosRivalJuego = eventosVsRival.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && !e.es_penalti);
  const tirosRivalPenalti = eventosVsRival.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && e.es_penalti);
  const zonasRivalJuego = distribucionPorZona(tirosRivalJuego);
  const zonasRivalPenalti = distribucionPorZona(tirosRivalPenalti);
  const paradasZonasRivalJuego = distribucionPorZona(tirosRivalJuego.filter((e) => e.resultado === "parado"));
  const paradasZonasRivalPenalti = distribucionPorZona(tirosRivalPenalti.filter((e) => e.resultado === "parado"));

  const partidoSeleccionado = ambitoValido !== "todos" ? partidosVsRival.find((p) => p.id === ambitoValido) ?? null : null;
  const eventosPartidoSeleccionado = partidoSeleccionado ? eventosPorPartido.get(partidoSeleccionado.id) ?? [] : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={rival.nombre} onBack={() => navigate(`/equipos/${equipoId}/rivales`)} backLabel="Rivales" />

      {partidosVsRival.length > 0 && (
        <Select
          aria-label="Ámbito de la ficha de rival"
          value={ambitoValido}
          onChange={(e) => {
            const valor = e.target.value;
            setSearchParams(valor === "todos" ? {} : { partido: valor }, { replace: true });
          }}
        >
          <option value="todos">Todos los partidos</option>
          {partidosVsRival.map((p) => (
            <option key={p.id} value={p.id}>
              {new Date(p.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} ·{" "}
              {marcadorPartido(p, eventosPorPartido.get(p.id) ?? [])}
            </option>
          ))}
        </Select>
      )}

      {ambitoValido === "todos" ? (
        <div className="flex flex-col gap-4">
          {partidosVsRival.length === 0 ? (
            <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">
              Todavía no hay partidos registrados contra este rival.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="card-surface p-4">
                  <div className="stat-number text-[28px]">{partidosConResultado}</div>
                  <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
                    Partidos
                  </div>
                </div>
                <div className="card-surface p-4">
                  <div className="stat-number text-[28px] text-[var(--color-success)]">{victorias}</div>
                  <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
                    Victorias
                  </div>
                </div>
                <div className="card-surface p-4">
                  <div className="stat-number text-[28px] text-[var(--color-warning)]">{empates}</div>
                  <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
                    Empates
                  </div>
                </div>
                <div className="card-surface p-4">
                  <div className="stat-number text-[28px] text-[var(--color-accent)]">{derrotas}</div>
                  <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
                    Derrotas
                  </div>
                </div>
              </div>

              <div className="card-surface flex items-center justify-center gap-8 p-4">
                <div className="text-center">
                  <div className="stat-number text-2xl">{golesFavorTotal}</div>
                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
                    Goles a favor
                  </div>
                </div>
                <div className="text-center">
                  <div className="stat-number text-2xl">{golesContraTotal}</div>
                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
                    Goles en contra
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                  Nuestra eficacia de tiro
                </div>
                <div className="flex items-center justify-center gap-6 card-surface p-4">
                  <AnilloDonut
                    tamano={96}
                    segmentos={[
                      { label: "Gol", valor: desgloseJuego.gol, color: "var(--color-success)" },
                      { label: "Parado", valor: desgloseJuego.parado, color: "#3d8ad6" },
                      { label: "Fuera", valor: desgloseJuego.fuera, color: "var(--color-accent)" },
                      { label: "Poste", valor: desgloseJuego.poste, color: "color-mix(in srgb, var(--color-accent) 55%, white)" },
                    ]}
                    centro={
                      pctJuego === null ? (
                        <span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">Juego abierto</span>
                      ) : (
                        <div className="flex flex-col items-center leading-none">
                          <span className="stat-number text-lg text-[var(--color-ink)]">{pctJuego}%</span>
                          <span className="mt-0.5 px-1 text-center text-[7px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">Juego abierto</span>
                        </div>
                      )
                    }
                  />
                  <AnilloDonut
                    tamano={96}
                    segmentos={[
                      { label: "Gol", valor: desglosePenalti.gol, color: "var(--color-success)" },
                      { label: "Parado", valor: desglosePenalti.parado, color: "#3d8ad6" },
                      { label: "Fuera", valor: desglosePenalti.fuera, color: "var(--color-accent)" },
                      { label: "Poste", valor: desglosePenalti.poste, color: "color-mix(in srgb, var(--color-accent) 55%, white)" },
                    ]}
                    centro={
                      pctPenalti === null ? (
                        <span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">7 metros</span>
                      ) : (
                        <div className="flex flex-col items-center leading-none">
                          <span className="stat-number text-lg text-[var(--color-ink)]">{pctPenalti}%</span>
                          <span className="mt-0.5 px-1 text-center text-[7px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">7 metros</span>
                        </div>
                      )
                    }
                  />
                </div>
              </div>

              <div className="card-surface p-4">
                <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                  Dónde tiramos nosotros
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <BloqueTiro
                    titulo="Juego abierto"
                    detalle={eficaciaConDetalle(eventosVsRival, { soloPenalti: false })}
                    zonas={zonasJuego}
                    total={tirosJuego.length}
                    aciertosPorZona={golesZonasJuego}
                    etiquetaAcierto="goles"
                  />
                  <BloqueTiro
                    titulo="7 metros"
                    detalle={eficaciaConDetalle(eventosVsRival, { soloPenalti: true })}
                    zonas={zonasPenalti}
                    total={tirosPenalti.length}
                    aciertosPorZona={golesZonasPenalti}
                    etiquetaAcierto="goles"
                  />
                </div>
              </div>

              <div className="card-surface p-4">
                <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                  Dónde nos tira el rival
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <BloqueTiro
                    titulo="Juego abierto"
                    detalle={porcentajeParadas(eventosVsRival, { soloPenalti: false })}
                    zonas={zonasRivalJuego}
                    total={tirosRivalJuego.length}
                    aciertosPorZona={paradasZonasRivalJuego}
                    etiquetaAcierto="paradas"
                  />
                  <BloqueTiro
                    titulo="7 metros"
                    detalle={porcentajeParadas(eventosVsRival, { soloPenalti: true })}
                    zonas={zonasRivalPenalti}
                    total={tirosRivalPenalti.length}
                    aciertosPorZona={paradasZonasRivalPenalti}
                    etiquetaAcierto="paradas"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                  Partidos contra {rival.nombre}
                </div>
                <div className="card-surface divide-y divide-[var(--color-border)] overflow-hidden p-0">
                  {[...partidosVsRival].reverse().map((p) => {
                    const eventosP = eventosPorPartido.get(p.id) ?? [];
                    const resultado = resultadoPartido(p, eventosP);
                    const badge = resultado ? RESULTADO_BADGE[resultado] : null;
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/equipos/${equipoId}/partido/${p.id}?vista=ficha`)}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                      >
                        <span
                          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                          style={{ backgroundColor: badge?.bg ?? "var(--color-text-faint)" }}
                        >
                          {badge?.letra ?? "—"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {new Date(p.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                          </div>
                          <div className="mt-1 truncate text-xs text-[var(--color-text-faint)]">
                            {p.casa_fuera === "casa" ? "Casa" : p.casa_fuera === "fuera" ? "Fuera" : "Sede sin confirmar"}
                            {p.competicion ? ` · ${p.competicion}` : ""}
                          </div>
                        </div>
                        <span className="stat-number shrink-0 text-lg tracking-[0.02em]">{marcadorPartido(p, eventosP)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        partidoSeleccionado && (
          <FichaTecnica partido={partidoSeleccionado} jugadores={jugadores} eventos={eventosPartidoSeleccionado} />
        )
      )}
    </div>
  );
}
