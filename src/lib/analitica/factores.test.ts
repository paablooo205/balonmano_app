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

describe("titular (wording por factor y signo)", () => {
  it("derrota con portería positiva: pese a una buena portería", () => {
    const d = descomponer(-4, 0, [f("porteria", 2)]);
    expect(titular(20, 24, d)).toBe("Perdimos 20-24 pese a una buena portería: 2,0 goles a favor frente a lo habitual");
  });
  it("victoria con 7 metros positivos: acertando desde los 7 metros", () => {
    const d = descomponer(2, 1, [f("sieteMetros", 1.2)]);
    expect(titular(25, 23, d)).toBe("Ganamos 25-23 acertando desde los 7 metros: 1,2 goles a favor frente a lo habitual");
  });
  it("derrota con 7 metros negativos: por los 7 metros fallados", () => {
    const d = descomponer(-4, -2.8, [f("sieteMetros", -1.2)]);
    expect(titular(20, 24, d)).toBe("Perdimos 20-24 por los 7 metros fallados: 1,2 goles en contra frente a lo habitual");
  });
  it("derrota con numéricas positivas: pese a un buen balance en las situaciones numéricas", () => {
    const d = descomponer(-4, -2.5, [f("numericas", 1.5)]);
    expect(titular(20, 24, d)).toBe("Perdimos 20-24 pese a un buen balance en las situaciones numéricas: 1,5 goles a favor frente a lo habitual");
  });
  it("empate con un factor: lo que más pesó", () => {
    const d = descomponer(0, 0, [f("porteria", 3.1)]);
    expect(titular(22, 22, d)).toBe("Empatamos 22-22; lo que más pesó: portería (3,1 goles a favor frente a lo habitual)");
  });
  it("umbral: un factor de exactamente 0,5 se usa", () => {
    const d = descomponer(2, 1.5, [f("acierto", 0.5)]);
    expect(titular(25, 23, d)).toBe("Ganamos 25-23 con acierto de cara a portería: 0,5 goles a favor frente a lo habitual");
  });
  it("umbral: 0,49 solo no protagoniza el titular", () => {
    const d = descomponer(2, 1.51, [f("acierto", 0.49)]);
    expect(titular(25, 23, d)).toBe("Ganamos 25-23 sin un factor que destaque");
  });
  it("empate en |valor|: gana el primero en el orden de entrada", () => {
    const d = descomponer(0, -1, [f("acierto", 1), f("perdidas", -1)]);
    expect(titular(25, 23, d)).toBe("Ganamos 25-23 con acierto de cara a portería: 1,0 goles a favor frente a lo habitual");
  });
});
