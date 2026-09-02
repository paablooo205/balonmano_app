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
const ACCION_AUSENCIA: Record<EtiquetaAcierto, string> = { goles: "tirado", paradas: "recibido tiros" };

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
  opts: { etiquetaAcierto: EtiquetaAcierto; contextoAusencia: string },
): Insight[] {
  const insights: Insight[] = [];
  const total = tiros.length;
  for (const [nombreGrupo, zonas] of Object.entries(grupos)) {
    const tirosGrupo = tiros.filter((e) => e.zona !== null && zonas.includes(e.zona));
    const tirosResto = tiros.filter((e) => e.zona !== null && !zonas.includes(e.zona));

    if (tirosGrupo.length === 0) {
      if (total >= MIN_TOTAL_AUSENCIA) {
        insights.push({
          texto: `No hemos ${ACCION_AUSENCIA[opts.etiquetaAcierto]} nada por ${nombreGrupo} ${opts.contextoAusencia}.`,
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
      texto: `Por ${nombreGrupo} ${VERBO_PRESENTE[opts.etiquetaAcierto]} el ${detGrupo.pct}% (${detGrupo.aciertos}/${detGrupo.intentos}), ${comparativo} del ${detResto.pct}% del resto de zonas.`,
      score: Math.abs(deviacion) * Math.log2(detGrupo.intentos),
      categoria: "zona",
    });
  }
  return insights;
}

/** `tiros` debe venir ya filtrado por el llamante a un contexto homogéneo
 * (propio o rival, juego abierto o 7m — nunca mezclados). "Acierto" es gol
 * si `etiquetaAcierto` es "goles", parada si es "paradas". */
export function insightsZona(
  tiros: EventosRow[],
  opts: { etiquetaAcierto: EtiquetaAcierto; contextoAusencia: string },
): Insight[] {
  return [
    ...insightsPorAgrupacion(tiros, FILAS, opts),
    ...insightsPorAgrupacion(tiros, COLUMNAS, opts),
  ];
}
