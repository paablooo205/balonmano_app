import { describe, expect, it } from "vitest";
import { calidadDatos, esMinutoFiable } from "./calidad";
import { ev, partidoFixture, tiro, toque } from "./fixtures";

describe("esMinutoFiable", () => {
  it("falso si no hay ningún evento en la 2ª parte (reloj dejado en la 1ª)", () => {
    expect(esMinutoFiable([ev({ minuto: 5 }), ev({ minuto: 28 })], 30)).toBe(false);
  });
  it("falso si la 2ª parte se apuntó entera en el mismo minuto", () => {
    const evs = Array.from({ length: 12 }, () => ev({ minuto: 31 }));
    expect(esMinutoFiable([ev({ minuto: 3 }), ...evs], 30)).toBe(false);
  });
  it("verdadero con minutos repartidos en ambas partes", () => {
    const evs = Array.from({ length: 20 }, (_, i) => ev({ minuto: 1 + i * 3 }));
    expect(esMinutoFiable(evs, 30)).toBe(true);
  });
  it("falso sin minutos", () => {
    expect(esMinutoFiable([ev()], 30)).toBe(false);
  });
});

describe("calidadDatos", () => {
  it("partido antiguo sin segundo, sin pista ni captura ampliada", () => {
    const p = partidoFixture({ fecha: "2026-10-01" });
    const c = calidadDatos(p, [tiro("propio", "gol", { minuto: 3 }), tiro("rival", "parado", { minuto: 40 })]);
    expect(c).toEqual({
      tieneSegundo: false,
      tienePista: false,
      tieneTirosRivalFuera: false,
      tieneExclusionesRival: false,
      tieneTiemposMuertos: false,
      minutoFiable: true,
    });
  });
  it("partido nuevo con segundo y pista", () => {
    const p = partidoFixture({ fecha: "2026-11-10", estadisticas: { eventos: [toque("entra_pista", "a", null)] } });
    const evs = Array.from({ length: 10 }, (_, i) => tiro("propio", "gol", { segundo: i * 100, minuto: Math.floor(i * 100 / 60) + 1 }));
    const c = calidadDatos(p, evs);
    expect(c.tieneSegundo).toBe(true);
    expect(c.tienePista).toBe(true);
    expect(c.tieneTirosRivalFuera).toBe(true); // por fecha >= FECHA_CAPTURA_AMPLIADA
  });
  it("tieneSegundo exige al menos el 90 %", () => {
    const evs = [...Array.from({ length: 8 }, () => ev({ segundo: 10 })), ev(), ev()];
    expect(calidadDatos(partidoFixture(), evs).tieneSegundo).toBe(false);
  });
});
