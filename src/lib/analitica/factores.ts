import { UMBRAL_FACTOR_DOMINANTE } from "./constantes";
import type { Metrica } from "./tipos";

export type ClaveFactor = "acierto" | "perdidas" | "porteria" | "numericas" | "sieteMetros";
export type Factor = { clave: ClaveFactor; etiqueta: string; goles: Metrica<number> };
export type Descomposicion = { referencia: number; factores: Factor[]; residuo: number; real: number };

export const ETIQUETAS_FACTOR: Record<ClaveFactor, string> = {
  acierto: "Acierto de tiro",
  perdidas: "Pérdidas",
  porteria: "Portería",
  numericas: "Situaciones numéricas",
  sieteMetros: "7 metros",
};

/** Descompone el diferencial real frente al de referencia en factores (en
 * goles) + un residuo "otros" que cuadra la cuenta (spec §4.7). */
export function descomponer(real: number, referenciaDiferencial: number, factores: Factor[]): Descomposicion {
  const suma = factores.reduce((s, f) => s + (f.goles.disponible ? f.goles.valor : 0), 0);
  return { referencia: referenciaDiferencial, factores, residuo: real - referenciaDiferencial - suma, real };
}

/** Frase con el factor dominante cuando va en el mismo sentido que el
 * resultado ("Ganamos … desde la portería") o como "pese a" cuando no. */
const FRASE: Record<ClaveFactor, { positivo: string; negativo: string }> = {
  acierto: { positivo: "con acierto de cara a portería", negativo: "por falta de acierto" },
  perdidas: { positivo: "cuidando el balón", negativo: "por las pérdidas" },
  porteria: { positivo: "desde la portería", negativo: "por la portería" },
  numericas: { positivo: "aprovechando las situaciones numéricas", negativo: "en inferioridad" },
  sieteMetros: { positivo: "acertando desde los 7 metros", negativo: "por los 7 metros fallados" },
};
const PESE_A: Record<ClaveFactor, { positivo: string; negativo: string }> = {
  acierto: { positivo: "un buen acierto", negativo: "la falta de acierto" },
  perdidas: { positivo: "cuidar el balón", negativo: "las pérdidas" },
  porteria: { positivo: "una buena portería", negativo: "la portería" },
  numericas: { positivo: "un buen balance en las situaciones numéricas", negativo: "la inferioridad" },
  sieteMetros: { positivo: "un buen acierto en 7 metros", negativo: "los 7 metros fallados" },
};

function fmt(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function titular(golesFavor: number, golesContra: number, d: Descomposicion): string {
  const verbo = golesFavor > golesContra ? "Ganamos" : golesFavor < golesContra ? "Perdimos" : "Empatamos";
  const base = `${verbo} ${golesFavor}-${golesContra}`;
  const candidatos = d.factores.filter((f) => f.goles.disponible && Math.abs(f.goles.valor) >= UMBRAL_FACTOR_DOMINANTE);
  if (candidatos.length === 0) return `${base} sin un factor que destaque`;
  // Empate en |valor|: gana el primero en el orden de entrada (la comparación es estricta).
  const top = candidatos.reduce((a, b) => (Math.abs((b.goles as { valor: number }).valor) > Math.abs((a.goles as { valor: number }).valor) ? b : a));
  const valor = (top.goles as { valor: number }).valor;
  const signo = valor > 0 ? "positivo" : "negativo";
  const detalle = `${fmt(Math.abs(valor))} goles ${valor > 0 ? "a favor" : "en contra"} frente a lo habitual`;
  if (golesFavor === golesContra) return `${base}; lo que más pesó: ${ETIQUETAS_FACTOR[top.clave].toLowerCase()} (${detalle})`;
  const coincide = (golesFavor > golesContra) === valor > 0;
  return coincide ? `${base} ${FRASE[top.clave][signo]}: ${detalle}` : `${base} pese a ${PESE_A[top.clave][signo]}: ${detalle}`;
}
