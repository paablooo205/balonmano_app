/**
 * Sin consumidores actuales — la tabla de jugadores que mostraba esta nota
 * se sustituyó por barras apiladas (fase "ficha técnica de partido —
 * gráficos") sin nota /10, decisión explícita y documentada como
 * reversible en la spec de esa fase. El motor de cálculo se deja intacto
 * por si se quiere volver a mostrar en algún sitio.
 */
import { esPortero, minutosJugados, porcentajeParadas } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow, PartidosRow, UUID } from "@/types/database";

/** Mínimos para que una nota se considere fiable — por debajo, se muestra
 * "—" en vez de un número que aparentaría más precisión de la que hay
 * (mismo principio de honestidad estadística que el resto del dashboard,
 * aplicado a la pieza más interpretativa de todas). */
const MIN_MINUTOS = 10;
const MIN_COMPANEROS = 2;
/** Mínimo de tiros rivales recibidos para que el baremo de portero se
 * considere fiable — sin esto, 2 de 3 paradas (66%) daría un 8.7 tan
 * confiado como una temporada entera, la misma trampa de tamaño de
 * muestra que el resto del dashboard evita mostrando siempre el recuento. */
const MIN_TIROS_RECIBIDOS = 5;

/** Baremo fijo de % de paradas para la nota de portero — no se compara
 * contra otros porteros del equipo (la plantilla real tiene 1-2, nunca
 * los 3 que exigiría un percentil fiable — con esa exigencia la nota de
 * portero no aparecería jamás). Referencias de balonmano base: <25% floja,
 * 25-35% normal, 35-45% buena, >45% muy buena. Interpolación lineal entre
 * puntos, saturando en los extremos (0% → 0, 60%+ → 10). */
const BAREMO_PARADAS: { pct: number; nota: number }[] = [
  { pct: 0, nota: 0 },
  { pct: 25, nota: 4 },
  { pct: 35, nota: 6 },
  { pct: 45, nota: 8 },
  { pct: 60, nota: 10 },
];

function notaPorBaremo(pct: number, tabla: { pct: number; nota: number }[]): number {
  const acotado = Math.max(tabla[0].pct, Math.min(tabla[tabla.length - 1].pct, pct));
  for (let i = 0; i < tabla.length - 1; i++) {
    const desde = tabla[i];
    const hasta = tabla[i + 1];
    if (acotado <= hasta.pct) {
      const t = (acotado - desde.pct) / (hasta.pct - desde.pct);
      return Math.round((desde.nota + t * (hasta.nota - desde.nota)) * 10) / 10;
    }
  }
  return tabla[tabla.length - 1].nota;
}

const PESO_EFICACIA = 0.4;
const PESOS_TASA: { clave: "robos" | "perdidas" | "sanciones"; peso: number; invertido: boolean }[] = [
  { clave: "robos", peso: 0.2, invertido: false },
  { clave: "perdidas", peso: 0.2, invertido: true },
  { clave: "sanciones", peso: 0.2, invertido: true },
];

type MetricasCampo = {
  eficacia: number | null;
  robos: number;
  perdidas: number;
  sanciones: number;
  minutos: number;
};

function minutosTotales(partidos: PartidosRow[], jugadorId: string): number {
  let total = 0;
  for (const p of partidos) total += minutosJugados(p.estadisticas.eventos ?? [], jugadorId);
  return total;
}

function metricasCampo(jugadorId: string, eventos: EventosRow[], partidos: PartidosRow[]): MetricasCampo {
  const propios = eventos.filter((e) => e.jugador_id === jugadorId);
  const minutos = minutosTotales(partidos, jugadorId);
  const factor30 = minutos > 0 ? 30 / minutos : 0;
  const tiros = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio");
  const goles = tiros.filter((e) => e.resultado === "gol").length;
  return {
    eficacia: tiros.length > 0 ? goles / tiros.length : null,
    robos: propios.filter((e) => e.tipo === "perdida" && e.equipo_origen === "rival").length * factor30,
    perdidas: propios.filter((e) => e.tipo === "perdida" && e.equipo_origen === "propio").length * factor30,
    sanciones: propios.filter((e) => e.tipo === "exclusion" || e.tipo === "tarjeta").length * factor30,
    minutos,
  };
}

