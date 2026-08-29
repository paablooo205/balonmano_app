import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import type { DiaSemana, SesionesRow } from "@/types/database";

/**
 * Crea de forma transparente la sesión de un día con horario recurrente
 * configurado pero sin fila propia todavía — "marcar como planificada" es
 * opcional para el entrenador, así que un día de entreno del horario debe
 * comportarse exactamente igual exista ya la fila o no. Se llama justo antes
 * de navegar al detalle, así la pantalla siempre trabaja sobre una sesión real.
 */
export async function crearSesionRapida(datos: {
  equipoId: string;
  fecha: string;
  diaSemana: DiaSemana;
  microcicloId: string | null;
  duracionMin: number | null;
}): Promise<SesionesRow> {
  const id = crypto.randomUUID();
  const ahora = new Date().toISOString();
  const payload: SesionesRow = {
    id,
    equipo_id: datos.equipoId,
    microciclo_id: datos.microcicloId,
    fecha: datos.fecha,
    dia_semana: datos.diaSemana,
    duracion_min: datos.duracionMin,
    estado: "planificada",
    bloques: [],
    adjuntos: [],
    valoracion: null,
    notas_adicionales: null,
    created_at: ahora,
    updated_at: ahora,
  };

  if (!navigator.onLine) {
    await encolarOperacion({ tabla: "sesiones", tipo: "insert", rowId: id, payload });
    return payload;
  }
  const { error, status } = await supabase.from("sesiones").insert(payload);
  if (error) {
    if (esErrorDeRed(status)) {
      await encolarOperacion({ tabla: "sesiones", tipo: "insert", rowId: id, payload });
      return payload;
    }
    throw error;
  }
  return payload;
}
