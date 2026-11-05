import { segundoDeToque, toquesPista } from "@/lib/partidoStats";
import type { EventoPartido, EventosRow } from "@/types/database";
import { DURACION_EXCLUSION_SEG, MIN_POSESIONES_CON_SIN, MIN_SEG_FORMACION, SEGUNDOS_REFERENCIA_POR30 } from "./constantes";
import { esCierrePosesion } from "./posesiones";
import { disponible, noDisponible, type Metrica } from "./tipos";

export type Intervalo = { inicio: number; fin: number };
export type PlusMinus = { jugadorId: string; segundos: number; golesFavor: number; golesContra: number; masMenos: number; por30: number | null };
export type ConSin = { con: number; sin: number; diferencia: number; posesionesCon: number; posesionesSin: number };
export type Formacion = { jugadores: string[]; segundos: number; golesFavor: number; golesContra: number; diferencial: number };

function restar(intervalos: Intervalo[], quitar: Intervalo): Intervalo[] {
  const fuera: Intervalo[] = [];
  for (const i of intervalos) {
    if (quitar.fin <= i.inicio || quitar.inicio >= i.fin) {
      fuera.push(i);
      continue;
    }
    if (quitar.inicio > i.inicio) fuera.push({ inicio: i.inicio, fin: quitar.inicio });
    if (quitar.fin < i.fin) fuera.push({ inicio: quitar.fin, fin: i.fin });
  }
  return fuera;
}

/** Intervalos `[inicio, fin)` en segundos de partido en que cada jugador está
 * jugando: de sus entradas/salidas (mismo emparejamiento que `tiempoDePista`:
 * entrada sin hora = 0; primera salida sin entrada = titular) MENOS sus
 * exclusiones de 2' (un excluido no juega aunque siga "en pista" en el
 * registro). Sustitutos de exclusión: su entrada ya viene fechada al final. */
export function intervalosEnPista(eventosJsonb: EventoPartido[], eventos: EventosRow[], duracionTotalSeg: number): Map<string, Intervalo[]> {
  const porJugador = new Map<string, EventoPartido[]>();
  for (const e of toquesPista(eventosJsonb)) {
    if (!e.jugador_id) continue;
    if (!porJugador.has(e.jugador_id)) porJugador.set(e.jugador_id, []);
    porJugador.get(e.jugador_id)!.push(e);
  }
  const resultado = new Map<string, Intervalo[]>();
  for (const [jugadorId, toques] of porJugador) {
    let intervalos: Intervalo[] = [];
    let entrada: number | null = toques[0]?.tipo === "sale_pista" ? 0 : null;
    for (const e of toques) {
      const t = segundoDeToque(e);
      if (e.tipo === "entra_pista") {
        if (entrada === null) entrada = t ?? 0;
      } else if (entrada !== null) {
        intervalos.push({ inicio: entrada, fin: t ?? entrada });
        entrada = null;
      }
    }
    if (entrada !== null) intervalos.push({ inicio: entrada, fin: duracionTotalSeg });
    for (const x of eventos) {
      if (x.tipo === "exclusion" && x.equipo_origen === "propio" && x.jugador_id === jugadorId && x.segundo != null) {
        intervalos = restar(intervalos, { inicio: x.segundo, fin: x.segundo + DURACION_EXCLUSION_SEG });
      }
    }
    intervalos = intervalos
      .map((i) => ({ inicio: Math.max(0, i.inicio), fin: Math.min(duracionTotalSeg, i.fin) }))
      .filter((i) => i.fin > i.inicio);
    resultado.set(jugadorId, intervalos);
  }
  return resultado;
}

function contiene(intervalos: Intervalo[] | undefined, t: number): boolean {
  return !!intervalos?.some((i) => i.inicio <= t && t < i.fin);
}

export function enPistaEn(intervalos: Map<string, Intervalo[]>, t: number): string[] {
  return [...intervalos.entries()].filter(([, ints]) => contiene(ints, t)).map(([id]) => id).sort();
}

function golesConSegundo(eventos: EventosRow[]) {
  return eventos.filter((e) => e.tipo === "tiro" && e.resultado === "gol" && e.segundo != null);
}

