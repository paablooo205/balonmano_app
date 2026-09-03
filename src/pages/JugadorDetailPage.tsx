import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { AnilloDonut } from "@/components/partido/AnilloDonut";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { DesgloseJugadorPartido } from "@/components/partido/DesgloseJugadorPartido";
import { LineaEvolucionEficacia } from "@/components/jugador/LineaEvolucionEficacia";
import { JugadorFormModal } from "@/components/equipo/JugadorFormModal";
import { InsightsCard } from "@/components/dashboard/InsightsCard";
import { Select } from "@/components/ui/field";
import {
  desgloseResultados,
  distribucionPorZona,
  eficaciaConDetalle,
  esPortero,
  perdidas,
  porcentajeParadas,
  resultadoPartido,
  robos,
} from "@/lib/partidoStats";
import { MIN_TIROS_RECIBIDOS } from "@/lib/valoracion";
import { agruparPorPartido, cargarEventosEquipo } from "@/lib/eventos";
import { generarInsights } from "@/lib/insights";
import type { AsistenciaRow, EventosRow, JugadoresRow, PartidosRow, SesionesRow } from "@/types/database";

export function JugadorDetailPage() {
  const { equipoId } = useEquipo();
  const { jugadorId } = useParams<{ jugadorId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jugador, setJugador] = useState<JugadoresRow | null>(null);
  const [partidos, setPartidos] = useState<PartidosRow[]>([]);
  const [asistencia, setAsistencia] = useState<AsistenciaRow[]>([]);
  const [sesiones, setSesiones] = useState<SesionesRow[]>([]);
  const [eventos, setEventos] = useState<EventosRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const ambito = searchParams.get("partido") ?? "temporada";

  async function cargar() {
    if (!jugadorId) return;
    setCargando(true);
    const [j, p, a, s, ev] = await Promise.all([
      supabase.from("jugadores").select("*").eq("id", jugadorId).maybeSingle(),
      supabase.from("partidos").select("*").eq("equipo_id", equipoId),
      supabase.from("asistencia").select("*").eq("equipo_id", equipoId).eq("jugador_id", jugadorId),
      supabase.from("sesiones").select("*").eq("equipo_id", equipoId),
      cargarEventosEquipo(equipoId),
    ]);
    setJugador(j.data ?? null);
    setPartidos(p.data ?? []);
    setAsistencia(a.data ?? []);
    setSesiones(s.data ?? []);
    setEventos(ev);
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

  // "Jugado" = convocado (asistencia.presente=true para ese partido_id) y
  // el partido ya tiene resultado resuelto — no "tiene algún evento", que
  // contaba de más (un partido con eventos pero sin convocatoria hecha) y
  // de menos (un suplente convocado que no llegó a tocar el balón) a la vez.
  const partidosConvocado = new Set(
    asistencia.filter((a) => a.jugador_id === jugador.id && a.partido_id && a.presente).map((a) => a.partido_id!),
  );
  const eventosPorPartido = agruparPorPartido(eventos);
  const partidosJugadosOrdenados = partidos
    .filter((p) => partidosConvocado.has(p.id) && resultadoPartido(p, eventosPorPartido.get(p.id) ?? []) !== null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const partidosJugados = partidosJugadosOrdenados.length;

  const idsPartidosJugados = new Set(partidosJugadosOrdenados.map((p) => p.id));
  const eventosDelJugador = eventos.filter(
    (e) => e.jugador_id === jugador.id && e.partido_id !== null && idsPartidosJugados.has(e.partido_id),
  );

  // Goles y demás: solo de los partidos que ahora cuentan como jugados.
  let goles = 0;
  let exclusiones = 0;
  for (const e of eventosDelJugador) {
    if (e.tipo === "tiro" && e.equipo_origen === "propio" && e.resultado === "gol") goles++;
    if (e.tipo === "exclusion") exclusiones++;
  }

  const ambitoValido =
    ambito === "temporada" || partidosJugadosOrdenados.some((p) => p.id === ambito) ? ambito : "temporada";

  const portero = esPortero(jugador.puesto);

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

  // --- Temporada completa: eficacia de tiro propio, acumulada ---
  const tirosJuego = eventosDelJugador.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti);
  const tirosPenalti = eventosDelJugador.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);
  const golesZonasJuego = distribucionPorZona(tirosJuego.filter((e) => e.resultado === "gol"));
  const golesZonasPenalti = distribucionPorZona(tirosPenalti.filter((e) => e.resultado === "gol"));
  const desgloseJuego = desgloseResultados(tirosJuego);
  const desglosePenalti = desgloseResultados(tirosPenalti);
  const pctJuego = tirosJuego.length > 0 ? Math.round((desgloseJuego.gol / tirosJuego.length) * 100) : null;
  const pctPenalti = tirosPenalti.length > 0 ? Math.round((desglosePenalti.gol / tirosPenalti.length) * 100) : null;

  // --- Temporada completa: paradas del portero, acumuladas ---
  const tirosRivalJuego = eventosDelJugador.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && !e.es_penalti);
  const tirosRivalPenalti = eventosDelJugador.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && e.es_penalti);
  const zonasRivalJuego = distribucionPorZona(tirosRivalJuego);
  const zonasRivalPenalti = distribucionPorZona(tirosRivalPenalti);
  const paradasZonasRivalJuego = distribucionPorZona(tirosRivalJuego.filter((e) => e.resultado === "parado"));
  const paradasZonasRivalPenalti = distribucionPorZona(tirosRivalPenalti.filter((e) => e.resultado === "parado"));
  const desgloseRivalJuego = desgloseResultados(tirosRivalJuego);
  const desgloseRivalPenalti = desgloseResultados(tirosRivalPenalti);
  const detalleParadasJuego = portero ? porcentajeParadas(eventosDelJugador, { soloPenalti: false }) : null;
  const detalleParadasPenalti = portero ? porcentajeParadas(eventosDelJugador, { soloPenalti: true }) : null;
  // Muestra pequeña evaluada por separado en cada anillo — 7m y juego abierto
  // nunca se mezclan, tampoco para decidir si hay que avisar de cautela.
  const muestraPequenaJuego = portero && tirosRivalJuego.length > 0 && tirosRivalJuego.length < MIN_TIROS_RECIBIDOS;
  const muestraPequenaPenalti = portero && tirosRivalPenalti.length > 0 && tirosRivalPenalti.length < MIN_TIROS_RECIBIDOS;

  // --- Línea de evolución, partido a partido: eficacia de tiro para un
  // jugador de campo, % de paradas para un portero — nunca la mezcla de
  // ambos criterios en la misma serie. ---
  const tendenciaEficacia = partidosJugadosOrdenados.map((p) => {
    const eventosDeEsePartido = eventosDelJugador.filter((e) => e.partido_id === p.id);
    const detalle = portero ? porcentajeParadas(eventosDeEsePartido) : eficaciaConDetalle(eventosDeEsePartido);
    return {
      label: p.fecha,
      pct: detalle?.pct ?? null,
      aciertos: detalle?.aciertos ?? null,
      intentos: detalle?.intentos ?? null,
    };
  });

  // --- Insights de temporada: últimos 3 partidos vs el resto (solo si hay
  // "resto" con el que comparar de forma justa). ---
  const ultimosPartidos = partidosJugadosOrdenados.slice(-3);
  const restoPartidos = partidosJugadosOrdenados.slice(0, -3);
  const idsUltimos = new Set(ultimosPartidos.map((p) => p.id));
  const idsResto = new Set(restoPartidos.map((p) => p.id));
  const enResto = (e: EventosRow) => e.partido_id !== null && idsResto.has(e.partido_id);
  const enUltimos = (e: EventosRow) => e.partido_id !== null && idsUltimos.has(e.partido_id);

  // Un jugador de campo nunca recibe insights de "nuestra portería" y un portero
  // nunca los recibe de tiro propio — misma separación estricta que ya aplican
  // los cuadros visibles de esta ficha.
  const insights = generarInsights({
    zonaPropioJuego: portero ? [] : tirosJuego,
    zonaPropioPenalti: portero ? [] : tirosPenalti,
    zonaRivalJuego: portero ? tirosRivalJuego : [],
    zonaRivalPenalti: portero ? tirosRivalPenalti : [],
    ejecucionPropioJuego: portero ? [] : tirosJuego,
    contextoAusencia: "en toda la temporada",
    tendencia:
      restoPartidos.length > 0 && ultimosPartidos.length > 0
        ? {
            propio: portero ? [[], []] : [tirosJuego.filter(enResto), tirosJuego.filter(enUltimos)],
            rival: portero ? [tirosRivalJuego.filter(enResto), tirosRivalJuego.filter(enUltimos)] : [[], []],
            etiquetas: { a: "del resto de la temporada", b: "los últimos 3 partidos" },
          }
        : undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="hero-band">
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
          Ficha técnica
        </div>
        {partidosJugadosOrdenados.length > 0 && (
          <Select
            className="mb-3"
            aria-label="Ámbito de la ficha técnica"
            value={ambitoValido}
            onChange={(e) => {
              const valor = e.target.value;
              setSearchParams(valor === "temporada" ? {} : { partido: valor }, { replace: true });
            }}
          >
            <option value="temporada">Toda la temporada</option>
            {partidosJugadosOrdenados.map((p) => (
              <option key={p.id} value={p.id}>
                {new Date(p.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} vs {p.rival}
              </option>
            ))}
          </Select>
        )}

        {ambitoValido === "temporada" ? (
          <div className="flex flex-col gap-4">
            <InsightsCard insights={insights} />

            <div className="flex gap-4 text-xs text-[var(--color-text-muted)]">
              <span>
                <span className="stat-number text-[var(--color-ink)]">{perdidas(eventosDelJugador)}</span> pérdidas
              </span>
              <span>
                <span className="stat-number text-[var(--color-ink)]">{robos(eventosDelJugador)}</span> robos
              </span>
            </div>

            {portero ? (
              <>
                <div>
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                    Eficacia de paradas
                  </div>
                  <div className="flex items-center justify-center gap-6 card-surface p-4">
                    <AnilloDonut
                      tamano={96}
                      segmentos={[
                        { label: "Parado", valor: desgloseRivalJuego.parado, color: "#3d8ad6" },
                        { label: "Gol", valor: desgloseRivalJuego.gol, color: "var(--color-success)" },
                        { label: "Fuera", valor: desgloseRivalJuego.fuera, color: "var(--color-accent)" },
                        { label: "Poste", valor: desgloseRivalJuego.poste, color: "color-mix(in srgb, var(--color-accent) 55%, white)" },
                      ]}
                      centro={
                        detalleParadasJuego === null ? (
                          <span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">Juego abierto</span>
                        ) : (
                          <div className="flex flex-col items-center leading-none">
                            <span className="stat-number text-lg text-[var(--color-ink)]">{detalleParadasJuego.pct}%</span>
                            <span className="mt-0.5 px-1 text-center text-[7px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">Juego abierto</span>
                          </div>
                        )
                      }
                    />
                    <AnilloDonut
                      tamano={96}
                      segmentos={[
                        { label: "Parado", valor: desgloseRivalPenalti.parado, color: "#3d8ad6" },
                        { label: "Gol", valor: desgloseRivalPenalti.gol, color: "var(--color-success)" },
                        { label: "Fuera", valor: desgloseRivalPenalti.fuera, color: "var(--color-accent)" },
                        { label: "Poste", valor: desgloseRivalPenalti.poste, color: "color-mix(in srgb, var(--color-accent) 55%, white)" },
                      ]}
                      centro={
                        detalleParadasPenalti === null ? (
                          <span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">7 metros</span>
                        ) : (
                          <div className="flex flex-col items-center leading-none">
                            <span className="stat-number text-lg text-[var(--color-ink)]">{detalleParadasPenalti.pct}%</span>
                            <span className="mt-0.5 px-1 text-center text-[7px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">7 metros</span>
                          </div>
                        )
                      }
                    />
                  </div>
                  {(muestraPequenaJuego || muestraPequenaPenalti) && (
                    <div className="mt-2 flex flex-col gap-0.5">
                      {muestraPequenaJuego && (
                        <p className="text-[10px] text-[var(--color-text-faint)]">
                          Juego abierto: menos de {MIN_TIROS_RECIBIDOS} tiros recibidos en la temporada — interpreta el % con cautela.
                        </p>
                      )}
                      {muestraPequenaPenalti && (
                        <p className="text-[10px] text-[var(--color-text-faint)]">
                          7 metros: menos de {MIN_TIROS_RECIBIDOS} tiros recibidos en la temporada — interpreta el % con cautela.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="card-surface p-4">
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                    Tiros recibidos
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <BloqueTiro
                      titulo="Juego abierto"
                      detalle={detalleParadasJuego}
                      zonas={zonasRivalJuego}
                      total={tirosRivalJuego.length}
                      aciertosPorZona={paradasZonasRivalJuego}
                      etiquetaAcierto="paradas"
                    />
                    <BloqueTiro
                      titulo="7 metros"
                      detalle={detalleParadasPenalti}
                      zonas={zonasRivalPenalti}
                      total={tirosRivalPenalti.length}
                      aciertosPorZona={paradasZonasRivalPenalti}
                      etiquetaAcierto="paradas"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
                    Eficacia de tiro
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
                    Tiro propio
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <BloqueTiro
                      titulo="Juego abierto"
                      detalle={eficaciaConDetalle(eventosDelJugador, { soloPenalti: false })}
                      zonas={zonasJuego}
                      total={tirosJuego.length}
                      aciertosPorZona={golesZonasJuego}
                      etiquetaAcierto="goles"
                    />
                    <BloqueTiro
                      titulo="7 metros"
                      detalle={eficaciaConDetalle(eventosDelJugador, { soloPenalti: true })}
                      zonas={zonasPenalti}
                      total={tirosPenalti.length}
                      aciertosPorZona={golesZonasPenalti}
                      etiquetaAcierto="goles"
                    />
                  </div>
                </div>
              </>
            )}

            <LineaEvolucionEficacia
              puntos={tendenciaEficacia}
              titulo={portero ? "Evolución de paradas" : "Evolución de eficacia"}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <DesgloseJugadorPartido jugador={jugador} eventos={eventos.filter((e) => e.partido_id === ambitoValido)} />
            <button
              onClick={() => navigate(`/equipos/${equipoId}/partido/${ambitoValido}?vista=ficha`)}
              className="text-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Ver ficha técnica completa del partido →
            </button>
          </div>
        )}
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
