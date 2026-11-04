import { describe, expect, it } from "vitest";
import { estadoEn, intervalosExclusion, resumirNumericas } from "./numericas";
import { ev, tiro } from "./fixtures";
import type { CalidadDatos } from "./tipos";

const calidad: CalidadDatos = {
  tieneSegundo: true, tienePista: false, tieneTirosRivalFuera: true,
  tieneExclusionesRival: true, tieneTiemposMuertos: true, minutoFiable: true,
};
const TOTAL = 3600;

describe("estados numéricos", () => {
  const evs = [
    ev({ tipo: "exclusion", resultado: null, equipo_origen: "propio", segundo: 600 }),
    ev({ tipo: "exclusion", resultado: null, equipo_origen: "rival", segundo: 660 }),
    ev({ tipo: "tarjeta", resultado: null, color_tarjeta: "roja", equipo_origen: "propio", segundo: 3550 }),
  ];
  const ints = intervalosExclusion(evs, TOTAL);
  it("la roja también deja 2' en inferioridad, recortada al final del partido", () => {
    expect(ints).toEqual([
      { equipo: "propio", inicio: 600, fin: 720 },
      { equipo: "rival", inicio: 660, fin: 780 },
      { equipo: "propio", inicio: 3550, fin: 3600 },
    ]);
  });
  it("estado en cada instante", () => {
    expect(estadoEn(599, ints)).toBe("igualdad");
    expect(estadoEn(630, ints)).toBe("inferioridad");
    expect(estadoEn(700, ints)).toBe("igualdad"); // 1 excluido por equipo
    expect(estadoEn(750, ints)).toBe("superioridad");
  });
});

describe("resumirNumericas", () => {
  // Inferioridad 600-720 (120 s): 0 GF, 2 GC. Resto (3480 s) igualdad: 29 GF, 29 GC → 0/min.
  const evs = [
    ev({ tipo: "exclusion", resultado: null, equipo_origen: "propio", segundo: 600 }),
    tiro("rival", "gol", { segundo: 610 }), tiro("rival", "gol", { segundo: 700 }),
    ...Array.from({ length: 29 }, (_, i) => tiro("propio", "gol", { segundo: 1000 + i * 10 })),
    ...Array.from({ length: 29 }, (_, i) => tiro("rival", "gol", { segundo: 1005 + i * 10 })),
  ];
  it("segundos y goles por estado; invariante: Σ goles = marcador", () => {
    const r = resumirNumericas(evs, TOTAL, calidad);
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    const { porEstado } = r.valor;
    expect(porEstado.inferioridad).toMatchObject({ segundos: 120, golesFavor: 0, golesContra: 2 });
    expect(porEstado.igualdad.segundos).toBe(3480);
    const gf = porEstado.igualdad.golesFavor + porEstado.inferioridad.golesFavor + porEstado.superioridad.golesFavor;
    const gc = porEstado.igualdad.golesContra + porEstado.inferioridad.golesContra + porEstado.superioridad.golesContra;
    expect([gf, gc]).toEqual([29, 31]);
  });
  it("coste por exclusión = (dif/min igualdad − dif/min inferioridad) × 2", () => {
    const r = resumirNumericas(evs, TOTAL, calidad);
    if (!r.disponible) throw new Error("debería estar disponible");
    // igualdad 0/min; inferioridad −2 en 2 min = −1/min → coste (0 − (−1)) × 2 = 2
    expect(r.valor.costePorExclusion.disponible).toBe(true);
    if (r.valor.costePorExclusion.disponible) expect(r.valor.costePorExclusion.valor).toBeCloseTo(2);
    // goles netos sobre lo esperado a ritmo de igualdad: (0 − 2) − 0 × 120 = −2
    expect(r.valor.golesNetosSobreIgualdad).toBeCloseTo(-2);
  });
  it("sin segundo no está disponible; sin exclusiones rival, la superioridad tampoco", () => {
    expect(resumirNumericas(evs, TOTAL, { ...calidad, tieneSegundo: false }).disponible).toBe(false);
    const r = resumirNumericas(evs, TOTAL, { ...calidad, tieneExclusionesRival: false });
    if (!r.disponible) throw new Error("debería estar disponible");
    expect(r.valor.superioridad.disponible).toBe(false);
  });
});
