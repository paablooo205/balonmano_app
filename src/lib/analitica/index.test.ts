import { describe, expect, it } from "vitest";
import { analizarPartido } from "./index";
import { SIN_FUERA_RIVAL } from "./posesiones";
import { ev, partidoFixture, tiro, toque } from "./fixtures";

describe("analizarPartido", () => {
  const partido = partidoFixture({
    id: "p1",
    fecha: "2026-11-10",
    estadisticas: { eventos: [toque("entra_pista", "a", null), toque("entra_pista", "po", null)] },
  });
  const eventos = [
    tiro("propio", "gol", { segundo: 60, jugador_id: "a", origen: "pivote", partido_id: "p1" }),
    tiro("propio", "parado", { segundo: 120, jugador_id: "a", origen: "pivote", partido_id: "p1" }),
    tiro("rival", "parado", { segundo: 180, jugador_id: "po", zona: 5, partido_id: "p1" }),
    tiro("rival", "gol", { segundo: 240, jugador_id: "po", zona: 1, partido_id: "p1" }),
    tiro("rival", "fuera", { segundo: 300, jugador_id: "po", partido_id: "p1" }),
    ev({ tipo: "perdida", resultado: null, equipo_origen: "propio", segundo: 360, partido_id: "p1" }),
  ];
  const contexto = { partidos: [partido], eventosPorPartido: new Map([["p1", eventos]]) };
  const a = analizarPartido(partido, eventos, contexto);

  it("calidad, posesiones y marcador coherentes", () => {
    expect(a.calidad.tieneSegundo).toBe(true);
    expect(a.posesiones.conteo).toMatchObject({ posesionesPropias: 3, posesionesRival: 3, golesFavor: 1, golesContra: 1 });
  });
  it("el partido analizado no entra en su propio modelo ni en sus referencias", () => {
    expect(a.referencias.eficienciaAtaque).toEqual({ valor: 0.55, n: 0, mezclada: true });
    expect(a.xg.porTipo.pivote.xg).toBeCloseTo(2 * 0.65);
  });
  it("invariante: referencia + Σ factores + residuo = diferencial real", () => {
    const d = a.factores;
    const suma = d.referencia + d.factores.reduce((s, f) => s + (f.goles.disponible ? f.goles.valor : 0), 0) + d.residuo;
    expect(suma).toBeCloseTo(d.real);
    expect(d.real).toBe(0);
  });
  it("genera un titular", () => {
    expect(a.titular.startsWith("Empatamos 1-1")).toBe(true);
  });
  it("+/− disponible con pista y segundo", () => {
    expect(a.pista.disponible).toBe(true);
  });
});

describe("analizarPartido con más partidos en el contexto", () => {
  const p1 = partidoFixture({ id: "p1", fecha: "2026-11-10" });
  const eventosP1 = [
    tiro("propio", "gol", { segundo: 60, jugador_id: "a", origen: "pivote", partido_id: "p1" }),
    tiro("propio", "parado", { segundo: 120, jugador_id: "a", origen: "pivote", partido_id: "p1" }),
    tiro("rival", "gol", { segundo: 240, jugador_id: "po", zona: 1, partido_id: "p1" }),
  ];
  // p2: igualdad 3480 s (0-600 y 720-3600) con 2 GF de pivote (100, 200) → tasa 2/3480 por s.
  // Inferioridad 600-720 (120 s): 1 GC (610). Superioridad 0 s.
  // Netos sobre igualdad p2 = (0 − 1) − (2/3480)·120 = −1 − 240/3480 ≈ −1.0689655.
  const p2 = partidoFixture({ id: "p2", fecha: "2026-11-11" });
  const eventosP2 = [
    tiro("propio", "gol", { segundo: 100, origen: "pivote", partido_id: "p2" }),
    tiro("propio", "gol", { segundo: 200, origen: "pivote", partido_id: "p2" }),
    ev({ tipo: "exclusion", resultado: null, equipo_origen: "propio", segundo: 600, partido_id: "p2" }),
    tiro("rival", "gol", { segundo: 610, zona: 5, partido_id: "p2" }),
  ];
  // p1 aparece dos veces en el contexto: ninguna de las dos copias debe colarse.
  const contexto = { partidos: [p1, p2, p1], eventosPorPartido: new Map([["p1", eventosP1], ["p2", eventosP2]]) };
  const a = analizarPartido(p1, eventosP1, contexto);

  it("el modelo de xG usa los tiros de p2 (y no los de p1, aunque esté duplicado)", () => {
    // pivote: (2 goles + 20·0.65) / (2 tiros + 20) = 15/22, distinto del prior 0.65.
    // Si p1 se colara: (2 + 1 + 13) / (2 + 2 + 20) = 16/24.
    expect(a.modelos.xg.pivote).toBeCloseTo(15 / 22, 10);
    expect(a.xg.porTipo.pivote.xg).toBeCloseTo(2 * (15 / 22), 10);
  });
  it("factor numéricas = netos del partido − referencia de temporada (mezclada)", () => {
    // Referencia: n = 1 → (1·(−1 − 240/3480) + 3·0) / 4 ≈ −0.2672414.
    const netoP2 = -1 - 240 / 3480;
    expect(a.referencias.golesNetosNumericas.n).toBe(1);
    expect(a.referencias.golesNetosNumericas.valor).toBeCloseTo(netoP2 / 4, 10);
    // p1 sin exclusiones: 0 s en inferioridad/superioridad → netos 0. Factor = 0 − netoP2/4 ≈ +0.2672414.
    const f = a.factores.factores.find((x) => x.clave === "numericas")!;
    expect(f.goles.disponible).toBe(true);
    if (f.goles.disponible) expect(f.goles.valor).toBeCloseTo(-netoP2 / 4, 10);
  });
});

