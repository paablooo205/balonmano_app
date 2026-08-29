import type { MicrociclosRow, PeriodosRow } from "@/types/database";

/** Categorías del desglose semanal (hoja MICROCICLOS del Excel de planificación). */
export const CATEGORIAS_CONTENIDO = [
  { key: "ataque", label: "Ataque" },
  { key: "defensa", label: "Defensa" },
  { key: "contraataque", label: "Contraataque" },
  { key: "repliegue", label: "Repliegue" },
  { key: "portero", label: "Portero" },
] as const;

/** Contenidos marcados para el microciclo, agrupados por categoría, sin las vacías. */
export function contenidosDeMicrociclo(
  microciclo: MicrociclosRow,
): { key: string; label: string; items: string[] }[] {
  const c = microciclo.contenidos as Record<string, unknown>;
  return CATEGORIAS_CONTENIDO.map((cat) => ({
    ...cat,
    items: Array.isArray(c?.[cat.key]) ? (c[cat.key] as unknown[]).map(String) : [],
  })).filter((cat) => cat.items.length > 0);
}

export function tienePreparacionFisica(microciclo: MicrociclosRow): boolean {
  return Boolean((microciclo.contenidos as Record<string, unknown>)?.preparacion_fisica);
}

/** Contenido técnico-táctico general del periodo (hoja PLANIFICACION), sin las categorías vacías. */
export function contenidosDePeriodo(
  periodo: PeriodosRow,
): { key: string; label: string; texto: string }[] {
  return CATEGORIAS_CONTENIDO.map((cat) => ({
    ...cat,
    texto: (periodo[`contenido_${cat.key}` as keyof PeriodosRow] as string | null) ?? "",
  })).filter((cat) => cat.texto.trim() !== "");
}
