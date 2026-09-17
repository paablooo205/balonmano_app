import type { AsistenciaRow, SesionesRow } from "@/types/database";

export type RegistroAsistencia = AsistenciaRow & { fecha: string };

export type AsistenciaJugador = {
  registros: RegistroAsistencia[];
  presentes: number;
  total: number;
  pct: number | null;
  llegadasTarde: number;
  justificados: number;
  injustificados: number;
  lesiones: number;
};

/** Asistencia a entrenamientos de un jugador (excluye partidos), más reciente primero. */
export function calcularAsistenciaJugador(
  asistencia: AsistenciaRow[],
  sesiones: SesionesRow[],
  jugadorId: string,
): AsistenciaJugador {
  const fechaDeSesion = new Map<string, string>();
  for (const s of sesiones) fechaDeSesion.set(s.id, s.fecha);

  const registros = asistencia
    .filter((a) => a.jugador_id === jugadorId && a.sesion_id)
    .map((a) => ({ ...a, fecha: fechaDeSesion.get(a.sesion_id!) ?? "" }))
    .filter((a) => a.fecha)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const presentes = registros.filter((a) => a.presente).length;
  const total = registros.length;
  const ausencias = registros.filter((a) => !a.presente);

  return {
    registros,
    presentes,
    total,
    pct: total > 0 ? Math.round((presentes / total) * 100) : null,
    llegadasTarde: registros.filter((a) => a.presente && a.llego_tarde).length,
    justificados: ausencias.filter((a) => a.motivo_ausencia === "justificado").length,
    injustificados: ausencias.filter((a) => a.motivo_ausencia !== "justificado" && a.motivo_ausencia !== "lesion").length,
    lesiones: ausencias.filter((a) => a.motivo_ausencia === "lesion").length,
  };
}

/** Verde=presente, ámbar=justificado, rojo=injustificado, neutro=lesión — excepción sancionada a la paleta (ver CLAUDE.md). */
export function colorRegistroAsistencia(a: AsistenciaRow): string {
  if (a.presente) return "var(--color-success)";
  if (a.motivo_ausencia === "justificado") return "var(--color-warning)";
  if (a.motivo_ausencia === "lesion") return "var(--color-text-faint)";
  return "var(--color-accent)";
}
