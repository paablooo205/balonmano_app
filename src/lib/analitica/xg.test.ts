import { describe, expect, it } from "vitest";
import {
  dificultadColocacion, estimarTasa, golesEvitados, modeloPsxg, modeloXgPreTiro, psxgDeTiro, tipoLanzamiento, xgPartido,
} from "./xg";
import { tiro } from "./fixtures";

describe("tipoLanzamiento", () => {
  it("penalti manda sobre el origen; mapea orígenes a tipos", () => {
    expect(tipoLanzamiento(tiro("propio", "gol", { es_penalti: true, origen: "central" }))).toBe("7m");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "ext_izq" }))).toBe("extremo");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "ext_der" }))).toBe("extremo");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "pivote" }))).toBe("pivote");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "lat_der" }))).toBe("exterior");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "9m" }))).toBe("exterior");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "contragolpe" }))).toBe("contragolpe");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: null }))).toBe("desconocido");
  });
});

describe("estimarTasa (Beta-Binomial)", () => {
  it("sin datos devuelve la referencia; con muchos, se acerca a la tasa observada", () => {
    expect(estimarTasa(0, 0, 0.5)).toBe(0.5);
    // (8 + 20·0,5) / (10 + 20) = 18/30 = 0,6
    expect(estimarTasa(8, 10, 0.5)).toBeCloseTo(0.6);
    expect(estimarTasa(800, 1000, 0.5)).toBeCloseTo((800 + 10) / 1020);
  });
});

describe("modeloXgPreTiro + xgPartido", () => {
  const historico = [
    ...Array.from({ length: 10 }, (_, i) => tiro("propio", i < 6 ? "gol" : "parado", { origen: "ext_izq" })),
    tiro("rival", "gol", { origen: "ext_izq" }), // los del rival no entran en el modelo propio
  ];
  const modelo = modeloXgPreTiro(historico);
  it("estima cada tipo con su referencia", () => {
    // extremo: (6 + 20·0,5) / (10 + 20) = 16/30
    expect(modelo.extremo).toBeCloseTo(16 / 30);
    expect(modelo.pivote).toBe(0.65);
    expect(modelo["7m"]).toBe(0.75);
  });
  it("suma xG y goles − xG por jugador, separando juego abierto y 7m", () => {
    const partido = [
      tiro("propio", "gol", { origen: "pivote", jugador_id: "a" }),
      tiro("propio", "fuera", { origen: "pivote", jugador_id: "a" }),
      tiro("propio", "gol", { es_penalti: true, jugador_id: "b" }),
      tiro("rival", "gol"),
    ];
    const r = xgPartido(partido, modelo);
    expect(r.total.tiros).toBe(3);
    expect(r.total.xg).toBeCloseTo(0.65 + 0.65 + 0.75);
    expect(r.juegoAbierto.golesMenosXg).toBeCloseTo(1 - 1.3);
    expect(r.sieteMetros.golesMenosXg).toBeCloseTo(0.25);
    const a = r.porJugador.find((j) => j.jugadorId === "a")!;
    expect(a).toMatchObject({ tiros: 2, goles: 1 });
    expect(a.xg).toBeCloseTo(1.3);
  });
});

describe("PSxG y goles evitados", () => {
  // Histórico rival a puerta: zona 1 → 2 de 10 goles; zona 5 → 9 de 10.
  const historicoRival = [
    ...Array.from({ length: 10 }, (_, i) => tiro("rival", i < 2 ? "gol" : "parado", { zona: 1 })),
    ...Array.from({ length: 10 }, (_, i) => tiro("rival", i < 9 ? "gol" : "parado", { zona: 5 })),
    tiro("rival", "fuera"), // fuera: sin zona, no entra
    tiro("rival", "gol", { zona: 5, es_penalti: true }), // 7m: no entra
  ];
  const modelo = modeloPsxg(historicoRival);
  it("base por defecto si hay menos de 30 tiros a puerta", () => {
    expect(modelo.muestra).toBe(20);
    expect(modelo.base).toBe(0.65);
    expect(modelo.porZona[1]).toBeCloseTo((2 + 20 * 0.65) / 30);
    expect(modelo.porZona[5]).toBeCloseTo((9 + 20 * 0.65) / 30);
    expect(modelo.porZona[9]).toBe(0.65);
  });
  it("psxgDeTiro es null para fuera, 7m o sin zona", () => {
    expect(psxgDeTiro(tiro("rival", "fuera"), modelo)).toBeNull();
    expect(psxgDeTiro(tiro("rival", "gol", { zona: 5, es_penalti: true }), modelo)).toBeNull();
    expect(psxgDeTiro(tiro("rival", "gol", { zona: null }), modelo)).toBeNull();
  });
  it("goles evitados = Σ PSxG − goles encajados, por portero; 7m aparte", () => {
    const partido = [
      tiro("rival", "parado", { zona: 5, jugador_id: "po1" }),
      tiro("rival", "parado", { zona: 5, jugador_id: "po1" }),
      tiro("rival", "gol", { zona: 1, jugador_id: "po1" }),
      tiro("rival", "fuera", { jugador_id: "po1" }),
      tiro("rival", "parado", { es_penalti: true, zona: 2, jugador_id: "po1" }),
    ];
    const [po1] = golesEvitados(partido, modelo);
    const esperado = 2 * modelo.porZona[5] + modelo.porZona[1];
    expect(po1.porteroId).toBe("po1");
    expect(po1.tirosAPuerta).toBe(3);
    expect(po1.goles).toBe(1);
    expect(po1.psxg).toBeCloseTo(esperado);
    expect(po1.evitados).toBeCloseTo(esperado - 1);
    expect(po1).toMatchObject({ sieteRecibidos: 1, sieteParados: 1 });
  });
  it("colocación: media de PSxG de los tiros propios a puerta", () => {
    const modeloPropio = modeloPsxg([]);
    const r = dificultadColocacion([tiro("propio", "gol", { zona: 3, jugador_id: "a" }), tiro("propio", "fuera", { jugador_id: "a" })], modeloPropio);
    expect(r).toEqual([{ jugadorId: "a", tirosAPuerta: 1, psxgMedio: 0.65 }]);
  });
});
