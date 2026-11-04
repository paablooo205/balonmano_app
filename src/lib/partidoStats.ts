import type {
  ColorTarjeta,
  CronometroPartido,
  EquipoOrigenEvento,
  EventoPartido,
  EventosRow,
  OrigenLanzamiento,
  PartidosRow,
  ResultadoTiro,
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

/** Grupo "Porteros" — resultado de los lanzamientos del rival contra nosotros.
 * "Fuera" (incluye poste) no lleva zona y no cuenta en el % de paradas: sirve
 * para contar las posesiones del rival (captura ampliada, spec §5). */
export const BOTONES_TIRO_RIVAL: BotonTiro[] = [
  { resultado: "parado", equipoOrigen: "rival", label: "Parada", color: "#3d8ad6" },
  { resultado: "gol", equipoOrigen: "rival", label: "Gol en contra", color: "var(--color-accent)" },
  { resultado: "fuera", equipoOrigen: "rival", label: "Fuera", color: "var(--color-text-faint)" },
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

/** Balones robados (perdida del rival, atribuida al jugador propio que la hizo). */
export function robos(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "perdida" && e.equipo_origen === "rival").length;
}

/** Balones perdidos propios. */
export function perdidas(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "perdida" && e.equipo_origen === "propio").length;
}

/** Exclusiones de 2' NUESTRAS — las del rival (botón "2' rival", sin
 * jugador) van aparte y nunca suman aquí. */
export function exclusiones(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "exclusion" && e.equipo_origen === "propio").length;
}

/** Tiro del rival que va a portería (gol o parada). Los "fuera"/"poste" del
 * rival existen desde la captura ampliada: cuentan como posesión del rival
 * pero nunca en el % de paradas ni en goles evitados. */
export function esTiroRivalAPuerta(e: EventosRow): boolean {
  return e.tipo === "tiro" && e.equipo_origen === "rival" && (e.resultado === "gol" || e.resultado === "parado");
}

export function tarjetas(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tarjeta").length;
}

/** Tiros propios totales, cualquier resultado (para el contador del grupo "Tiro" en el panel de stats). */
export function tirosTotales(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio").length;
}

export type BotonTarjeta = { color: ColorTarjeta; label: string; hex: string };

