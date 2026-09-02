import type { EventosRow } from "@/types/database";

export type CategoriaInsight = "zona" | "ejecucion" | "tendencia";
export type EtiquetaAcierto = "goles" | "paradas";

export type Insight = {
  texto: string;
  score: number;
  categoria: CategoriaInsight;
};

const FILAS: Record<string, number[]> = {
  arriba: [1, 2, 3],
  medio: [4, 5, 6],
  abajo: [7, 8, 9],
};

const COLUMNAS: Record<string, number[]> = {
  izquierda: [1, 4, 7],
  centro: [2, 5, 8],
  derecha: [3, 6, 9],
};

const VERBO_PRESENTE: Record<EtiquetaAcierto, string> = { goles: "metemos", paradas: "paramos" };
const FRASE_AUSENCIA: Record<EtiquetaAcierto, (grupo: string, contexto: string) => string> = {
  goles: (grupo, contexto) => `No hemos tirado a portería nada por ${grupo} ${contexto}.`,
  paradas: (grupo, contexto) => `No hemos recibido ningún tiro por ${grupo} ${contexto}.`,
};
const PARTICIPIO: Record<EtiquetaAcierto, string> = { goles: "metido", paradas: "parado" };

const MIN_TIROS_GRUPO_ZONA = 5;
const MIN_TOTAL_AUSENCIA = 10;
const DEVIACION_MINIMA_ZONA = 20;
const SCORE_AUSENCIA = 15;

function esAcierto(e: EventosRow, etiqueta: EtiquetaAcierto): boolean {
  return etiqueta === "goles" ? e.resultado === "gol" : e.resultado === "parado";
}

function pctAcierto(tiros: EventosRow[], etiqueta: EtiquetaAcierto): { pct: number; aciertos: number; intentos: number } | null {
  if (tiros.length === 0) return null;
  const aciertos = tiros.filter((e) => esAcierto(e, etiqueta)).length;
  return { pct: Math.round((aciertos / tiros.length) * 100), aciertos, intentos: tiros.length };
}

function insightsPorAgrupacion(
  tiros: EventosRow[],
  grupos: Record<string, number[]>,
  opts: { etiquetaAcierto: EtiquetaAcierto; contextoAusencia: string; etiquetaContexto?: string },
): Insight[] {
  const insights: Insight[] = [];
  // Solo los tiros con zona real cuentan para el umbral de ausencia: fuera/poste
  // no llevan zona (ver `requiereZona`), así que un tiro fallado fuera no prueba
  // que no hayamos tirado por ahí.
  const total = tiros.filter((e) => e.zona !== null).length;
  const contexto = opts.etiquetaContexto ?? "";
  for (const [nombreGrupo, zonas] of Object.entries(grupos)) {
    const tirosGrupo = tiros.filter((e) => e.zona !== null && zonas.includes(e.zona));
    const tirosResto = tiros.filter((e) => e.zona !== null && !zonas.includes(e.zona));

    if (tirosGrupo.length === 0) {
      if (total >= MIN_TOTAL_AUSENCIA) {
        insights.push({
          texto: FRASE_AUSENCIA[opts.etiquetaAcierto](`${nombreGrupo}${contexto}`, opts.contextoAusencia),
          score: SCORE_AUSENCIA,
          categoria: "zona",
        });
      }
      continue;
    }

    if (tirosGrupo.length < MIN_TIROS_GRUPO_ZONA || tirosResto.length < MIN_TIROS_GRUPO_ZONA) continue;

    const detGrupo = pctAcierto(tirosGrupo, opts.etiquetaAcierto)!;
    const detResto = pctAcierto(tirosResto, opts.etiquetaAcierto)!;
    const deviacion = detGrupo.pct - detResto.pct;
    if (Math.abs(deviacion) < DEVIACION_MINIMA_ZONA) continue;

    const comparativo = deviacion > 0 ? "muy por encima" : "muy por debajo";
    insights.push({
      texto: `Por ${nombreGrupo}${contexto} ${VERBO_PRESENTE[opts.etiquetaAcierto]} el ${detGrupo.pct}% (${detGrupo.aciertos}/${detGrupo.intentos}), ${comparativo} del ${detResto.pct}% del resto de zonas.`,
      score: Math.abs(deviacion) * Math.log2(detGrupo.intentos),
      categoria: "zona",
    });
  }
  return insights;
}

/** `tiros` debe venir ya filtrado por el llamante a un contexto homogéneo
 * (propio o rival, juego abierto o 7m — nunca mezclados). "Acierto" es gol
 * si `etiquetaAcierto` es "goles", parada si es "paradas". `etiquetaContexto`
 * se pega justo detrás del nombre de la zona en la frase para distinguir
 * contextos que si no se leerían como contradictorios (" (7m)"); el juego
 * abierto es el caso implícito y no lleva etiqueta. */
export function insightsZona(
  tiros: EventosRow[],
  opts: { etiquetaAcierto: EtiquetaAcierto; contextoAusencia: string; etiquetaContexto?: string },
): Insight[] {
  return [
    ...insightsPorAgrupacion(tiros, FILAS, opts),
    ...insightsPorAgrupacion(tiros, COLUMNAS, opts),
  ];
}

const MIN_TIROS_EJECUCION = 8;
const PCT_FALLO_NO_FORZADO_MINIMO = 25;

/** Solo tiros propios en juego abierto — nunca 7m, un fallo a puerta vacía
 * en 7m no es comparable a un fallo bajo presión defensiva. */
