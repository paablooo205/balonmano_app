import type { EventosRow } from "@/types/database";
import { DURACION_EXCLUSION_SEG, MIN_SEG_ESTADO_COSTE } from "./constantes";
import { esCierrePosesion } from "./posesiones";
import { disponible, noDisponible, type CalidadDatos, type Equipo, type Metrica } from "./tipos";

export type EstadoNumerico = "igualdad" | "inferioridad" | "superioridad";
export type IntervaloExclusion = { equipo: Equipo; inicio: number; fin: number };
export type ResumenEstado = { segundos: number; golesFavor: number; golesContra: number; posesionesPropias: number; posesionesRival: number };
export type ResumenNumericas = {
  porEstado: Record<EstadoNumerico, ResumenEstado>;
  costePorExclusion: Metrica<number>;
  superioridad: Metrica<ResumenEstado>;
  /** Goles netos en inferioridad + superioridad menos lo que se habría hecho
   * en ese tiempo al ritmo de igualdad (factor "situaciones numéricas"). */
  golesNetosSobreIgualdad: number;
};

/** Exclusiones (y rojas, que también dejan 2' en inferioridad) con segundo
 * registrado, como intervalos `[inicio, fin)` recortados al partido. */
export function intervalosExclusion(eventos: EventosRow[], duracionTotalSeg: number): IntervaloExclusion[] {
  return eventos
    .filter((e) => (e.tipo === "exclusion" || (e.tipo === "tarjeta" && e.color_tarjeta === "roja")) && e.segundo != null)
    .map((e) => ({ equipo: e.equipo_origen, inicio: e.segundo!, fin: Math.min(e.segundo! + DURACION_EXCLUSION_SEG, duracionTotalSeg) }))
    .sort((a, b) => a.inicio - b.inicio);
}

export function estadoEn(t: number, ints: IntervaloExclusion[]): EstadoNumerico {
  let propios = 0;
  let rival = 0;
  for (const i of ints) {
    if (i.inicio <= t && t < i.fin) {
      if (i.equipo === "propio") propios++;
      else rival++;
    }
  }
  return propios > rival ? "inferioridad" : rival > propios ? "superioridad" : "igualdad";
}

const vacio = (): ResumenEstado => ({ segundos: 0, golesFavor: 0, golesContra: 0, posesionesPropias: 0, posesionesRival: 0 });

/** Igualdad / inferioridad / superioridad (spec §4.4). Requiere segundo. */
export function resumirNumericas(eventos: EventosRow[], duracionTotalSeg: number, calidad: CalidadDatos): Metrica<ResumenNumericas> {
  if (!calidad.tieneSegundo) return noDisponible("Este partido no tiene el segundo exacto de cada acción");
  const ints = intervalosExclusion(eventos, duracionTotalSeg);
  const porEstado: Record<EstadoNumerico, ResumenEstado> = { igualdad: vacio(), inferioridad: vacio(), superioridad: vacio() };
  const cortes = new Set<number>([0, duracionTotalSeg]);
  for (const i of ints) {
    cortes.add(i.inicio);
    cortes.add(i.fin);
  }
  const puntos = [...cortes].filter((t) => t >= 0 && t <= duracionTotalSeg).sort((a, b) => a - b);
  for (let k = 0; k < puntos.length - 1; k++) porEstado[estadoEn(puntos[k], ints)].segundos += puntos[k + 1] - puntos[k];
  for (const e of eventos) {
    if (e.segundo == null) continue;
    const r = porEstado[estadoEn(e.segundo, ints)];
    const equipo = esCierrePosesion(e);
    if (equipo === "propio") r.posesionesPropias++;
    if (equipo === "rival") r.posesionesRival++;
    if (e.tipo === "tiro" && e.resultado === "gol") {
      if (e.equipo_origen === "propio") r.golesFavor++;
      else r.golesContra++;
    }
  }
  const difPorSeg = (r: ResumenEstado) => (r.golesFavor - r.golesContra) / r.segundos;
  const { igualdad, inferioridad, superioridad } = porEstado;
  const costePorExclusion: Metrica<number> =
    igualdad.segundos >= MIN_SEG_ESTADO_COSTE && inferioridad.segundos >= MIN_SEG_ESTADO_COSTE
      ? disponible((difPorSeg(igualdad) - difPorSeg(inferioridad)) * DURACION_EXCLUSION_SEG)
      : noDisponible(`Menos de ${MIN_SEG_ESTADO_COSTE} s en igualdad o en inferioridad`);
  const tasaIgualdad = igualdad.segundos > 0 ? difPorSeg(igualdad) : 0;
  const golesNetosSobreIgualdad = [inferioridad, superioridad].reduce(
    (s, r) => s + (r.golesFavor - r.golesContra) - tasaIgualdad * r.segundos,
    0,
  );
  return disponible({
    porEstado,
    costePorExclusion,
    superioridad: calidad.tieneExclusionesRival ? disponible(superioridad) : noDisponible("En este partido no se registraban las exclusiones del rival"),
    golesNetosSobreIgualdad,
  });
}
