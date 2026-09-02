import { supabase } from "@/lib/supabaseClient";
import { guardarCache, leerCache } from "@/lib/offline/queue";
import type { RivalesRow } from "@/types/database";

/** Rivales del equipo, ordenados por nombre. Red primero, última copia
 * conocida en caché si falla — mismo patrón que `cargarEventosEquipo`.
 * Sin esto, abrir el selector de partido sin red siempre veía una lista
 * vacía (nunca "ya en memoria" como asumía el diseño original) y bloqueaba
 * por completo dar de alta un partido sin conexión, incluso eligiendo un
 * rival ya existente — la única escritura que el diseño quería permitir
 * offline. Solo es caché de lectura: crear un rival nuevo sigue exigiendo
 * red (ver PartidoModal.tsx), nada se encola para esta tabla. */
export async function cargarRivalesEquipo(equipoId: string): Promise<RivalesRow[]> {
  const { data } = await supabase.from("rivales").select("*").eq("equipo_id", equipoId).order("nombre");
  if (data) {
    void guardarCache("rivales", equipoId, data);
    return data;
  }
  return (await leerCache<RivalesRow>("rivales", equipoId)) ?? [];
}