export function insightsEjecucion(tirosJuegoAbierto: EventosRow[]): Insight[] {
  if (tirosJuegoAbierto.length < MIN_TIROS_EJECUCION) return [];
  const falloNoForzado = tirosJuegoAbierto.filter((e) => e.resultado === "fuera" || e.resultado === "poste").length;
  const pct = Math.round((falloNoForzado / tirosJuegoAbierto.length) * 100);
  if (pct < PCT_FALLO_NO_FORZADO_MINIMO) return [];
  return [
    {
      texto: `${falloNoForzado} de cada ${tirosJuegoAbierto.length} tiros se van fuera o al poste — más fallo propio que del portero rival.`,
      score: pct * Math.log2(tirosJuegoAbierto.length),
      categoria: "ejecucion",
    },
  ];
}

const MIN_INTENTOS_TENDENCIA = 5;
const DEVIACION_MINIMA_TENDENCIA = 20;

/** Mediana de `creado_en` entre los eventos de tipo "tiro" (propios y
 * rivales) — aproxima "mitad del partido" sin depender de un minuto real
 * por tiro (no existe en `eventos`, solo en el jsonb de sustituciones). */
export function cortePorMediana(eventos: EventosRow[]): string | null {
  const timestamps = eventos
    .filter((e) => e.tipo === "tiro")
    .map((e) => e.creado_en)
    .sort();
  if (timestamps.length === 0) return null;
  return timestamps[Math.floor(timestamps.length / 2)];
}

export function dividirPorCorte(eventos: EventosRow[], corte: string): [EventosRow[], EventosRow[]] {
  return [eventos.filter((e) => e.creado_en < corte), eventos.filter((e) => e.creado_en >= corte)];
}

/** `periodoA` es el periodo de referencia (más antiguo o "resto"),
 * `periodoB` el periodo reciente que se compara contra él — ambos ya
 * filtrados y homogéneos (mismo contexto propio/rival, juego abierto).
 * `etiquetas.a` va después de "frente al X% (n/m) " en la frase, así que
 * debe traer su propia preposición ("de la 1ª parte", "del resto de la
 * temporada" — nunca "el resto de la temporada" a secas, produciría "de
 * el resto..." en vez de "del resto..."). `etiquetas.b` va después de "En "
 * y no necesita preposición ("la 2ª parte", "los últimos 3 partidos"). */
export function insightsTendencia(
  periodoA: EventosRow[],
  periodoB: EventosRow[],
  etiquetas: { a: string; b: string },
  opts: { etiquetaAcierto: EtiquetaAcierto },
): Insight[] {
  if (periodoA.length < MIN_INTENTOS_TENDENCIA || periodoB.length < MIN_INTENTOS_TENDENCIA) return [];
  const detA = pctAcierto(periodoA, opts.etiquetaAcierto)!;
  const detB = pctAcierto(periodoB, opts.etiquetaAcierto)!;
  const deviacion = detB.pct - detA.pct;
  if (Math.abs(deviacion) < DEVIACION_MINIMA_TENDENCIA) return [];
  const prefijo = deviacion < 0 ? "solo " : "";
  return [
    {
      texto: `En ${etiquetas.b} ${prefijo}hemos ${PARTICIPIO[opts.etiquetaAcierto]} el ${detB.pct}% (${detB.aciertos}/${detB.intentos}), frente al ${detA.pct}% (${detA.aciertos}/${detA.intentos}) ${etiquetas.a}.`,
      score: Math.abs(deviacion) * Math.log2(Math.min(detA.intentos, detB.intentos)),
      categoria: "tendencia",
    },
  ];
}

export type EntradasInsights = {
  zonaPropioJuego: EventosRow[];
  zonaPropioPenalti: EventosRow[];
  zonaRivalJuego: EventosRow[];
  zonaRivalPenalti: EventosRow[];
  ejecucionPropioJuego: EventosRow[];
  /** Frase que completa "No hemos tirado a portería nada por abajo {contextoAusencia}." — p.ej. "en el partido", "en la temporada", "en los enfrentamientos contra este rival". */
  contextoAusencia: string;
  /** `propio`/`rival` deben ser juego abierto únicamente (nunca 7m) — mismo criterio que el resto de `EntradasInsights`. */
  tendencia?: {
    propio: [EventosRow[], EventosRow[]];
    rival: [EventosRow[], EventosRow[]];
    etiquetas: { a: string; b: string };
  };
};

const MAX_INSIGHTS = 4;

/** Punto de entrada único que usan las tres fichas: recopila todas las
 * categorías aplicables, ordena por `score` descendente y recorta al top 4
 * — sin cuota fija por categoría. */
export function generarInsights(entradas: EntradasInsights): Insight[] {
  const insights: Insight[] = [
    ...insightsZona(entradas.zonaPropioJuego, { etiquetaAcierto: "goles", contextoAusencia: entradas.contextoAusencia }),
    ...insightsZona(entradas.zonaPropioPenalti, { etiquetaAcierto: "goles", contextoAusencia: entradas.contextoAusencia, etiquetaContexto: " (7m)" }),
    ...insightsZona(entradas.zonaRivalJuego, { etiquetaAcierto: "paradas", contextoAusencia: entradas.contextoAusencia }),
    ...insightsZona(entradas.zonaRivalPenalti, { etiquetaAcierto: "paradas", contextoAusencia: entradas.contextoAusencia, etiquetaContexto: " (7m)" }),
    ...insightsEjecucion(entradas.ejecucionPropioJuego),
  ];
  if (entradas.tendencia) {
    const { propio, rival, etiquetas } = entradas.tendencia;
    insights.push(
      ...insightsTendencia(propio[0], propio[1], etiquetas, { etiquetaAcierto: "goles" }),
      ...insightsTendencia(rival[0], rival[1], etiquetas, { etiquetaAcierto: "paradas" }),
    );
  }
  return insights.sort((a, b) => b.score - a.score).slice(0, MAX_INSIGHTS);
}
