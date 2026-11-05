import { describe, expect, it } from "vitest";
import { conSin, enPistaEn, formaciones, intervalosEnPista, plusMinus } from "./pista";
import { ev, tiro, toque } from "./fixtures";

const TOTAL = 3600;

describe("intervalosEnPista", () => {
  it("titular hasta su salida, sustituto desde su entrada hasta el final", () => {
    const jsonb = [toque("entra_pista", "a", null), toque("sale_pista", "a", 600), toque("entra_pista", "b", 600)];
    const m = intervalosEnPista(jsonb, [], TOTAL);
    expect(m.get("a")).toEqual([{ inicio: 0, fin: 600 }]);
    expect(m.get("b")).toEqual([{ inicio: 600, fin: TOTAL }]);
  });
  it("resta su exclusión de 2' del tiempo en pista", () => {
    const jsonb = [toque("entra_pista", "a", null)];
    const exclusion = ev({ tipo: "exclusion", resultado: null, jugador_id: "a", segundo: 1000 });
    expect(intervalosEnPista(jsonb, [exclusion], TOTAL).get("a")).toEqual([
      { inicio: 0, fin: 1000 },
      { inicio: 1120, fin: TOTAL },
    ]);
  });
  it("sustituto de exclusión (entrada fechada al final de la exclusión) no está en pista antes", () => {
    const jsonb = [toque("entra_pista", "b", 1120, { cubre_exclusion: "x" })];
    expect(intervalosEnPista(jsonb, [], TOTAL).get("b")).toEqual([{ inicio: 1120, fin: TOTAL }]);
  });
  it("doble entrada sin salida conserva la primera entrada", () => {
    const jsonb = [toque("entra_pista", "a", 100), toque("entra_pista", "a", 500)];
    expect(intervalosEnPista(jsonb, [], TOTAL).get("a")).toEqual([{ inicio: 100, fin: TOTAL }]);
  });
  it("secuencia en vivo de exclusión: el sustituto entra al cumplirse el hueco", () => {
    const jsonb = [
      toque("entra_pista", "x", null),
      toque("sale_pista", "x", 1000),
      toque("entra_pista", "b", 1120, { cubre_exclusion: "e1" }),
    ];
    const exclusion = ev({ id: "e1", tipo: "exclusion", resultado: null, jugador_id: "x", segundo: 1000 });
    const m = intervalosEnPista(jsonb, [exclusion], TOTAL);
    expect(m.get("x")).toEqual([{ inicio: 0, fin: 1000 }]);
    expect(m.get("b")).toEqual([{ inicio: 1120, fin: TOTAL }]);
  });
  it("sustituto reemplazado antes de entrar no tiene intervalo", () => {
    const jsonb = [toque("entra_pista", "b", 1120, { cubre_exclusion: "e1" }), toque("sale_pista", "b", 1120)];
    expect((intervalosEnPista(jsonb, [], TOTAL).get("b") ?? []).length).toBe(0);
  });
});

describe("plusMinus y formaciones", () => {
  const jsonb = [
    toque("entra_pista", "a", null), toque("entra_pista", "b", null),
    toque("sale_pista", "a", 1800), toque("entra_pista", "c", 1800),
  ];
  const eventos = [
    tiro("propio", "gol", { segundo: 100 }), tiro("propio", "gol", { segundo: 200 }), tiro("rival", "gol", { segundo: 300 }),
    tiro("rival", "gol", { segundo: 2000 }), tiro("rival", "gol", { segundo: 2100 }),
  ];
  const ints = intervalosEnPista(jsonb, eventos, TOTAL);
  it("enPistaEn devuelve quién está en pista en cada instante", () => {
    expect(enPistaEn(ints, 0)).toEqual(["a", "b"]);
    expect(enPistaEn(ints, 1800)).toEqual(["b", "c"]);
  });
  it("+/− por jugador y normalizado a 30'", () => {
    const pm = plusMinus(eventos, ints);
    expect(pm.find((p) => p.jugadorId === "a")).toEqual({ jugadorId: "a", segundos: 1800, golesFavor: 2, golesContra: 1, masMenos: 1, por30: 1 });
    expect(pm.find((p) => p.jugadorId === "b")).toMatchObject({ masMenos: -1, segundos: 3600, por30: -0.5 });
    expect(pm.find((p) => p.jugadorId === "c")).toMatchObject({ masMenos: -2 });
  });
  it("formaciones con sus segundos y diferencial (≥ 300 s)", () => {
    expect(formaciones(eventos, ints, TOTAL)).toEqual([
      { jugadores: ["a", "b"], segundos: 1800, golesFavor: 2, golesContra: 1, diferencial: 1 },
      { jugadores: ["b", "c"], segundos: 1800, golesFavor: 0, golesContra: 2, diferencial: -2 },
    ]);
  });
  it("invariante: Σ goles por formaciones (sin filtro de minutos) = marcador", () => {
    const todas = formaciones(eventos, ints, TOTAL, 0);
    expect(todas.reduce((s, f) => s + f.golesFavor, 0)).toBe(2);
    expect(todas.reduce((s, f) => s + f.golesContra, 0)).toBe(3);
  });
});

describe("conSin", () => {
  it("no disponible con menos de 10 posesiones en algún lado", () => {
    const jsonb = [toque("entra_pista", "a", null)];
    const r = conSin([tiro("propio", "gol", { segundo: 10 })], intervalosEnPista(jsonb, [], TOTAL), "a");
    expect(r.disponible).toBe(false);
  });
  it("diferencial por posesión con y sin el jugador", () => {
    const jsonb = [toque("entra_pista", "a", null), toque("sale_pista", "a", 1800)];
    const ints = intervalosEnPista(jsonb, [], TOTAL);
    const conA = [
      ...Array.from({ length: 10 }, (_, i) => tiro("propio", i < 6 ? "gol" : "parado", { segundo: 10 + i })),
      ...Array.from({ length: 10 }, (_, i) => tiro("rival", i < 4 ? "gol" : "parado", { segundo: 100 + i })),
    ];
    const sinA = [
      ...Array.from({ length: 10 }, (_, i) => tiro("propio", i < 4 ? "gol" : "parado", { segundo: 2000 + i })),
      ...Array.from({ length: 10 }, (_, i) => tiro("rival", i < 6 ? "gol" : "parado", { segundo: 2100 + i })),
    ];
    const r = conSin([...conA, ...sinA], ints, "a");
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    expect(r.valor.con).toBeCloseTo(0.6 - 0.4);
    expect(r.valor.sin).toBeCloseTo(0.4 - 0.6);
    expect(r.valor.diferencia).toBeCloseTo(0.4);
    expect(r.valor).toMatchObject({ posesionesCon: 20, posesionesSin: 20 });
  });
});
