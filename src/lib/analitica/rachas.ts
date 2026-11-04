import { segundoDeToque } from "@/lib/partidoStats";
import type { EventoPartido, EventosRow } from "@/types/database";
import { RACHA_MIN_GOLES, SEQUIA_MIN_SEG, VENTANA_CONTEXTO_PARCIAL_SEG, VENTANA_TIEMPO_MUERTO_SEG } from "./constantes";
import type { Equipo } from "./tipos";

export type Contexto = { tipo: "exclusion" | "tiempo_muerto" | "cambio" | "descanso"; equipo: Equipo | null; segundo: number };
export type Parcial = { equipo: Equipo; goles: number; inicioSeg: number; finSeg: number; contexto: Contexto[] };
export type Sequia = { equipo: Equipo; inicioSeg: number; finSeg: number; segundos: number };
export type EfectoTiempoMuerto = { equipo: Equipo; segundo: number; antes: number; despues: number };

function golesOrdenados(eventos: EventosRow[]) {
  return eventos
    .filter((e) => e.tipo === "tiro" && e.resultado === "gol" && e.segundo != null)
    .sort((a, b) => a.segundo! - b.segundo! || a.creado_en.localeCompare(b.creado_en));
}

/** Parciales: ≥ 3 goles seguidos del mismo equipo, con lo que pasó entre un
 * minuto antes y el final del parcial (exclusiones, tiempos muertos, cambios,
 * descanso). Spec §4.5. */
export function parciales(eventos: EventosRow[], eventosJsonb: EventoPartido[], duracionParteMin: number): Parcial[] {
  const goles = golesOrdenados(eventos);
  const tramos: { equipo: Equipo; inicio: number; fin: number; n: number }[] = [];
  for (const g of goles) {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.equipo === g.equipo_origen) {
      ultimo.fin = g.segundo!;
      ultimo.n++;
    } else {
      tramos.push({ equipo: g.equipo_origen, inicio: g.segundo!, fin: g.segundo!, n: 1 });
    }
  }
  const cambios = new Map<string, number>();
  for (const e of eventosJsonb) {
    if (e.grupo && e.tipo === "sale_pista") {
      const t = segundoDeToque(e);
      if (t !== null && !cambios.has(e.grupo)) cambios.set(e.grupo, t);
    }
  }
  const descanso = duracionParteMin * 60;
  return tramos
    .filter((t) => t.n >= RACHA_MIN_GOLES)
    .map((t) => {
      const desde = t.inicio - VENTANA_CONTEXTO_PARCIAL_SEG;
      const dentro = (s: number) => s >= desde && s <= t.fin;
      const contexto: Contexto[] = [];
      for (const e of eventos) {
        if (e.segundo == null || !dentro(e.segundo)) continue;
        if (e.tipo === "exclusion") contexto.push({ tipo: "exclusion", equipo: e.equipo_origen, segundo: e.segundo });
        if (e.tipo === "tiempo_muerto") contexto.push({ tipo: "tiempo_muerto", equipo: e.equipo_origen, segundo: e.segundo });
      }
      for (const s of cambios.values()) if (dentro(s)) contexto.push({ tipo: "cambio", equipo: null, segundo: s });
      if (t.inicio < descanso && descanso <= t.fin) contexto.push({ tipo: "descanso", equipo: null, segundo: descanso });
      contexto.sort((a, b) => a.segundo - b.segundo);
      return { equipo: t.equipo, goles: t.n, inicioSeg: t.inicio, finSeg: t.fin, contexto };
    });
}

/** Tramos de ≥ 5' sin marcar de cada equipo (desde el inicio o su último gol
 * hasta su siguiente gol o el final). */
export function sequias(eventos: EventosRow[], duracionTotalSeg: number): Sequia[] {
  const resultado: Sequia[] = [];
  for (const equipo of ["propio", "rival"] as const) {
    const marcas = [0, ...golesOrdenados(eventos).filter((g) => g.equipo_origen === equipo).map((g) => g.segundo!), duracionTotalSeg];
    for (let k = 0; k < marcas.length - 1; k++) {
      const segundos = marcas[k + 1] - marcas[k];
      if (segundos >= SEQUIA_MIN_SEG) resultado.push({ equipo, inicioSeg: marcas[k], finSeg: marcas[k + 1], segundos });
    }
  }
  return resultado;
}

/** Diferencial de goles (desde nuestro punto de vista) en los 5' anteriores
 * y posteriores a cada tiempo muerto. */
export function efectoTiemposMuertos(eventos: EventosRow[]): EfectoTiempoMuerto[] {
  const goles = golesOrdenados(eventos);
  const dif = (desde: number, hasta: number, incluirDesde: boolean) =>
    goles
      .filter((g) => (incluirDesde ? g.segundo! >= desde : g.segundo! > desde) && (incluirDesde ? g.segundo! < hasta : g.segundo! <= hasta))
      .reduce((s, g) => s + (g.equipo_origen === "propio" ? 1 : -1), 0);
  return eventos
    .filter((e) => e.tipo === "tiempo_muerto" && e.segundo != null)
    .sort((a, b) => a.segundo! - b.segundo!)
    .map((e) => ({
      equipo: e.equipo_origen,
      segundo: e.segundo!,
      antes: dif(e.segundo! - VENTANA_TIEMPO_MUERTO_SEG, e.segundo!, true),
      despues: dif(e.segundo!, e.segundo! + VENTANA_TIEMPO_MUERTO_SEG, false),
    }));
}
