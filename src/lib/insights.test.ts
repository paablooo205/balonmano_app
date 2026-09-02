import { describe, expect, it } from "vitest";
import { insightsZona } from "./insights";
import type { EventosRow } from "@/types/database";

function tiro(overrides: Partial<EventosRow> & Pick<EventosRow, "resultado" | "zona">): EventosRow {
  return {
    id: "e1",
    equipo_id: "equipo-1",
    partido_id: "partido-1",
    sesion_id: null,
    jugador_id: null,
    equipo_origen: "propio",
    tipo: "tiro",
    origen: null,
    es_penalti: false,
    color_tarjeta: null,
    creado_en: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("insightsZona", () => {
  it("no genera nada por debajo del umbral mínimo de muestra", () => {
    const tiros = [
      tiro({ resultado: "gol", zona: 1 }),
      tiro({ resultado: "gol", zona: 1 }),
      tiro({ resultado: "fuera", zona: 8 }),
      tiro({ resultado: "fuera", zona: 8 }),
    ];
    const insights = insightsZona(tiros, { etiquetaAcierto: "goles", contextoAusencia: "en el partido" });
    expect(insights).toEqual([]);
  });

  it("detecta una desviación fuerte en una fila con muestra suficiente", () => {
    const tiros = [
      ...Array.from({ length: 2 }, () => tiro({ resultado: "gol", zona: 1 })),
      ...Array.from({ length: 2 }, () => tiro({ resultado: "fuera", zona: 2 })),
      ...Array.from({ length: 3 }, () => tiro({ resultado: "gol", zona: 5 })),
      ...Array.from({ length: 3 }, () => tiro({ resultado: "fuera", zona: 5 })),
      ...Array.from({ length: 5 }, () => tiro({ resultado: "gol", zona: 8 })),
    ];
    const insights = insightsZona(tiros, { etiquetaAcierto: "goles", contextoAusencia: "en el partido" });
    const insightAbajo = insights.find((i) => i.texto.startsWith("Por abajo"));
    expect(insightAbajo).toBeDefined();
    expect(insightAbajo!.texto).toBe(
      "Por abajo metemos el 100% (5/5), muy por encima del 50% del resto de zonas.",
    );
    expect(insightAbajo!.categoria).toBe("zona");
  });

  it("genera un insight de ausencia cuando un grupo no recibe ningún tiro con volumen total suficiente", () => {
    const tiros = [
      ...Array.from({ length: 6 }, () => tiro({ resultado: "gol", zona: 1 })),
      ...Array.from({ length: 6 }, () => tiro({ resultado: "gol", zona: 2 })),
    ];
    const insights = insightsZona(tiros, { etiquetaAcierto: "goles", contextoAusencia: "en el partido" });
    expect(insights.some((i) => i.texto === "No hemos tirado nada por abajo en el partido." && i.score === 15)).toBe(true);
  });

  it("usa el vocabulario de portería (paradas/recibido tiros) cuando etiquetaAcierto es 'paradas'", () => {
    const tiros = [
      ...Array.from({ length: 6 }, () => tiro({ resultado: "parado", zona: 1, equipo_origen: "rival" })),
      ...Array.from({ length: 6 }, () => tiro({ resultado: "parado", zona: 2, equipo_origen: "rival" })),
    ];
    const insights = insightsZona(tiros, { etiquetaAcierto: "paradas", contextoAusencia: "en el partido" });
    expect(insights.some((i) => i.texto === "No hemos recibido tiros nada por abajo en el partido.")).toBe(true);
  });
});
