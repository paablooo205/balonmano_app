import { N_MEZCLA_REFERENCIA } from "./constantes";

export type Referencia = { valor: number; n: number; mezclada: boolean };

/** Referencia de temporada para una métrica (spec §4.6): media de los
 * partidos que la tienen (el llamante ya excluye el partido analizado y pasa
 * null donde no está disponible). Con menos de 3 partidos se mezcla con el
 * valor fijo: (n·media + 3·fijo) / (n + 3). */
export function referencia(valoresTemporada: (number | null | undefined)[], valorFijo: number): Referencia {
  const v = valoresTemporada.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const n = v.length;
  const media = n > 0 ? v.reduce((s, x) => s + x, 0) / n : 0;
  if (n >= N_MEZCLA_REFERENCIA) return { valor: media, n, mezclada: false };
  return { valor: (n * media + N_MEZCLA_REFERENCIA * valorFijo) / (n + N_MEZCLA_REFERENCIA), n, mezclada: true };
}
