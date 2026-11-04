/** Resultado de una métrica: o un valor, o el motivo por el que no se puede
 * calcular en este partido. Nunca un 0 ni un número inventado (spec §2). */
export type Metrica<T> = { disponible: true; valor: T } | { disponible: false; motivo: string };

export function disponible<T>(valor: T): Metrica<T> {
  return { disponible: true, valor };
}

export function noDisponible<T>(motivo: string): Metrica<T> {
  return { disponible: false, motivo };
}

export type Equipo = "propio" | "rival";

/** Qué datos tiene un partido — cada métrica declara cuáles necesita. */
export type CalidadDatos = {
  tieneSegundo: boolean;
  tienePista: boolean;
  tieneTirosRivalFuera: boolean;
  tieneExclusionesRival: boolean;
  tieneTiemposMuertos: boolean;
  minutoFiable: boolean;
};
