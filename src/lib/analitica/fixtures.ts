/** Constructores de datos para los tests del motor. Solo se importa desde
 * `*.test.ts`. */
import type { EquipoOrigenEvento, EventoPartido, EventosRow, PartidosRow, ResultadoTiro } from "@/types/database";

let contador = 0;

export function ev(overrides: Partial<EventosRow> = {}): EventosRow {
  contador++;
  return {
    id: `ev-${contador}`,
    equipo_id: "equipo-1",
    partido_id: "p1",
    sesion_id: null,
    jugador_id: null,
    equipo_origen: "propio",
    tipo: "tiro",
    resultado: "gol",
    zona: null,
    origen: null,
    es_penalti: false,
    color_tarjeta: null,
    minuto: null,
    segundo: null,
    creado_en: new Date(Date.UTC(2026, 0, 1, 0, 0, contador)).toISOString(),
    ...overrides,
  };
}

export function tiro(equipo: EquipoOrigenEvento, resultado: ResultadoTiro, overrides: Partial<EventosRow> = {}): EventosRow {
  return ev({ tipo: "tiro", equipo_origen: equipo, resultado, ...overrides });
}

export function partidoFixture(overrides: Partial<PartidosRow> = {}): PartidosRow {
  return {
    id: "p1",
    equipo_id: "equipo-1",
    fecha: "2026-11-10",
    rival: "Rival",
    resultado: null,
    duracion_parte_min: 30,
    estadisticas: { eventos: [] },
    ...overrides,
  } as PartidosRow;
}

export function toque(
  tipo: "entra_pista" | "sale_pista",
  jugadorId: string,
  segundo: number | null,
  overrides: Partial<EventoPartido> = {},
): EventoPartido {
  contador++;
  return {
    id: `t-${contador}`,
    tipo,
    jugador_id: jugadorId,
    minuto: segundo === null ? null : Math.floor(segundo / 60) + 1,
    segundo,
    creado_en: new Date(Date.UTC(2026, 0, 1, 0, 0, contador)).toISOString(),
    ...overrides,
  };
}