export const BOTONES_TARJETA: BotonTarjeta[] = [
  { color: "amarilla", label: "Amarilla", hex: "#f0c419" },
  { color: "azul", label: "Azul", hex: "#3d8ad6" },
  { color: "roja", label: "Roja", hex: "var(--color-accent)" },
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

export function crearEventoJsonb(
  tipo: TipoEventoPartido,
  jugadorId: string | null,
  minuto: number | null,
  segundo: number | null = null,
): EventoPartido {
  return { id: crypto.randomUUID(), tipo, jugador_id: jugadorId, minuto, segundo, creado_en: new Date().toISOString() };
}

export const ETIQUETAS_ORIGEN: Record<OrigenLanzamiento, string> = {
  ext_izq: "Ext. izq.",
  lat_izq: "Lat. izq.",
  central: "Central",
  lat_der: "Lat. der.",
  ext_der: "Ext. der.",
  pivote: "Pivote",
  "9m": "9 m",
  contragolpe: "Contragolpe",
  "7m": "7 m",
};

export const ORIGENES: OrigenLanzamiento[] = [
  "ext_izq", "lat_izq", "central", "lat_der", "ext_der", "pivote", "9m", "contragolpe", "7m",
];

/** Preselecciona el origen del lanzamiento según el puesto del jugador.
 * `jugadores.puesto` es texto libre (poblado desde la carga de Excel) — los
 * valores reales en producción son "Central", "Extremo derecho", "Lateral
 * derecho", "Lateral izquierdo", "Pivote", "Portero" (verificado contra la
 * base en vivo). Coincidencia laxa (insensible a mayúsculas, por palabras
 * clave) para tolerar variantes futuras; si no reconoce nada, no
 * preselecciona — nunca debe bloquear el registro. */
export function origenPorPuesto(puesto: string | null): OrigenLanzamiento | null {
  if (!puesto) return null;
  const p = puesto.toLowerCase();
  if (p.includes("pivote")) return "pivote";
  if (p.includes("extremo") && p.includes("izquierd")) return "ext_izq";
  if (p.includes("extremo") && p.includes("derech")) return "ext_der";
  if (p.includes("lateral") && p.includes("izquierd")) return "lat_izq";
  if (p.includes("lateral") && p.includes("derech")) return "lat_der";
  if (p.includes("central")) return "central";
  return null;
}

/** Mismo criterio laxo que `origenPorPuesto`. */
export function esPortero(puesto: string | null): boolean {
  return !!puesto && puesto.toLowerCase().includes("portero");
}

/** Etiqueta de un evento de tiro para la cronología — mismo texto que su
 * botón; el fuera/poste del rival se distingue del nuestro. */
export function etiquetaTiro(e: EventosRow): string {
  const propio = e.equipo_origen === "propio";
  let base: string;
  if (e.resultado === "gol") base = propio ? "Gol" : "Gol en contra";
  else if (e.resultado === "parado") base = propio ? "Parado" : "Parada";
  else if (!propio) base = "Tiro rival fuera";
  else base = e.resultado === "fuera" ? "Fuera" : "Poste";
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

/** Hay marcador registrado en vivo (algún gol, de quien sea). Criterio
 * único para los tres helpers de marcador: antes `resultadoPartido` y
 * `marcadorNumerico` miraban "hay algún evento", así que un partido con solo
 * una tarjeta o una pérdida apuntada y el resultado escrito a mano salía
 * como empate 0-0 en Rival/Progreso mientras `marcadorPartido` mostraba el
 * resultado escrito. */
function tieneMarcadorEnVivo(eventos: EventosRow[]): boolean {
  return golesFavor(eventos) > 0 || golesContra(eventos) > 0;
}

/** Resultado del partido: prioriza los toques en vivo (fuente de verdad) sobre el campo `resultado` escrito a mano. */
export function resultadoPartido(p: PartidosRow, eventos: EventosRow[]): "victoria" | "derrota" | "empate" | null {
  if (tieneMarcadorEnVivo(eventos)) {
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
  if (tieneMarcadorEnVivo(eventos)) {
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
  if (tieneMarcadorEnVivo(eventos)) {
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

/** Segundos de partido "para mostrar" (1ª parte tal cual, 2ª parte con el
 * offset de la duración de la primera — configurable por partido, 30' por
 * convenio si no se indica). */
export function segundosPartido(c: CronometroPartido | undefined, duracionParteMin = 30): number {
  if (!c) return 0;
  return (c.parte - 1) * duracionParteMin * 60 + segundosActuales(c);
}

/** Minuto de partido en curso (1-based). Acotado al último minuto de la
 * parte en curso: si el reloj siguió corriendo con la app en segundo plano
 * (el auto-stop solo actúa con la pantalla abierta), un toque de la 1ª parte
 * no puede acabar con minuto 35 y contarse como de la 2ª. */
export function minutoActual(c: CronometroPartido | undefined, duracionParteMin = 30): number | null {
  if (!c || (c.segundosAcumulados === 0 && !c.corriendo && c.parte === 1)) return null;
  const minutoEnParte = Math.min(Math.floor(segundosActuales(c) / 60) + 1, duracionParteMin);
  return (c.parte - 1) * duracionParteMin + minutoEnParte;
}

/** El partido ha llegado al final de la 2ª parte y se ha parado solo (ver el
 * useEffect de auto-stop en ContadoresEnVivo.tsx) — distinto de "en pausa a
 * mitad de la 2ª parte", que no debe bloquear el registro. A partir de aquí
 * la pantalla en vivo pasa a solo lectura: sin más registro de datos, sin
 * reanudar el cronómetro ni cambiar de parte. */
export function partidoFinalizado(c: CronometroPartido | undefined, duracionParteMin = 30): boolean {
  if (!c) return false;
  return c.parte === 2 && !c.corriendo && segundosActuales(c) >= duracionParteMin * 60;
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

/** Segundo de partido en curso (reloj de partido: la 2ª parte con el offset
 * de la 1ª), acotado al final de la parte igual que `minutoActual`. `null`
 * con el reloj sin iniciar — mismo criterio que `minutoActual`. */
export function segundoActual(c: CronometroPartido | undefined, duracionParteMin = 30): number | null {
  if (!c || (c.segundosAcumulados === 0 && !c.corriendo && c.parte === 1)) return null;
  const enParte = Math.min(Math.floor(segundosActuales(c)), duracionParteMin * 60);
  return (c.parte - 1) * duracionParteMin * 60 + enParte;
}

/** Duración de una exclusión, en segundos de reloj de partido. */
export const DURACION_EXCLUSION_SEG = 120;

export type ExclusionActiva = { eventoId: string; jugadorId: string | null; finSegundo: number; restante: number };

/** Exclusiones de 2' que siguen cumpliéndose en `segundoAhora` (reloj de
 * partido: la cuenta corre con el reloj y se para con él, como el tiempo de
 * la exclusión en pista). Solo las que tienen `segundo` registrado — las
 * anteriores a ese campo no se pueden situar. Ordenadas por la que antes
 * termina. */
export function exclusionesActivas(
  eventos: EventosRow[],
  segundoAhora: number | null,
  equipo: "propio" | "rival" = "propio",
): ExclusionActiva[] {
  if (segundoAhora === null) return [];
  return eventos
    .filter((e) => e.tipo === "exclusion" && e.equipo_origen === equipo && e.segundo != null)
    .map((e) => ({
      eventoId: e.id,
      jugadorId: e.jugador_id,
      finSegundo: e.segundo! + DURACION_EXCLUSION_SEG,
      restante: e.segundo! + DURACION_EXCLUSION_SEG - segundoAhora,
    }))
    .filter((x) => x.restante > 0 && x.restante <= DURACION_EXCLUSION_SEG)
    .sort((a, b) => a.restante - b.restante);
}

/** Con `duracionParteMin`, acota lo acumulado a la duración de la parte —
 * si no, volver tras horas con la app cerrada guardaba p.ej. 400 minutos. */
export function pausar(c: CronometroPartido | undefined, duracionParteMin?: number): CronometroPartido {
  const base = c ?? CRONOMETRO_INICIAL;
  if (!base.corriendo) return base;
  const segundos = segundosActuales(base);
  const acotados = duracionParteMin !== undefined ? Math.min(segundos, duracionParteMin * 60) : segundos;
  return { ...base, segundosAcumulados: acotados, corriendo: false, ultimaMarca: null };
}

/** Pasa de la 1ª a la 2ª parte, con el contador a 0 y en pausa. Solo hacia
 * delante: antes alternaba, y tocar "1ª parte" durante la 2ª ponía el reloj
 * a 0 en la 1ª — el resto del partido quedaba apuntado como minutos 1-30
 * (visto en partidos reales). En la 2ª parte no hace nada. */
export function cambiarParte(c: CronometroPartido | undefined): CronometroPartido {
  const base = c ?? CRONOMETRO_INICIAL;
  if (base.parte === 2) return base;
  return { parte: 2, segundosAcumulados: 0, corriendo: false, ultimaMarca: null };
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
 * `hastaMin` (el minuto actual, en vivo) o el final del partido
 * (`duracionTotalMin` = 2 × duracion_parte_min). Si el primer toque del
 * jugador es una salida sin entrada previa, se asume titular (entró en el
 * minuto 0) — antes esa salida se ignoraba y el titular salía con 0'.
 *
 * Calcula en segundos cuando el toque los tiene (`segundo`, exacto) y cae a
 * `minuto` × 60 en los anteriores a ese campo; el resultado se redondea a
 * minutos enteros.
 */
export function minutosJugados(
  eventosJsonb: EventoPartido[],
  jugadorId: string,
  duracionTotalMin = 60,
  hastaMin?: number,
): number {
  const propios = toquesPista(eventosJsonb).filter((e) => e.jugador_id === jugadorId);

  const fin = Math.min(hastaMin ?? duracionTotalMin, duracionTotalMin) * 60;
  let total = 0;
  let entrada: number | null = propios[0]?.tipo === "sale_pista" ? 0 : null;
  for (const e of propios) {
    const t = segundoDeToque(e);
    if (e.tipo === "entra_pista") {
      if (entrada === null) entrada = t ?? 0;
    } else if (entrada !== null) {
      total += Math.max(0, (t ?? entrada) - entrada);
      entrada = null;
    }
  }
  if (entrada !== null) total += Math.max(0, fin - entrada);
  return Math.round(total / 60);
}

/** Momento de un toque jsonb en segundos de partido: `segundo` si lo tiene,
 * si no `minuto` × 60 (histórico); null si se registró con el reloj sin
 * iniciar (titulares antes del pitido inicial → cuenta como 0). */
export function segundoDeToque(e: EventoPartido): number | null {
  if (e.segundo != null) return e.segundo;
  return e.minuto != null ? e.minuto * 60 : null;
}

/** Entradas/salidas de pista en orden cronológico (por momento de partido y,
 * a igualdad, por orden de registro). */
export function toquesPista(eventosJsonb: EventoPartido[]): EventoPartido[] {
  return eventosJsonb
    .filter((e) => e.tipo === "entra_pista" || e.tipo === "sale_pista")
    .slice()
    .sort((a, b) => (segundoDeToque(a) ?? 0) - (segundoDeToque(b) ?? 0) || a.creado_en.localeCompare(b.creado_en));
}

/** Tiempo de pista de un jugador en `segundoAhora` (reloj de partido):
 * `totalSeg` = todo lo jugado hasta ahora; `tramoSeg` = lo que lleva desde
 * su última entrada si sigue en pista (null si está en el banquillo). Para
 * las tarjetas del registro en vivo; mismo emparejamiento que
 * `minutosJugados`, pero en segundos y hasta el instante actual. */
export function tiempoDePista(
  eventosJsonb: EventoPartido[],
  jugadorId: string,
  segundoAhora: number | null,
): { totalSeg: number; tramoSeg: number | null } {
  const ahora = segundoAhora ?? 0;
  let total = 0;
  let entrada: number | null = null;
  const propios = toquesPista(eventosJsonb).filter((e) => e.jugador_id === jugadorId);
  if (propios[0]?.tipo === "sale_pista") entrada = 0;
  for (const e of propios) {
    const t = segundoDeToque(e);
    if (e.tipo === "entra_pista") {
      if (entrada === null) entrada = t ?? 0;
    } else if (entrada !== null) {
      total += Math.max(0, (t ?? entrada) - entrada);
      entrada = null;
    }
  }
  const tramo = entrada !== null ? Math.max(0, ahora - entrada) : null;
  return { totalSeg: total + (tramo ?? 0), tramoSeg: tramo };
}

/** Jugadores en pista ahora mismo: aquellos cuyo último toque de pista es una
 * entrada. Vacío si en este partido no se han registrado cambios. */
export function jugadoresEnPista(eventosJsonb: EventoPartido[]): Set<string> {
  const enPista = new Set<string>();
  for (const e of toquesPista(eventosJsonb)) {
    if (!e.jugador_id) continue;
    if (e.tipo === "entra_pista") enPista.add(e.jugador_id);
    else enPista.delete(e.jugador_id);
  }
  return enPista;
}

/** ¿Se ha registrado alguna entrada/salida de pista en el partido? Si no, la
 * pantalla en vivo propone elegir titulares. */
export function hayRegistroDePista(eventosJsonb: EventoPartido[]): boolean {
  return eventosJsonb.some((e) => e.tipo === "entra_pista" || e.tipo === "sale_pista");
}

/** Titulares de un partido ya jugado: quienes entraron a pista antes de que
 * corriera el reloj (o en el segundo 0). Sirve para proponer los mismos en
 * el siguiente partido. */
export function titularesDe(eventosJsonb: EventoPartido[]): string[] {
  return eventosJsonb
    .filter((e) => e.tipo === "entra_pista" && e.jugador_id && (segundoDeToque(e) ?? 0) === 0)
    .map((e) => e.jugador_id!);
}

/** `null` si no hay intentos — nunca un `0%`/`NaN%` engañoso. El recuento
 * real (`aciertos`/`intentos`) viaja siempre junto al porcentaje: es la
 * honestidad estadística de esta fase, no una condición por umbral. */
export type EficaciaDetalle = { pct: number; aciertos: number; intentos: number } | null;

/** Eficacia de tiro propio, con detalle. `opts.soloPenalti` separa juego
 * abierto (`false`) de 7 metros (`true`) — nunca se mezclan. Sin `opts`,
 * combina ambos en una eficacia global (para la cifra protagonista). */
export function eficaciaConDetalle(eventos: EventosRow[], opts?: { soloPenalti: boolean }): EficaciaDetalle {
  const propios = eventos.filter(
    (e) => e.tipo === "tiro" && e.equipo_origen === "propio" && (opts === undefined || e.es_penalti === opts.soloPenalti),
  );
  const aciertos = propios.filter((e) => e.resultado === "gol").length;
  const intentos = propios.length;
  return intentos > 0 ? { pct: Math.round((aciertos / intentos) * 100), aciertos, intentos } : null;
}

/** Recuento de tiros por zona — el llamante ya filtra a los eventos que
 * interesan (p.ej. solo juego abierto, o solo 7m, o los del rival). */
export function distribucionPorZona(eventos: EventosRow[]): Record<number, number> {
  const mapa: Record<number, number> = {};
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.zona === null) continue;
    mapa[e.zona] = (mapa[e.zona] ?? 0) + 1;
  }
  return mapa;
}

/** % de paradas de nuestro portero. `eventos` ya viene filtrado por el
 * llamante a un jugador_id de portero concreto (o no, para el total del
 * equipo) — esta función solo separa los tiros del rival y calcula el ratio.
 * `opts.soloPenalti` separa juego abierto (`false`) de 7 metros (`true`) —
 * igual que `eficaciaConDetalle`, nunca se mezclan. Sin `opts`, combina
 * ambos en un % global (para la cifra protagonista). */
export function porcentajeParadas(eventos: EventosRow[], opts?: { soloPenalti: boolean }): EficaciaDetalle {
  const rivales = eventos.filter(
    (e) => esTiroRivalAPuerta(e) && (opts === undefined || e.es_penalti === opts.soloPenalti),
  );
  const aciertos = rivales.filter((e) => e.resultado === "parado").length;
  const intentos = rivales.length;
  return intentos > 0 ? { pct: Math.round((aciertos / intentos) * 100), aciertos, intentos } : null;
}

/** Recuento de tiros por resultado — el llamante ya filtra a los eventos
 * que interesan (p.ej. solo juego abierto propio, o solo 7m), igual
 * contrato que `distribucionPorZona`. Base del anillo de eficacia. */
export function desgloseResultados(eventos: EventosRow[]): { gol: number; parado: number; fuera: number; poste: number } {
  const conteo = { gol: 0, parado: 0, fuera: 0, poste: 0 };
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.resultado === null) continue;
    conteo[e.resultado]++;
  }
  return conteo;
}

/** Código de 2 letras del puesto para tablas compactas (ficha técnica en
 * PDF). Mismo criterio laxo que `origenPorPuesto`/`esPortero`: sin match
 * reconocido, devuelve "—" en vez de bloquear o inventar. */
export function abreviaturaPuesto(puesto: string | null): string {
  if (!puesto) return "—";
  const p = puesto.toLowerCase();
  if (p.includes("portero")) return "PO";
  if (p.includes("pivote")) return "PI";
  if (p.includes("extremo") && p.includes("izquierd")) return "EI";
  if (p.includes("extremo") && p.includes("derech")) return "ED";
  if (p.includes("lateral") && p.includes("izquierd")) return "LI";
  if (p.includes("lateral") && p.includes("derech")) return "LD";
  if (p.includes("central")) return "CE";
  return "—";
}

/** Eficacia de tiro propio acotada a un subconjunto de orígenes de
 * lanzamiento (p.ej. zona de 6 metros: extremos + pivote; lanzamiento
 * exterior: laterales + central + 9m) — mismo contrato que
 * `eficaciaConDetalle` (`null` sin intentos). Los tiros sin `origen`
 * registrado (histórico, o el entrenador no lo marcó) no cuentan en ningún
 * grupo — no se reparten a ciegas entre categorías. */
export function eficaciaPorOrigenes(eventos: EventosRow[], origenes: OrigenLanzamiento[]): EficaciaDetalle {
  const propios = eventos.filter(
    (e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.origen !== null && origenes.includes(e.origen),
  );
  const aciertos = propios.filter((e) => e.resultado === "gol").length;
  const intentos = propios.length;
  return intentos > 0 ? { pct: Math.round((aciertos / intentos) * 100), aciertos, intentos } : null;
}

export type TramoParcial = { rango: string; propio: number; rival: number };

/** Goles marcados por cada equipo en tramos de 5 minutos, a lo largo de todo
 * el partido (número de tramos según `duracionParteMin` — 30' por parte da
 * 12 tramos de 5', igual que si se juegan partes de 25'). Tiros sin `minuto`
 * registrado (histórico, anterior a esa columna) no se pueden situar en
 * ningún tramo y se excluyen del gráfico — no se les asigna un tramo al
 * azar. */
export function parcialesPorTramos(eventos: EventosRow[], duracionParteMin = 30): TramoParcial[] {
  const totalMin = duracionParteMin * 2;
  const numTramos = Math.ceil(totalMin / 5);
  const tramos: TramoParcial[] = Array.from({ length: numTramos }, (_, i) => ({
    rango: `${i * 5}-${Math.min((i + 1) * 5, totalMin)}`,
    propio: 0,
    rival: 0,
  }));
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.resultado !== "gol" || e.minuto === null) continue;
    const indice = Math.min(Math.floor((e.minuto - 1) / 5), numTramos - 1);
    if (indice < 0) continue;
    if (e.equipo_origen === "propio") tramos[indice].propio++;
    else tramos[indice].rival++;
  }
  return tramos;
}

/** Marcador acumulado en cada gol, en orden cronológico — base de la línea
 * de marcador. Sin goles, lista vacía (el llamante decide qué hacer con
 * menos de 2 puntos, igual que `TendenciaEficacia`). */
export function serieMarcador(eventos: EventosRow[]): { ts: string; favor: number; contra: number }[] {
  const goles = eventos
    .filter((e) => e.tipo === "tiro" && e.resultado === "gol")
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  let favor = 0;
  let contra = 0;
  return goles.map((e) => {
    if (e.equipo_origen === "propio") favor++;
    else contra++;
    return { ts: e.creado_en, favor, contra };
  });
}

/**
 * Corrección SOLO DE LECTURA (nunca se reescribe la fila en la base): un tiro
 * con origen "7m" es un penalti aunque no se activara el interruptor
 * "Penalti" al registrarlo — antes de que el chip "7m" lo activara solo,
 * hubo tiros guardados así, y contaban como juego abierto en la eficacia.
 */
export function normalizarEventos(eventos: EventosRow[]): EventosRow[] {
  return eventos.map((e) => (e.tipo === "tiro" && e.origen === "7m" && !e.es_penalti ? { ...e, es_penalti: true } : e));
}

/** Tiempos muertos por equipo: 3 por partido, máximo 2 por parte. */
export const MAX_TM_PARTIDO = 3;
export const MAX_TM_PARTE = 2;

/** Tiempos muertos que le quedan a un equipo en la parte en curso (el menor
 * entre lo que queda de partido y lo que queda de la parte). */
export function tiemposMuertosRestantes(eventos: EventosRow[], equipo: EquipoOrigenEvento, parte: 1 | 2, duracionParteMin: number): number {
  const propios = eventos.filter((e) => e.tipo === "tiempo_muerto" && e.equipo_origen === equipo);
  const corte = duracionParteMin * 60;
  const enParte = propios.filter((e) => (parte === 1 ? (e.segundo ?? 0) < corte : (e.segundo ?? 0) >= corte)).length;
  return Math.max(0, Math.min(MAX_TM_PARTIDO - propios.length, MAX_TM_PARTE - enParte));
}
