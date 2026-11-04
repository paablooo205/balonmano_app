import type { EventosRow } from "@/types/database";
import { K_PRIOR, PSXG_BASE_DEFECTO, PSXG_MIN_MUESTRA, XG_REFERENCIA } from "./constantes";

export type TipoLanzamiento = "7m" | "extremo" | "pivote" | "exterior" | "contragolpe" | "desconocido";
export const TIPOS_LANZAMIENTO: TipoLanzamiento[] = ["7m", "extremo", "pivote", "exterior", "contragolpe", "desconocido"];

export type ResumenXg = { tiros: number; goles: number; xg: number; golesMenosXg: number };
export type ModeloXg = Record<TipoLanzamiento, number>;
export type ModeloPsxg = { porZona: Record<number, number>; base: number; muestra: number };
export type PorteroEvitados = {
  porteroId: string | null;
  tirosAPuerta: number;
  goles: number;
  psxg: number;
  evitados: number;
  sieteRecibidos: number;
  sieteParados: number;
};
export type Colocacion = { jugadorId: string | null; tirosAPuerta: number; psxgMedio: number };

/** Tipo de lanzamiento de un tiro. `origen` viene del PUESTO del jugador (no
 * de la posición real del tiro), de ahí que el xG pre-tiro sea aproximado. */
export function tipoLanzamiento(e: EventosRow): TipoLanzamiento {
  if (e.es_penalti) return "7m";
  switch (e.origen) {
    case "ext_izq":
    case "ext_der":
      return "extremo";
    case "pivote":
      return "pivote";
    case "lat_izq":
    case "lat_der":
    case "central":
    case "9m":
      return "exterior";
    case "contragolpe":
      return "contragolpe";
    default:
      return "desconocido";
  }
}

/** Estimador Beta-Binomial: (a + k·p0) / (n + k). Con pocos tiros manda la
 * referencia p0; con muchos, la tasa observada (spec §4.2). */
export function estimarTasa(aciertos: number, intentos: number, p0: number, k: number = K_PRIOR): number {
  return (aciertos + k * p0) / (intentos + k);
}

function vacio(): ResumenXg {
  return { tiros: 0, goles: 0, xg: 0, golesMenosXg: 0 };
}

function sumar(r: ResumenXg, gol: boolean, xg: number): void {
  r.tiros++;
  if (gol) r.goles++;
  r.xg += xg;
  r.golesMenosXg = r.goles - r.xg;
}

/** Modelo de xG pre-tiro a partir del histórico de tiros PROPIOS (el llamante
 * excluye el partido analizado). */
export function modeloXgPreTiro(historico: EventosRow[]): ModeloXg {
  const modelo = {} as ModeloXg;
  for (const tipo of TIPOS_LANZAMIENTO) {
    const tiros = historico.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && tipoLanzamiento(e) === tipo);
    const goles = tiros.filter((e) => e.resultado === "gol").length;
    modelo[tipo] = estimarTasa(goles, tiros.length, XG_REFERENCIA[tipo]);
  }
  return modelo;
}

export function xgPartido(eventos: EventosRow[], modelo: ModeloXg) {
  const total = vacio();
  const juegoAbierto = vacio();
  const sieteMetros = vacio();
  const porTipo = Object.fromEntries(TIPOS_LANZAMIENTO.map((t) => [t, vacio()])) as Record<TipoLanzamiento, ResumenXg>;
  const porJugadorMapa = new Map<string | null, ResumenXg>();
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.equipo_origen !== "propio") continue;
    const tipo = tipoLanzamiento(e);
    const xg = modelo[tipo];
    const gol = e.resultado === "gol";
    sumar(total, gol, xg);
    sumar(tipo === "7m" ? sieteMetros : juegoAbierto, gol, xg);
    sumar(porTipo[tipo], gol, xg);
    if (!porJugadorMapa.has(e.jugador_id)) porJugadorMapa.set(e.jugador_id, vacio());
    sumar(porJugadorMapa.get(e.jugador_id)!, gol, xg);
  }
  const porJugador = [...porJugadorMapa.entries()].map(([jugadorId, r]) => ({ jugadorId, ...r }));
  return { total, juegoAbierto, sieteMetros, porTipo, porJugador };
}