export function plusMinus(eventos: EventosRow[], intervalos: Map<string, Intervalo[]>): PlusMinus[] {
  const goles = golesConSegundo(eventos);
  return [...intervalos.entries()].map(([jugadorId, ints]) => {
    const segundos = ints.reduce((s, i) => s + (i.fin - i.inicio), 0);
    let golesFavor = 0;
    let golesContra = 0;
    for (const g of goles) {
      if (!contiene(ints, g.segundo!)) continue;
      if (g.equipo_origen === "propio") golesFavor++;
      else golesContra++;
    }
    const masMenos = golesFavor - golesContra;
    return { jugadorId, segundos, golesFavor, golesContra, masMenos, por30: segundos > 0 ? (masMenos * SEGUNDOS_REFERENCIA_POR30) / segundos : null };
  });
}

/** Diferencial por posesión (goles/posesión propia − goles/posesión rival)
 * con el jugador jugando frente a sin él. Exige ≥ 10 posesiones (de ambos
 * equipos) a cada lado y al menos una de cada equipo. */
export function conSin(eventos: EventosRow[], intervalos: Map<string, Intervalo[]>, jugadorId: string): Metrica<ConSin> {
  const ints = intervalos.get(jugadorId);
  const lado = () => ({ pp: 0, gf: 0, pr: 0, gc: 0 });
  const con = lado();
  const sin = lado();
  for (const e of eventos) {
    const equipo = esCierrePosesion(e);
    if (equipo === null || e.segundo == null) continue;
    const l = contiene(ints, e.segundo) ? con : sin;
    if (equipo === "propio") {
      l.pp++;
      if (e.tipo === "tiro" && e.resultado === "gol") l.gf++;
    } else {
      l.pr++;
      if (e.tipo === "tiro" && e.resultado === "gol") l.gc++;
    }
  }
  const valido = (l: ReturnType<typeof lado>) => l.pp + l.pr >= MIN_POSESIONES_CON_SIN && l.pp > 0 && l.pr > 0;
  if (!valido(con) || !valido(sin)) return noDisponible("Menos de 10 posesiones con o sin el jugador");
  const dif = (l: ReturnType<typeof lado>) => l.gf / l.pp - l.gc / l.pr;
  return disponible({
    con: dif(con),
    sin: dif(sin),
    diferencia: dif(con) - dif(sin),
    posesionesCon: con.pp + con.pr,
    posesionesSin: sin.pp + sin.pr,
  });
}

/** Formaciones (quiénes juegan a la vez) con su tiempo y goles; por defecto
 * solo las de ≥ 300 s, ordenadas por tiempo. */
export function formaciones(
  eventos: EventosRow[],
  intervalos: Map<string, Intervalo[]>,
  duracionTotalSeg: number,
  minSegundos: number = MIN_SEG_FORMACION,
): Formacion[] {
  const cortes = new Set<number>([0, duracionTotalSeg]);
  for (const ints of intervalos.values()) {
    for (const i of ints) {
      cortes.add(i.inicio);
      cortes.add(i.fin);
    }
  }
  const puntos = [...cortes].filter((t) => t >= 0 && t <= duracionTotalSeg).sort((a, b) => a - b);
  const goles = golesConSegundo(eventos);
  const acumulado = new Map<string, Formacion>();
  for (let k = 0; k < puntos.length - 1; k++) {
    const a = puntos[k];
    const b = puntos[k + 1];
    const jugadores = enPistaEn(intervalos, a);
    if (jugadores.length === 0) continue;
    const clave = jugadores.join(",");
    const f = acumulado.get(clave) ?? { jugadores, segundos: 0, golesFavor: 0, golesContra: 0, diferencial: 0 };
    f.segundos += b - a;
    for (const g of goles) {
      if (g.segundo! < a || g.segundo! >= b) continue;
      if (g.equipo_origen === "propio") f.golesFavor++;
      else f.golesContra++;
    }
    f.diferencial = f.golesFavor - f.golesContra;
    acumulado.set(clave, f);
  }
  return [...acumulado.values()].filter((f) => f.segundos >= minSegundos).sort((x, y) => y.segundos - x.segundos);
}
