import { describe, expect, it } from "vitest";
import { descomponer, ETIQUETAS_FACTOR, titular, type Factor } from "./factores";

const f = (clave: Factor["clave"], goles: number | null): Factor => ({
  clave,
  etiqueta: ETIQUETAS_FACTOR[clave],
  goles: goles === null ? { disponible: false, motivo: "x" } : { disponible: true, valor: goles },
});

describe("descomponer", () => {
  it("invariante: referencia + Σ factores disponibles + residuo = real", () => {
    const d = descomponer(5, 1, [f("acierto", 1.5), f("perdidas", -0.5), f("porteria", 3.1), f("numericas", null), f("sieteMetros", 0.2)]);
    const suma = d.referencia + d.factores.reduce((s, x) => s + (x.goles.disponible ? x.goles.valor : 0), 0) + d.residuo;
    expect(suma).toBeCloseTo(5);
    expect(d.residuo).toBeCloseTo(5 - 1 - 4.3);
  });
});

describe("titular", () => {
  it("victoria con el factor dominante a favor", () => {
    const d = descomponer(5, 1, [f("porteria", 3.1), f("acierto", 0.4)]);
    expect(titular(29, 24, d)).toBe("Ganamos 29-24 desde la portería: 3,1 goles a favor frente a lo habitual");
  });
  it("victoria pese a un factor dominante en contra", () => {
    const d = descomponer(2, 3, [f("perdidas", -2.4), f("acierto", 1)]);
    expect(titular(25, 23, d)).toBe("Ganamos 25-23 pese a las pérdidas: 2,4 goles en contra frente a lo habitual");
  });
  it("derrota con el factor dominante en contra", () => {
    const d = descomponer(-4, 0, [f("numericas", -2.6)]);
    expect(titular(20, 24, d)).toBe("Perdimos 20-24 en inferioridad: 2,6 goles en contra frente a lo habitual");
  });
  it("sin factor claro (todos < 0,5 o no disponibles)", () => {
    const d = descomponer(0, 0, [f("acierto", 0.3), f("porteria", null)]);
    expect(titular(22, 22, d)).toBe("Empatamos 22-22 sin un factor que destaque");
  });
});
