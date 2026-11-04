# Analítica de partido — Fase 1: motor de métricas y captura nueva

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor de métricas puro (`src/lib/analitica/`) y añadir al registro en vivo los cuatro toques nuevos (tiro rival fuera, 2' rival, tiempo muerto, robo sin jugador).

**Architecture:** Funciones puras en TypeScript sobre `EventosRow[]` (tabla `eventos`) y `EventoPartido[]` (jsonb de pista), sin React ni Supabase, cada archivo con su `*.test.ts`. Un punto de entrada `analizarPartido()` devuelve un objeto tipado `AnalisisPartido` que consumirán la ficha (fase 2) y el PDF (fase 3). La captura nueva se añade en `ContadoresEnVivo.tsx` con una migración que solo amplía el check de `eventos.tipo`.

**Tech Stack:** React 19 + Vite + TypeScript, Vitest (`npx vitest run <archivo>`), Supabase (Postgres). Tipos de BD alineados a mano en `src/types/database.ts`.

**Spec:** `docs/superpowers/specs/2026-11-04-analitica-partido-design.md` (leerla entera antes de empezar).

## Global Constraints

- Ningún cambio modifica ni borra filas existentes de la base de datos. Las migraciones solo añaden.
- Tipos TS (`src/types/database.ts`) y migración SQL van en el mismo commit.
- Todo valor que no se pueda calcular se devuelve como `{ disponible: false, motivo }` — nunca 0 ni un número inventado.
- El motor (`src/lib/analitica/`) no importa React, ni `@/lib/supabaseClient`, ni nada de `src/components`.
- Constantes numéricas solo en `src/lib/analitica/constantes.ts`. Valores (copiados de la spec): k=20; xG ref 7m 0,75 · extremo 0,50 · pivote 0,65 · exterior 0,40 · contragolpe 0,80 · desconocido 0,50; PSxG base por defecto 0,65 si n < 30; referencias fijas: eficiencia ataque 0,55 · eficiencia defensa 0,55 · % pérdidas 0,15 · % paradas 0,33 · ritmo 55; mezcla con referencia fija si n < 3 partidos; formaciones ≥ 300 s; con/sin ≥ 10 posesiones por lado; parcial ≥ 3 goles seguidos; sequía ≥ 300 s; ventana de tiempo muerto 300 s; exclusión 120 s; `tieneSegundo` si ≥ 90 % de eventos tienen `segundo`.
- Todo el texto visible en español. Comentarios en español, con la densidad del código existente.
- Tests: `npx vitest run`; tipos: `npx tsc -p tsconfig.app.json --noEmit`; lint: `npx eslint src` (0 errores).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0036_eventos_tiempo_muerto.sql` | Amplía `eventos_tipo_check` con `tiempo_muerto` |
| `src/types/database.ts` | `TipoEvento` + `tiempo_muerto` |
| `src/lib/partidoStats.ts` | Exporta `segundoDeToque`/`toquesPista`; `exclusiones`, `exclusionesActivas` y `porcentajeParadas` acotados a lo que les corresponde; `esTiroRivalAPuerta`; botón "Fuera" rival |
| `src/lib/analitica/tipos.ts` | `Metrica<T>`, `CalidadDatos`, `Equipo` |
| `src/lib/analitica/constantes.ts` | Todas las constantes del motor |
| `src/lib/analitica/calidad.ts` | Flags de calidad por partido |
| `src/lib/analitica/posesiones.ts` | Posesiones, eficiencias, ritmo, % pérdidas |
| `src/lib/analitica/xg.ts` | xG pre-tiro, PSxG, goles evitados, colocación |
| `src/lib/analitica/pista.ts` | Intervalos en pista, +/−, con/sin, formaciones |
| `src/lib/analitica/numericas.ts` | Igualdad/inferioridad/superioridad, coste por exclusión |
| `src/lib/analitica/rachas.ts` | Parciales, sequías, efecto de tiempos muertos |
| `src/lib/analitica/referencias.ts` | Referencia de temporada mezclada con valor fijo |
| `src/lib/analitica/factores.ts` | Descomposición del diferencial y titular |
| `src/lib/analitica/index.ts` | `analizarPartido()` |
| `src/lib/analitica/fixtures.ts` | Constructores de eventos para tests (solo tests) |
| `src/components/partido/ContadoresEnVivo.tsx` | Botones nuevos y tiempo muerto |

---

### Task 1: Base de datos y correcciones de conteo

**Files:**
- Create: `supabase/migrations/0036_eventos_tiempo_muerto.sql`
- Modify: `src/types/database.ts:300` (`TipoEvento`)
- Modify: `src/lib/partidoStats.ts` (`exclusiones`, `exclusionesActivas`, `porcentajeParadas`, `segundoDeToque`, `toquesPista`, nuevo `esTiroRivalAPuerta`)
- Test: `src/lib/partidoStats.test.ts`

**Interfaces:**
- Produces: `TipoEvento` incluye `"tiempo_muerto"`; `export function segundoDeToque(e: EventoPartido): number | null`; `export function toquesPista(eventosJsonb: EventoPartido[]): EventoPartido[]`; `export function esTiroRivalAPuerta(e: EventosRow): boolean`; `exclusiones(eventos)` cuenta solo `equipo_origen === "propio"`; `exclusionesActivas(eventos, segundoAhora, equipo: "propio" | "rival" = "propio")`.

- [ ] **Step 1: Write the failing tests** — añadir al final de `src/lib/partidoStats.test.ts` (y añadir `esTiroRivalAPuerta`, `exclusiones`, `porcentajeParadas` al import existente de `./partidoStats`):

```ts
describe("captura ampliada: exclusiones y tiros del rival", () => {
  it("exclusiones() cuenta solo las nuestras", () => {
    const evs = [
      evento({ tipo: "exclusion", resultado: null, equipo_origen: "propio" }),
      evento({ tipo: "exclusion", resultado: null, equipo_origen: "rival" }),
    ];
    expect(exclusiones(evs)).toBe(1);
  });

  it("exclusionesActivas separa propias y del rival", () => {
    const evs = [
      evento({ tipo: "exclusion", resultado: null, equipo_origen: "propio", jugador_id: "j1", segundo: 100 }),
      evento({ tipo: "exclusion", resultado: null, equipo_origen: "rival", jugador_id: null, segundo: 110 }),
    ];
    expect(exclusionesActivas(evs, 150).map((x) => x.jugadorId)).toEqual(["j1"]);
    expect(exclusionesActivas(evs, 150, "rival").map((x) => x.finSegundo)).toEqual([230]);
  });

  it("un tiro rival fuera no cuenta en el % de paradas", () => {
    const evs = [
      evento({ equipo_origen: "rival", resultado: "parado" }),
      evento({ equipo_origen: "rival", resultado: "gol" }),
      evento({ equipo_origen: "rival", resultado: "fuera" }),
    ];
    expect(porcentajeParadas(evs)).toEqual({ pct: 50, aciertos: 1, intentos: 2 });
    expect(evs.filter(esTiroRivalAPuerta)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/partidoStats.test.ts`
Expected: FAIL (`esTiroRivalAPuerta` no exportado; `exclusiones` devuelve 2; `porcentajeParadas` intentos 3).

- [ ] **Step 3: Implement**

`supabase/migrations/0036_eventos_tiempo_muerto.sql`:

```sql
-- Tiempo muerto (nuestro o del rival) como evento de la tabla `eventos`, para
-- que la analítica lo trate igual que el resto de acciones (ver
-- docs/superpowers/specs/2026-11-04-analitica-partido-design.md §5).
-- Solo amplía el check de `tipo`: no toca ninguna fila existente.
-- equipo_origen indica quién lo pide; jugador_id queda null.
alter table eventos drop constraint eventos_tipo_check;
alter table eventos add constraint eventos_tipo_check
  check (tipo = any (array['tiro', 'perdida', 'exclusion', 'tarjeta', 'tiempo_muerto']));
```

`src/types/database.ts` línea 300:

```ts
export type TipoEvento = "tiro" | "perdida" | "exclusion" | "tarjeta" | "tiempo_muerto";
```

`src/lib/partidoStats.ts` — sustituir `exclusiones`:

```ts
/** Exclusiones de 2' NUESTRAS — las del rival (botón "2' rival", sin
 * jugador) van aparte y nunca suman aquí. */
export function exclusiones(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "exclusion" && e.equipo_origen === "propio").length;
}

/** Tiro del rival que va a portería (gol o parada). Los "fuera"/"poste" del
 * rival existen desde la captura ampliada: cuentan como posesión del rival
 * pero nunca en el % de paradas ni en goles evitados. */
export function esTiroRivalAPuerta(e: EventosRow): boolean {
  return e.tipo === "tiro" && e.equipo_origen === "rival" && (e.resultado === "gol" || e.resultado === "parado");
}
```

En `porcentajeParadas`, cambiar el filtro de `rivales` por:

```ts
  const rivales = eventos.filter(
    (e) => esTiroRivalAPuerta(e) && (opts === undefined || e.es_penalti === opts.soloPenalti),
  );
```

`exclusionesActivas` — añadir el parámetro `equipo` y filtrar por él:

```ts
export function exclusionesActivas(
  eventos: EventosRow[],
  segundoAhora: number | null,
  equipo: "propio" | "rival" = "propio",
): ExclusionActiva[] {
  if (segundoAhora === null) return [];
  return eventos
    .filter((e) => e.tipo === "exclusion" && e.equipo_origen === equipo && e.segundo != null)
    // …resto igual que ahora
```

Cambiar `function segundoDeToque` → `export function segundoDeToque` y `function toquesPista` → `export function toquesPista` (sin cambiar su cuerpo).

- [ ] **Step 4: Aplicar `esTiroRivalAPuerta` en todo el código del portero.** Ejecutar:

Run: `grep -rn 'equipo_origen === "rival"' src --include=*.tsx --include=*.ts` (o la búsqueda del editor)

En cada sitio donde se filtran **tiros del rival para estadísticas del portero** (`tipo === "tiro" && e.equipo_origen === "rival"`), sustituir esa condición por `esTiroRivalAPuerta(e)`. Sitios conocidos: `src/components/partido/FichaTecnica.tsx` (`tirosRivalJuego`, `tirosRivalPenalti`), `src/pages/JugadorDetailPage.tsx` (`tirosRivalJuego`, `tirosRivalPenalti`), `src/pages/RivalDetailPage.tsx` (`tirosRivalJuego`, `tirosRivalPenalti`), `src/components/partido/DesgloseJugadorPartido.tsx` y `src/lib/pdf/InformeJugadorPartidoPdf.tsx` (rama `portero`: filtrar además a gol|parado cuando `equipoOrigenRelevante === "rival"`), `src/lib/pdf/FichaPartidoPdf.tsx` (`tirosRivales` y `afrontados`). **No** cambiar `golesContra`, `contarBotonTiro` ni `marcadorHastaTabla`.

- [ ] **Step 5: Run tests, types and lint**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npx eslint src`
Expected: todo PASS, 0 errores.

- [ ] **Step 6: Aplicar la migración** en Supabase (herramienta `apply_migration`, nombre `eventos_tiempo_muerto`, el SQL de arriba) y verificar con `select pg_get_constraintdef(oid) from pg_constraint where conname = 'eventos_tipo_check';` que incluye `tiempo_muerto`. Si la herramienta no está disponible, parar y avisar al controlador.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0036_eventos_tiempo_muerto.sql src/types/database.ts src/lib/partidoStats.ts src/lib/partidoStats.test.ts src/components src/pages src/lib/pdf
git commit -m "feat: tipo tiempo_muerto en eventos y conteos de portero/exclusiones acotados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos, constantes, fixtures y calidad de datos

**Files:**
- Create: `src/lib/analitica/tipos.ts`, `src/lib/analitica/constantes.ts`, `src/lib/analitica/fixtures.ts`, `src/lib/analitica/calidad.ts`
- Test: `src/lib/analitica/calidad.test.ts`

**Interfaces:**
- Consumes: `hayRegistroDePista` de `@/lib/partidoStats`.
- Produces: `Metrica<T>`, `disponible(v)`, `noDisponible(motivo)`, `Equipo`, `CalidadDatos`, `calidadDatos(partido, eventos)`, `esMinutoFiable(eventos, duracionParteMin)`, constantes de `constantes.ts`, y en `fixtures.ts`: `ev(overrides)`, `tiro(equipo, resultado, overrides?)`, `partidoFixture(overrides?)`, `toque(tipo, jugadorId, segundo, overrides?)`.

- [ ] **Step 1: Crear `tipos.ts`, `constantes.ts` y `fixtures.ts`**

`src/lib/analitica/tipos.ts`:

```ts
/** Resultado de una métrica: o un valor, o el motivo por el que no se puede
 * calcular en este partido. Nunca un 0 ni un número inventado (spec §2). */
export type Metrica<T> = { disponible: true; valor: T } | { disponible: false; motivo: string };

export function disponible<T>(valor: T): Metrica<T> {
  return { disponible: true, valor };
}

export function noDisponible<T>(motivo: string): Metrica<T> {
  return { disponible: false, motivo };
}

export type Equipo = "propio" | "rival";

/** Qué datos tiene un partido — cada métrica declara cuáles necesita. */
export type CalidadDatos = {
  tieneSegundo: boolean;
  tienePista: boolean;
  tieneTirosRivalFuera: boolean;
  tieneExclusionesRival: boolean;
  tieneTiemposMuertos: boolean;
  minutoFiable: boolean;
};
```

`src/lib/analitica/constantes.ts`:

```ts
/** Constantes del motor de analítica — todas aquí, documentadas (spec §4).
 * Cambiar un valor aquí es cambiar la definición de una métrica. */

/** Peso (en tiros) de la referencia en el estimador Beta-Binomial. */
export const K_PRIOR = 20;

/** Probabilidad de gol de referencia por tipo de lanzamiento (xG pre-tiro). */
export const XG_REFERENCIA = {
  "7m": 0.75,
  extremo: 0.5,
  pivote: 0.65,
  exterior: 0.4,
  contragolpe: 0.8,
  desconocido: 0.5,
} as const;

/** PSxG: tasa base si hay menos de PSXG_MIN_MUESTRA tiros a puerta. */
export const PSXG_BASE_DEFECTO = 0.65;
export const PSXG_MIN_MUESTRA = 30;

/** Referencias fijas mientras haya menos de N_MEZCLA_REFERENCIA partidos. */
export const REFERENCIA_FIJA = {
  eficienciaAtaque: 0.55,
  eficienciaDefensa: 0.55,
  pctPerdidas: 0.15,
  pctParadas: 0.33,
  ritmo: 55,
} as const;
export const N_MEZCLA_REFERENCIA = 3;

export const DURACION_EXCLUSION_SEG = 120;
export const MIN_SEG_FORMACION = 300;
export const MIN_POSESIONES_CON_SIN = 10;
export const RACHA_MIN_GOLES = 3;
export const SEQUIA_MIN_SEG = 300;
export const VENTANA_TIEMPO_MUERTO_SEG = 300;
/** Ventana previa a un parcial en la que se buscan causas (exclusión, TM...). */
export const VENTANA_CONTEXTO_PARCIAL_SEG = 60;
export const UMBRAL_TIENE_SEGUNDO = 0.9;
/** Fracción máxima de eventos de la 2ª parte en un mismo minuto antes de
 * considerar el minuto no fiable (síntoma de reloj parado). */
export const MAX_FRACCION_MISMO_MINUTO = 0.3;

/** Día de despliegue de la captura ampliada (tiro rival fuera, 2' rival,
 * tiempo muerto). Desde esta fecha, que no haya un "fuera" rival significa
 * que no lo hubo, no que no se registrara. Fijar al desplegar la fase 1. */
export const FECHA_CAPTURA_AMPLIADA = "2026-11-05";
```

`src/lib/analitica/fixtures.ts`:

```ts
/** Constructores de datos para los tests del motor. Solo se importa desde
 * `*.test.ts`. */
import type { EquipoOrigenEvento, EventoPartido, EventosRow, PartidosRow, ResultadoTiro } from "@/types/database";

let contador = 0;

export function ev(overrides: Partial<EventosRow> = {}): EventosRow {
  contador++;
  return {
    id: `ev-${contador}`,
    equipo_id: "equipo-1",
    partido_id: "p1",
    sesion_id: null,
    jugador_id: null,
    equipo_origen: "propio",
    tipo: "tiro",
    resultado: "gol",
    zona: null,
    origen: null,
    es_penalti: false,
    color_tarjeta: null,
    minuto: null,
    segundo: null,
    creado_en: new Date(Date.UTC(2026, 0, 1, 0, 0, contador)).toISOString(),
    ...overrides,
  };
}

export function tiro(equipo: EquipoOrigenEvento, resultado: ResultadoTiro, overrides: Partial<EventosRow> = {}): EventosRow {
  return ev({ tipo: "tiro", equipo_origen: equipo, resultado, ...overrides });
}

export function partidoFixture(overrides: Partial<PartidosRow> = {}): PartidosRow {
  return {
    id: "p1",
    equipo_id: "equipo-1",
    fecha: "2026-11-10",
    rival: "Rival",
    resultado: null,
    duracion_parte_min: 30,
    estadisticas: { eventos: [] },
    ...overrides,
  } as PartidosRow;
}

export function toque(
  tipo: "entra_pista" | "sale_pista",
  jugadorId: string,
  segundo: number | null,
  overrides: Partial<EventoPartido> = {},
): EventoPartido {
  contador++;
  return {
    id: `t-${contador}`,
    tipo,
    jugador_id: jugadorId,
    minuto: segundo === null ? null : Math.floor(segundo / 60) + 1,
    segundo,
    creado_en: new Date(Date.UTC(2026, 0, 1, 0, 0, contador)).toISOString(),
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing test** `src/lib/analitica/calidad.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calidadDatos, esMinutoFiable } from "./calidad";
import { ev, partidoFixture, tiro, toque } from "./fixtures";

describe("esMinutoFiable", () => {
  it("falso si no hay ningún evento en la 2ª parte (reloj dejado en la 1ª)", () => {
    expect(esMinutoFiable([ev({ minuto: 5 }), ev({ minuto: 28 })], 30)).toBe(false);
  });
  it("falso si la 2ª parte se apuntó entera en el mismo minuto", () => {
    const evs = Array.from({ length: 12 }, () => ev({ minuto: 31 }));
    expect(esMinutoFiable([ev({ minuto: 3 }), ...evs], 30)).toBe(false);
  });
  it("verdadero con minutos repartidos en ambas partes", () => {
    const evs = Array.from({ length: 20 }, (_, i) => ev({ minuto: 1 + i * 3 }));
    expect(esMinutoFiable(evs, 30)).toBe(true);
  });
  it("falso sin minutos", () => {
    expect(esMinutoFiable([ev()], 30)).toBe(false);
  });
});

describe("calidadDatos", () => {
  it("partido antiguo sin segundo, sin pista ni captura ampliada", () => {
    const p = partidoFixture({ fecha: "2026-10-01" });
    const c = calidadDatos(p, [tiro("propio", "gol", { minuto: 3 }), tiro("rival", "parado", { minuto: 40 })]);
    expect(c).toEqual({
      tieneSegundo: false,
      tienePista: false,
      tieneTirosRivalFuera: false,
      tieneExclusionesRival: false,
      tieneTiemposMuertos: false,
      minutoFiable: true,
    });
  });
  it("partido nuevo con segundo y pista", () => {
    const p = partidoFixture({ fecha: "2026-11-10", estadisticas: { eventos: [toque("entra_pista", "a", null)] } });
    const evs = Array.from({ length: 10 }, (_, i) => tiro("propio", "gol", { segundo: i * 100, minuto: Math.floor(i * 100 / 60) + 1 }));
    const c = calidadDatos(p, evs);
    expect(c.tieneSegundo).toBe(true);
    expect(c.tienePista).toBe(true);
    expect(c.tieneTirosRivalFuera).toBe(true); // por fecha >= FECHA_CAPTURA_AMPLIADA
  });
  it("tieneSegundo exige al menos el 90 %", () => {
    const evs = [...Array.from({ length: 8 }, () => ev({ segundo: 10 })), ev(), ev()];
    expect(calidadDatos(partidoFixture(), evs).tieneSegundo).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/analitica/calidad.test.ts`
Expected: FAIL (`./calidad` no existe).

- [ ] **Step 4: Implement** `src/lib/analitica/calidad.ts`:

```ts
import { hayRegistroDePista } from "@/lib/partidoStats";
import type { EventosRow, PartidosRow } from "@/types/database";
import { FECHA_CAPTURA_AMPLIADA, MAX_FRACCION_MISMO_MINUTO, UMBRAL_TIENE_SEGUNDO } from "./constantes";
import type { CalidadDatos } from "./tipos";

/** ¿El `minuto` de los eventos de este partido refleja el partido real? Falso
 * cuando todo cayó en la 1ª parte (la 2ª se apuntó con el reloj en la 1ª) o
 * cuando la 2ª parte se amontona en un mismo minuto (reloj parado) — los dos
 * fallos vistos en los datos reales. */
export function esMinutoFiable(eventos: EventosRow[], duracionParteMin: number): boolean {
  const minutos = eventos.map((e) => e.minuto).filter((m): m is number => m !== null);
  if (minutos.length === 0) return false;
  const segunda = minutos.filter((m) => m > duracionParteMin);
  if (segunda.length === 0) return false;
  if (segunda.length >= 10) {
    const conteo = new Map<number, number>();
    for (const m of segunda) conteo.set(m, (conteo.get(m) ?? 0) + 1);
    const max = Math.max(...conteo.values());
    if (max / segunda.length > MAX_FRACCION_MISMO_MINUTO) return false;
  }
  return true;
}

/** Flags de calidad de un partido (spec §3). `eventos` = eventos de la tabla
 * de ese partido. */
export function calidadDatos(partido: PartidosRow, eventos: EventosRow[]): CalidadDatos {
  const conSegundo = eventos.filter((e) => e.segundo != null).length;
  const ampliada = partido.fecha >= FECHA_CAPTURA_AMPLIADA;
  return {
    tieneSegundo: eventos.length > 0 && conSegundo / eventos.length >= UMBRAL_TIENE_SEGUNDO,
    tienePista: hayRegistroDePista(partido.estadisticas.eventos ?? []),
    tieneTirosRivalFuera:
      ampliada || eventos.some((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && (e.resultado === "fuera" || e.resultado === "poste")),
    tieneExclusionesRival: ampliada || eventos.some((e) => e.tipo === "exclusion" && e.equipo_origen === "rival"),
    tieneTiemposMuertos: ampliada || eventos.some((e) => e.tipo === "tiempo_muerto"),
    minutoFiable: esMinutoFiable(eventos, partido.duracion_parte_min),
  };
}
```

- [ ] **Step 5: Run tests** — `npx vitest run src/lib/analitica/calidad.test.ts` → PASS; `npx tsc -p tsconfig.app.json --noEmit` → 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analitica
git commit -m "feat(analitica): tipos, constantes, fixtures y calidad de datos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Posesiones y eficiencia

**Files:**
- Create: `src/lib/analitica/posesiones.ts`
- Test: `src/lib/analitica/posesiones.test.ts`

**Interfaces:**
- Consumes: `Metrica`, `disponible`, `noDisponible`, `CalidadDatos` (Task 2).
- Produces: `type ConteoPosesiones = { tirosPropios: number; perdidasPropias: number; posesionesPropias: number; golesFavor: number; tirosRival: number; robos: number; posesionesRival: number; golesContra: number }`; `contarPosesiones(eventos: EventosRow[]): ConteoPosesiones`; `type ResumenPosesiones = { conteo: ConteoPosesiones; eficienciaAtaque: Metrica<number>; eficienciaDefensa: Metrica<number>; diferencial: Metrica<number>; ritmo: Metrica<number>; pctPerdidas: Metrica<number> }`; `resumirPosesiones(eventos, duracionParteMin, calidad): ResumenPosesiones`; `esCierrePosesion(e): Equipo | null`.

- [ ] **Step 1: Write the failing test** `src/lib/analitica/posesiones.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contarPosesiones, esCierrePosesion, resumirPosesiones } from "./posesiones";
import { ev, tiro } from "./fixtures";
import type { CalidadDatos } from "./tipos";

const calidadCompleta: CalidadDatos = {
  tieneSegundo: true, tienePista: true, tieneTirosRivalFuera: true,
  tieneExclusionesRival: true, tieneTiemposMuertos: true, minutoFiable: true,
};

// 10 posesiones nuestras: 6 tiros (4 goles, 1 de ellos 7m) + 4 pérdidas.
// 10 posesiones del rival: 8 tiros (5 goles, 2 paradas, 1 fuera) + 2 robos nuestros.
const partido = [
  tiro("propio", "gol"), tiro("propio", "gol"), tiro("propio", "gol"),
  tiro("propio", "gol", { es_penalti: true }), tiro("propio", "parado"), tiro("propio", "fuera"),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }),
  ...Array.from({ length: 5 }, () => tiro("rival", "gol")),
  tiro("rival", "parado"), tiro("rival", "parado"), tiro("rival", "fuera"),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "rival" }),
  ev({ tipo: "perdida", resultado: null, equipo_origen: "rival", jugador_id: null }),
  ev({ tipo: "exclusion", resultado: null }), // no cierra posesión
  ev({ tipo: "tiempo_muerto", resultado: null }), // no cierra posesión
];

describe("contarPosesiones", () => {
  it("cuenta tiros + pérdidas para cada equipo", () => {
    expect(contarPosesiones(partido)).toEqual({
      tirosPropios: 6, perdidasPropias: 4, posesionesPropias: 10, golesFavor: 4,
      tirosRival: 8, robos: 2, posesionesRival: 10, golesContra: 5,
    });
  });
});

describe("esCierrePosesion", () => {
  it("tiro propio y pérdida propia cierran nuestra posesión; tiro rival y robo, la del rival", () => {
    expect(esCierrePosesion(tiro("propio", "fuera"))).toBe("propio");
    expect(esCierrePosesion(ev({ tipo: "perdida", resultado: null, equipo_origen: "propio" }))).toBe("propio");
    expect(esCierrePosesion(tiro("rival", "gol"))).toBe("rival");
    expect(esCierrePosesion(ev({ tipo: "perdida", resultado: null, equipo_origen: "rival" }))).toBe("rival");
    expect(esCierrePosesion(ev({ tipo: "exclusion", resultado: null }))).toBeNull();
  });
});

describe("resumirPosesiones", () => {
  it("eficiencias, diferencial, ritmo y % pérdidas", () => {
    const r = resumirPosesiones(partido, 30, calidadCompleta);
    expect(r.eficienciaAtaque).toEqual({ disponible: true, valor: 0.4 });
    expect(r.eficienciaDefensa).toEqual({ disponible: true, valor: 0.5 });
    expect(r.diferencial.disponible && r.diferencial.valor).toBeCloseTo(-0.1);
    // (10 + 10) / 2 = 10 posesiones por equipo en 60' → ritmo 10
    expect(r.ritmo).toEqual({ disponible: true, valor: 10 });
    expect(r.pctPerdidas).toEqual({ disponible: true, valor: 0.4 });
  });
  it("sin captura de tiros rival fuera, lo que depende del rival no está disponible", () => {
    const r = resumirPosesiones(partido, 30, { ...calidadCompleta, tieneTirosRivalFuera: false });
    expect(r.eficienciaAtaque.disponible).toBe(true);
    expect(r.eficienciaDefensa.disponible).toBe(false);
    expect(r.diferencial.disponible).toBe(false);
    expect(r.ritmo.disponible).toBe(false);
  });
  it("sin posesiones propias, nada inventado", () => {
    const r = resumirPosesiones([], 30, calidadCompleta);
    expect(r.eficienciaAtaque.disponible).toBe(false);
    expect(r.pctPerdidas.disponible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/analitica/posesiones.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implement** `src/lib/analitica/posesiones.ts`:

```ts
import type { EventosRow } from "@/types/database";
import { disponible, noDisponible, type CalidadDatos, type Equipo, type Metrica } from "./tipos";

export type ConteoPosesiones = {
  tirosPropios: number;
  perdidasPropias: number;
  posesionesPropias: number;
  golesFavor: number;
  tirosRival: number;
  robos: number;
  posesionesRival: number;
  golesContra: number;
};

export type ResumenPosesiones = {
  conteo: ConteoPosesiones;
  eficienciaAtaque: Metrica<number>;
  eficienciaDefensa: Metrica<number>;
  diferencial: Metrica<number>;
  ritmo: Metrica<number>;
  pctPerdidas: Metrica<number>;
};

const SIN_FUERA_RIVAL = "En este partido no se registraban los tiros del rival fuera o al poste";

/** Equipo cuya posesión termina con este evento, o null si no cierra ninguna.
 * Nuestra posesión: tiro propio (incl. 7m) o pérdida propia. La del rival:
 * tiro rival (gol, parada, fuera, poste) o robo nuestro (= pérdida del rival,
 * con o sin jugador). Spec §4.1. */
export function esCierrePosesion(e: EventosRow): Equipo | null {
  if (e.tipo === "tiro") return e.equipo_origen;
  if (e.tipo === "perdida") return e.equipo_origen === "propio" ? "propio" : "rival";
  return null;
}

export function contarPosesiones(eventos: EventosRow[]): ConteoPosesiones {
  let tirosPropios = 0, perdidasPropias = 0, golesFavor = 0, tirosRival = 0, robos = 0, golesContra = 0;
  for (const e of eventos) {
    if (e.tipo === "tiro" && e.equipo_origen === "propio") {
      tirosPropios++;
      if (e.resultado === "gol") golesFavor++;
    } else if (e.tipo === "tiro" && e.equipo_origen === "rival") {
      tirosRival++;
      if (e.resultado === "gol") golesContra++;
    } else if (e.tipo === "perdida" && e.equipo_origen === "propio") {
      perdidasPropias++;
    } else if (e.tipo === "perdida" && e.equipo_origen === "rival") {
      robos++;
    }
  }
  return {
    tirosPropios, perdidasPropias, posesionesPropias: tirosPropios + perdidasPropias, golesFavor,
    tirosRival, robos, posesionesRival: tirosRival + robos, golesContra,
  };
}

/** Eficiencia (goles por posesión), diferencial, ritmo y % de pérdidas. Lo
 * que depende de las posesiones del rival exige `tieneTirosRivalFuera`: sin
 * los fuera del rival, sus posesiones salen cortas y la eficiencia defensiva
 * saldría inflada. */
export function resumirPosesiones(eventos: EventosRow[], duracionParteMin: number, calidad: CalidadDatos): ResumenPosesiones {
  const c = contarPosesiones(eventos);
  const eficienciaAtaque: Metrica<number> =
    c.posesionesPropias > 0 ? disponible(c.golesFavor / c.posesionesPropias) : noDisponible("Sin posesiones nuestras registradas");
  const eficienciaDefensa: Metrica<number> = !calidad.tieneTirosRivalFuera
    ? noDisponible(SIN_FUERA_RIVAL)
    : c.posesionesRival > 0
      ? disponible(c.golesContra / c.posesionesRival)
      : noDisponible("Sin posesiones del rival registradas");
  const diferencial: Metrica<number> =
    eficienciaAtaque.disponible && eficienciaDefensa.disponible
      ? disponible(eficienciaAtaque.valor - eficienciaDefensa.valor)
      : noDisponible(eficienciaDefensa.disponible ? "Sin posesiones nuestras registradas" : SIN_FUERA_RIVAL);
  const ritmo: Metrica<number> = !calidad.tieneTirosRivalFuera
    ? noDisponible(SIN_FUERA_RIVAL)
    : disponible(((c.posesionesPropias + c.posesionesRival) / 2 / (2 * duracionParteMin)) * 60);
  const pctPerdidas: Metrica<number> =
    c.posesionesPropias > 0 ? disponible(c.perdidasPropias / c.posesionesPropias) : noDisponible("Sin posesiones nuestras registradas");
  return { conteo: c, eficienciaAtaque, eficienciaDefensa, diferencial, ritmo, pctPerdidas };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/analitica/posesiones.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analitica/posesiones.ts src/lib/analitica/posesiones.test.ts
git commit -m "feat(analitica): posesiones, eficiencia, ritmo y % de pérdidas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Goles esperados (xG pre-tiro y PSxG)

**Files:**
- Create: `src/lib/analitica/xg.ts`
- Test: `src/lib/analitica/xg.test.ts`

**Interfaces:**
- Consumes: constantes `K_PRIOR`, `XG_REFERENCIA`, `PSXG_BASE_DEFECTO`, `PSXG_MIN_MUESTRA`.
- Produces:
  - `type TipoLanzamiento = "7m" | "extremo" | "pivote" | "exterior" | "contragolpe" | "desconocido"`; `TIPOS_LANZAMIENTO: TipoLanzamiento[]`
  - `tipoLanzamiento(e: EventosRow): TipoLanzamiento`
  - `estimarTasa(aciertos: number, intentos: number, p0: number, k?: number): number`
  - `type ModeloXg = Record<TipoLanzamiento, number>`; `modeloXgPreTiro(historico: EventosRow[]): ModeloXg`
  - `type ResumenXg = { tiros: number; goles: number; xg: number; golesMenosXg: number }`
  - `xgPartido(eventos, modelo): { total: ResumenXg; juegoAbierto: ResumenXg; sieteMetros: ResumenXg; porTipo: Record<TipoLanzamiento, ResumenXg>; porJugador: (ResumenXg & { jugadorId: string | null })[] }`
  - `type ModeloPsxg = { porZona: Record<number, number>; base: number; muestra: number }`; `modeloPsxg(tirosAPuerta: EventosRow[]): ModeloPsxg`
  - `psxgDeTiro(e: EventosRow, modelo: ModeloPsxg): number | null`
  - `type PorteroEvitados = { porteroId: string | null; tirosAPuerta: number; goles: number; psxg: number; evitados: number; sieteRecibidos: number; sieteParados: number }`; `golesEvitados(eventos, modeloRival): PorteroEvitados[]`
  - `type Colocacion = { jugadorId: string | null; tirosAPuerta: number; psxgMedio: number }`; `dificultadColocacion(eventos, modeloPropio): Colocacion[]`

- [ ] **Step 1: Write the failing test** `src/lib/analitica/xg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  dificultadColocacion, estimarTasa, golesEvitados, modeloPsxg, modeloXgPreTiro, psxgDeTiro, tipoLanzamiento, xgPartido,
} from "./xg";
import { tiro } from "./fixtures";

describe("tipoLanzamiento", () => {
  it("penalti manda sobre el origen; mapea orígenes a tipos", () => {
    expect(tipoLanzamiento(tiro("propio", "gol", { es_penalti: true, origen: "central" }))).toBe("7m");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "ext_izq" }))).toBe("extremo");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "ext_der" }))).toBe("extremo");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "pivote" }))).toBe("pivote");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "lat_der" }))).toBe("exterior");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "9m" }))).toBe("exterior");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: "contragolpe" }))).toBe("contragolpe");
    expect(tipoLanzamiento(tiro("propio", "gol", { origen: null }))).toBe("desconocido");
  });
});

