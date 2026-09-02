import { describe, expect, it } from "vitest";
import { generarInsights, cortePorMediana, dividirPorCorte, insightsEjecucion, insightsTendencia, insightsZona } from "./insights";
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

describe("insightsEjecucion", () => {
  it("no genera nada por debajo del mínimo de intentos", () => {
    const tiros = Array.from({ length: 7 }, () => tiro({ resultado: "fuera", zona: null }));
    expect(insightsEjecucion(tiros)).toEqual([]);
  });

  it("no genera nada si el % de fuera+poste no llega al umbral", () => {
    const tiros = [
      ...Array.from({ length: 9 }, () => tiro({ resultado: "gol", zona: 5 })),
      tiro({ resultado: "fuera", zona: 5 }),
    ];
    expect(insightsEjecucion(tiros)).toEqual([]);
  });

  it("genera el insight cuando fuera+poste supera el 25% con muestra suficiente", () => {
    const tiros = [
      ...Array.from({ length: 5 }, () => tiro({ resultado: "gol", zona: 5 })),
      ...Array.from({ length: 4 }, () => tiro({ resultado: "fuera", zona: 5 })),
      tiro({ resultado: "poste", zona: 5 }),
    ];
    const insights = insightsEjecucion(tiros);
    expect(insights).toHaveLength(1);
    expect(insights[0].texto).toBe(
      "5 de cada 10 tiros se van fuera o al poste — más fallo propio que del portero rival.",
    );
    expect(insights[0].categoria).toBe("ejecucion");
  });
});

describe("cortePorMediana", () => {
  it("devuelve null sin tiros", () => {
    expect(cortePorMediana([])).toBeNull();
  });

  it("devuelve el creado_en mediano de los eventos de tipo tiro, ignorando otros tipos", () => {
    const eventos: EventosRow[] = [
      tiro({ resultado: "gol", zona: 1, creado_en: "2026-01-01T00:00:00.000Z" }),
      tiro({ resultado: "gol", zona: 1, creado_en: "2026-01-01T00:01:00.000Z" }),
      tiro({ resultado: "gol", zona: 1, creado_en: "2026-01-01T00:02:00.000Z" }),
      tiro({ resultado: "gol", zona: 1, creado_en: "2026-01-01T00:03:00.000Z" }),
      tiro({ resultado: "gol", zona: 1, creado_en: "2026-01-01T00:04:00.000Z" }),
      { ...tiro({ resultado: null, zona: null }), tipo: "perdida", creado_en: "2026-01-01T00:10:00.000Z" },
    ];
    expect(cortePorMediana(eventos)).toBe("2026-01-01T00:02:00.000Z");
  });
});

describe("dividirPorCorte", () => {
  it("divide en antes/después del corte (inclusive en el segundo tramo)", () => {
    const antes = tiro({ resultado: "gol", zona: 1, creado_en: "2026-01-01T00:00:00.000Z" });
    const enElCorte = tiro({ resultado: "gol", zona: 1, creado_en: "2026-01-01T00:02:00.000Z" });
    const despues = tiro({ resultado: "gol", zona: 1, creado_en: "2026-01-01T00:04:00.000Z" });
    const [periodoA, periodoB] = dividirPorCorte([antes, enElCorte, despues], "2026-01-01T00:02:00.000Z");
    expect(periodoA).toEqual([antes]);
    expect(periodoB).toEqual([enElCorte, despues]);
  });
});