/** Percentil de `valor` dentro de `todos` (0-1) — `todos` debe incluir el
 * propio `valor`. Los empates se reparten a partes iguales entre las
 * posiciones que ocupan, para no premiar/penalizar por orden de iteración. */
function percentil(valor: number, todos: number[]): number {
  if (todos.length <= 1) return 0.5;
  const menores = todos.filter((v) => v < valor).length;
  const igualesMenosUno = todos.filter((v) => v === valor).length - 1;
  return (menores + igualesMenosUno / 2) / (todos.length - 1);
}

function notaCampo(jugadorId: string, comparables: JugadoresRow[], metricas: Map<UUID, MetricasCampo>): number | null {
  const propia = metricas.get(jugadorId)!;
  const otros = comparables.filter((c) => c.id !== jugadorId).length;
  if (propia.minutos < MIN_MINUTOS || otros < MIN_COMPANEROS) return null;

  let pesoTotal = 0;
  let scoreTotal = 0;

  if (propia.eficacia !== null) {
    const valores = comparables.map((c) => metricas.get(c.id)!.eficacia).filter((v): v is number => v !== null);
    const otrosConEficacia = comparables.filter((c) => c.id !== jugadorId && metricas.get(c.id)!.eficacia !== null).length;
    if (otrosConEficacia >= MIN_COMPANEROS) {
      scoreTotal += PESO_EFICACIA * percentil(propia.eficacia, valores);
      pesoTotal += PESO_EFICACIA;
    }
  }

  for (const { clave, peso, invertido } of PESOS_TASA) {
    const valores = comparables.map((c) => metricas.get(c.id)![clave]);
    const pct = percentil(propia[clave], valores);
    scoreTotal += peso * (invertido ? 1 - pct : pct);
    pesoTotal += peso;
  }

  return pesoTotal > 0 ? Math.round((scoreTotal / pesoTotal) * 100) / 10 : null;
}

/**
 * Nota /10 por jugador en el mismo ámbito — un partido, o varios
 * (`eventos`/`partidos` ya vienen filtrados al ámbito por el llamante;
 * `partidos` debe ser exactamente el conjunto de partidos del que salen
 * `eventos`, para que los minutos jugados salgan del mismo ámbito que las
 * estadísticas).
 *
 * Jugadores de campo: percentil contra sus compañeros de campo comparables
 * (nunca contra porteros). Porteros: baremo fijo de % de paradas
 * (`BAREMO_PARADAS`) — no se comparan contra otros porteros, la plantilla
 * real (1-2 porteros) nunca alcanzaría el mínimo de comparables.
 *
 * `null` en el mapa: nota no fiable. Campo: menos de 10 minutos jugados en
 * el ámbito, o menos de 2 compañeros de campo comparables con datos.
 * Portero: menos de 10 minutos jugados, o menos de 5 tiros rivales recibidos
 * en el ámbito (un baremo sobre 2-3 tiros sería tan poco fiable como el
 * percentil que sustituye). Se muestra "—" en ambos casos.
 */
export function calcularNotas(jugadores: JugadoresRow[], eventos: EventosRow[], partidos: PartidosRow[]): Map<UUID, number | null> {
  const notas = new Map<UUID, number | null>();
  const campo = jugadores.filter((j) => !esPortero(j.puesto));
  const porteros = jugadores.filter((j) => esPortero(j.puesto));

  const metricasCampoTodas = new Map(campo.map((j) => [j.id, metricasCampo(j.id, eventos, partidos)] as const));
  const comparablesCampo = campo.filter((j) => metricasCampoTodas.get(j.id)!.minutos >= MIN_MINUTOS);
  for (const j of campo) {
    notas.set(j.id, notaCampo(j.id, comparablesCampo, metricasCampoTodas));
  }

  for (const j of porteros) {
    const propios = eventos.filter((e) => e.jugador_id === j.id);
    const detalle = porcentajeParadas(propios);
    const minutos = minutosTotales(partidos, j.id);
    const fiable = minutos >= MIN_MINUTOS && detalle !== null && detalle.intentos >= MIN_TIROS_RECIBIDOS;
    notas.set(j.id, fiable ? notaPorBaremo(detalle.pct, BAREMO_PARADAS) : null);
  }

  return notas;
}
