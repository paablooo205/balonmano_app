import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import type { BloqueSesion, SesionesRow } from "@/types/database";

/**
 * Guarda un cambio en los bloques de una sesión al instante (añadir, editar
 * o quitar un bloque). Envía siempre la fila `SesionesRow` completa, no solo
 * la columna `bloques`: la cola offline (`aplicarPendientes` en
 * src/lib/offline/queue.ts) sustituye la fila cacheada entera por el payload
 * de una operación "update" encolada, así que un payload parcial dejaría la
 * sesión sin `fecha`/`duracion_min`/etc. mientras la operación esté pendiente.
 */
export async function guardarBloques(sesion: SesionesRow, nuevosBloques: BloqueSesion[]): Promise<void> {
  const payload: SesionesRow = {
    ...sesion,
    bloques: nuevosBloques,
    updated_at: new Date().toISOString(),
  };

  if (!navigator.onLine) {
    await encolarOperacion({ tabla: "sesiones", tipo: "update", rowId: sesion.id, payload });
    return;
  }

  const { error, status } = await supabase.from("sesiones").update(payload).eq("id", sesion.id);
  if (error) {
    if (esErrorDeRed(status)) {
      await encolarOperacion({ tabla: "sesiones", tipo: "update", rowId: sesion.id, payload });
      return;
    }
    throw error;
  }
}
