import { describe, expect, it } from "vitest";
import {
  cambiarParte,
  exclusionesActivas,
  marcadorNumerico,
  minutoActual,
  minutosJugados,
  pausar,
  resultadoPartido,
  segundoActual,
} from "./partidoStats";
import { normalizarEventos } from "./eventos";
import type { CronometroPartido, EventoPartido, EventosRow, PartidosRow } from "@/types/database";

function evento(overrides: Partial<EventosRow>): EventosRow {
  return {
    id: crypto.randomUUID(),
    equipo_id: "equipo-1",
    partido_id: "partido-1",
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
    creado_en: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const partido = { resultado: "25-20" } as PartidosRow;

describe("resultadoPartido / marcadorNumerico", () => {
  it("un partido con eventos pero sin goles usa el resultado escrito a mano, no un 0-0", () => {
    const soloTarjeta = [evento({ tipo: "tarjeta", resultado: null, color_tarjeta: "amarilla" })];
    expect(resultadoPartido(partido, soloTarjeta)).toBe("victoria");
    expect(marcadorNumerico(partido, soloTarjeta)).toEqual({ favor: 25, contra: 20 });
  });

  it("con goles en vivo, mandan los eventos", () => {
    const eventos = [evento({}), evento({ equipo_origen: "rival" }), evento({ equipo_origen: "rival" })];
    expect(resultadoPartido(partido, eventos)).toBe("derrota");
    expect(marcadorNumerico(partido, eventos)).toEqual({ favor: 1, contra: 2 });
  });
});

describe("cronómetro", () => {
  const corriendoDesdeHaceHoras = (parte: 1 | 2): CronometroPartido => ({
    parte,
    segundosAcumulados: 0,
    corriendo: true,
    ultimaMarca: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  });

  it("minutoActual se acota al final de la parte en curso", () => {
    expect(minutoActual(corriendoDesdeHaceHoras(1), 30)).toBe(30);
    expect(minutoActual(corriendoDesdeHaceHoras(2), 30)).toBe(60);
  });

  it("2ª parte en pausa a 0 → minuto 31", () => {
    expect(minutoActual({ parte: 2, segundosAcumulados: 0, corriendo: false, ultimaMarca: null }, 30)).toBe(31);
  });

  it("pausar con duración acota lo acumulado", () => {
    expect(pausar(corriendoDesdeHaceHoras(2), 30).segundosAcumulados).toBe(1800);
  });

  it("cambiarParte solo avanza: en la 2ª no vuelve a la 1ª ni resetea", () => {
    const segunda: CronometroPartido = { parte: 2, segundosAcumulados: 600, corriendo: false, ultimaMarca: null };
    expect(cambiarParte(segunda)).toBe(segunda);
    expect(cambiarParte({ parte: 1, segundosAcumulados: 1800, corriendo: false, ultimaMarca: null }).parte).toBe(2);
  });
});

describe("minutosJugados", () => {
  const toque = (tipo: "entra_pista" | "sale_pista", minuto: number | null): EventoPartido => ({
    id: crypto.randomUUID(),
    tipo,
    jugador_id: "j1",
    minuto,
    creado_en: "2026-01-01T00:00:00.000Z",
  });

  it("una salida sin entrada previa se toma como titular (desde el minuto 0)", () => {
    expect(minutosJugados([toque("sale_pista", 20)], "j1", 60)).toBe(20);
  });

  it("una entrada sin salida cuenta hasta el minuto en curso en vivo, o hasta el final", () => {
    expect(minutosJugados([toque("entra_pista", 10)], "j1", 50, 15)).toBe(5);
    expect(minutosJugados([toque("entra_pista", 10)], "j1", 50)).toBe(40);
  });
});

describe("normalizarEventos", () => {
  it("un tiro con origen 7m se lee como penalti sin tocar el resto", () => {
    const [siete, normal] = normalizarEventos([evento({ origen: "7m" }), evento({ origen: "central" })]);
    expect(siete.es_penalti).toBe(true);
    expect(normal.es_penalti).toBe(false);
  });
});

describe("exclusiones con segundo exacto", () => {
  const exclusion = (jugador_id: string, segundo: number | null) =>
    evento({ tipo: "exclusion", resultado: null, jugador_id, segundo });

  it("segundoActual cuenta en reloj de partido y se acota al final de la parte", () => {
    expect(segundoActual({ parte: 2, segundosAcumulados: 65, corriendo: false, ultimaMarca: null }, 30)).toBe(1865);
    expect(segundoActual({ parte: 1, segundosAcumulados: 0, corriendo: false, ultimaMarca: null }, 30)).toBeNull();
  });

  it("cuenta atrás de 2' desde el segundo de la exclusión; las antiguas sin segundo no cuentan", () => {
    const eventos = [exclusion("j1", 1000), exclusion("j2", 1080), exclusion("j3", null)];
    const activas = exclusionesActivas(eventos, 1100);
    expect(activas.map((x) => [x.jugadorId, x.restante, x.finSegundo])).toEqual([
      ["j1", 20, 1120],
      ["j2", 100, 1200],
    ]);
    expect(exclusionesActivas(eventos, 1120).map((x) => x.jugadorId)).toEqual(["j2"]);
  });

  it("una exclusión al final de la 1ª parte sigue corriendo en la 2ª", () => {
    expect(exclusionesActivas([exclusion("j1", 1750)], 1800 + 30)[0].restante).toBe(40);
  });
});
