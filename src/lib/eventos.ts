import { supabase } from "@/lib/supabaseClient";
import { aplicarPendientes, encolarOperacion, esErrorDeRed, guardarCache, leerCache, obtenerCola } from "@/lib/offline/queue";
import type { Database, EventosRow } from "@/types/database";

type EventoInsert = Database["public"]["Tables"]["eventos"]["Insert"];

/** Carga todos los eventos del equipo (mismo patrón que PartidoPage.tsx para
 * `partidos`: red primero, caché si falla, cola pendiente fusionada encima). */
export async function cargarEventosEquipo(equipoId: string): Promise<EventosRow[]> {
  const { data } = await supabase.from("eventos").select("*").eq("equipo_id", equipoId);
  const base = data ?? (await leerCache<EventosRow>("eventos", equipoId)) ?? [];
  if (data) void guardarCache("eventos", equipoId, data);
  const cola = await obtenerCola();
  return aplicarPendientes("eventos", base, cola);
}

/** Indexa una lista de eventos por partido_id, para pintar/leer por partido sin volver a consultar. */
export function agruparPorPartido(eventos: EventosRow[]): Map<string, EventosRow[]> {
  const mapa = new Map<string, EventosRow[]>();
  for (const e of eventos) {
    if (!e.partido_id) continue;
    const arr = mapa.get(e.partido_id);
    if (arr) arr.push(e);
    else mapa.set(e.partido_id, [e]);
  }
  return mapa;
}

/** Inserta un evento (tiro/pérdida/exclusión), con la misma cola offline que
 * el resto de escrituras en vivo (ver ContadoresEnVivo.tsx `persistirEstadisticas`). */
export async function registrarEvento(datos: Omit<EventoInsert, "creado_en">): Promise<EventosRow> {
  const fila: EventosRow = {
    id: datos.id ?? crypto.randomUUID(),
    equipo_id: datos.equipo_id,
    partido_id: datos.partido_id ?? null,
    sesion_id: datos.sesion_id ?? null,
    jugador_id: datos.jugador_id ?? null,
    equipo_origen: datos.equipo_origen,
    tipo: datos.tipo,
    resultado: datos.resultado ?? null,
    zona: datos.zona ?? null,
    origen: datos.origen ?? null,
    es_penalti: datos.es_penalti ?? false,
    color_tarjeta: datos.color_tarjeta ?? null,
    minuto: datos.minuto ?? null,
    creado_en: new Date().toISOString(),
  };
  if (!navigator.onLine) {
    await encolarOperacion({ tabla: "eventos", tipo: "insert", rowId: fila.id, payload: fila });
    return fila;
  }
  const { error, status } = await supabase.from("eventos").insert(fila);
  if (error && esErrorDeRed(status)) {
    await encolarOperacion({ tabla: "eventos", tipo: "insert", rowId: fila.id, payload: fila });
  } else if (error) {
    console.error(`[eventos] no se pudo insertar el evento ${fila.id} (${fila.tipo}):`, error);
  }
  return fila;
}

/** Borra un evento (usado por "deshacer"), con la misma cola offline. */
export async function borrarEvento(id: string): Promise<void> {
  if (!navigator.onLine) {
    await encolarOperacion({ tabla: "eventos", tipo: "delete", rowId: id });
    return;
  }
  const { error, status } = await supabase.from("eventos").delete().eq("id", id);
  if (error && esErrorDeRed(status)) {
    await encolarOperacion({ tabla: "eventos", tipo: "delete", rowId: id });
  } else if (error) {
    console.error(`[eventos] no se pudo borrar el evento ${id}:`, error);
  }
}
