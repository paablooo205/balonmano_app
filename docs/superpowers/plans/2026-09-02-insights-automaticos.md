# Insights automáticos en las fichas técnicas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar automáticamente frases en español ("Por abajo metemos el 71%...") en las tres fichas técnicas (partido, jugador de temporada, rival) que señalen los patrones de zona/ejecución/tendencia más accionables para reajustar estrategia de tiro y de portero.

**Architecture:** Un motor de insights puro en `src/lib/insights.ts` (sin React ni Supabase) alimentado con los mismos arrays de `EventosRow` que cada página ya calcula; un componente de presentación `InsightsCard` reutilizado en las tres páginas, montado arriba del todo de cada ficha.

**Tech Stack:** TypeScript puro para el motor; React para `InsightsCard`; Vitest (nuevo, solo para este módulo) para los tests unitarios del motor.

**Spec:** `docs/superpowers/specs/2026-09-02-insights-automaticos-design.md`

## Global Constraints

- Todo en español (CLAUDE.md) — todos los textos generados y la UI en español.
- `card-surface` claro, tipografía Barlow Condensed para cifras (`stat-number`)/Archivo para cuerpo, un único acento rojo (`var(--color-accent)`) — nada de codificar categoría de insight por color.
- Sin nueva migración ni escritura en Supabase: todo se deriva en el cliente.
- Umbrales fijos en código (no configurables por el usuario): `MIN_TIROS_GRUPO_ZONA = 5`, `MIN_TOTAL_AUSENCIA = 10`, `DEVIACION_MINIMA_ZONA = 20` (puntos porcentuales), `MIN_TIROS_EJECUCION = 8`, `PCT_FALLO_NO_FORZADO_MINIMO = 25`, `MIN_INTENTOS_TENDENCIA = 5`, `DEVIACION_MINIMA_TENDENCIA = 20`.
- Máximo 4 insights mostrados, ordenados por `score` descendente.
- Juego abierto y 7 metros nunca se mezclan en el mismo cálculo de %.

---

### Task 1: Motor de insights — tipos, agrupación de zonas, `insightsZona`, y arranque de Vitest

**Files:**
- Create: `src/lib/insights.ts`
- Create: `src/lib/insights.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (añadir `vitest` a `devDependencies` y el script `test`)

**Interfaces:**
- Produces: `type CategoriaInsight = "zona" | "ejecucion" | "tendencia"`; `type Insight = { texto: string; score: number; categoria: CategoriaInsight }`; `type EtiquetaAcierto = "goles" | "paradas"`; `function insightsZona(tiros: EventosRow[], opts: { etiquetaAcierto: EtiquetaAcierto; contextoAusencia: string }): Insight[]`.

- [ ] **Step 1: Instalar Vitest**

Run: `npm install --save-dev vitest`

- [ ] **Step 2: Añadir el script de test a `package.json`**

En la sección `"scripts"` de `package.json`, junto a `"lint": "eslint ."`, añade:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Escribir el test que falla — umbral, deviación y ausencia de `insightsZona`**

Crea `src/lib/insights.test.ts`:

```ts
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
```

- [ ] **Step 5: Ejecutar el test y comprobar que falla**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: FAIL — `insights.ts` no existe todavía (`Cannot find module './insights'`).

- [ ] **Step 6: Implementar `src/lib/insights.ts`**

```ts
import type { EventosRow } from "@/types/database";

export type CategoriaInsight = "zona" | "ejecucion" | "tendencia";
export type EtiquetaAcierto = "goles" | "paradas";

export type Insight = {
  texto: string;
  score: number;
  categoria: CategoriaInsight;
};

const FILAS: Record<string, number[]> = {
  arriba: [1, 2, 3],
  medio: [4, 5, 6],
  abajo: [7, 8, 9],
};

const COLUMNAS: Record<string, number[]> = {
  izquierda: [1, 4, 7],
  centro: [2, 5, 8],
  derecha: [3, 6, 9],
};

