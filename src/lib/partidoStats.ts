import type {
  CronometroPartido,
  EquipoOrigenEvento,
  EventoPartido,
  EventosRow,
  PartidosRow,
  ResultadoTiro,
  TipoEvento,
  TipoEventoPartido,
} from "@/types/database";

/** Un tiro (propio o rival) para el panel de "Partido en directo": resultado
 * fijo, equipo_origen fijo. El penalti no forma parte del botón — es un
 * interruptor aparte ("Penalti") que se aplica al siguiente tiro que se
 * registre, sea cual sea. */
export type BotonTiro = { resultado: ResultadoTiro; equipoOrigen: EquipoOrigenEvento; label: string; color: string };

/** Grupo "Tiros" — resultado de nuestros lanzamientos. */
export const BOTONES_TIRO_PROPIO: BotonTiro[] = [
  { resultado: "gol", equipoOrigen: "propio", label: "Gol", color: "var(--color-success)" },
  { resultado: "parado", equipoOrigen: "propio", label: "Parado", color: "#3d8ad6" },
  { resultado: "fuera", equipoOrigen: "propio", label: "Fuera", color: "var(--color-accent)" },
  { resultado: "poste", equipoOrigen: "propio", label: "Poste", color: "var(--color-accent)" },
];

/** Grupo "Porteros" — resultado de los lanzamientos del rival contra nosotros. */
export const BOTONES_TIRO_RIVAL: BotonTiro[] = [
  { resultado: "parado", equipoOrigen: "rival", label: "Parada", color: "#3d8ad6" },
  { resultado: "gol", equipoOrigen: "rival", label: "Gol en contra", color: "var(--color-accent)" },
];

/** Un tiro necesita zona (arma la cuadrícula de portería) solo si va a
 * portería — gol o parado. Fuera/poste no llevan zona: no hay "dónde". */
export function requiereZona(resultado: ResultadoTiro): boolean {
  return resultado === "gol" || resultado === "parado";
}

/** Cuenta los tiros que coinciden con un botón de `BOTONES_TIRO_PROPIO`/`BOTONES_TIRO_RIVAL`
 * (mismo resultado + equipo_origen), sin distinguir penalti — el número del
 * botón suma normales y de 7m juntos. */
export function contarBotonTiro(eventos: EventosRow[], boton: BotonTiro): number {
  return eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === boton.equipoOrigen && e.resultado === boton.resultado).length;
}

/** Las 3 acciones de un solo toque que quedan (pérdida propia/rival y
 * exclusión) — sin zona, sin penalti posible (ver check `eventos_penalti_solo_tiro`
 * en 0017_eventos.sql: es_penalti solo puede ser true si tipo='tiro'). */
export const ACCIONES_PERDIDA_EXCLUSION: {
  tipo: TipoEvento;
  equipoOrigen: EquipoOrigenEvento;
  resultado: null;
  esPenalti: false;
  label: string;
  color: string;
}[] = [
  { tipo: "perdida", equipoOrigen: "rival", resultado: null, esPenalti: false, label: "Balón ganado", color: "var(--color-success)" },
  { tipo: "perdida", equipoOrigen: "propio", resultado: null, esPenalti: false, label: "Balón perdido", color: "var(--color-warning)" },
  { tipo: "exclusion", equipoOrigen: "propio", resultado: null, esPenalti: false, label: "Exclusión 2'", color: "var(--color-warning)" },
];

/** Las 2 acciones que siguen viviendo en `estadisticas.eventos` (jsonb) —
 * matices sin fila propia en `eventos` (ver nota de alcance en
 * 0017_eventos.sql). No van en la rejilla de conteo: son toques puntuales,
 * no contadores con "deshacer" independiente por tipo. */
export const ACCIONES_JSONB: { tipo: TipoEventoPartido; label: string; color: string }[] = [
  { tipo: "siete_provocado", label: "7m provocado", color: "var(--color-success)" },
  { tipo: "siete_cometido", label: "7m cometido", color: "var(--color-accent)" },
];

/** Entrada/salida de pista — no son "acciones" de marcador, pero sí toques
 * con jugador+minuto para poder derivar minutos jugados. */
const SUSTITUCIONES: { tipo: TipoEventoPartido; label: string }[] = [
  { tipo: "entra_pista", label: "Entra a pista" },
  { tipo: "sale_pista", label: "Sale de pista" },
];

export const ETIQUETAS_EVENTO_JSONB: Record<TipoEventoPartido, string> = Object.fromEntries(
  [...ACCIONES_JSONB.map((a) => [a.tipo, a.label]), ...SUSTITUCIONES.map((s) => [s.tipo, s.label])],
) as Record<TipoEventoPartido, string>;

export function crearEventoJsonb(tipo: TipoEventoPartido, jugadorId: string | null, minuto: number | null): EventoPartido {
  return { id: crypto.randomUUID(), tipo, jugador_id: jugadorId, minuto, creado_en: new Date().toISOString() };
}

/** Cuenta cuántos eventos de la tabla `eventos` coinciden exactamente con una
 * acción de `ACCIONES_PERDIDA_EXCLUSION` (mismo tipo + equipo_origen). */
export function contarTabla(eventos: EventosRow[], accion: (typeof ACCIONES_PERDIDA_EXCLUSION)[number]): number {
  return eventos.filter(
    (e) =>
      e.tipo === accion.tipo &&
      e.equipo_origen === accion.equipoOrigen &&
      e.resultado === accion.resultado &&
      e.es_penalti === accion.esPenalti,
  ).length;
}

