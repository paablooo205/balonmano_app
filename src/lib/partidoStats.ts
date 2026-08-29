import type { CronometroPartido, EventoPartido, PartidosRow, TipoEventoPartido } from "@/types/database";

/** Las acciones del marcador en vivo, calcadas del prototipo de Claude Design + ampliadas
 * para poder recoger en directo lo que alimenta la ficha del jugador (exclusiones, tiro
 * fallado en juego abierto). */
export const ACCIONES: {
  tipo: TipoEventoPartido;
  label: string;
  equipo: "propio" | "rival";
  color: string;
  /** Si esta acción cambia el marcador (para saber si mostrar el resultado junto al toque en la cronología). */
  afectaMarcador: boolean;
}[] = [
  { tipo: "gol_favor", label: "Gol a favor", equipo: "propio", color: "var(--color-success)", afectaMarcador: true },
  { tipo: "gol_contra", label: "Gol en contra", equipo: "rival", color: "var(--color-accent)", afectaMarcador: true },
  { tipo: "parada_portero", label: "Parada portero", equipo: "propio", color: "#3d8ad6", afectaMarcador: false },
  { tipo: "balon_ganado", label: "Balón ganado", equipo: "propio", color: "var(--color-success)", afectaMarcador: false },
  { tipo: "balon_perdido", label: "Balón perdido", equipo: "propio", color: "var(--color-warning)", afectaMarcador: false },
  { tipo: "tiro_fallado", label: "Tiro fallado", equipo: "propio", color: "var(--color-accent)", afectaMarcador: false },
  { tipo: "siete_provocado", label: "7m provocado", equipo: "propio", color: "var(--color-success)", afectaMarcador: false },
  { tipo: "siete_cometido", label: "7m cometido", equipo: "propio", color: "var(--color-accent)", afectaMarcador: false },
  { tipo: "siete_metido", label: "7m metido", equipo: "propio", color: "var(--color-success)", afectaMarcador: true },
  { tipo: "siete_fallado", label: "7m fallado", equipo: "propio", color: "var(--color-accent)", afectaMarcador: false },
  { tipo: "exclusion_2min", label: "Exclusión 2'", equipo: "propio", color: "var(--color-warning)", afectaMarcador: false },
];

/** Entrada/salida de pista — no son "acciones" de marcador (no van en la rejilla de botones de
 * conteo), pero sí toques con jugador+minuto para poder derivar minutos jugados. */
const SUSTITUCIONES: { tipo: TipoEventoPartido; label: string }[] = [
  { tipo: "entra_pista", label: "Entra a pista" },
  { tipo: "sale_pista", label: "Sale de pista" },
];

export const ETIQUETAS_EVENTO: Record<TipoEventoPartido, string> = Object.fromEntries(
  [...ACCIONES.map((a) => [a.tipo, a.label]), ...SUSTITUCIONES.map((s) => [s.tipo, s.label])],
) as Record<TipoEventoPartido, string>;

export function accionDe(tipo: TipoEventoPartido) {
  return ACCIONES.find((a) => a.tipo === tipo)!;
}

export function crearEvento(tipo: TipoEventoPartido, jugadorId: string | null, minuto: number | null): EventoPartido {
  return { id: crypto.randomUUID(), tipo, jugador_id: jugadorId, minuto, creado_en: new Date().toISOString() };
}

export function contar(eventos: EventoPartido[] | undefined, tipo: TipoEventoPartido): number {
  return (eventos ?? []).filter((e) => e.tipo === tipo).length;
}

/** Goles a favor: "gol a favor" + "7m metido" (ambos suman al marcador propio). */
export function golesFavor(eventos: EventoPartido[] | undefined): number {
  return contar(eventos, "gol_favor") + contar(eventos, "siete_metido");
}

export function golesContra(eventos: EventoPartido[] | undefined): number {
  return contar(eventos, "gol_contra");
}

/** Resultado del partido: prioriza los toques en vivo (fuente de verdad) sobre el campo `resultado` escrito a mano. */
export function resultadoPartido(p: PartidosRow): "victoria" | "derrota" | "empate" | null {
  const eventos = p.estadisticas.eventos;
  if (eventos && eventos.length > 0) {
    const favor = golesFavor(eventos);
    const contra = golesContra(eventos);
    if (favor === contra) return "empate";
    return favor > contra ? "victoria" : "derrota";
  }
  const m = p.resultado?.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (!m) return null;
  const [, a, b] = m;
  if (a === b) return "empate";
  return Number(a) > Number(b) ? "victoria" : "derrota";
}

/** Marcador textual: prioriza los toques en vivo (fuente de verdad) sobre el campo escrito a mano. */
export function marcadorPartido(p: PartidosRow): string {
  const eventos = p.estadisticas.eventos;
  if (eventos && (golesFavor(eventos) > 0 || golesContra(eventos) > 0)) {
    return `${golesFavor(eventos)}-${golesContra(eventos)}`;
  }
  return p.resultado ?? "—";
}

/**
 * Marcador como par numérico, mismo criterio de prioridad que
 * `resultadoPartido`/`marcadorPartido` (eventos en vivo > resultado escrito a
 * mano). `null` si no hay ninguno de los dos — para agregados de temporada
 * (diferencia de goles, medias por partido) que necesitan los dos números,
 * no solo el texto.
 */
export function marcadorNumerico(p: PartidosRow): { favor: number; contra: number } | null {
  const eventos = p.estadisticas.eventos;
  if (eventos && eventos.length > 0) {
    return { favor: golesFavor(eventos), contra: golesContra(eventos) };
  }
  const m = p.resultado?.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (!m) return null;
  return { favor: Number(m[1]), contra: Number(m[2]) };
}