function esAPuertaJuegoAbierto(e: EventosRow): boolean {
  return e.tipo === "tiro" && !e.es_penalti && e.zona !== null && (e.resultado === "gol" || e.resultado === "parado");
}

/** Probabilidad de gol de un tiro A PUERTA según la zona a la que va (PSxG),
 * solo juego abierto. `tirosAPuerta`: histórico del equipo correspondiente
 * (rival para goles evitados, propio para colocación), sin el partido. */
export function modeloPsxg(tirosAPuerta: EventosRow[]): ModeloPsxg {
  const validos = tirosAPuerta.filter(esAPuertaJuegoAbierto);
  const goles = validos.filter((e) => e.resultado === "gol").length;
  const base = validos.length >= PSXG_MIN_MUESTRA ? goles / validos.length : PSXG_BASE_DEFECTO;
  const porZona: Record<number, number> = {};
  for (let z = 1; z <= 9; z++) {
    const enZona = validos.filter((e) => e.zona === z);
    porZona[z] = estimarTasa(enZona.filter((e) => e.resultado === "gol").length, enZona.length, base);
  }
  return { porZona, base, muestra: validos.length };
}

export function psxgDeTiro(e: EventosRow, modelo: ModeloPsxg): number | null {
  return esAPuertaJuegoAbierto(e) ? modelo.porZona[e.zona!] : null;
}

/** Goles evitados por portero = Σ PSxG de los tiros a puerta que recibió −
 * goles encajados (juego abierto). Positivo: paró más de lo que le tocaba por
 * dónde le tiraron. Los 7m se cuentan aparte. */
export function golesEvitados(eventos: EventosRow[], modeloRival: ModeloPsxg): PorteroEvitados[] {
  const mapa = new Map<string | null, PorteroEvitados>();
  const de = (id: string | null) => {
    if (!mapa.has(id)) mapa.set(id, { porteroId: id, tirosAPuerta: 0, goles: 0, psxg: 0, evitados: 0, sieteRecibidos: 0, sieteParados: 0 });
    return mapa.get(id)!;
  };
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.equipo_origen !== "rival") continue;
    if (e.es_penalti && (e.resultado === "gol" || e.resultado === "parado")) {
      const p = de(e.jugador_id);
      p.sieteRecibidos++;
      if (e.resultado === "parado") p.sieteParados++;
      continue;
    }
    const psxg = psxgDeTiro(e, modeloRival);
    if (psxg === null) continue;
    const p = de(e.jugador_id);
    p.tirosAPuerta++;
    p.psxg += psxg;
    if (e.resultado === "gol") p.goles++;
    p.evitados = p.psxg - p.goles;
  }
  return [...mapa.values()];
}

/** Dificultad para el portero de los tiros a puerta de cada jugador propio
 * (media de PSxG con el modelo de tiros propios). Más alto = mejor colocados. */
export function dificultadColocacion(eventos: EventosRow[], modeloPropio: ModeloPsxg): Colocacion[] {
  const mapa = new Map<string | null, { n: number; suma: number }>();
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.equipo_origen !== "propio") continue;
    const psxg = psxgDeTiro(e, modeloPropio);
    if (psxg === null) continue;
    const acc = mapa.get(e.jugador_id) ?? { n: 0, suma: 0 };
    acc.n++;
    acc.suma += psxg;
    mapa.set(e.jugador_id, acc);
  }
  return [...mapa.entries()].map(([jugadorId, { n, suma }]) => ({ jugadorId, tirosAPuerta: n, psxgMedio: suma / n }));
}
