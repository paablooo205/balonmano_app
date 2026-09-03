import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function claveVistos(equipoId: string) {
  return `ejercicios-vistos:${equipoId}`;
}

function ultimaVezVisto(equipoId: string): string {
  try {
    return localStorage.getItem(claveVistos(equipoId)) ?? "1970-01-01T00:00:00.000Z";
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
}

/**
 * Detecta si hay ejercicios compartidos por OTROS equipos que este equipo
 * todavía no ha visto (creados después de la última vez que se abrió la
 * sección Ejercicios) — para la burbuja roja en "Más"/"Ejercicios" del menú
 * inferior. "Visto" se guarda en localStorage, por equipo: es una
 * preferencia local de este dispositivo, no un dato compartido en Supabase.
 */
export function useEjerciciosNuevos(equipoId: string) {
  const [hayNuevos, setHayNuevos] = useState(false);

  useEffect(() => {
    if (!equipoId) return;
    supabase
      .from("ejercicios")
      .select("id", { count: "exact", head: true })
      .eq("compartido", true)
      .neq("equipo_id", equipoId)
      .gt("created_at", ultimaVezVisto(equipoId))
      .then(({ count }) => setHayNuevos((count ?? 0) > 0));
  }, [equipoId]);

  function marcarVistos() {
    if (!equipoId) return;
    try {
      localStorage.setItem(claveVistos(equipoId), new Date().toISOString());
    } catch {
      // localStorage puede fallar (modo privado, cuota) — la burbuja no es
      // crítica, seguir sin marcar como visto no rompe nada más.
    }
    setHayNuevos(false);
  }

  return { hayNuevos, marcarVistos };
}
