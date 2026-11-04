import { hayRegistroDePista } from "@/lib/partidoStats";
import type { EventosRow, PartidosRow } from "@/types/database";
import { FECHA_CAPTURA_AMPLIADA, MAX_FRACCION_MISMO_MINUTO, MIN_EVENTOS_SEGUNDA_PARTE_MINUTO, UMBRAL_TIENE_SEGUNDO } from "./constantes";
import type { CalidadDatos } from "./tipos";

/** ¿El `minuto` de los eventos de este partido refleja el partido real? Falso
 * cuando todo cayó en la 1ª parte (la 2ª se apuntó con el reloj en la 1ª) o
 * cuando la 2ª parte se amontona en un mismo minuto (reloj parado) — los dos
 * fallos vistos en los datos reales. */
export function esMinutoFiable(eventos: EventosRow[], duracionParteMin: number): boolean {
  const minutos = eventos.map((e) => e.minuto).filter((m): m is number => m !== null);
  if (minutos.length === 0) return false;
  const segunda = minutos.filter((m) => m > duracionParteMin);
  if (segunda.length === 0) return false;
  if (segunda.length >= MIN_EVENTOS_SEGUNDA_PARTE_MINUTO) {
    const conteo = new Map<number, number>();
    for (const m of segunda) conteo.set(m, (conteo.get(m) ?? 0) + 1);
    const max = Math.max(...conteo.values());
    if (max / segunda.length > MAX_FRACCION_MISMO_MINUTO) return false;
  }
  return true;
}

/** Flags de calidad de un partido (spec §3). `eventos` = eventos de la tabla
 * de ese partido. */
export function calidadDatos(partido: PartidosRow, eventos: EventosRow[]): CalidadDatos {
  const conSegundo = eventos.filter((e) => e.segundo != null).length;
  const ampliada = partido.fecha >= FECHA_CAPTURA_AMPLIADA;
  return {
    tieneSegundo: eventos.length > 0 && conSegundo / eventos.length >= UMBRAL_TIENE_SEGUNDO,
    tienePista: hayRegistroDePista(partido.estadisticas.eventos ?? []),
    tieneTirosRivalFuera:
      ampliada || eventos.some((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && (e.resultado === "fuera" || e.resultado === "poste")),
    tieneExclusionesRival: ampliada || eventos.some((e) => e.tipo === "exclusion" && e.equipo_origen === "rival"),
    tieneTiemposMuertos: ampliada || eventos.some((e) => e.tipo === "tiempo_muerto"),
    minutoFiable: esMinutoFiable(eventos, partido.duracion_parte_min),
  };
}
