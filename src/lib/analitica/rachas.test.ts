import { describe, expect, it } from "vitest";
import { efectoTiemposMuertos, parciales, sequias } from "./rachas";
import { ev, tiro, toque } from "./fixtures";

describe("parciales", () => {
  const goles = [
    tiro("propio", "gol", { segundo: 100 }),
    tiro("rival", "gol", { segundo: 200 }), tiro("rival", "gol", { segundo: 300 }), tiro("rival", "gol", { segundo: 400 }),
    tiro("propio", "gol", { segundo: 500 }),
  ];
  it("detecta 3 o más goles seguidos del mismo equipo", () => {
    const r = parciales(goles, [], 30);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ equipo: "rival", goles: 3, inicioSeg: 200, finSeg: 400 });
  });
  it("anota el contexto: exclusión justo antes y cambio durante", () => {
    const exclusion = ev({ tipo: "exclusion", resultado: null, equipo_origen: "propio", segundo: 170 });
    const cambio = [toque("sale_pista", "a", 250, { grupo: "g" }), toque("entra_pista", "b", 250, { grupo: "g" })];
    const r = parciales([...goles, exclusion], cambio, 30);
    expect(r[0].contexto).toEqual([
      { tipo: "exclusion", equipo: "propio", segundo: 170 },
      { tipo: "cambio", equipo: null, segundo: 250 },
    ]);
  });
  it("marca el descanso si el parcial lo cruza", () => {
    const cruza = [tiro("propio", "gol", { segundo: 1700 }), tiro("propio", "gol", { segundo: 1790 }), tiro("propio", "gol", { segundo: 1850 })];
    expect(parciales(cruza, [], 30)[0].contexto).toEqual([{ tipo: "descanso", equipo: null, segundo: 1800 }]);
  });
});

describe("sequias", () => {
  it("≥ 300 s sin marcar, incluido el inicio y el final", () => {
    const r = sequias([tiro("propio", "gol", { segundo: 400 }), tiro("propio", "gol", { segundo: 500 }), tiro("rival", "gol", { segundo: 3500 })], 3600);
    expect(r).toEqual([
      { equipo: "propio", inicioSeg: 0, finSeg: 400, segundos: 400 },
      { equipo: "propio", inicioSeg: 500, finSeg: 3600, segundos: 3100 },
      { equipo: "rival", inicioSeg: 0, finSeg: 3500, segundos: 3500 },
    ]);
  });
});

describe("efectoTiemposMuertos", () => {
  it("diferencial (nuestro) en los 5' antes y después", () => {
    const evs = [
      tiro("rival", "gol", { segundo: 800 }), tiro("rival", "gol", { segundo: 900 }),
      ev({ tipo: "tiempo_muerto", resultado: null, equipo_origen: "propio", segundo: 1000 }),
      tiro("propio", "gol", { segundo: 1100 }), tiro("propio", "gol", { segundo: 1200 }), tiro("rival", "gol", { segundo: 1250 }),
      tiro("propio", "gol", { segundo: 1400 }), // fuera de la ventana (> 1300)
    ];
    expect(efectoTiemposMuertos(evs)).toEqual([{ equipo: "propio", segundo: 1000, antes: -2, despues: 1 }]);
  });
});
