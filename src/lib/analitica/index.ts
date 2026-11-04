import { normalizarEventos } from "@/lib/partidoStats";
import type { EventosRow, PartidosRow } from "@/types/database";
import { calidadDatos } from "./calidad";
import { REFERENCIA_FIJA } from "./constantes";
import { descomponer, ETIQUETAS_FACTOR, titular, type Descomposicion, type Factor } from "./factores";
import { resumirNumericas, type ResumenNumericas } from "./numericas";
import { conSin, formaciones, intervalosEnPista, plusMinus, type ConSin, type Formacion, type PlusMinus } from "./pista";
import { resumirPosesiones, type ResumenPosesiones } from "./posesiones";
import { efectoTiemposMuertos, parciales, sequias, type EfectoTiempoMuerto, type Parcial, type Sequia } from "./rachas";
import { referencia, type Referencia } from "./referencias";
import { disponible, noDisponible, type CalidadDatos, type Metrica } from "./tipos";
import {
  dificultadColocacion, golesEvitados, modeloPsxg, modeloXgPreTiro, xgPartido,
  type Colocacion, type ModeloPsxg, type ModeloXg, type PorteroEvitados,
} from "./xg";

export * from "./tipos";
export type { ResumenPosesiones } from "./posesiones";
export type { ResumenXg, TipoLanzamiento, PorteroEvitados, Colocacion } from "./xg";
export type { PlusMinus, ConSin, Formacion } from "./pista";
export type { ResumenNumericas, EstadoNumerico, ResumenEstado } from "./numericas";
export type { Parcial, Sequia, EfectoTiempoMuerto, Contexto } from "./rachas";
export type { Referencia } from "./referencias";
export type { Factor, Descomposicion, ClaveFactor } from "./factores";

export type ContextoTemporada = { partidos: PartidosRow[]; eventosPorPartido: Map<string, EventosRow[]> };

export type AnalisisPartido = {
  calidad: CalidadDatos;
  posesiones: ResumenPosesiones;
  xg: ReturnType<typeof xgPartido>;
  porteros: PorteroEvitados[];
  colocacion: Colocacion[];
  pista: Metrica<{ plusMinus: PlusMinus[]; formaciones: Formacion[]; conSin: Map<string, Metrica<ConSin>> }>;
  numericas: Metrica<ResumenNumericas>;
  parciales: Parcial[];
  sequias: Sequia[];
  tiemposMuertos: EfectoTiempoMuerto[];
  referencias: {
    eficienciaAtaque: Referencia;
    eficienciaDefensa: Referencia;
    diferencial: Referencia;
    ritmo: Referencia;
    pctPerdidas: Referencia;
    golesMenosXgJuego: Referencia;
    golesMenosXg7m: Referencia;
    golesEvitados: Referencia;
    diferencialGoles: Referencia;
  };
  factores: Descomposicion;
  titular: string;
};

const valorDe = (m: Metrica<number>): number | null => (m.disponible ? m.valor : null);

type Modelos = { xg: ModeloXg; psxgRival: ModeloPsxg; psxgPropio: ModeloPsxg };

/** Métricas "base" de un partido con modelos dados: las que sirven tanto para
 * el partido analizado como para las referencias de los demás. */
function metricasBase(partido: PartidosRow, eventos: EventosRow[], modelos: Modelos) {
  const calidad = calidadDatos(partido, eventos);
  const posesiones = resumirPosesiones(eventos, partido.duracion_parte_min, calidad);
  const xg = xgPartido(eventos, modelos.xg);
  const porteros = golesEvitados(eventos, modelos.psxgRival);
  const evitados = porteros.reduce((s, p) => s + p.evitados, 0);
  const tirosAPuertaRival = porteros.reduce((s, p) => s + p.tirosAPuerta, 0);
  return { calidad, posesiones, xg, porteros, evitados, tirosAPuertaRival };
}

/** Análisis completo de un partido (spec §7). `contexto` = partidos y eventos
 * del equipo; el partido analizado se excluye de modelos y referencias. */