const VERBO_PRESENTE: Record<EtiquetaAcierto, string> = { goles: "metemos", paradas: "paramos" };
const PARTICIPIO: Record<EtiquetaAcierto, string> = { goles: "metido", paradas: "parado" };
const ACCION_AUSENCIA: Record<EtiquetaAcierto, string> = { goles: "tirado", paradas: "recibido tiros" };

const MIN_TIROS_GRUPO_ZONA = 5;
const MIN_TOTAL_AUSENCIA = 10;
const DEVIACION_MINIMA_ZONA = 20;
const SCORE_AUSENCIA = 15;

function esAcierto(e: EventosRow, etiqueta: EtiquetaAcierto): boolean {
  return etiqueta === "goles" ? e.resultado === "gol" : e.resultado === "parado";
}

function pctAcierto(tiros: EventosRow[], etiqueta: EtiquetaAcierto): { pct: number; aciertos: number; intentos: number } | null {
  if (tiros.length === 0) return null;
  const aciertos = tiros.filter((e) => esAcierto(e, etiqueta)).length;
  return { pct: Math.round((aciertos / tiros.length) * 100), aciertos, intentos: tiros.length };
}

function insightsPorAgrupacion(
  tiros: EventosRow[],
  grupos: Record<string, number[]>,
  opts: { etiquetaAcierto: EtiquetaAcierto; contextoAusencia: string },
): Insight[] {
  const insights: Insight[] = [];
  const total = tiros.length;
  for (const [nombreGrupo, zonas] of Object.entries(grupos)) {
    const tirosGrupo = tiros.filter((e) => e.zona !== null && zonas.includes(e.zona));
    const tirosResto = tiros.filter((e) => e.zona !== null && !zonas.includes(e.zona));

    if (tirosGrupo.length === 0) {
      if (total >= MIN_TOTAL_AUSENCIA) {
        insights.push({
          texto: `No hemos ${ACCION_AUSENCIA[opts.etiquetaAcierto]} nada por ${nombreGrupo} ${opts.contextoAusencia}.`,
          score: SCORE_AUSENCIA,
          categoria: "zona",
        });
      }
      continue;
    }

    if (tirosGrupo.length < MIN_TIROS_GRUPO_ZONA || tirosResto.length < MIN_TIROS_GRUPO_ZONA) continue;

    const detGrupo = pctAcierto(tirosGrupo, opts.etiquetaAcierto)!;
    const detResto = pctAcierto(tirosResto, opts.etiquetaAcierto)!;
    const deviacion = detGrupo.pct - detResto.pct;
    if (Math.abs(deviacion) < DEVIACION_MINIMA_ZONA) continue;

    const comparativo = deviacion > 0 ? "muy por encima" : "muy por debajo";
    insights.push({
      texto: `Por ${nombreGrupo} ${VERBO_PRESENTE[opts.etiquetaAcierto]} el ${detGrupo.pct}% (${detGrupo.aciertos}/${detGrupo.intentos}), ${comparativo} del ${detResto.pct}% del resto de zonas.`,
      score: Math.abs(deviacion) * Math.log2(detGrupo.intentos),
      categoria: "zona",
    });
  }
  return insights;
}

/** `tiros` debe venir ya filtrado por el llamante a un contexto homogéneo
 * (propio o rival, juego abierto o 7m — nunca mezclados). "Acierto" es gol
 * si `etiquetaAcierto` es "goles", parada si es "paradas". */
export function insightsZona(
  tiros: EventosRow[],
  opts: { etiquetaAcierto: EtiquetaAcierto; contextoAusencia: string },
): Insight[] {
  return [
    ...insightsPorAgrupacion(tiros, FILAS, opts),
    ...insightsPorAgrupacion(tiros, COLUMNAS, opts),
  ];
}
```

- [ ] **Step 7: Ejecutar el test y comprobar que pasa**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Verificar que el resto del proyecto sigue compilando**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat: motor de insights — instala Vitest y añade insightsZona (patrón por fila/columna)"
```

---

### Task 2: `insightsEjecucion` (fuera/poste en exceso)

**Files:**
- Modify: `src/lib/insights.ts`
- Modify: `src/lib/insights.test.ts`

**Interfaces:**
- Consumes: `type Insight`, `type CategoriaInsight` (Task 1).
- Produces: `function insightsEjecucion(tirosJuegoAbierto: EventosRow[]): Insight[]`.

