import type { EventosRow } from "@/types/database";
import { disponible, noDisponible, type CalidadDatos, type Equipo, type Metrica } from "./tipos";

export type ConteoPosesiones = {
  tirosPropios: number;
  perdidasPropias: number;
  posesionesPropias: number;
  golesFavor: number;
  tirosRival: number;
  robos: number;
  posesionesRival: number;
  golesContra: number;
};

export type ResumenPosesiones = {
  conteo: ConteoPosesiones;
  eficienciaAtaque: Metrica<number>;
  eficienciaDefensa: Metrica<number>;
  diferencial: Metrica<number>;
  ritmo: Metrica<number>;
  pctPerdidas: Metrica<number>;
};

const SIN_FUERA_RIVAL = "En este partido no se registraban los tiros del rival fuera o al poste";

/** Equipo cuya posesión termina con este evento, o null si no cierra ninguna.
 * Nuestra posesión: tiro propio (incl. 7m) o pérdida propia. La del rival:
 * tiro rival (gol, parada, fuera, poste) o robo nuestro (= pérdida del rival,
 * con o sin jugador). Spec §4.1. */
export function esCierrePosesion(e: EventosRow): Equipo | null {
  if (e.tipo === "tiro") return e.equipo_origen;
  if (e.tipo === "perdida") return e.equipo_origen === "propio" ? "propio" : "rival";
  return null;
}

export function contarPosesiones(eventos: EventosRow[]): ConteoPosesiones {
  let tirosPropios = 0, perdidasPropias = 0, golesFavor = 0, tirosRival = 0, robos = 0, golesContra = 0;
  for (const e of eventos) {
    if (e.tipo === "tiro" && e.equipo_origen === "propio") {
      tirosPropios++;
      if (e.resultado === "gol") golesFavor++;
    } else if (e.tipo === "tiro" && e.equipo_origen === "rival") {
      tirosRival++;
      if (e.resultado === "gol") golesContra++;
    } else if (e.tipo === "perdida" && e.equipo_origen === "propio") {
      perdidasPropias++;
    } else if (e.tipo === "perdida" && e.equipo_origen === "rival") {
      robos++;
    }
  }
  return {
    tirosPropios, perdidasPropias, posesionesPropias: tirosPropios + perdidasPropias, golesFavor,
    tirosRival, robos, posesionesRival: tirosRival + robos, golesContra,
  };
}

/** Eficiencia (goles por posesión), diferencial, ritmo y % de pérdidas. Lo
 * que depende de las posesiones del rival exige `tieneTirosRivalFuera`: sin
 * los fuera del rival, sus posesiones salen cortas y la eficiencia defensiva
 * saldría inflada. */
export function resumirPosesiones(eventos: EventosRow[], duracionParteMin: number, calidad: CalidadDatos): ResumenPosesiones {
  const c = contarPosesiones(eventos);
  const eficienciaAtaque: Metrica<number> =
    c.posesionesPropias > 0 ? disponible(c.golesFavor / c.posesionesPropias) : noDisponible("Sin posesiones nuestras registradas");
  const eficienciaDefensa: Metrica<number> = !calidad.tieneTirosRivalFuera
    ? noDisponible(SIN_FUERA_RIVAL)
    : c.posesionesRival > 0
      ? disponible(c.golesContra / c.posesionesRival)
      : noDisponible("Sin posesiones del rival registradas");
  const diferencial: Metrica<number> =
    eficienciaAtaque.disponible && eficienciaDefensa.disponible
      ? disponible(eficienciaAtaque.valor - eficienciaDefensa.valor)
      : noDisponible(eficienciaDefensa.disponible ? "Sin posesiones nuestras registradas" : SIN_FUERA_RIVAL);
  const ritmo: Metrica<number> = !calidad.tieneTirosRivalFuera
    ? noDisponible(SIN_FUERA_RIVAL)
    : disponible(((c.posesionesPropias + c.posesionesRival) / 2 / (2 * duracionParteMin)) * 60);
  const pctPerdidas: Metrica<number> =
    c.posesionesPropias > 0 ? disponible(c.perdidasPropias / c.posesionesPropias) : noDisponible("Sin posesiones nuestras registradas");
  return { conteo: c, eficienciaAtaque, eficienciaDefensa, diferencial, ritmo, pctPerdidas };
}