/** Letra + color del badge de resultado (G/E/P), reutilizado en Partido e Inicio. */
export const RESULTADO_BADGE: Record<"victoria" | "empate" | "derrota", { letra: string; bg: string }> = {
  victoria: { letra: "G", bg: "var(--color-success)" },
  empate: { letra: "E", bg: "var(--color-warning)" },
  derrota: { letra: "P", bg: "var(--color-accent)" },
};

/** Recuento G·E·P de una lista de partidos (solo cuenta los que ya tienen resultado). */
export function resumenResultados(partidos: PartidosRow[]): { g: number; e: number; p: number } {
  let g = 0;
  let e = 0;
  let p = 0;
  for (const partido of partidos) {
    const r = resultadoPartido(partido);
    if (r === "victoria") g++;
    else if (r === "empate") e++;
    else if (r === "derrota") p++;
  }
  return { g, e, p };
}

/** Marcador "a–b" tal como estaba justo después de los primeros `hastaIndice` eventos más recientes (orden desc por fecha). */
export function marcadorHasta(eventosDesc: EventoPartido[], hastaIndice: number): string {
  let favor = 0;
  let contra = 0;
  for (let i = eventosDesc.length - 1; i >= hastaIndice; i--) {
    const e = eventosDesc[i];
    if (e.tipo === "gol_favor" || e.tipo === "siete_metido") favor++;
    if (e.tipo === "gol_contra") contra++;
  }
  return `${favor}–${contra}`;
}

/** Segundos transcurridos de la parte en curso ahora mismo (incluye el tramo en marcha si está corriendo). */
export function segundosActuales(c: CronometroPartido | undefined): number {
  if (!c) return 0;
  if (!c.corriendo || !c.ultimaMarca) return c.segundosAcumulados;
  const transcurrido = (Date.now() - new Date(c.ultimaMarca).getTime()) / 1000;
  return c.segundosAcumulados + Math.max(0, transcurrido);
}

/** Segundos de partido "para mostrar" (1ª parte tal cual, 2ª parte con el offset de los 30' de la primera). */
export function segundosPartido(c: CronometroPartido | undefined): number {
  if (!c) return 0;
  return (c.parte - 1) * 1800 + segundosActuales(c);
}

export function minutoActual(c: CronometroPartido | undefined): number | null {
  if (!c || (c.segundosAcumulados === 0 && !c.corriendo && c.parte === 1)) return null;
  return Math.floor(segundosPartido(c) / 60) + 1;
}

export function formatoReloj(segundos: number): string {
  const s = Math.floor(segundos);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

const CRONOMETRO_INICIAL: CronometroPartido = { parte: 1, segundosAcumulados: 0, corriendo: false, ultimaMarca: null };

export function iniciarOReanudar(c: CronometroPartido | undefined): CronometroPartido {
  const base = c ?? CRONOMETRO_INICIAL;
  if (base.corriendo) return base;
  return { ...base, corriendo: true, ultimaMarca: new Date().toISOString() };
}

export function pausar(c: CronometroPartido | undefined): CronometroPartido {
  const base = c ?? CRONOMETRO_INICIAL;
  if (!base.corriendo) return base;
  return { ...base, segundosAcumulados: segundosActuales(base), corriendo: false, ultimaMarca: null };
}

/** Cambia de parte (alterna 1ª/2ª) y reinicia el contador de la parte, en pausa. */
export function cambiarParte(c: CronometroPartido | undefined): CronometroPartido {
  const base = c ?? CRONOMETRO_INICIAL;
  return { parte: base.parte === 1 ? 2 : 1, segundosAcumulados: 0, corriendo: false, ultimaMarca: null };
}

/**
 * Eficacia de lanzamiento en juego abierto + 7m: aciertos (gol a favor + 7m
 * metido) sobre intentos (aciertos + tiro fallado + 7m fallado). Si se pasa
 * `jugadorId`, se acota a los toques atribuidos a ese jugador.
 */
export function eficaciaLanzamiento(eventos: EventoPartido[], jugadorId?: string): number | null {
  const propios = jugadorId ? eventos.filter((e) => e.jugador_id === jugadorId) : eventos;
  const aciertos = propios.filter((e) => e.tipo === "gol_favor" || e.tipo === "siete_metido").length;
  const fallos = propios.filter((e) => e.tipo === "tiro_fallado" || e.tipo === "siete_fallado").length;
  const intentos = aciertos + fallos;
  return intentos > 0 ? Math.round((aciertos / intentos) * 100) : null;
}

/**
 * Minutos jugados por un jugador en un partido, a partir de los toques
 * "entra_pista"/"sale_pista". Empareja cronológicamente por minuto; si queda
 * una entrada sin salida, cuenta hasta el final del partido (60' por
 * convenio, dos partes de 30').
 */
export function minutosJugados(eventos: EventoPartido[], jugadorId: string, duracionTotalMin = 60): number {
  const propios = eventos
    .filter((e) => e.jugador_id === jugadorId && (e.tipo === "entra_pista" || e.tipo === "sale_pista"))
    .slice()
    .sort((a, b) => (a.minuto ?? 0) - (b.minuto ?? 0) || a.creado_en.localeCompare(b.creado_en));

  let total = 0;
  let entradaMin: number | null = null;
  for (const e of propios) {
    if (e.tipo === "entra_pista") {
      entradaMin = e.minuto ?? entradaMin ?? 0;
    } else if (entradaMin !== null) {
      total += Math.max(0, (e.minuto ?? entradaMin) - entradaMin);
      entradaMin = null;
    }
  }
  if (entradaMin !== null) total += Math.max(0, duracionTotalMin - entradaMin);
  return total;
}
