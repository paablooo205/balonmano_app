import { supabase } from "@/lib/supabaseClient";
import type { RivalesRow } from "@/types/database";

/** Rivales del equipo, ordenados por nombre. Sin caché offline propia: es
 * una lista pequeña que cambia poco (alta desde el selector de partido), y
 * quien la necesita sin red ya la tiene en memoria desde que abrió el
 * selector con red — ver PartidoModal.tsx. */
export async function cargarRivalesEquipo(equipoId: string): Promise<RivalesRow[]> {
  const { data } = await supabase.from("rivales").select("*").eq("equipo_id", equipoId).order("nombre");
  return data ?? [];
}