export function analizarPartido(partido: PartidosRow, eventosPartido: EventosRow[], contexto: ContextoTemporada): AnalisisPartido {
  const eventos = normalizarEventos(eventosPartido);
  const otros = contexto.partidos.filter((p) => p.id !== partido.id);
  const eventosOtros = otros.map((p) => ({ partido: p, eventos: normalizarEventos(contexto.eventosPorPartido.get(p.id) ?? []) }));
  const todosOtros = eventosOtros.flatMap((x) => x.eventos);
  const modelos: Modelos = {
    xg: modeloXgPreTiro(todosOtros),
    psxgRival: modeloPsxg(todosOtros.filter((e) => e.equipo_origen === "rival")),
    psxgPropio: modeloPsxg(todosOtros.filter((e) => e.equipo_origen === "propio")),
  };

  const base = metricasBase(partido, eventos, modelos);
  const { calidad, posesiones, xg, porteros } = base;
  const duracionTotalSeg = partido.duracion_parte_min * 2 * 60;
  const jsonb = partido.estadisticas.eventos ?? [];

  const pista: AnalisisPartido["pista"] =
    calidad.tienePista && calidad.tieneSegundo
      ? (() => {
          const intervalos = intervalosEnPista(jsonb, eventos, duracionTotalSeg);
          return disponible({
            plusMinus: plusMinus(eventos, intervalos),
            formaciones: formaciones(eventos, intervalos, duracionTotalSeg),
            conSin: new Map([...intervalos.keys()].map((id) => [id, conSin(eventos, intervalos, id)])),
          });
        })()
      : noDisponible(calidad.tienePista ? "Este partido no tiene el segundo exacto de cada acción" : "En este partido no se registraron los cambios");

  const numericas = resumirNumericas(eventos, duracionTotalSeg, calidad);
  const conTiempo = calidad.tieneSegundo;

  // Referencias: los mismos cálculos sobre los demás partidos (con los mismos modelos).
  const otrosBase = eventosOtros.filter((x) => x.eventos.length > 0).map((x) => metricasBase(x.partido, x.eventos, modelos));
  const referencias: AnalisisPartido["referencias"] = {
    eficienciaAtaque: referencia(otrosBase.map((b) => valorDe(b.posesiones.eficienciaAtaque)), REFERENCIA_FIJA.eficienciaAtaque),
    eficienciaDefensa: referencia(otrosBase.map((b) => valorDe(b.posesiones.eficienciaDefensa)), REFERENCIA_FIJA.eficienciaDefensa),
    diferencial: referencia(otrosBase.map((b) => valorDe(b.posesiones.diferencial)), REFERENCIA_FIJA.eficienciaAtaque - REFERENCIA_FIJA.eficienciaDefensa),
    ritmo: referencia(otrosBase.map((b) => valorDe(b.posesiones.ritmo)), REFERENCIA_FIJA.ritmo),
    pctPerdidas: referencia(otrosBase.map((b) => valorDe(b.posesiones.pctPerdidas)), REFERENCIA_FIJA.pctPerdidas),
    golesMenosXgJuego: referencia(otrosBase.map((b) => (b.xg.juegoAbierto.tiros > 0 ? b.xg.juegoAbierto.golesMenosXg : null)), 0),
    golesMenosXg7m: referencia(otrosBase.map((b) => (b.xg.sieteMetros.tiros > 0 ? b.xg.sieteMetros.golesMenosXg : null)), 0),
    golesEvitados: referencia(otrosBase.map((b) => (b.tirosAPuertaRival > 0 ? b.evitados : null)), 0),
    diferencialGoles: referencia(otrosBase.map((b) => b.posesiones.conteo.golesFavor - b.posesiones.conteo.golesContra), 0),
  };

  const { golesFavor, golesContra, posesionesPropias } = posesiones.conteo;
  const factor = (clave: Factor["clave"], goles: Metrica<number>): Factor => ({ clave, etiqueta: ETIQUETAS_FACTOR[clave], goles });
  const factoresLista: Factor[] = [
    factor("acierto", xg.juegoAbierto.tiros > 0 ? disponible(xg.juegoAbierto.golesMenosXg - referencias.golesMenosXgJuego.valor) : noDisponible("Sin tiros en juego abierto")),
    factor(
      "perdidas",
      posesiones.pctPerdidas.disponible
        ? disponible((referencias.pctPerdidas.valor - posesiones.pctPerdidas.valor) * posesionesPropias * referencias.eficienciaAtaque.valor)
        : noDisponible("Sin posesiones nuestras registradas"),
    ),
    factor("porteria", base.tirosAPuertaRival > 0 ? disponible(base.evitados - referencias.golesEvitados.valor) : noDisponible("Sin tiros a puerta del rival con zona")),
    factor("numericas", numericas.disponible ? disponible(numericas.valor.golesNetosSobreIgualdad) : noDisponible(numericas.motivo)),
    factor("sieteMetros", xg.sieteMetros.tiros > 0 ? disponible(xg.sieteMetros.golesMenosXg - referencias.golesMenosXg7m.valor) : noDisponible("Sin 7 metros")),
  ];
  const factores = descomponer(golesFavor - golesContra, referencias.diferencialGoles.valor, factoresLista);

  return {
    calidad,
    posesiones,
    xg,
    porteros,
    colocacion: dificultadColocacion(eventos, modelos.psxgPropio),
    pista,
    numericas,
    parciales: conTiempo ? parciales(eventos, jsonb, partido.duracion_parte_min) : [],
    sequias: conTiempo ? sequias(eventos, duracionTotalSeg) : [],
    tiemposMuertos: conTiempo ? efectoTiemposMuertos(eventos) : [],
    referencias,
    factores,
    titular: titular(golesFavor, golesContra, factores),
  };
}
