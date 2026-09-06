import type { MicrociclosRow, PeriodosRow } from "@/types/database";
import { addDays, startOfWeek, toISODate } from "@/lib/calendar";

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

export type SemanaRango = { fecha_inicio: string; fecha_fin: string };

/** Semanas lunes-domingo que cubren [fechaInicio, fechaFin], alineadas con el resto del calendario. */
export function semanasDeRango(fechaInicio: string, fechaFin: string): SemanaRango[] {
  const fin = new Date(fechaFin);
  const semanas: SemanaRango[] = [];
  let cursor = startOfWeek(new Date(fechaInicio));
  while (cursor <= fin) {
    semanas.push({ fecha_inicio: toISODate(cursor), fecha_fin: toISODate(addDays(cursor, 6)) });
    cursor = addDays(cursor, 7);
  }
  return semanas;
}

/** Numera 1..N las semanas de un bloque en orden cronológico por fecha_inicio. */
export function numerarSemanas<T extends { fecha_inicio: string | null }>(semanas: T[]): (T & { semana: number })[] {
  return [...semanas]
    .sort((a, b) => (a.fecha_inicio ?? "").localeCompare(b.fecha_inicio ?? ""))
    .map((s, i) => ({ ...s, semana: i + 1 }));
}

function semanaTieneContenido(m: MicrociclosRow): boolean {
  const contenidos = m.contenidos as Record<string, unknown>;
  const contenidosRellenos = Object.values(contenidos ?? {}).some((v) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v),
  );
  return Boolean(
    m.objetivo?.trim() || m.rival?.trim() || m.competicion?.trim() || m.notas_adicionales?.trim() || contenidosRellenos,
  );
}

export type PlanConciliacion = {
  /** Semanas existentes que se conservan tal cual (su fecha_inicio sigue en el nuevo rango). */
  conservar: MicrociclosRow[];
  /** Semanas nuevas a insertar (el rango creció). */
  crear: SemanaRango[];
  /** Semanas existentes fuera del nuevo rango, sin ningún dato — se borran sin preguntar. */
  borrarSinAviso: MicrociclosRow[];
  /** Semanas existentes fuera del nuevo rango, con datos — requieren confirmación explícita antes de borrarlas. */
  borrarConAviso: MicrociclosRow[];
};

/**
 * Compara las semanas actuales de un bloque contra un nuevo rango de fechas
 * y calcula qué conservar, crear o borrar — no toca la base de datos.
 */
export function conciliarSemanas(
  actuales: MicrociclosRow[],
  nuevaFechaInicio: string,
  nuevaFechaFin: string,
): PlanConciliacion {
  const nuevasSemanas = semanasDeRango(nuevaFechaInicio, nuevaFechaFin);
  const fechasNuevas = new Set(nuevasSemanas.map((s) => s.fecha_inicio));
  const fechasActuales = new Set(actuales.map((m) => m.fecha_inicio));

  const conservar = actuales.filter((m) => m.fecha_inicio && fechasNuevas.has(m.fecha_inicio));
  const crear = nuevasSemanas.filter((s) => !fechasActuales.has(s.fecha_inicio));
  const fuera = actuales.filter((m) => !m.fecha_inicio || !fechasNuevas.has(m.fecha_inicio));

  return {
    conservar,
    crear,
    borrarSinAviso: fuera.filter((m) => !semanaTieneContenido(m)),
    borrarConAviso: fuera.filter(semanaTieneContenido),
  };
}
