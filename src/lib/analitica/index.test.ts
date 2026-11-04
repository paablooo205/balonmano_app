import { describe, expect, it } from "vitest";
import { analizarPartido } from "./index";
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