describe("estimarTasa (Beta-Binomial)", () => {
  it("sin datos devuelve la referencia; con muchos, se acerca a la tasa observada", () => {
    expect(estimarTasa(0, 0, 0.5)).toBe(0.5);
    // (8 + 20·0,5) / (10 + 20) = 18/30 = 0,6
    expect(estimarTasa(8, 10, 0.5)).toBeCloseTo(0.6);
    expect(estimarTasa(800, 1000, 0.5)).toBeCloseTo((800 + 10) / 1020);
  });
});

describe("modeloXgPreTiro + xgPartido", () => {
  const historico = [
    ...Array.from({ length: 10 }, (_, i) => tiro("propio", i < 6 ? "gol" : "parado", { origen: "ext_izq" })),
    tiro("rival", "gol", { origen: "ext_izq" }), // los del rival no entran en el modelo propio
  ];
  const modelo = modeloXgPreTiro(historico);
  it("estima cada tipo con su referencia", () => {
    // extremo: (6 + 20·0,5) / (10 + 20) = 16/30
    expect(modelo.extremo).toBeCloseTo(16 / 30);
    expect(modelo.pivote).toBe(0.65);
    expect(modelo["7m"]).toBe(0.75);
  });
  it("suma xG y goles − xG por jugador, separando juego abierto y 7m", () => {
    const partido = [
      tiro("propio", "gol", { origen: "pivote", jugador_id: "a" }),
      tiro("propio", "fuera", { origen: "pivote", jugador_id: "a" }),
      tiro("propio", "gol", { es_penalti: true, jugador_id: "b" }),
      tiro("rival", "gol"),
    ];
    const r = xgPartido(partido, modelo);
    expect(r.total.tiros).toBe(3);
    expect(r.total.xg).toBeCloseTo(0.65 + 0.65 + 0.75);
    expect(r.juegoAbierto.golesMenosXg).toBeCloseTo(1 - 1.3);
    expect(r.sieteMetros.golesMenosXg).toBeCloseTo(0.25);
    const a = r.porJugador.find((j) => j.jugadorId === "a")!;
    expect(a).toMatchObject({ tiros: 2, goles: 1 });
    expect(a.xg).toBeCloseTo(1.3);
  });
});