describe("insightsTendencia", () => {
  it("no genera nada si algún periodo no llega al mínimo de intentos", () => {
    const periodoA = Array.from({ length: 4 }, () => tiro({ resultado: "gol", zona: 1 }));
    const periodoB = Array.from({ length: 5 }, () => tiro({ resultado: "gol", zona: 1 }));
    expect(insightsTendencia(periodoA, periodoB, { a: "la 1ª parte", b: "la 2ª parte" }, { etiquetaAcierto: "goles" })).toEqual([]);
  });

  it("genera el insight con 'solo' cuando el periodo B empeora", () => {
    const periodoA = [
      ...Array.from({ length: 4 }, () => tiro({ resultado: "gol", zona: 1 })),
      tiro({ resultado: "fuera", zona: 1 }),
    ];
    const periodoB = [
      tiro({ resultado: "gol", zona: 1 }),
      ...Array.from({ length: 4 }, () => tiro({ resultado: "fuera", zona: 1 })),
    ];
    const insights = insightsTendencia(periodoA, periodoB, { a: "de la 1ª parte", b: "la 2ª parte" }, { etiquetaAcierto: "goles" });
    expect(insights).toHaveLength(1);
    expect(insights[0].texto).toBe(
      "En la 2ª parte solo hemos metido el 20% (1/5), frente al 80% (4/5) de la 1ª parte.",
    );
    expect(insights[0].categoria).toBe("tendencia");
  });

  it("genera el insight sin 'solo' cuando el periodo B mejora", () => {
    const periodoA = [
      tiro({ resultado: "parado", zona: 1, equipo_origen: "rival" }),
      ...Array.from({ length: 4 }, () => tiro({ resultado: "gol", zona: 1, equipo_origen: "rival" })),
    ];
    const periodoB = [
      ...Array.from({ length: 4 }, () => tiro({ resultado: "parado", zona: 1, equipo_origen: "rival" })),
      tiro({ resultado: "gol", zona: 1, equipo_origen: "rival" }),
    ];
    const insights = insightsTendencia(
      periodoA,
      periodoB,
      { a: "del resto de la temporada", b: "los últimos 3 partidos" },
      { etiquetaAcierto: "paradas" },
    );
    expect(insights).toHaveLength(1);
    expect(insights[0].texto).toBe(
      "En los últimos 3 partidos hemos parado el 80% (4/5), frente al 20% (1/5) del resto de la temporada.",
    );
  });
});

describe("generarInsights", () => {
  it("combina categorías y recorta al top 4 por score descendente", () => {
    // Zona: fila "abajo" al 100% (5/5) vs 50% del resto (score alto).
    const zonaPropioJuego = [
      ...Array.from({ length: 5 }, () => tiro({ resultado: "gol", zona: 8 })),
      ...Array.from({ length: 4 }, () => tiro({ resultado: "gol", zona: 1 })),
      ...Array.from({ length: 4 }, () => tiro({ resultado: "fuera", zona: 1 })),
      ...Array.from({ length: 2 }, () => tiro({ resultado: "gol", zona: 5 })),
    ];
    // Ejecución: 6/10 fuera+poste (score medio).
    const ejecucionPropioJuego = [
      ...Array.from({ length: 4 }, () => tiro({ resultado: "gol", zona: 5 })),
      ...Array.from({ length: 6 }, () => tiro({ resultado: "fuera", zona: 5 })),
    ];
    const insights = generarInsights({
      zonaPropioJuego,
      zonaPropioPenalti: [],
      zonaRivalJuego: [],
      zonaRivalPenalti: [],
      ejecucionPropioJuego,
      contextoAusencia: "en el partido",
    });
    expect(insights.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1].score).toBeGreaterThanOrEqual(insights[i].score);
    }
    expect(insights.some((i) => i.categoria === "zona")).toBe(true);
    expect(insights.some((i) => i.categoria === "ejecucion")).toBe(true);
  });

  it("incluye insights de tendencia (propio y rival) cuando se pasa `tendencia`", () => {
    const periodoA = [
      ...Array.from({ length: 4 }, () => tiro({ resultado: "gol", zona: 1 })),
      tiro({ resultado: "fuera", zona: 1 }),
    ];
    const periodoB = [
      tiro({ resultado: "gol", zona: 1 }),
      ...Array.from({ length: 4 }, () => tiro({ resultado: "fuera", zona: 1 })),
    ];
    const insights = generarInsights({
      zonaPropioJuego: [],
      zonaPropioPenalti: [],
      zonaRivalJuego: [],
      zonaRivalPenalti: [],
      ejecucionPropioJuego: [],
      contextoAusencia: "en el partido",
      tendencia: {
        propio: [periodoA, periodoB],
        rival: [[], []],
        etiquetas: { a: "la 1ª parte", b: "la 2ª parte" },
      },
    });
    expect(insights.some((i) => i.categoria === "tendencia")).toBe(true);
  });

  it("sin ninguna entrada con datos suficientes, devuelve un array vacío", () => {
    const insights = generarInsights({
      zonaPropioJuego: [],
      zonaPropioPenalti: [],
      zonaRivalJuego: [],
      zonaRivalPenalti: [],
      ejecucionPropioJuego: [],
      contextoAusencia: "en el partido",
    });
    expect(insights).toEqual([]);
  });
});
