import { describe, expect, it } from "vitest";
import { referencia } from "./referencias";

describe("referencia", () => {
  it("sin partidos, el valor fijo", () => {
    expect(referencia([], 0.55)).toEqual({ valor: 0.55, n: 0, mezclada: true });
  });
  it("con menos de 3 partidos, mezcla (n·media + 3·fijo)/(n + 3)", () => {
    // n=1, media 0,7 → (0,7 + 1,65)/4 = 0,5875
    expect(referencia([0.7, null, undefined], 0.55).valor).toBeCloseTo(0.5875);
  });
  it("con 3 o más, la media propia", () => {
    expect(referencia([0.4, 0.5, 0.6], 0.55)).toEqual({ valor: 0.5, n: 3, mezclada: false });
  });
});