describe("PSxG y goles evitados", () => {
  // Histórico rival a puerta: zona 1 → 2 de 10 goles; zona 5 → 9 de 10.
  const historicoRival = [
    ...Array.from({ length: 10 }, (_, i) => tiro("rival", i < 2 ? "gol" : "parado", { zona: 1 })),
    ...Array.from({ length: 10 }, (_, i) => tiro("rival", i < 9 ? "gol" : "parado", { zona: 5 })),
    tiro("rival", "fuera"), // fuera: sin zona, no entra
    tiro("rival", "gol", { zona: 5, es_penalti: true }), // 7m: no entra
  ];
  const modelo = modeloPsxg(historicoRival);
  it("base por defecto si hay menos de 30 tiros a puerta", () => {
    expect(modelo.muestra).toBe(20);
    expect(modelo.base).toBe(0.65);
    expect(modelo.porZona[1]).toBeCloseTo((2 + 20 * 0.65) / 30);
    expect(modelo.porZona[5]).toBeCloseTo((9 + 20 * 0.65) / 30);
    expect(modelo.porZona[9]).toBe(0.65);
  });
  it("psxgDeTiro es null para fuera, 7m o sin zona", () => {
    expect(psxgDeTiro(tiro("rival", "fuera"), modelo)).toBeNull();
    expect(psxgDeTiro(tiro("rival", "gol", { zona: 5, es_penalti: true }), modelo)).toBeNull();
    expect(psxgDeTiro(tiro("rival", "gol", { zona: null }), modelo)).toBeNull();
  });
  it("goles evitados = Σ PSxG − goles encajados, por portero; 7m aparte", () => {
    const partido = [
      tiro("rival", "parado", { zona: 5, jugador_id: "po1" }),
      tiro("rival", "parado", { zona: 5, jugador_id: "po1" }),
      tiro("rival", "gol", { zona: 1, jugador_id: "po1" }),
      tiro("rival", "fuera", { jugador_id: "po1" }),
      tiro("rival", "parado", { es_penalti: true, zona: 2, jugador_id: "po1" }),
    ];
    const [po1] = golesEvitados(partido, modelo);
    const esperado = 2 * modelo.porZona[5] + modelo.porZona[1];
    expect(po1.porteroId).toBe("po1");
    expect(po1.tirosAPuerta).toBe(3);
    expect(po1.goles).toBe(1);
    expect(po1.psxg).toBeCloseTo(esperado);
    expect(po1.evitados).toBeCloseTo(esperado - 1);
    expect(po1).toMatchObject({ sieteRecibidos: 1, sieteParados: 1 });
  });
  it("colocación: media de PSxG de los tiros propios a puerta", () => {
    const modeloPropio = modeloPsxg([]);
    const r = dificultadColocacion([tiro("propio", "gol", { zona: 3, jugador_id: "a" }), tiro("propio", "fuera", { jugador_id: "a" })], modeloPropio);
    expect(r).toEqual([{ jugadorId: "a", tirosAPuerta: 1, psxgMedio: 0.65 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/analitica/xg.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/lib/analitica/xg.ts`:

```ts
import type { EventosRow } from "@/types/database";
import { K_PRIOR, PSXG_BASE_DEFECTO, PSXG_MIN_MUESTRA, XG_REFERENCIA } from "./constantes";

export type TipoLanzamiento = "7m" | "extremo" | "pivote" | "exterior" | "contragolpe" | "desconocido";
export const TIPOS_LANZAMIENTO: TipoLanzamiento[] = ["7m", "extremo", "pivote", "exterior", "contragolpe", "desconocido"];

export type ResumenXg = { tiros: number; goles: number; xg: number; golesMenosXg: number };
export type ModeloXg = Record<TipoLanzamiento, number>;
export type ModeloPsxg = { porZona: Record<number, number>; base: number; muestra: number };
export type PorteroEvitados = {
  porteroId: string | null;
  tirosAPuerta: number;
  goles: number;
  psxg: number;
  evitados: number;
  sieteRecibidos: number;
  sieteParados: number;
};
export type Colocacion = { jugadorId: string | null; tirosAPuerta: number; psxgMedio: number };

/** Tipo de lanzamiento de un tiro. `origen` viene del PUESTO del jugador (no
 * de la posición real del tiro), de ahí que el xG pre-tiro sea aproximado. */
export function tipoLanzamiento(e: EventosRow): TipoLanzamiento {
  if (e.es_penalti) return "7m";
  switch (e.origen) {
    case "ext_izq":
    case "ext_der":
      return "extremo";
    case "pivote":
      return "pivote";
    case "lat_izq":
    case "lat_der":
    case "central":
    case "9m":
      return "exterior";
    case "contragolpe":
      return "contragolpe";
    default:
      return "desconocido";
  }
}

/** Estimador Beta-Binomial: (a + k·p0) / (n + k). Con pocos tiros manda la
 * referencia p0; con muchos, la tasa observada (spec §4.2). */
export function estimarTasa(aciertos: number, intentos: number, p0: number, k: number = K_PRIOR): number {
  return (aciertos + k * p0) / (intentos + k);
}

function vacio(): ResumenXg {
  return { tiros: 0, goles: 0, xg: 0, golesMenosXg: 0 };
}

function sumar(r: ResumenXg, gol: boolean, xg: number): void {
  r.tiros++;
  if (gol) r.goles++;
  r.xg += xg;
  r.golesMenosXg = r.goles - r.xg;
}

/** Modelo de xG pre-tiro a partir del histórico de tiros PROPIOS (el llamante
 * excluye el partido analizado). */
export function modeloXgPreTiro(historico: EventosRow[]): ModeloXg {
  const modelo = {} as ModeloXg;
  for (const tipo of TIPOS_LANZAMIENTO) {
    const tiros = historico.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && tipoLanzamiento(e) === tipo);
    const goles = tiros.filter((e) => e.resultado === "gol").length;
    modelo[tipo] = estimarTasa(goles, tiros.length, XG_REFERENCIA[tipo]);
  }
  return modelo;
}

export function xgPartido(eventos: EventosRow[], modelo: ModeloXg) {
  const total = vacio();
  const juegoAbierto = vacio();
  const sieteMetros = vacio();
  const porTipo = Object.fromEntries(TIPOS_LANZAMIENTO.map((t) => [t, vacio()])) as Record<TipoLanzamiento, ResumenXg>;
  const porJugadorMapa = new Map<string | null, ResumenXg>();
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.equipo_origen !== "propio") continue;
    const tipo = tipoLanzamiento(e);
    const xg = modelo[tipo];
    const gol = e.resultado === "gol";
    sumar(total, gol, xg);
    sumar(tipo === "7m" ? sieteMetros : juegoAbierto, gol, xg);
    sumar(porTipo[tipo], gol, xg);
    if (!porJugadorMapa.has(e.jugador_id)) porJugadorMapa.set(e.jugador_id, vacio());
    sumar(porJugadorMapa.get(e.jugador_id)!, gol, xg);
  }
  const porJugador = [...porJugadorMapa.entries()].map(([jugadorId, r]) => ({ jugadorId, ...r }));
  return { total, juegoAbierto, sieteMetros, porTipo, porJugador };
}

function esAPuertaJuegoAbierto(e: EventosRow): boolean {
  return e.tipo === "tiro" && !e.es_penalti && e.zona !== null && (e.resultado === "gol" || e.resultado === "parado");
}

/** Probabilidad de gol de un tiro A PUERTA según la zona a la que va (PSxG),
 * solo juego abierto. `tirosAPuerta`: histórico del equipo correspondiente
 * (rival para goles evitados, propio para colocación), sin el partido. */
export function modeloPsxg(tirosAPuerta: EventosRow[]): ModeloPsxg {
  const validos = tirosAPuerta.filter(esAPuertaJuegoAbierto);
  const goles = validos.filter((e) => e.resultado === "gol").length;
  const base = validos.length >= PSXG_MIN_MUESTRA ? goles / validos.length : PSXG_BASE_DEFECTO;
  const porZona: Record<number, number> = {};
  for (let z = 1; z <= 9; z++) {
    const enZona = validos.filter((e) => e.zona === z);
    porZona[z] = estimarTasa(enZona.filter((e) => e.resultado === "gol").length, enZona.length, base);
  }
  return { porZona, base, muestra: validos.length };
}

export function psxgDeTiro(e: EventosRow, modelo: ModeloPsxg): number | null {
  return esAPuertaJuegoAbierto(e) ? modelo.porZona[e.zona!] : null;
}

/** Goles evitados por portero = Σ PSxG de los tiros a puerta que recibió −
 * goles encajados (juego abierto). Positivo: paró más de lo que le tocaba por
 * dónde le tiraron. Los 7m se cuentan aparte. */
export function golesEvitados(eventos: EventosRow[], modeloRival: ModeloPsxg): PorteroEvitados[] {
  const mapa = new Map<string | null, PorteroEvitados>();
  const de = (id: string | null) => {
    if (!mapa.has(id)) mapa.set(id, { porteroId: id, tirosAPuerta: 0, goles: 0, psxg: 0, evitados: 0, sieteRecibidos: 0, sieteParados: 0 });
    return mapa.get(id)!;
  };
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.equipo_origen !== "rival") continue;
    if (e.es_penalti && (e.resultado === "gol" || e.resultado === "parado")) {
      const p = de(e.jugador_id);
      p.sieteRecibidos++;
      if (e.resultado === "parado") p.sieteParados++;
      continue;
    }
    const psxg = psxgDeTiro(e, modeloRival);
    if (psxg === null) continue;
    const p = de(e.jugador_id);
    p.tirosAPuerta++;
    p.psxg += psxg;
    if (e.resultado === "gol") p.goles++;
    p.evitados = p.psxg - p.goles;
  }
  return [...mapa.values()];
}

/** Dificultad para el portero de los tiros a puerta de cada jugador propio
 * (media de PSxG con el modelo de tiros propios). Más alto = mejor colocados. */
export function dificultadColocacion(eventos: EventosRow[], modeloPropio: ModeloPsxg): Colocacion[] {
  const mapa = new Map<string | null, { n: number; suma: number }>();
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.equipo_origen !== "propio") continue;
    const psxg = psxgDeTiro(e, modeloPropio);
    if (psxg === null) continue;
    const acc = mapa.get(e.jugador_id) ?? { n: 0, suma: 0 };
    acc.n++;
    acc.suma += psxg;
    mapa.set(e.jugador_id, acc);
  }
  return [...mapa.entries()].map(([jugadorId, { n, suma }]) => ({ jugadorId, tirosAPuerta: n, psxgMedio: suma / n }));
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/analitica/xg.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analitica/xg.ts src/lib/analitica/xg.test.ts
git commit -m "feat(analitica): xG pre-tiro, PSxG por zona, goles evitados y colocación

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pista — intervalos, +/−, con/sin, formaciones

**Files:**
- Create: `src/lib/analitica/pista.ts`
- Test: `src/lib/analitica/pista.test.ts`

**Interfaces:**
- Consumes: `segundoDeToque`, `toquesPista` (Task 1); `esCierrePosesion` (Task 3); constantes.
- Produces: `type Intervalo = { inicio: number; fin: number }`; `intervalosEnPista(eventosJsonb: EventoPartido[], eventos: EventosRow[], duracionTotalSeg: number): Map<string, Intervalo[]>`; `enPistaEn(intervalos, t): string[]`; `type PlusMinus = { jugadorId: string; segundos: number; golesFavor: number; golesContra: number; masMenos: number; por30: number | null }`; `plusMinus(eventos, intervalos): PlusMinus[]`; `type ConSin = { con: number; sin: number; diferencia: number; posesionesCon: number; posesionesSin: number }`; `conSin(eventos, intervalos, jugadorId): Metrica<ConSin>`; `type Formacion = { jugadores: string[]; segundos: number; golesFavor: number; golesContra: number; diferencial: number }`; `formaciones(eventos, intervalos, duracionTotalSeg): Formacion[]`.

- [ ] **Step 1: Write the failing test** `src/lib/analitica/pista.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/analitica/pista.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/lib/analitica/pista.ts`:

```ts
import { segundoDeToque, toquesPista } from "@/lib/partidoStats";
import type { EventoPartido, EventosRow } from "@/types/database";
import { DURACION_EXCLUSION_SEG, MIN_POSESIONES_CON_SIN, MIN_SEG_FORMACION } from "./constantes";
import { esCierrePosesion } from "./posesiones";
import { disponible, noDisponible, type Metrica } from "./tipos";

export type Intervalo = { inicio: number; fin: number };
export type PlusMinus = { jugadorId: string; segundos: number; golesFavor: number; golesContra: number; masMenos: number; por30: number | null };
export type ConSin = { con: number; sin: number; diferencia: number; posesionesCon: number; posesionesSin: number };
export type Formacion = { jugadores: string[]; segundos: number; golesFavor: number; golesContra: number; diferencial: number };

function restar(intervalos: Intervalo[], quitar: Intervalo): Intervalo[] {
  const fuera: Intervalo[] = [];
  for (const i of intervalos) {
    if (quitar.fin <= i.inicio || quitar.inicio >= i.fin) {
      fuera.push(i);
      continue;
    }
    if (quitar.inicio > i.inicio) fuera.push({ inicio: i.inicio, fin: quitar.inicio });
    if (quitar.fin < i.fin) fuera.push({ inicio: quitar.fin, fin: i.fin });
  }
  return fuera;
}

/** Intervalos `[inicio, fin)` en segundos de partido en que cada jugador está
 * jugando: de sus entradas/salidas (mismo emparejamiento que `tiempoDePista`:
 * entrada sin hora = 0; primera salida sin entrada = titular) MENOS sus
 * exclusiones de 2' (un excluido no juega aunque siga "en pista" en el
 * registro). Sustitutos de exclusión: su entrada ya viene fechada al final. */
export function intervalosEnPista(eventosJsonb: EventoPartido[], eventos: EventosRow[], duracionTotalSeg: number): Map<string, Intervalo[]> {
  const porJugador = new Map<string, EventoPartido[]>();
  for (const e of toquesPista(eventosJsonb)) {
    if (!e.jugador_id) continue;
    if (!porJugador.has(e.jugador_id)) porJugador.set(e.jugador_id, []);
    porJugador.get(e.jugador_id)!.push(e);
  }
  const resultado = new Map<string, Intervalo[]>();
  for (const [jugadorId, toques] of porJugador) {
    let intervalos: Intervalo[] = [];
    let entrada: number | null = toques[0]?.tipo === "sale_pista" ? 0 : null;
    for (const e of toques) {
      const t = segundoDeToque(e);
      if (e.tipo === "entra_pista") {
        if (entrada === null) entrada = t ?? 0;
      } else if (entrada !== null) {
        intervalos.push({ inicio: entrada, fin: t ?? entrada });
        entrada = null;
      }
    }
    if (entrada !== null) intervalos.push({ inicio: entrada, fin: duracionTotalSeg });
    for (const x of eventos) {
      if (x.tipo === "exclusion" && x.equipo_origen === "propio" && x.jugador_id === jugadorId && x.segundo != null) {
        intervalos = restar(intervalos, { inicio: x.segundo, fin: x.segundo + DURACION_EXCLUSION_SEG });
      }
    }
    intervalos = intervalos
      .map((i) => ({ inicio: Math.max(0, i.inicio), fin: Math.min(duracionTotalSeg, i.fin) }))
      .filter((i) => i.fin > i.inicio);
    resultado.set(jugadorId, intervalos);
  }
  return resultado;
}

function contiene(intervalos: Intervalo[] | undefined, t: number): boolean {
  return !!intervalos?.some((i) => i.inicio <= t && t < i.fin);
}

export function enPistaEn(intervalos: Map<string, Intervalo[]>, t: number): string[] {
  return [...intervalos.entries()].filter(([, ints]) => contiene(ints, t)).map(([id]) => id).sort();
}

function golesConSegundo(eventos: EventosRow[]) {
  return eventos.filter((e) => e.tipo === "tiro" && e.resultado === "gol" && e.segundo != null);
}

export function plusMinus(eventos: EventosRow[], intervalos: Map<string, Intervalo[]>): PlusMinus[] {
  const goles = golesConSegundo(eventos);
  return [...intervalos.entries()].map(([jugadorId, ints]) => {
    const segundos = ints.reduce((s, i) => s + (i.fin - i.inicio), 0);
    let golesFavor = 0;
    let golesContra = 0;
    for (const g of goles) {
      if (!contiene(ints, g.segundo!)) continue;
      if (g.equipo_origen === "propio") golesFavor++;
      else golesContra++;
    }
    const masMenos = golesFavor - golesContra;
    return { jugadorId, segundos, golesFavor, golesContra, masMenos, por30: segundos > 0 ? (masMenos * 1800) / segundos : null };
  });
}

/** Diferencial por posesión (goles/posesión propia − goles/posesión rival)
 * con el jugador jugando frente a sin él. Exige ≥ 10 posesiones (de ambos
 * equipos) a cada lado y al menos una de cada equipo. */
export function conSin(eventos: EventosRow[], intervalos: Map<string, Intervalo[]>, jugadorId: string): Metrica<ConSin> {
  const ints = intervalos.get(jugadorId);
  const lado = () => ({ pp: 0, gf: 0, pr: 0, gc: 0 });
  const con = lado();
  const sin = lado();
  for (const e of eventos) {
    const equipo = esCierrePosesion(e);
    if (equipo === null || e.segundo == null) continue;
    const l = contiene(ints, e.segundo) ? con : sin;
    if (equipo === "propio") {
      l.pp++;
      if (e.tipo === "tiro" && e.resultado === "gol") l.gf++;
    } else {
      l.pr++;
      if (e.tipo === "tiro" && e.resultado === "gol") l.gc++;
    }
  }
  const valido = (l: ReturnType<typeof lado>) => l.pp + l.pr >= MIN_POSESIONES_CON_SIN && l.pp > 0 && l.pr > 0;
  if (!valido(con) || !valido(sin)) return noDisponible("Menos de 10 posesiones con o sin el jugador");
  const dif = (l: ReturnType<typeof lado>) => l.gf / l.pp - l.gc / l.pr;
  return disponible({
    con: dif(con),
    sin: dif(sin),
    diferencia: dif(con) - dif(sin),
    posesionesCon: con.pp + con.pr,
    posesionesSin: sin.pp + sin.pr,
  });
}

/** Formaciones (quiénes juegan a la vez) con su tiempo y goles; por defecto
 * solo las de ≥ 300 s, ordenadas por tiempo. */
export function formaciones(
  eventos: EventosRow[],
  intervalos: Map<string, Intervalo[]>,
  duracionTotalSeg: number,
  minSegundos: number = MIN_SEG_FORMACION,
): Formacion[] {
  const cortes = new Set<number>([0, duracionTotalSeg]);
  for (const ints of intervalos.values()) for (const i of ints) {
    cortes.add(i.inicio);
    cortes.add(i.fin);
  }
  const puntos = [...cortes].filter((t) => t >= 0 && t <= duracionTotalSeg).sort((a, b) => a - b);
  const goles = golesConSegundo(eventos);
  const acumulado = new Map<string, Formacion>();
  for (let k = 0; k < puntos.length - 1; k++) {
    const a = puntos[k];
    const b = puntos[k + 1];
    const jugadores = enPistaEn(intervalos, a);
    if (jugadores.length === 0) continue;
    const clave = jugadores.join(",");
    const f = acumulado.get(clave) ?? { jugadores, segundos: 0, golesFavor: 0, golesContra: 0, diferencial: 0 };
    f.segundos += b - a;
    for (const g of goles) {
      if (g.segundo! < a || g.segundo! >= b) continue;
      if (g.equipo_origen === "propio") f.golesFavor++;
      else f.golesContra++;
    }
    f.diferencial = f.golesFavor - f.golesContra;
    acumulado.set(clave, f);
  }
  return [...acumulado.values()].filter((f) => f.segundos >= minSegundos).sort((x, y) => y.segundos - x.segundos);
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/analitica/pista.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analitica/pista.ts src/lib/analitica/pista.test.ts
git commit -m "feat(analitica): intervalos en pista, +/-, con/sin y formaciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Situaciones numéricas

**Files:**
- Create: `src/lib/analitica/numericas.ts`
- Test: `src/lib/analitica/numericas.test.ts`

**Interfaces:**
- Consumes: `esCierrePosesion` (Task 3), `Metrica`, `CalidadDatos`, `Equipo`, `DURACION_EXCLUSION_SEG`.
- Produces: `type EstadoNumerico = "igualdad" | "inferioridad" | "superioridad"`; `type IntervaloExclusion = { equipo: Equipo; inicio: number; fin: number }`; `intervalosExclusion(eventos, duracionTotalSeg): IntervaloExclusion[]`; `estadoEn(t, ints): EstadoNumerico`; `type ResumenEstado = { segundos: number; golesFavor: number; golesContra: number; posesionesPropias: number; posesionesRival: number }`; `type ResumenNumericas = { porEstado: Record<EstadoNumerico, ResumenEstado>; costePorExclusion: Metrica<number>; superioridad: Metrica<ResumenEstado>; golesNetosSobreIgualdad: number }`; `resumirNumericas(eventos, duracionTotalSeg, calidad): Metrica<ResumenNumericas>`.

- [ ] **Step 1: Write the failing test** `src/lib/analitica/numericas.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/analitica/numericas.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/lib/analitica/numericas.ts`:

```ts
import type { EventosRow } from "@/types/database";
import { DURACION_EXCLUSION_SEG } from "./constantes";
import { esCierrePosesion } from "./posesiones";
import { disponible, noDisponible, type CalidadDatos, type Equipo, type Metrica } from "./tipos";

export type EstadoNumerico = "igualdad" | "inferioridad" | "superioridad";
export type IntervaloExclusion = { equipo: Equipo; inicio: number; fin: number };
export type ResumenEstado = { segundos: number; golesFavor: number; golesContra: number; posesionesPropias: number; posesionesRival: number };
export type ResumenNumericas = {
  porEstado: Record<EstadoNumerico, ResumenEstado>;
  costePorExclusion: Metrica<number>;
  superioridad: Metrica<ResumenEstado>;
  /** Goles netos en inferioridad + superioridad menos lo que se habría hecho
   * en ese tiempo al ritmo de igualdad (factor "situaciones numéricas"). */
  golesNetosSobreIgualdad: number;
};

/** Exclusiones (y rojas, que también dejan 2' en inferioridad) con segundo
 * registrado, como intervalos `[inicio, fin)` recortados al partido. */
export function intervalosExclusion(eventos: EventosRow[], duracionTotalSeg: number): IntervaloExclusion[] {
  return eventos
    .filter((e) => (e.tipo === "exclusion" || (e.tipo === "tarjeta" && e.color_tarjeta === "roja")) && e.segundo != null)
    .map((e) => ({ equipo: e.equipo_origen, inicio: e.segundo!, fin: Math.min(e.segundo! + DURACION_EXCLUSION_SEG, duracionTotalSeg) }))
    .sort((a, b) => a.inicio - b.inicio);
}

export function estadoEn(t: number, ints: IntervaloExclusion[]): EstadoNumerico {
  let propios = 0;
  let rival = 0;
  for (const i of ints) {
    if (i.inicio <= t && t < i.fin) {
      if (i.equipo === "propio") propios++;
      else rival++;
    }
  }
  return propios > rival ? "inferioridad" : rival > propios ? "superioridad" : "igualdad";
}

const vacio = (): ResumenEstado => ({ segundos: 0, golesFavor: 0, golesContra: 0, posesionesPropias: 0, posesionesRival: 0 });

/** Igualdad / inferioridad / superioridad (spec §4.4). Requiere segundo. */
export function resumirNumericas(eventos: EventosRow[], duracionTotalSeg: number, calidad: CalidadDatos): Metrica<ResumenNumericas> {
  if (!calidad.tieneSegundo) return noDisponible("Este partido no tiene el segundo exacto de cada acción");
  const ints = intervalosExclusion(eventos, duracionTotalSeg);
  const porEstado: Record<EstadoNumerico, ResumenEstado> = { igualdad: vacio(), inferioridad: vacio(), superioridad: vacio() };
  const cortes = new Set<number>([0, duracionTotalSeg]);
  for (const i of ints) {
    cortes.add(i.inicio);
    cortes.add(i.fin);
  }
  const puntos = [...cortes].filter((t) => t >= 0 && t <= duracionTotalSeg).sort((a, b) => a - b);
  for (let k = 0; k < puntos.length - 1; k++) porEstado[estadoEn(puntos[k], ints)].segundos += puntos[k + 1] - puntos[k];
  for (const e of eventos) {
    if (e.segundo == null) continue;
    const r = porEstado[estadoEn(e.segundo, ints)];
    const equipo = esCierrePosesion(e);
    if (equipo === "propio") r.posesionesPropias++;
    if (equipo === "rival") r.posesionesRival++;
    if (e.tipo === "tiro" && e.resultado === "gol") {
      if (e.equipo_origen === "propio") r.golesFavor++;
      else r.golesContra++;
    }
  }
  const difPorSeg = (r: ResumenEstado) => (r.golesFavor - r.golesContra) / r.segundos;
  const { igualdad, inferioridad, superioridad } = porEstado;
  const costePorExclusion: Metrica<number> =
    igualdad.segundos >= 60 && inferioridad.segundos >= 60
      ? disponible((difPorSeg(igualdad) - difPorSeg(inferioridad)) * 60 * 2)
      : noDisponible("Menos de 1 minuto en igualdad o en inferioridad");
  const tasaIgualdad = igualdad.segundos > 0 ? difPorSeg(igualdad) : 0;
  const golesNetosSobreIgualdad = [inferioridad, superioridad].reduce(
    (s, r) => s + (r.golesFavor - r.golesContra) - tasaIgualdad * r.segundos,
    0,
  );
  return disponible({
    porEstado,
    costePorExclusion,
    superioridad: calidad.tieneExclusionesRival ? disponible(superioridad) : noDisponible("En este partido no se registraban las exclusiones del rival"),
    golesNetosSobreIgualdad,
  });
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/analitica/numericas.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analitica/numericas.ts src/lib/analitica/numericas.test.ts
git commit -m "feat(analitica): situaciones numéricas y coste por exclusión

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Rachas, sequías y tiempos muertos

**Files:**
- Create: `src/lib/analitica/rachas.ts`
- Test: `src/lib/analitica/rachas.test.ts`

**Interfaces:**
- Consumes: `segundoDeToque` (Task 1), `Equipo`, constantes.
- Produces: `type Contexto = { tipo: "exclusion" | "tiempo_muerto" | "cambio" | "descanso"; equipo: Equipo | null; segundo: number }`; `type Parcial = { equipo: Equipo; goles: number; inicioSeg: number; finSeg: number; contexto: Contexto[] }`; `parciales(eventos, eventosJsonb, duracionParteMin): Parcial[]`; `type Sequia = { equipo: Equipo; inicioSeg: number; finSeg: number; segundos: number }`; `sequias(eventos, duracionTotalSeg): Sequia[]`; `type EfectoTiempoMuerto = { equipo: Equipo; segundo: number; antes: number; despues: number }`; `efectoTiemposMuertos(eventos): EfectoTiempoMuerto[]`.

- [ ] **Step 1: Write the failing test** `src/lib/analitica/rachas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { efectoTiemposMuertos, parciales, sequias } from "./rachas";
import { ev, tiro, toque } from "./fixtures";

describe("parciales", () => {
  const goles = [
    tiro("propio", "gol", { segundo: 100 }),
    tiro("rival", "gol", { segundo: 200 }), tiro("rival", "gol", { segundo: 300 }), tiro("rival", "gol", { segundo: 400 }),
    tiro("propio", "gol", { segundo: 500 }),
  ];
  it("detecta 3 o más goles seguidos del mismo equipo", () => {
    const r = parciales(goles, [], 30);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ equipo: "rival", goles: 3, inicioSeg: 200, finSeg: 400 });
  });
  it("anota el contexto: exclusión justo antes y cambio durante", () => {
    const exclusion = ev({ tipo: "exclusion", resultado: null, equipo_origen: "propio", segundo: 170 });
    const cambio = [toque("sale_pista", "a", 250, { grupo: "g" }), toque("entra_pista", "b", 250, { grupo: "g" })];
    const r = parciales([...goles, exclusion], cambio, 30);
    expect(r[0].contexto).toEqual([
      { tipo: "exclusion", equipo: "propio", segundo: 170 },
      { tipo: "cambio", equipo: null, segundo: 250 },
    ]);
  });
  it("marca el descanso si el parcial lo cruza", () => {
    const cruza = [tiro("propio", "gol", { segundo: 1700 }), tiro("propio", "gol", { segundo: 1790 }), tiro("propio", "gol", { segundo: 1850 })];
    expect(parciales(cruza, [], 30)[0].contexto).toEqual([{ tipo: "descanso", equipo: null, segundo: 1800 }]);
  });
});

describe("sequias", () => {
  it("≥ 300 s sin marcar, incluido el inicio y el final", () => {
    const r = sequias([tiro("propio", "gol", { segundo: 400 }), tiro("propio", "gol", { segundo: 500 }), tiro("rival", "gol", { segundo: 3500 })], 3600);
    expect(r).toEqual([
      { equipo: "propio", inicioSeg: 0, finSeg: 400, segundos: 400 },
      { equipo: "propio", inicioSeg: 500, finSeg: 3600, segundos: 3100 },
      { equipo: "rival", inicioSeg: 0, finSeg: 3500, segundos: 3500 },
    ]);
  });
});

describe("efectoTiemposMuertos", () => {
  it("diferencial (nuestro) en los 5' antes y después", () => {
    const evs = [
      tiro("rival", "gol", { segundo: 800 }), tiro("rival", "gol", { segundo: 900 }),
      ev({ tipo: "tiempo_muerto", resultado: null, equipo_origen: "propio", segundo: 1000 }),
      tiro("propio", "gol", { segundo: 1100 }), tiro("propio", "gol", { segundo: 1200 }), tiro("rival", "gol", { segundo: 1250 }),
      tiro("propio", "gol", { segundo: 1400 }), // fuera de la ventana (> 1300)
    ];
    expect(efectoTiemposMuertos(evs)).toEqual([{ equipo: "propio", segundo: 1000, antes: -2, despues: 1 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/analitica/rachas.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/lib/analitica/rachas.ts`:

```ts
import { segundoDeToque } from "@/lib/partidoStats";
import type { EventoPartido, EventosRow } from "@/types/database";
import { RACHA_MIN_GOLES, SEQUIA_MIN_SEG, VENTANA_CONTEXTO_PARCIAL_SEG, VENTANA_TIEMPO_MUERTO_SEG } from "./constantes";
import type { Equipo } from "./tipos";

export type Contexto = { tipo: "exclusion" | "tiempo_muerto" | "cambio" | "descanso"; equipo: Equipo | null; segundo: number };
export type Parcial = { equipo: Equipo; goles: number; inicioSeg: number; finSeg: number; contexto: Contexto[] };
export type Sequia = { equipo: Equipo; inicioSeg: number; finSeg: number; segundos: number };
export type EfectoTiempoMuerto = { equipo: Equipo; segundo: number; antes: number; despues: number };

function golesOrdenados(eventos: EventosRow[]) {
  return eventos
    .filter((e) => e.tipo === "tiro" && e.resultado === "gol" && e.segundo != null)
    .sort((a, b) => a.segundo! - b.segundo! || a.creado_en.localeCompare(b.creado_en));
}

/** Parciales: ≥ 3 goles seguidos del mismo equipo, con lo que pasó entre un
 * minuto antes y el final del parcial (exclusiones, tiempos muertos, cambios,
 * descanso). Spec §4.5. */
export function parciales(eventos: EventosRow[], eventosJsonb: EventoPartido[], duracionParteMin: number): Parcial[] {
  const goles = golesOrdenados(eventos);
  const tramos: { equipo: Equipo; inicio: number; fin: number; n: number }[] = [];
  for (const g of goles) {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.equipo === g.equipo_origen) {
      ultimo.fin = g.segundo!;
      ultimo.n++;
    } else {
      tramos.push({ equipo: g.equipo_origen, inicio: g.segundo!, fin: g.segundo!, n: 1 });
    }
  }
  const cambios = new Map<string, number>();
  for (const e of eventosJsonb) {
    if (e.grupo && e.tipo === "sale_pista") {
      const t = segundoDeToque(e);
      if (t !== null && !cambios.has(e.grupo)) cambios.set(e.grupo, t);
    }
  }
  const descanso = duracionParteMin * 60;
  return tramos
    .filter((t) => t.n >= RACHA_MIN_GOLES)
    .map((t) => {
      const desde = t.inicio - VENTANA_CONTEXTO_PARCIAL_SEG;
      const dentro = (s: number) => s >= desde && s <= t.fin;
      const contexto: Contexto[] = [];
      for (const e of eventos) {
        if (e.segundo == null || !dentro(e.segundo)) continue;
        if (e.tipo === "exclusion") contexto.push({ tipo: "exclusion", equipo: e.equipo_origen, segundo: e.segundo });
        if (e.tipo === "tiempo_muerto") contexto.push({ tipo: "tiempo_muerto", equipo: e.equipo_origen, segundo: e.segundo });
      }
      for (const s of cambios.values()) if (dentro(s)) contexto.push({ tipo: "cambio", equipo: null, segundo: s });
      if (t.inicio < descanso && descanso <= t.fin) contexto.push({ tipo: "descanso", equipo: null, segundo: descanso });
      contexto.sort((a, b) => a.segundo - b.segundo);
      return { equipo: t.equipo, goles: t.n, inicioSeg: t.inicio, finSeg: t.fin, contexto };
    });
}

/** Tramos de ≥ 5' sin marcar de cada equipo (desde el inicio o su último gol
 * hasta su siguiente gol o el final). */
export function sequias(eventos: EventosRow[], duracionTotalSeg: number): Sequia[] {
  const resultado: Sequia[] = [];
  for (const equipo of ["propio", "rival"] as const) {
    const marcas = [0, ...golesOrdenados(eventos).filter((g) => g.equipo_origen === equipo).map((g) => g.segundo!), duracionTotalSeg];
    for (let k = 0; k < marcas.length - 1; k++) {
      const segundos = marcas[k + 1] - marcas[k];
      if (segundos >= SEQUIA_MIN_SEG) resultado.push({ equipo, inicioSeg: marcas[k], finSeg: marcas[k + 1], segundos });
    }
  }
  return resultado;
}

/** Diferencial de goles (desde nuestro punto de vista) en los 5' anteriores
 * y posteriores a cada tiempo muerto. */
export function efectoTiemposMuertos(eventos: EventosRow[]): EfectoTiempoMuerto[] {
  const goles = golesOrdenados(eventos);
  const dif = (desde: number, hasta: number, incluirDesde: boolean) =>
    goles
      .filter((g) => (incluirDesde ? g.segundo! >= desde : g.segundo! > desde) && (incluirDesde ? g.segundo! < hasta : g.segundo! <= hasta))
      .reduce((s, g) => s + (g.equipo_origen === "propio" ? 1 : -1), 0);
  return eventos
    .filter((e) => e.tipo === "tiempo_muerto" && e.segundo != null)
    .sort((a, b) => a.segundo! - b.segundo!)
    .map((e) => ({
      equipo: e.equipo_origen,
      segundo: e.segundo!,
      antes: dif(e.segundo! - VENTANA_TIEMPO_MUERTO_SEG, e.segundo!, true),
      despues: dif(e.segundo!, e.segundo! + VENTANA_TIEMPO_MUERTO_SEG, false),
    }));
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/analitica/rachas.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analitica/rachas.ts src/lib/analitica/rachas.test.ts
git commit -m "feat(analitica): parciales, sequías y efecto de tiempos muertos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Referencias y factores del partido (titular)

**Files:**
- Create: `src/lib/analitica/referencias.ts`, `src/lib/analitica/factores.ts`
- Test: `src/lib/analitica/referencias.test.ts`, `src/lib/analitica/factores.test.ts`

**Interfaces:**
- Consumes: `Metrica`, `N_MEZCLA_REFERENCIA`.
- Produces: `type Referencia = { valor: number; n: number; mezclada: boolean }`; `referencia(valoresTemporada: (number | null | undefined)[], valorFijo: number): Referencia`; `type ClaveFactor = "acierto" | "perdidas" | "porteria" | "numericas" | "sieteMetros"`; `type Factor = { clave: ClaveFactor; etiqueta: string; goles: Metrica<number> }`; `type Descomposicion = { referencia: number; factores: Factor[]; residuo: number; real: number }`; `descomponer(real: number, referenciaDiferencial: number, factores: Factor[]): Descomposicion`; `titular(golesFavor: number, golesContra: number, d: Descomposicion): string`; `ETIQUETAS_FACTOR: Record<ClaveFactor, string>`.

- [ ] **Step 1: Write the failing tests**

`src/lib/analitica/referencias.test.ts`:

```ts
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
```

`src/lib/analitica/factores.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail** — `npx vitest run src/lib/analitica/referencias.test.ts src/lib/analitica/factores.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/lib/analitica/referencias.ts`:

```ts
import { N_MEZCLA_REFERENCIA } from "./constantes";

export type Referencia = { valor: number; n: number; mezclada: boolean };

/** Referencia de temporada para una métrica (spec §4.6): media de los
 * partidos que la tienen (el llamante ya excluye el partido analizado y pasa
 * null donde no está disponible). Con menos de 3 partidos se mezcla con el
 * valor fijo: (n·media + 3·fijo) / (n + 3). */
export function referencia(valoresTemporada: (number | null | undefined)[], valorFijo: number): Referencia {
  const v = valoresTemporada.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const n = v.length;
  const media = n > 0 ? v.reduce((s, x) => s + x, 0) / n : 0;
  if (n >= N_MEZCLA_REFERENCIA) return { valor: media, n, mezclada: false };
  return { valor: (n * media + N_MEZCLA_REFERENCIA * valorFijo) / (n + N_MEZCLA_REFERENCIA), n, mezclada: true };
}
```

`src/lib/analitica/factores.ts`:

```ts
import type { Metrica } from "./tipos";

export type ClaveFactor = "acierto" | "perdidas" | "porteria" | "numericas" | "sieteMetros";
export type Factor = { clave: ClaveFactor; etiqueta: string; goles: Metrica<number> };
export type Descomposicion = { referencia: number; factores: Factor[]; residuo: number; real: number };

export const ETIQUETAS_FACTOR: Record<ClaveFactor, string> = {
  acierto: "Acierto de tiro",
  perdidas: "Pérdidas",
  porteria: "Portería",
  numericas: "Situaciones numéricas",
  sieteMetros: "7 metros",
};

/** Descompone el diferencial real frente al de referencia en factores (en
 * goles) + un residuo "otros" que cuadra la cuenta (spec §4.7). */
export function descomponer(real: number, referenciaDiferencial: number, factores: Factor[]): Descomposicion {
  const suma = factores.reduce((s, f) => s + (f.goles.disponible ? f.goles.valor : 0), 0);
  return { referencia: referenciaDiferencial, factores, residuo: real - referenciaDiferencial - suma, real };
}

/** Frase con el factor dominante cuando va en el mismo sentido que el
 * resultado ("Ganamos … desde la portería") o como "pese a" cuando no. */
const FRASE: Record<ClaveFactor, { positivo: string; negativo: string }> = {
  acierto: { positivo: "con acierto de cara a portería", negativo: "por falta de acierto" },
  perdidas: { positivo: "cuidando el balón", negativo: "por las pérdidas" },
  porteria: { positivo: "desde la portería", negativo: "por la portería" },
  numericas: { positivo: "en las situaciones numéricas", negativo: "en inferioridad" },
  sieteMetros: { positivo: "desde los 7 metros", negativo: "desde los 7 metros" },
};
const PESE_A: Record<ClaveFactor, { positivo: string; negativo: string }> = {
  acierto: { positivo: "un buen acierto", negativo: "la falta de acierto" },
  perdidas: { positivo: "cuidar el balón", negativo: "las pérdidas" },
  porteria: { positivo: "una buena portería", negativo: "la portería" },
  numericas: { positivo: "las situaciones numéricas", negativo: "la inferioridad" },
  sieteMetros: { positivo: "los 7 metros", negativo: "los 7 metros fallados" },
};
const UMBRAL_FACTOR_DOMINANTE = 0.5;

function fmt(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function titular(golesFavor: number, golesContra: number, d: Descomposicion): string {
  const verbo = golesFavor > golesContra ? "Ganamos" : golesFavor < golesContra ? "Perdimos" : "Empatamos";
  const base = `${verbo} ${golesFavor}-${golesContra}`;
  const candidatos = d.factores.filter((f) => f.goles.disponible && Math.abs(f.goles.valor) >= UMBRAL_FACTOR_DOMINANTE);
  if (candidatos.length === 0) return `${base} sin un factor que destaque`;
  const top = candidatos.reduce((a, b) => (Math.abs((b.goles as { valor: number }).valor) > Math.abs((a.goles as { valor: number }).valor) ? b : a));
  const valor = (top.goles as { valor: number }).valor;
  const signo = valor > 0 ? "positivo" : "negativo";
  const detalle = `${fmt(Math.abs(valor))} goles ${valor > 0 ? "a favor" : "en contra"} frente a lo habitual`;
  const coincide = golesFavor === golesContra || (golesFavor > golesContra) === valor > 0;
  return coincide ? `${base} ${FRASE[top.clave][signo]}: ${detalle}` : `${base} pese a ${PESE_A[top.clave][signo]}: ${detalle}`;
}
```

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analitica/referencias.ts src/lib/analitica/referencias.test.ts src/lib/analitica/factores.ts src/lib/analitica/factores.test.ts
git commit -m "feat(analitica): referencias de temporada, factores del partido y titular

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `analizarPartido` (punto de entrada) y contraste con datos reales

**Files:**
- Create: `src/lib/analitica/index.ts`
- Test: `src/lib/analitica/index.test.ts`

**Interfaces:**
- Consumes: todo lo anterior; `normalizarEventos`, que en el Step 0 se mueve a `@/lib/partidoStats` (el motor no puede importar `@/lib/eventos`, que importa el cliente de Supabase).

- [ ] **Step 0: Mover `normalizarEventos` a `partidoStats.ts`.** Cortar la función `normalizarEventos` (con su comentario) de `src/lib/eventos.ts` y pegarla tal cual al final de `src/lib/partidoStats.ts` (exportada). En `src/lib/eventos.ts` añadir `import { normalizarEventos } from "@/lib/partidoStats";` (la usa `cargarEventosEquipo`) y `export { normalizarEventos } from "@/lib/partidoStats";` para que los importadores actuales (`SharedPartidoPage.tsx`, `partidoStats.test.ts`) no cambien. Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit` → PASS.
- Produces: `type ContextoTemporada = { partidos: PartidosRow[]; eventosPorPartido: Map<string, EventosRow[]> }`; `type AnalisisPartido` (ver código); `analizarPartido(partido: PartidosRow, eventosPartido: EventosRow[], contexto: ContextoTemporada): AnalisisPartido`. Re-exporta los tipos públicos de los módulos.

- [ ] **Step 1: Write the failing test** `src/lib/analitica/index.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/analitica/index.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/lib/analitica/index.ts`:

```ts
import { normalizarEventos } from "@/lib/partidoStats";
import type { EventosRow, PartidosRow } from "@/types/database";
import { calidadDatos } from "./calidad";
import { REFERENCIA_FIJA } from "./constantes";
import { descomponer, ETIQUETAS_FACTOR, titular, type Descomposicion, type Factor } from "./factores";
import { resumirNumericas, type ResumenNumericas } from "./numericas";
import { conSin, formaciones, intervalosEnPista, plusMinus, type ConSin, type Formacion, type PlusMinus } from "./pista";
import { resumirPosesiones, type ResumenPosesiones } from "./posesiones";
import { efectoTiemposMuertos, parciales, sequias, type EfectoTiempoMuerto, type Parcial, type Sequia } from "./rachas";
import { referencia, type Referencia } from "./referencias";
import { disponible, noDisponible, type CalidadDatos, type Metrica } from "./tipos";
import {
  dificultadColocacion, golesEvitados, modeloPsxg, modeloXgPreTiro, xgPartido,
  type Colocacion, type ModeloPsxg, type ModeloXg, type PorteroEvitados,
} from "./xg";

export * from "./tipos";
export type { ResumenPosesiones } from "./posesiones";
export type { ResumenXg, TipoLanzamiento, PorteroEvitados, Colocacion } from "./xg";
export type { PlusMinus, ConSin, Formacion } from "./pista";
export type { ResumenNumericas, EstadoNumerico, ResumenEstado } from "./numericas";
export type { Parcial, Sequia, EfectoTiempoMuerto, Contexto } from "./rachas";
export type { Referencia } from "./referencias";
export type { Factor, Descomposicion, ClaveFactor } from "./factores";

export type ContextoTemporada = { partidos: PartidosRow[]; eventosPorPartido: Map<string, EventosRow[]> };

export type AnalisisPartido = {
  calidad: CalidadDatos;
  posesiones: ResumenPosesiones;
  xg: ReturnType<typeof xgPartido>;
  porteros: PorteroEvitados[];
  colocacion: Colocacion[];
  pista: Metrica<{ plusMinus: PlusMinus[]; formaciones: Formacion[]; conSin: Map<string, Metrica<ConSin>> }>;
  numericas: Metrica<ResumenNumericas>;
  parciales: Parcial[];
  sequias: Sequia[];
  tiemposMuertos: EfectoTiempoMuerto[];
  referencias: {
    eficienciaAtaque: Referencia;
    eficienciaDefensa: Referencia;
    diferencial: Referencia;
    ritmo: Referencia;
    pctPerdidas: Referencia;
    golesMenosXgJuego: Referencia;
    golesMenosXg7m: Referencia;
    golesEvitados: Referencia;
    diferencialGoles: Referencia;
  };
  factores: Descomposicion;
  titular: string;
};

const valorDe = (m: Metrica<number>): number | null => (m.disponible ? m.valor : null);

type Modelos = { xg: ModeloXg; psxgRival: ModeloPsxg; psxgPropio: ModeloPsxg };

/** Métricas "base" de un partido con modelos dados: las que sirven tanto para
 * el partido analizado como para las referencias de los demás. */
function metricasBase(partido: PartidosRow, eventos: EventosRow[], modelos: Modelos) {
  const calidad = calidadDatos(partido, eventos);
  const posesiones = resumirPosesiones(eventos, partido.duracion_parte_min, calidad);
  const xg = xgPartido(eventos, modelos.xg);
  const porteros = golesEvitados(eventos, modelos.psxgRival);
  const evitados = porteros.reduce((s, p) => s + p.evitados, 0);
  const tirosAPuertaRival = porteros.reduce((s, p) => s + p.tirosAPuerta, 0);
  return { calidad, posesiones, xg, porteros, evitados, tirosAPuertaRival };
}

/** Análisis completo de un partido (spec §7). `contexto` = partidos y eventos
 * del equipo; el partido analizado se excluye de modelos y referencias. */
export function analizarPartido(partido: PartidosRow, eventosPartido: EventosRow[], contexto: ContextoTemporada): AnalisisPartido {
  const eventos = normalizarEventos(eventosPartido);
  const otros = contexto.partidos.filter((p) => p.id !== partido.id);
  const eventosOtros = otros.map((p) => ({ partido: p, eventos: normalizarEventos(contexto.eventosPorPartido.get(p.id) ?? []) }));
  const todosOtros = eventosOtros.flatMap((x) => x.eventos);
  const modelos: Modelos = {
    xg: modeloXgPreTiro(todosOtros),
    psxgRival: modeloPsxg(todosOtros.filter((e) => e.equipo_origen === "rival")),
    psxgPropio: modeloPsxg(todosOtros.filter((e) => e.equipo_origen === "propio")),
  };

  const base = metricasBase(partido, eventos, modelos);
  const { calidad, posesiones, xg, porteros } = base;
  const duracionTotalSeg = partido.duracion_parte_min * 2 * 60;
  const jsonb = partido.estadisticas.eventos ?? [];

  const pista: AnalisisPartido["pista"] =
    calidad.tienePista && calidad.tieneSegundo
      ? (() => {
          const intervalos = intervalosEnPista(jsonb, eventos, duracionTotalSeg);
          return disponible({
            plusMinus: plusMinus(eventos, intervalos),
            formaciones: formaciones(eventos, intervalos, duracionTotalSeg),
            conSin: new Map([...intervalos.keys()].map((id) => [id, conSin(eventos, intervalos, id)])),
          });
        })()
      : noDisponible(calidad.tienePista ? "Este partido no tiene el segundo exacto de cada acción" : "En este partido no se registraron los cambios");

  const numericas = resumirNumericas(eventos, duracionTotalSeg, calidad);
  const conTiempo = calidad.tieneSegundo;

  // Referencias: los mismos cálculos sobre los demás partidos (con los mismos modelos).
  const otrosBase = eventosOtros.filter((x) => x.eventos.length > 0).map((x) => metricasBase(x.partido, x.eventos, modelos));
  const referencias: AnalisisPartido["referencias"] = {
    eficienciaAtaque: referencia(otrosBase.map((b) => valorDe(b.posesiones.eficienciaAtaque)), REFERENCIA_FIJA.eficienciaAtaque),
    eficienciaDefensa: referencia(otrosBase.map((b) => valorDe(b.posesiones.eficienciaDefensa)), REFERENCIA_FIJA.eficienciaDefensa),
    diferencial: referencia(otrosBase.map((b) => valorDe(b.posesiones.diferencial)), REFERENCIA_FIJA.eficienciaAtaque - REFERENCIA_FIJA.eficienciaDefensa),
    ritmo: referencia(otrosBase.map((b) => valorDe(b.posesiones.ritmo)), REFERENCIA_FIJA.ritmo),
    pctPerdidas: referencia(otrosBase.map((b) => valorDe(b.posesiones.pctPerdidas)), REFERENCIA_FIJA.pctPerdidas),
    golesMenosXgJuego: referencia(otrosBase.map((b) => (b.xg.juegoAbierto.tiros > 0 ? b.xg.juegoAbierto.golesMenosXg : null)), 0),
    golesMenosXg7m: referencia(otrosBase.map((b) => (b.xg.sieteMetros.tiros > 0 ? b.xg.sieteMetros.golesMenosXg : null)), 0),
    golesEvitados: referencia(otrosBase.map((b) => (b.tirosAPuertaRival > 0 ? b.evitados : null)), 0),
    diferencialGoles: referencia(otrosBase.map((b) => b.posesiones.conteo.golesFavor - b.posesiones.conteo.golesContra), 0),
  };

  const { golesFavor, golesContra, posesionesPropias } = posesiones.conteo;
  const factor = (clave: Factor["clave"], goles: Metrica<number>): Factor => ({ clave, etiqueta: ETIQUETAS_FACTOR[clave], goles });
  const factoresLista: Factor[] = [
    factor("acierto", xg.juegoAbierto.tiros > 0 ? disponible(xg.juegoAbierto.golesMenosXg - referencias.golesMenosXgJuego.valor) : noDisponible("Sin tiros en juego abierto")),
    factor(
      "perdidas",
      posesiones.pctPerdidas.disponible
        ? disponible((referencias.pctPerdidas.valor - posesiones.pctPerdidas.valor) * posesionesPropias * referencias.eficienciaAtaque.valor)
        : noDisponible("Sin posesiones nuestras registradas"),
    ),
    factor("porteria", base.tirosAPuertaRival > 0 ? disponible(base.evitados - referencias.golesEvitados.valor) : noDisponible("Sin tiros a puerta del rival con zona")),
    factor("numericas", numericas.disponible ? disponible(numericas.valor.golesNetosSobreIgualdad) : noDisponible(numericas.motivo)),
    factor("sieteMetros", xg.sieteMetros.tiros > 0 ? disponible(xg.sieteMetros.golesMenosXg - referencias.golesMenosXg7m.valor) : noDisponible("Sin 7 metros")),
  ];
  const factores = descomponer(golesFavor - golesContra, referencias.diferencialGoles.valor, factoresLista);

  return {
    calidad,
    posesiones,
    xg,
    porteros,
    colocacion: dificultadColocacion(eventos, modelos.psxgPropio),
    pista,
    numericas,
    parciales: conTiempo ? parciales(eventos, jsonb, partido.duracion_parte_min) : [],
    sequias: conTiempo ? sequias(eventos, duracionTotalSeg) : [],
    tiemposMuertos: conTiempo ? efectoTiemposMuertos(eventos) : [],
    referencias,
    factores,
    titular: titular(golesFavor, golesContra, factores),
  };
}
```

- [ ] **Step 4: Run all tests, types, lint** — `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npx eslint src` → PASS / 0 errores.

- [ ] **Step 5: Contraste con un partido real (verificación, sin escribir nada).** Con la herramienta SQL de Supabase (solo lectura), para el partido con más eventos y `segundo` (si aún no hay ninguno, el de más eventos), obtener:

```sql
select
  count(*) filter (where tipo='tiro' and equipo_origen='propio') + count(*) filter (where tipo='perdida' and equipo_origen='propio') as posesiones_propias,
  count(*) filter (where tipo='tiro' and equipo_origen='rival') + count(*) filter (where tipo='perdida' and equipo_origen='rival') as posesiones_rival,
  count(*) filter (where tipo='tiro' and equipo_origen='propio' and resultado='gol') as gf,
  count(*) filter (where tipo='tiro' and equipo_origen='rival' and resultado='gol') as gc
from eventos where partido_id = '<id>';
```

y comparar con `contarPosesiones` sobre las mismas filas (script temporal en el scratchpad con `npx tsx`, que se borra después; no se commitea). Deben coincidir exactamente. Anotar el resultado en el informe de la tarea. Si la herramienta SQL no está disponible, parar y avisar al controlador.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analitica/index.ts src/lib/analitica/index.test.ts
git commit -m "feat(analitica): analizarPartido como punto de entrada del motor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Registro en vivo — tiro rival fuera, 2' rival y robo sin jugador

**Files:**
- Modify: `src/lib/partidoStats.ts` (`BOTONES_TIRO_RIVAL`, `etiquetaTiro`)
- Modify: `src/components/partido/ContadoresEnVivo.tsx`
- Test: `src/lib/partidoStats.test.ts`

**Interfaces:**
- Consumes: `exclusionesActivas(eventos, s, "rival")` (Task 1).
- Produces: botón "Fuera" en el grupo Portero; botón "2' rival" en Sanción (sin jugador); Robo habilitado sin jugador; cuenta atrás de exclusiones rivales bajo los goles del rival.

- [ ] **Step 1: Write the failing test** — añadir a `src/lib/partidoStats.test.ts` (importar `BOTONES_TIRO_RIVAL`, `etiquetaTiro`):

```ts
describe("tiro rival fuera", () => {
  it("existe el botón Fuera del rival y su etiqueta en la cronología", () => {
    expect(BOTONES_TIRO_RIVAL.map((b) => b.label)).toEqual(["Parada", "Gol en contra", "Fuera"]);
    expect(etiquetaTiro(evento({ equipo_origen: "rival", resultado: "fuera" }))).toBe("Tiro rival fuera");
    expect(etiquetaTiro(evento({ equipo_origen: "propio", resultado: "fuera" }))).toBe("Fuera");
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/partidoStats.test.ts` → FAIL.

- [ ] **Step 3: Implement en `partidoStats.ts`**

```ts
/** Grupo "Porteros" — resultado de los lanzamientos del rival contra nosotros.
 * "Fuera" (incluye poste) no lleva zona y no cuenta en el % de paradas: sirve
 * para contar las posesiones del rival (captura ampliada, spec §5). */
export const BOTONES_TIRO_RIVAL: BotonTiro[] = [
  { resultado: "parado", equipoOrigen: "rival", label: "Parada", color: "#3d8ad6" },
  { resultado: "gol", equipoOrigen: "rival", label: "Gol en contra", color: "var(--color-accent)" },
  { resultado: "fuera", equipoOrigen: "rival", label: "Fuera", color: "var(--color-text-faint)" },
];
```

Sustituir la función `etiquetaTiro` entera por:

```ts
/** Etiqueta de un evento de tiro para la cronología — mismo texto que su
 * botón; el fuera/poste del rival se distingue del nuestro. */
export function etiquetaTiro(e: EventosRow): string {
  const propio = e.equipo_origen === "propio";
  let base: string;
  if (e.resultado === "gol") base = propio ? "Gol" : "Gol en contra";
  else if (e.resultado === "parado") base = propio ? "Parado" : "Parada";
  else if (!propio) base = "Tiro rival fuera";
  else base = e.resultado === "fuera" ? "Fuera" : "Poste";
  return `${base}${e.es_penalti ? " (7m)" : ""}`;
}
```

- [ ] **Step 4: Implement en `ContadoresEnVivo.tsx`** (leer el archivo antes; los nombres citados existen):
  1. **Grupo Portero (3 botones):** `GrupoBotones` acepta `cols: 2 | 3 | 4` (`const colsClass = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";`); en `grupoTiro`, el grupo del portero pasa a `cols={3}`. En `botonesTiro` (layout compacto), quitar `className="col-span-2"` de los botones del rival y, tras el `.map`, si `esJugadorActualPortero`, añadir `<span aria-hidden="true" />` para completar la fila de 4.
  2. **Robo sin jugador:** en `registrarPerdidaRobo`, cambiar `if (finalizado || !jugadorSel) return;` por `if (finalizado) return; if (equipoOrigen === "propio" && !jugadorSel) return;` y usar `jugador_id: jugadorSel` (puede ser `null`). En los dos `BotonAccion label="Robo"` (normal y compacto), `disabled={finalizado}`.
  3. **2' rival:** nueva función junto a `registrarExclusion`:

```tsx
  /** Exclusión del rival: sin jugador (botón "2' rival"). Abre la cuenta
   * atrás bajo los goles del rival y alimenta la superioridad numérica. */
  function registrarExclusionRival() {
    if (finalizado) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: null,
      equipo_origen: "rival",
      tipo: "exclusion",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: null,
      minuto: minutoActual(cronometro, duracionParteMin),
      segundo: segundoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
  }
```

     En el grupo "Sanción" (normal), pasar a `cols={4}` con 5 botones → cambiar a dos filas: dejar `GrupoBotones titulo="Sanción" cols={4}` con 2', Amarilla, Azul, Roja y añadir debajo `GrupoBotones titulo="Rival" cols={4}` con `<BotonAccion label="2' rival" color="var(--color-warning)" count={eventos.filter((e) => e.tipo === "exclusion" && e.equipo_origen === "rival").length} disabled={finalizado} onClick={registrarExclusionRival} />`. En `accionesCompacto`, sustituir el `<span aria-hidden="true" />` de la fila de tarjetas por ese mismo botón.
  4. **Cuenta atrás del rival en el marcador:** calcular `const excluidosRival = exclusionesActivas(eventos, segundoActual(cronometro, duracionParteMin), "rival");` junto a `excluidos`, y bajo `{golesContra(eventos)}` en `cabecera` añadir el mismo bloque de chips que bajo nuestros goles pero alineado a la izquierda (`justify-start`) y con texto `2' · {formatoReloj(x.restante)}` (sin dorsal).
  5. **Cronología:** en `toquesTabla`, la rama de exclusión usa `label = e.equipo_origen === "rival" ? "Exclusión 2' rival" : "Exclusión 2'"` y `esRival: e.equipo_origen === "rival"`.

- [ ] **Step 5: Run tests, types and lint** — `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npx eslint src` → PASS.

- [ ] **Step 6: Verificación visual.** Con el servidor de desarrollo (`npx vite --host`, en segundo plano) y una página de prueba temporal en memoria (como la usada antes: `preview-live.html` + `src/__preview/live.tsx`, con ids no-uuid para que ninguna escritura llegue a Supabase), capturar con Playwright tablet 1180×820 y móvil 844×390: grupo Portero con 3 botones, "2' rival" y su cuenta atrás bajo los goles del rival, sin scroll de página (`scrollHeight === clientHeight`). Borrar la página de prueba al terminar (no se commitea).

- [ ] **Step 7: Commit**

```bash
git add src/lib/partidoStats.ts src/lib/partidoStats.test.ts src/components/partido/ContadoresEnVivo.tsx
git commit -m "feat(en-vivo): tiro rival fuera, exclusión del rival y robo sin jugador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Registro en vivo — tiempo muerto

**Files:**
- Modify: `src/lib/partidoStats.ts` (nuevas `tiemposMuertosRestantes`)
- Modify: `src/components/partido/ContadoresEnVivo.tsx`
- Test: `src/lib/partidoStats.test.ts`

**Interfaces:**
- Consumes: tipo `tiempo_muerto` (Task 1).
- Produces: `export const MAX_TM_PARTIDO = 3; export const MAX_TM_PARTE = 2;` y `export function tiemposMuertosRestantes(eventos: EventosRow[], equipo: EquipoOrigenEvento, parte: 1 | 2, duracionParteMin: number): number`.

- [ ] **Step 1: Write the failing test** — añadir a `src/lib/partidoStats.test.ts` (importar `tiemposMuertosRestantes`):

```ts
describe("tiemposMuertosRestantes", () => {
  const tm = (equipo: "propio" | "rival", segundo: number) =>
    evento({ tipo: "tiempo_muerto", resultado: null, equipo_origen: equipo, segundo });
  it("3 por partido y máximo 2 por parte, por equipo", () => {
    expect(tiemposMuertosRestantes([], "propio", 1, 30)).toBe(2);
    expect(tiemposMuertosRestantes([tm("propio", 300), tm("propio", 900)], "propio", 1, 30)).toBe(0);
    expect(tiemposMuertosRestantes([tm("propio", 300), tm("propio", 900)], "propio", 2, 30)).toBe(1);
    expect(tiemposMuertosRestantes([tm("propio", 300), tm("propio", 2000)], "propio", 2, 30)).toBe(1);
    expect(tiemposMuertosRestantes([tm("propio", 300)], "rival", 1, 30)).toBe(2);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement en `partidoStats.ts`**

```ts
/** Tiempos muertos por equipo: 3 por partido, máximo 2 por parte. */
export const MAX_TM_PARTIDO = 3;
export const MAX_TM_PARTE = 2;

/** Tiempos muertos que le quedan a un equipo en la parte en curso (el menor
 * entre lo que queda de partido y lo que queda de la parte). */
export function tiemposMuertosRestantes(eventos: EventosRow[], equipo: EquipoOrigenEvento, parte: 1 | 2, duracionParteMin: number): number {
  const propios = eventos.filter((e) => e.tipo === "tiempo_muerto" && e.equipo_origen === equipo);
  const corte = duracionParteMin * 60;
  const enParte = propios.filter((e) => (parte === 1 ? (e.segundo ?? 0) < corte : (e.segundo ?? 0) >= corte)).length;
  return Math.max(0, Math.min(MAX_TM_PARTIDO - propios.length, MAX_TM_PARTE - enParte));
}
```

- [ ] **Step 4: Implement en `ContadoresEnVivo.tsx`**
  1. Estado: `const [tiempoMuerto, setTiempoMuerto] = useState<{ equipo: EquipoOrigenEvento; finMs: number } | null>(null);` y un `useEffect` que, mientras `tiempoMuerto` no sea null, haga `setTick` cada segundo y lo ponga a null cuando `Date.now() >= finMs`.
  2. Función:

```tsx
  /** Tiempo muerto (1 minuto): para el reloj, registra el evento y muestra la
   * cuenta atrás a pantalla completa (cerrable). Se deshace como cualquier
   * acción; deshacerlo no vuelve a poner el reloj en marcha. */
  function registrarTiempoMuerto(equipo: EquipoOrigenEvento) {
    const parte = (cronometro?.parte ?? 1) as 1 | 2;
    if (finalizado || tiemposMuertosRestantes(eventos, equipo, parte, duracionParteMin) === 0) return;
    if (cronometro?.corriendo) void persistirEstadisticas({ ...partido.estadisticas, cronometro: pausar(cronometro, duracionParteMin) });
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: null,
      equipo_origen: equipo,
      tipo: "tiempo_muerto",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: null,
      minuto: minutoActual(cronometro, duracionParteMin),
      segundo: segundoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    setTiempoMuerto({ equipo, finMs: Date.now() + 60_000 });
  }
```

  3. **Botones** en `cabecera`, en el bloque de controles a la derecha y antes de "2ª parte": dos botones `h-11` con texto `TM` y `TM rival` (en compacto `TM` / `TM R`), cada uno con su restante como superíndice pequeño (`stat-number`), `disabled` si `finalizado` o restantes = 0, `aria-label` "Tiempo muerto nuestro (quedan N)" / "Tiempo muerto del rival (quedan N)".
  4. **Overlay** (dentro del contenedor raíz de ambos layouts): si `tiempoMuerto`, un `div` `fixed inset-0 z-[60]` con fondo `bg-[#0d0d0f]/95`, centrado: eyebrow "Tiempo muerto" + equipo (`equipoNombre` o `partido.rival`), la cuenta atrás `formatoReloj(Math.max(0, Math.ceil((tiempoMuerto.finMs - Date.now()) / 1000)))` en `stat-number` muy grande (`text-[120px]`), y un botón "Cerrar" (`h-11`) que hace `setTiempoMuerto(null)`.
  5. **Cronología:** en `toquesTabla`, rama nueva antes de la de pérdida/exclusión: `if (e.tipo === "tiempo_muerto") return { id: e.id, origen: "tabla", label: e.equipo_origen === "rival" ? "Tiempo muerto rival" : "Tiempo muerto", color: "rgba(255,255,255,.35)", jugadorId: null, esRival: e.equipo_origen === "rival", minuto: e.minuto, segundo: e.segundo ?? null, creadoEn: e.creado_en, afectaMarcador: false, detalle: "" };`

- [ ] **Step 5: Run tests, types, lint** → PASS.

- [ ] **Step 6: Verificación visual** como en Task 10 Step 6: botones TM en la cabecera sin desbordar en móvil 844×390 y tablet; overlay visible y "Cerrar" funciona; sin scroll de página. Borrar la página de prueba.

- [ ] **Step 7: Commit**

```bash
git add src/lib/partidoStats.ts src/lib/partidoStats.test.ts src/components/partido/ContadoresEnVivo.tsx
git commit -m "feat(en-vivo): tiempo muerto con cuenta atrás de 1 minuto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Revisión de fase

- [ ] **Step 1:** Fijar `FECHA_CAPTURA_AMPLIADA` en `src/lib/analitica/constantes.ts` al día del despliegue de esta fase y commitear.
- [ ] **Step 2:** Revisión matemática independiente (agente revisor): cada fórmula del motor contra la spec §4, casos límite e invariantes; informe con archivo:línea.
- [ ] **Step 3:** Revisión de código (code review) del diff completo de la fase.
- [ ] **Step 4:** Revisión visual (agente ui-estetica) de los cambios del registro en vivo con las capturas de Task 10/11.
- [ ] **Step 5:** `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npx eslint src && npm run build` → todo en verde.