describe("referencia de diferencial de goles", () => {
  it("solo cuenta los partidos con marcador en vivo (algún gol registrado)", () => {
    const p1 = partidoFixture({ id: "p1" });
    const p2 = partidoFixture({ id: "p2" });
    const p3 = partidoFixture({ id: "p3" });
    const evP2 = [tiro("propio", "gol", { segundo: 10, partido_id: "p2" }), tiro("propio", "gol", { segundo: 20, partido_id: "p2" })];
    // p3: solo una pérdida, sin goles → no cuenta como diferencial 0.
    const evP3 = [ev({ tipo: "perdida", resultado: null, equipo_origen: "propio", segundo: 30, partido_id: "p3" })];
    const evP1 = [tiro("propio", "gol", { segundo: 5 })];
    const a = analizarPartido(p1, evP1, { partidos: [p1, p2, p3], eventosPorPartido: new Map([["p1", evP1], ["p2", evP2], ["p3", evP3]]) });
    // Solo p2 (+2): (1·2 + 3·0) / 4 = 0.5.
    expect(a.referencias.diferencialGoles).toEqual({ valor: 0.5, n: 1, mezclada: true });
  });
});

describe("disponibilidad según la calidad de datos", () => {
  it("partido antiguo sin tiros rival fuera: con/sin no disponible para nadie", () => {
    const p = partidoFixture({
      id: "old",
      fecha: "2026-10-01",
      estadisticas: { eventos: [toque("entra_pista", "a", null), toque("entra_pista", "po", null)] },
    });
    const evs = Array.from({ length: 30 }, (_, i) =>
      tiro(i % 2 ? "rival" : "propio", i % 3 ? "parado" : "gol", { segundo: 60 + i * 60, jugador_id: i % 2 ? "po" : "a", partido_id: "old" }),
    );
    const a = analizarPartido(p, evs, { partidos: [p], eventosPorPartido: new Map([["old", evs]]) });
    expect(a.calidad.tieneTirosRivalFuera).toBe(false);
    expect(a.pista.disponible).toBe(true);
    if (!a.pista.disponible) return;
    expect(a.pista.valor.conSin.size).toBe(2);
    for (const m of a.pista.valor.conSin.values()) {
      expect(m).toEqual({ disponible: false, motivo: SIN_FUERA_RIVAL });
    }
  });
  it("sin segundo exacto: parciales, sequías y tiempos muertos no disponibles", () => {
    const p = partidoFixture({ id: "ns" });
    const evs = [tiro("propio", "gol", { minuto: 3, partido_id: "ns" }), tiro("rival", "gol", { minuto: 40, partido_id: "ns" })];
    const a = analizarPartido(p, evs, { partidos: [p], eventosPorPartido: new Map([["ns", evs]]) });
    const motivo = "Este partido no tiene el segundo exacto de cada acción";
    expect(a.parciales).toEqual({ disponible: false, motivo });
    expect(a.sequias).toEqual({ disponible: false, motivo });
    expect(a.tiemposMuertos).toEqual({ disponible: false, motivo });
  });
  it("partido antiguo con segundo pero sin tiempos muertos registrados: solo los tiempos muertos faltan", () => {
    const p = partidoFixture({ id: "tm", fecha: "2026-10-01" });
    const evs = [tiro("propio", "gol", { segundo: 10, partido_id: "tm" }), tiro("rival", "gol", { segundo: 900, partido_id: "tm" })];
    const a = analizarPartido(p, evs, { partidos: [p], eventosPorPartido: new Map([["tm", evs]]) });
    expect(a.parciales.disponible).toBe(true);
    expect(a.sequias.disponible).toBe(true);
    expect(a.tiemposMuertos).toEqual({ disponible: false, motivo: "En este partido no se registraban los tiempos muertos" });
  });
});