/** Etiqueta de un evento de tiro (gol/fuera/parado/poste, propio o rival, con
 * o sin penalti) para la cronología — mismo texto que su botón en el panel
 * de acciones (ver `BOTONES_TIRO_PROPIO`/`BOTONES_TIRO_RIVAL`). */
export function etiquetaTiro(e: EventosRow): string {
  const propio = e.equipo_origen === "propio";
  let base: string;
  if (e.resultado === "gol") base = propio ? "Gol" : "Gol en contra";
  else if (e.resultado === "parado") base = propio ? "Parado" : "Parada";
  else if (e.resultado === "fuera") base = "Fuera";
  else base = "Poste";
  return `${base}${e.es_penalti ? " (7m)" : ""}`;
}

/** Color de un evento de tiro para la cronología: verde si es gol, azul si lo
 * para el portero, rojo en el resto de fallos (fuera/poste). */
export function colorTiro(e: EventosRow): string {
  if (e.resultado === "gol") return "var(--color-success)";
  if (e.resultado === "parado") return "#3d8ad6";
  return "var(--color-accent)";
}

/** Tiros propios fallados en juego abierto (fuera/parado/poste, sin penalti). */
export function tirosFallados(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti && e.resultado !== "gol").length;
}

/** 7 metros propios fallados (fuera/parado/poste). */
export function sieteFallados(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti && e.resultado !== "gol").length;
}

/** Goles a favor: "gol a favor" + "7m metido" (ambos suman al marcador propio). */
export function golesFavor(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.resultado === "gol").length;
}

export function golesContra(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && e.resultado === "gol").length;
}

/** Resultado del partido: prioriza los toques en vivo (fuente de verdad) sobre el campo `resultado` escrito a mano. */
export function resultadoPartido(p: PartidosRow, eventos: EventosRow[]): "victoria" | "derrota" | "empate" | null {
  if (eventos.length > 0) {
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
export function marcadorPartido(p: PartidosRow, eventos: EventosRow[]): string {
  if (golesFavor(eventos) > 0 || golesContra(eventos) > 0) {
    return `${golesFavor(eventos)}-${golesContra(eventos)}`;
  }
  return p.resultado ?? "—";
}

/**
 * Marcador como par numérico, mismo criterio de prioridad que
 * `resultadoPartido`/`marcadorPartido` (eventos en vivo > resultado escrito a
 * mano). `null` si no hay ninguno de los dos.
 */
export function marcadorNumerico(p: PartidosRow, eventos: EventosRow[]): { favor: number; contra: number } | null {
  if (eventos.length > 0) {
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

/** Recuento G·E·P de una lista de partidos (solo cuenta los que ya tienen
 * resultado). `eventosPorPartido` debe traer, como mínimo, los eventos de
 * cada partido en la lista (ver `agruparPorPartido` en `@/lib/eventos`). */
export function resumenResultados(
  partidos: PartidosRow[],
  eventosPorPartido: Map<string, EventosRow[]>,
): { g: number; e: number; p: number } {
  let g = 0;
  let e = 0;
  let p = 0;
  for (const partido of partidos) {
    const r = resultadoPartido(partido, eventosPorPartido.get(partido.id) ?? []);
    if (r === "victoria") g++;
    else if (r === "empate") e++;
    else if (r === "derrota") p++;
  }
  return { g, e, p };
}

/** Marcador "a–b" tal como estaba justo después de los primeros `hastaIndice`
 * eventos de gol más recientes (orden desc por fecha, ya filtrado a tiro). */
export function marcadorHastaTabla(eventosDesc: EventosRow[], hastaIndice: number): string {
  let favor = 0;
  let contra = 0;
  for (let i = eventosDesc.length - 1; i >= hastaIndice; i--) {
    const e = eventosDesc[i];
    if (e.tipo !== "tiro" || e.resultado !== "gol") continue;
    if (e.equipo_origen === "propio") favor++;
    else contra++;
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
 * Eficacia de lanzamiento en juego abierto + 7m: aciertos (resultado='gol')
 * sobre intentos (aciertos + fallos), solo tiros propios. Si se pasa
 * `jugadorId`, se acota a los toques atribuidos a ese jugador.
 */
export function eficaciaLanzamiento(eventos: EventosRow[], jugadorId?: string): number | null {
  const propios = eventos.filter(
    (e) => e.tipo === "tiro" && e.equipo_origen === "propio" && (jugadorId === undefined || e.jugador_id === jugadorId),
  );
  const aciertos = propios.filter((e) => e.resultado === "gol").length;
  const fallos = propios.filter((e) => e.resultado !== "gol").length;
  const intentos = aciertos + fallos;
  return intentos > 0 ? Math.round((aciertos / intentos) * 100) : null;
}

/**
 * Minutos jugados por un jugador en un partido, a partir de los toques
 * "entra_pista"/"sale_pista" (siguen en `estadisticas.eventos`, jsonb — no
 * migran a la tabla `eventos`, ver alcance en 0017_eventos.sql). Empareja
 * cronológicamente por minuto; si queda una entrada sin salida, cuenta hasta
 * el final del partido (60' por convenio, dos partes de 30').
 */
export function minutosJugados(eventosJsonb: EventoPartido[], jugadorId: string, duracionTotalMin = 60): number {
  const propios = eventosJsonb
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
