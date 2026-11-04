import { describe, expect, it } from "vitest";
import { contarPosesiones, esCierrePosesion, resumirPosesiones } from "./posesiones";
import { ev, tiro } from "./fixtures";
import type { CalidadDatos } from "./tipos";

const calidadCompleta: CalidadDatos = {
  tieneSegundo: true, tienePista: true, tieneTirosRivalFuera: true,
  tieneExclusionesRival: true, tieneTiemposMuertos: true, minutoFiable: true,
};

// 10 posesiones nuestras: 6 tiros (4 goles, 1 de ellos 7m) + 4 pérdidas.
// 10 posesiones del rival: 8 tiros (5 goles, 2 paradas, 1 fuera) + 2 robos nuestros.
const partido = [
  tiro("propio", "gol"), tiro("propio", "gol"), tiro("propio", "gol"),
  tiro("propio", "gol", { es_penalti: true }), tiro("propio", "parado"), tiro("propio", "fuera"),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }),
  ...Array.from({ length: 5 }, () => tiro("rival", "gol")),
  tiro("rival", "parado"), tiro("rival", "parado"), tiro("rival", "fuera"),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "rival" }),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "rival", jugador_id: null }),
  ev({ tipo: "exclusion", resultado: null }), // no cierra posesión
  ev({ tipo: "tiempo_muerto", resultado: null }), // no cierra posesión
];

describe("contarPosesiones", () => {
  it("cuenta tiros + pérdidas para cada equipo", () => {
    expect(contarPosesiones(partido)).toEqual({
      tirosPropios: 6, perdidasPropias: 4, posesionesPropias: 10, golesFavor: 4,
      tirosRival: 8, robos: 2, posesionesRival: 10, golesContra: 5,
    });
  });
});

describe("esCierrePosesion", () => {
  it("tiro propio y pérdida propia cierran nuestra posesión; tiro rival y robo, la del rival", () => {
    expect(esCierrePosesion(tiro("propio", "fuera"))).toBe("propio");
    expect(esCierrePosesion(ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }))).toBe("propio");
    expect(esCierrePosesion(tiro("rival", "gol"))).toBe("rival");
    expect(esCierrePosesion(ev({ tipo: "perdida", resultado: null, equipo_origen: "rival" }))).toBe("rival");
    expect(esCierrePosesion(ev({ tipo: "exclusion", resultado: null }))).toBeNull();
  });
});

describe("resumirPosesiones", () => {
  it("eficiencias, diferencial, ritmo y % pérdidas", () => {
    const r = resumirPosesiones(partido, 30, calidadCompleta);
    expect(r.eficienciaAtaque).toEqual({ disponible: true, valor: 0.4 });
    expect(r.eficienciaDefensa).toEqual({ disponible: true, valor: 0.5 });
    expect(r.diferencial.disponible && r.diferencial.valor).toBeCloseTo(-0.1);
    // (10 + 10) / 2 = 10 posesiones por equipo en 60' → ritmo 10
    expect(r.ritmo).toEqual({ disponible: true, valor: 10 });
    expect(r.pctPerdidas).toEqual({ disponible: true, valor: 0.4 });
  });
  it("sin captura de tiros rival fuera, lo que depende del rival no está disponible", () => {
    const r = resumirPosesiones(partido, 30, { ...calidadCompleta, tieneTirosRivalFuera: false });
    expect(r.eficienciaAtaque.disponible).toBe(true);
    expect(r.eficienciaDefensa.disponible).toBe(false);
    expect(r.diferencial.disponible).toBe(false);
    expect(r.ritmo.disponible).toBe(false);
  });
  it("sin posesiones propias, nada inventado", () => {
    const r = resumirPosesiones([], 30, calidadCompleta);
    expect(r.eficienciaAtaque.disponible).toBe(false);
    expect(r.pctPerdidas.disponible).toBe(false);
  });
});