- [ ] **Step 1: Escribir el test que falla**

Actualiza la línea `import { insightsZona } from "./insights";` de `src/lib/insights.test.ts` (Task 1) para incluir también `insightsEjecucion`:

```ts
import { insightsEjecucion, insightsZona } from "./insights";
```

Y añade al final del archivo:

```ts
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
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: FAIL — `insightsEjecucion` no existe.

- [ ] **Step 3: Implementar `insightsEjecucion`**

Añade a `src/lib/insights.ts`:

```ts
const MIN_TIROS_EJECUCION = 8;
const PCT_FALLO_NO_FORZADO_MINIMO = 25;

/** Solo tiros propios en juego abierto — nunca 7m, un fallo a puerta vacía
 * en 7m no es comparable a un fallo bajo presión defensiva. */
export function insightsEjecucion(tirosJuegoAbierto: EventosRow[]): Insight[] {
  if (tirosJuegoAbierto.length < MIN_TIROS_EJECUCION) return [];
  const falloNoForzado = tirosJuegoAbierto.filter((e) => e.resultado === "fuera" || e.resultado === "poste").length;
  const pct = Math.round((falloNoForzado / tirosJuegoAbierto.length) * 100);
  if (pct < PCT_FALLO_NO_FORZADO_MINIMO) return [];
  return [
    {
      texto: `${falloNoForzado} de cada ${tirosJuegoAbierto.length} tiros se van fuera o al poste — más fallo propio que del portero rival.`,
      score: pct * Math.log2(tirosJuegoAbierto.length),
      categoria: "ejecucion",
    },
  ];
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: PASS (7 tests en total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat: motor de insights — añade insightsEjecucion (exceso de fuera/poste)"
```

---

### Task 3: `cortePorMediana`, `dividirPorCorte` e `insightsTendencia`

**Files:**
- Modify: `src/lib/insights.ts`
- Modify: `src/lib/insights.test.ts`

**Interfaces:**
- Consumes: `type Insight` (Task 1).
- Produces: `function cortePorMediana(eventos: EventosRow[]): string | null`; `function dividirPorCorte(eventos: EventosRow[], corte: string): [EventosRow[], EventosRow[]]`; `function insightsTendencia(periodoA: EventosRow[], periodoB: EventosRow[], etiquetas: { a: string; b: string }, opts: { etiquetaAcierto: EtiquetaAcierto }): Insight[]`.

- [ ] **Step 1: Escribir el test que falla**

Actualiza la línea de import de `"./insights"` en `src/lib/insights.test.ts` para incluir también `cortePorMediana`, `dividirPorCorte` e `insightsTendencia`:

```ts
import { cortePorMediana, dividirPorCorte, insightsEjecucion, insightsTendencia, insightsZona } from "./insights";
```

Y añade al final del archivo:

```ts
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
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: FAIL — `cortePorMediana`/`dividirPorCorte`/`insightsTendencia` no existen.

- [ ] **Step 3: Implementar**

Añade a `src/lib/insights.ts`:

```ts
const MIN_INTENTOS_TENDENCIA = 5;
const DEVIACION_MINIMA_TENDENCIA = 20;

/** Mediana de `creado_en` entre los eventos de tipo "tiro" (propios y
 * rivales) — aproxima "mitad del partido" sin depender de un minuto real
 * por tiro (no existe en `eventos`, solo en el jsonb de sustituciones). */
export function cortePorMediana(eventos: EventosRow[]): string | null {
  const timestamps = eventos
    .filter((e) => e.tipo === "tiro")
    .map((e) => e.creado_en)
    .sort();
  if (timestamps.length === 0) return null;
  return timestamps[Math.floor(timestamps.length / 2)];
}

export function dividirPorCorte(eventos: EventosRow[], corte: string): [EventosRow[], EventosRow[]] {
  return [eventos.filter((e) => e.creado_en < corte), eventos.filter((e) => e.creado_en >= corte)];
}

/** `periodoA` es el periodo de referencia (más antiguo o "resto"),
 * `periodoB` el periodo reciente que se compara contra él — ambos ya
 * filtrados y homogéneos (mismo contexto propio/rival, juego abierto).
 * `etiquetas.a` va después de "frente al X% (n/m) " en la frase, así que
 * debe traer su propia preposición ("de la 1ª parte", "del resto de la
 * temporada" — nunca "el resto de la temporada" a secas, produciría "de
 * el resto..." en vez de "del resto..."). `etiquetas.b` va después de "En "
 * y no necesita preposición ("la 2ª parte", "los últimos 3 partidos"). */
export function insightsTendencia(
  periodoA: EventosRow[],
  periodoB: EventosRow[],
  etiquetas: { a: string; b: string },
  opts: { etiquetaAcierto: EtiquetaAcierto },
): Insight[] {
  if (periodoA.length < MIN_INTENTOS_TENDENCIA || periodoB.length < MIN_INTENTOS_TENDENCIA) return [];
  const detA = pctAcierto(periodoA, opts.etiquetaAcierto)!;
  const detB = pctAcierto(periodoB, opts.etiquetaAcierto)!;
  const deviacion = detB.pct - detA.pct;
  if (Math.abs(deviacion) < DEVIACION_MINIMA_TENDENCIA) return [];
  const prefijo = deviacion < 0 ? "solo " : "";
  return [
    {
      texto: `En ${etiquetas.b} ${prefijo}hemos ${PARTICIPIO[opts.etiquetaAcierto]} el ${detB.pct}% (${detB.aciertos}/${detB.intentos}), frente al ${detA.pct}% (${detA.aciertos}/${detA.intentos}) ${etiquetas.a}.`,
      score: Math.abs(deviacion) * Math.log2(Math.min(detA.intentos, detB.intentos)),
      categoria: "tendencia",
    },
  ];
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: PASS (13 tests en total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat: motor de insights — añade cortePorMediana, dividirPorCorte e insightsTendencia"
```

---

### Task 4: `generarInsights` (combinación y ranking)

**Files:**
- Modify: `src/lib/insights.ts`
- Modify: `src/lib/insights.test.ts`

**Interfaces:**
- Consumes: `insightsZona`, `insightsEjecucion`, `insightsTendencia` (Tasks 1-3).
- Produces: `type EntradasInsights`; `function generarInsights(entradas: EntradasInsights): Insight[]` — punto de entrada único que usan las tres páginas.

- [ ] **Step 1: Escribir el test que falla**

Actualiza la línea de import de `"./insights"` en `src/lib/insights.test.ts` para incluir también `generarInsights`:

```ts
import { generarInsights, cortePorMediana, dividirPorCorte, insightsEjecucion, insightsTendencia, insightsZona } from "./insights";
```

Y añade al final del archivo:

```ts
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
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: FAIL — `generarInsights` no existe.

- [ ] **Step 3: Implementar `generarInsights`**

Añade a `src/lib/insights.ts`:

```ts
export type EntradasInsights = {
  zonaPropioJuego: EventosRow[];
  zonaPropioPenalti: EventosRow[];
  zonaRivalJuego: EventosRow[];
  zonaRivalPenalti: EventosRow[];
  ejecucionPropioJuego: EventosRow[];
  /** Frase que completa "No hemos tirado nada por abajo {contextoAusencia}." — p.ej. "en el partido", "en la temporada", "en los enfrentamientos contra este rival". */
  contextoAusencia: string;
  tendencia?: {
    propio: [EventosRow[], EventosRow[]];
    rival: [EventosRow[], EventosRow[]];
    etiquetas: { a: string; b: string };
  };
};

const MAX_INSIGHTS = 4;

/** Punto de entrada único que usan las tres fichas: recopila todas las
 * categorías aplicables, ordena por `score` descendente y recorta al top 4
 * — sin cuota fija por categoría. */
export function generarInsights(entradas: EntradasInsights): Insight[] {
  const insights: Insight[] = [
    ...insightsZona(entradas.zonaPropioJuego, { etiquetaAcierto: "goles", contextoAusencia: entradas.contextoAusencia }),
    ...insightsZona(entradas.zonaPropioPenalti, { etiquetaAcierto: "goles", contextoAusencia: entradas.contextoAusencia }),
    ...insightsZona(entradas.zonaRivalJuego, { etiquetaAcierto: "paradas", contextoAusencia: entradas.contextoAusencia }),
    ...insightsZona(entradas.zonaRivalPenalti, { etiquetaAcierto: "paradas", contextoAusencia: entradas.contextoAusencia }),
    ...insightsEjecucion(entradas.ejecucionPropioJuego),
  ];
  if (entradas.tendencia) {
    const { propio, rival, etiquetas } = entradas.tendencia;
    insights.push(
      ...insightsTendencia(propio[0], propio[1], etiquetas, { etiquetaAcierto: "goles" }),
      ...insightsTendencia(rival[0], rival[1], etiquetas, { etiquetaAcierto: "paradas" }),
    );
  }
  return insights.sort((a, b) => b.score - a.score).slice(0, MAX_INSIGHTS);
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `npx vitest run src/lib/insights.test.ts`
Expected: PASS (16 tests en total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat: motor de insights — añade generarInsights (combinación y ranking top 4)"
```

---

### Task 5: Componente `InsightsCard`

**Files:**
- Create: `src/components/dashboard/InsightsCard.tsx`

**Interfaces:**
- Consumes: `type Insight` de `@/lib/insights` (Task 1).
- Produces: `function InsightsCard({ insights }: { insights: Insight[] }): JSX.Element | null`.

- [ ] **Step 1: Crear el componente**

```tsx
import type { Insight } from "@/lib/insights";

/**
 * Tarjeta de solo lectura con las frases generadas por `generarInsights` —
 * si no hay ninguna que supere el umbral mínimo de muestra, no se
 * renderiza nada (mismo criterio que el bloque de "Problemas
 * detectados"/"Notas adicionales" en FichaTecnica.tsx: nunca un hueco
 * vacío avisando de que no hay datos).
 */
export function InsightsCard({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="card-surface p-4">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">
        Patrones detectados
      </div>
      <ul className="flex flex-col gap-2.5">
        {insights.map((insight, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
            <span>{insight.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/InsightsCard.tsx
git commit -m "feat: añade InsightsCard, componente de presentación de los insights automáticos"
```

---

### Task 6: Integrar `InsightsCard` en `FichaTecnica.tsx` (ficha de partido)

**Files:**
- Modify: `src/components/partido/FichaTecnica.tsx`

**Interfaces:**
- Consumes: `generarInsights`, `cortePorMediana`, `dividirPorCorte` de `@/lib/insights`; `InsightsCard` de `@/components/dashboard/InsightsCard`.

- [ ] **Step 1: Añadir los imports**

En `src/components/partido/FichaTecnica.tsx`, junto a los imports existentes:

```ts
import { InsightsCard } from "@/components/dashboard/InsightsCard";
import { cortePorMediana, dividirPorCorte, generarInsights } from "@/lib/insights";
```

- [ ] **Step 2: Calcular los insights antes del `return`**

Justo antes de `return (` (después de las líneas `pctJuego`/`pctPenalti` ya existentes), añade:

```ts
  const corte = cortePorMediana(eventos);
  const insights = generarInsights({
    zonaPropioJuego: tirosJuego,
    zonaPropioPenalti: tirosPenalti,
    zonaRivalJuego: tirosRivalJuego,
    zonaRivalPenalti: tirosRivalPenalti,
    ejecucionPropioJuego: tirosJuego,
    contextoAusencia: "en el partido",
    tendencia: corte
      ? {
          propio: dividirPorCorte(tirosJuego, corte),
          rival: dividirPorCorte(tirosRivalJuego, corte),
          etiquetas: { a: "de la 1ª parte", b: "la 2ª parte" },
        }
      : undefined,
  });
```

- [ ] **Step 3: Montar `InsightsCard` arriba del todo**

Cambia el inicio del `return`:

```tsx
  return (
    <div className="flex flex-col gap-4">
      <LineaMarcador eventos={eventos} />
```

por:

```tsx
  return (
    <div className="flex flex-col gap-4">
      <InsightsCard insights={insights} />
      <LineaMarcador eventos={eventos} />
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/components/partido/FichaTecnica.tsx`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/partido/FichaTecnica.tsx
git commit -m "feat: muestra los insights automáticos arriba del todo en la ficha técnica de partido"
```

---

### Task 7: Integrar `InsightsCard` en `JugadorDetailPage.tsx` (ficha de jugador, temporada)

**Files:**
- Modify: `src/pages/JugadorDetailPage.tsx`

**Interfaces:**
- Consumes: `generarInsights` de `@/lib/insights`; `InsightsCard` de `@/components/dashboard/InsightsCard`.

- [ ] **Step 1: Añadir los imports**

En `src/pages/JugadorDetailPage.tsx`, junto a los imports existentes:

```ts
import { InsightsCard } from "@/components/dashboard/InsightsCard";
import { generarInsights } from "@/lib/insights";
```

- [ ] **Step 2: Calcular los insights de temporada**

Después del bloque `const tendenciaEficacia = partidosJugadosOrdenados.map(...)` ya existente, añade:

```ts
  // --- Insights de temporada: últimos 3 partidos vs el resto (solo si hay
  // "resto" con el que comparar de forma justa). ---
  const ultimosPartidos = partidosJugadosOrdenados.slice(-3);
  const restoPartidos = partidosJugadosOrdenados.slice(0, -3);
  const idsUltimos = new Set(ultimosPartidos.map((p) => p.id));
  const idsResto = new Set(restoPartidos.map((p) => p.id));
  const enResto = (e: EventosRow) => e.partido_id !== null && idsResto.has(e.partido_id);
  const enUltimos = (e: EventosRow) => e.partido_id !== null && idsUltimos.has(e.partido_id);

  const insights = generarInsights({
    zonaPropioJuego: tirosJuego,
    zonaPropioPenalti: tirosPenalti,
    zonaRivalJuego: tirosRivalJuego,
    zonaRivalPenalti: tirosRivalPenalti,
    ejecucionPropioJuego: tirosJuego,
    contextoAusencia: "en toda la temporada",
    tendencia:
      restoPartidos.length > 0 && ultimosPartidos.length > 0
        ? {
            propio: [tirosJuego.filter(enResto), tirosJuego.filter(enUltimos)],
            rival: [tirosRivalJuego.filter(enResto), tirosRivalJuego.filter(enUltimos)],
            etiquetas: { a: "del resto de la temporada", b: "los últimos 3 partidos" },
          }
        : undefined,
  });
```

- [ ] **Step 3: Montar `InsightsCard` como primer elemento de la rama "temporada"**

Cambia:

```tsx
        {ambitoValido === "temporada" ? (
          <div className="flex flex-col gap-4">
            <div className="flex gap-4 text-xs text-[var(--color-text-muted)]">
```

por:

```tsx
        {ambitoValido === "temporada" ? (
          <div className="flex flex-col gap-4">
            <InsightsCard insights={insights} />

            <div className="flex gap-4 text-xs text-[var(--color-text-muted)]">
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/pages/JugadorDetailPage.tsx`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/pages/JugadorDetailPage.tsx
git commit -m "feat: muestra los insights automáticos de temporada en la ficha técnica de jugador"
```

---

### Task 8: Integrar `InsightsCard` en `RivalDetailPage.tsx` (ficha de rival, vista agregada)

**Files:**
- Modify: `src/pages/RivalDetailPage.tsx`

**Interfaces:**
- Consumes: `generarInsights` de `@/lib/insights`; `InsightsCard` de `@/components/dashboard/InsightsCard`.

- [ ] **Step 1: Añadir los imports**

En `src/pages/RivalDetailPage.tsx`, junto a los imports existentes:

```ts
import { InsightsCard } from "@/components/dashboard/InsightsCard";
import { generarInsights } from "@/lib/insights";
```

- [ ] **Step 2: Calcular los insights contra este rival**

Después de la línea `const eventosPartidoSeleccionado = ...` ya existente (justo antes del `return`), añade:

```ts
  // --- Insights: últimos 3 enfrentamientos vs el resto, solo contando
  // partidos ya resueltos (mismo criterio que el historial de arriba). ---
  const partidosResueltos = partidosVsRival.filter((p) => resultadoPartido(p, eventosPorPartido.get(p.id) ?? []) !== null);
  const ultimosPartidos = partidosResueltos.slice(-3);
  const restoPartidos = partidosResueltos.slice(0, -3);
  const idsUltimos = new Set(ultimosPartidos.map((p) => p.id));
  const idsResto = new Set(restoPartidos.map((p) => p.id));
  const enResto = (e: EventosRow) => e.partido_id !== null && idsResto.has(e.partido_id);
  const enUltimos = (e: EventosRow) => e.partido_id !== null && idsUltimos.has(e.partido_id);

  const insights = generarInsights({
    zonaPropioJuego: tirosJuego,
    zonaPropioPenalti: tirosPenalti,
    zonaRivalJuego: tirosRivalJuego,
    zonaRivalPenalti: tirosRivalPenalti,
    ejecucionPropioJuego: tirosJuego,
    contextoAusencia: "en los enfrentamientos contra este rival",
    tendencia:
      restoPartidos.length > 0 && ultimosPartidos.length > 0
        ? {
            propio: [tirosJuego.filter(enResto), tirosJuego.filter(enUltimos)],
            rival: [tirosRivalJuego.filter(enResto), tirosRivalJuego.filter(enUltimos)],
            etiquetas: { a: "del resto de enfrentamientos", b: "los últimos 3 enfrentamientos" },
          }
        : undefined,
  });
```

- [ ] **Step 3: Montar `InsightsCard` como primer elemento de la vista "todos"**

Cambia:

```tsx
      {ambitoValido === "todos" ? (
        <div className="flex flex-col gap-4">
          {partidosVsRival.length === 0 ? (
```

por:

```tsx
      {ambitoValido === "todos" ? (
        <div className="flex flex-col gap-4">
          <InsightsCard insights={insights} />

          {partidosVsRival.length === 0 ? (
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/pages/RivalDetailPage.tsx`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/pages/RivalDetailPage.tsx
git commit -m "feat: muestra los insights automáticos contra el rival en su ficha"
```

---

### Task 9: Verificación final, `ui-estetica`, prueba manual

**Files:** ninguno nuevo — comandos + revisión de agente.

- [ ] **Step 1: Typecheck + lint + build + tests completos**

Run: `npx tsc -b --noEmit && npm run lint && npm run build && npm run test`
Expected: los cuatro limpios.

- [ ] **Step 2: Revisión de `ui-estetica`**

Dispatch al agente `ui-estetica` para revisar `InsightsCard.tsx` y su integración en `FichaTecnica.tsx`, `JugadorDetailPage.tsx` y `RivalDetailPage.tsx` frente a CLAUDE.md: tema claro estándar (`card-surface`), un único acento rojo (sin codificar categoría por color), coherencia tipográfica con el resto de eyebrows de sección, y que el bullet de cada frase no rompa en móvil con textos largos. Aplicar los hallazgos reales que encuentre.

- [ ] **Step 3: Prueba manual del usuario**

Pedir al usuario que, con datos reales:
1. Abra la ficha técnica de un partido con bastantes tiros registrados y confirme que los insights que aparecen arriba del todo son coherentes con lo que ve luego en los mapas de calor de abajo (ningún porcentaje inventado).
2. Abra la ficha de un jugador con varios partidos jugados en "Toda la temporada" y confirme lo mismo; confirme que la vista de un partido concreto de ese jugador NO muestra insights (solo el desglose puntual).
3. Abra la ficha de un rival contra el que se haya jugado más de un partido, en "Todos los partidos", y confirme que los insights hablan en los términos correctos (nuestra eficacia y el patrón defensivo del rival, acotados a esos enfrentamientos).
4. Confirme que en un partido/jugador/rival con muy pocos tiros registrados no aparece ninguna tarjeta de insights (en vez de una vacía o con avisos de "faltan datos").

- [ ] **Step 4: Commit final si `ui-estetica` aplicó cambios**

```bash
git add -A
git commit -m "fix: ajustes de ui-estetica sobre los insights automáticos"
```
