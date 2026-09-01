import { esPortero, minutosJugados, porcentajeParadas } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow, PartidosRow, UUID } from "@/types/database";

/** Mínimos para que una nota se considere fiable — por debajo, se muestra
 * "—" en vez de un número que aparentaría más precisión de la que hay
 * (mismo principio de honestidad estadística que el resto del dashboard,
 * aplicado a la pieza más interpretativa de todas). */
const MIN_MINUTOS = 10;
const MIN_COMPANEROS = 2;

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
  if (propia.minutos < MIN_MINUTOS || comparables.length < MIN_COMPANEROS) return null;

  let pesoTotal = 0;
  let scoreTotal = 0;

  if (propia.eficacia !== null) {
    const valores = comparables.map((c) => metricas.get(c.id)!.eficacia).filter((v): v is number => v !== null);
    if (valores.length >= MIN_COMPANEROS) {
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
 * Nota /10 por jugador, comparando a cada uno contra sus compañeros
 * comparables (de campo contra de campo, porteros contra porteros) en el
 * mismo ámbito — un partido, o varios (`eventos`/`partidos` ya vienen
 * filtrados al ámbito por el llamante; `partidos` debe ser exactamente el
 * conjunto de partidos del que salen `eventos`, para que los minutos
 * jugados salgan del mismo ámbito que las estadísticas).
 *
 * `null` en el mapa: nota no fiable (menos de 10 minutos jugados en el
 * ámbito, o menos de 2 compañeros comparables con datos) — se muestra "—".
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

  const metricasPorteroTodas = new Map(
    porteros.map((j) => {
      const propios = eventos.filter((e) => e.jugador_id === j.id);
      return [j.id, { detalle: porcentajeParadas(propios), minutos: minutosTotales(partidos, j.id) }] as const;
    }),
  );
  const comparablesPorteros = porteros.filter((j) => {
    const m = metricasPorteroTodas.get(j.id)!;
    return m.minutos >= MIN_MINUTOS && m.detalle !== null;
  });
  for (const j of porteros) {
    const m = metricasPorteroTodas.get(j.id)!;
    if (m.minutos < MIN_MINUTOS || m.detalle === null || comparablesPorteros.length < MIN_COMPANEROS) {
      notas.set(j.id, null);
      continue;
    }
    const valores = comparablesPorteros.map((c) => metricasPorteroTodas.get(c.id)!.detalle!.pct);
    notas.set(j.id, Math.round(percentil(m.detalle.pct, valores) * 100) / 10);
  }

  return notas;
}
