# Planifica la Temporada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cualquier entrenador (con o sin Excel) una pantalla propia, "Planifica la temporada", donde crear y editar por completo bloques de temporada con fechas y las semanas que caen dentro de cada uno.

**Architecture:** Reutiliza las tablas `mesociclos`/`microciclos` ya existentes. Un "bloque" de esta pantalla es una fila de `mesociclos` con `periodo_id is null` y sus propias `fecha_inicio`/`fecha_fin` (columnas nuevas). Sus "semanas" son filas de `microciclos` generadas y conciliadas automáticamente a partir de ese rango de fechas. El flujo antiguo basado en `periodos` (Excel) sigue funcionando exactamente igual, sin tocarlo — ambos conviven por el valor de `periodo_id`.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres), Tailwind v4, componentes propios en `src/components/ui`.

**Spec:** `docs/superpowers/specs/2026-09-06-planifica-temporada-design.md`

## Global Constraints

- Nunca borrar en silencio una semana (`microciclos`) que tenga `objetivo`, `rival`, `competicion` o `contenidos` rellenados al cambiar las fechas de un bloque — pedir confirmación explícita listando qué se perdería.
- `sesiones.microciclo_id` y `partidos.microciclo_id` son `on delete set null` — borrar un bloque o una semana nunca borra una sesión/partido real, solo le quita el objetivo asociado. No cambiar esas FKs.
- Sin librería de arrastre nueva — reordenar bloques con botones subir/bajar.
- Confirmaciones con `confirm()` nativo del navegador (patrón ya usado en `JugadorFormModal.tsx:149`), no un `Modal` a medida.
- Reutilizar los primitivos de UI existentes (`Field`, `Input`, `Textarea`, `Button`, `PageHeader`) — no crear componentes de formulario nuevos.
- Ningún cambio a `PlanificacionAjustes.tsx` afecta a equipos que ya tienen `periodos` — ese camino se mantiene idéntico.
- Sin test runner en el proyecto: verificación vía `npx tsc -b --noEmit`, `npx eslint <archivos>` y `npm run build`, más una comprobación manual guiada donde no baste con tipos/lint.

---

### Task 1: Migración SQL y tipos — columnas nuevas en `mesociclos`

**Files:**
- Create: `supabase/migrations/0032_planificacion_bloques.sql`
- Modify: `src/types/database.ts:74-83` (`MesociclosRow`), `src/types/database.ts:370-373` (`TableDef` de `mesociclos`)

**Interfaces:**
- Produces: `MesociclosRow` con tres campos nuevos: `fecha_inicio: string | null`, `fecha_fin: string | null`, `orden: number | null`. Todas las tareas siguientes dependen de estos nombres exactos.

- [ ] **Step 1: Crear la migración**

```sql
-- supabase/migrations/0032_planificacion_bloques.sql
-- Añade fecha_inicio/fecha_fin/orden a mesociclos para la sección
-- "Planifica la temporada": un mesociclo sin periodo_id, con estas fechas
-- rellenas, es un "bloque" gestionado desde esa pantalla nueva. Los
-- mesociclos existentes (con periodo_id, dados de alta desde el Excel)
-- quedan con estas tres columnas en null y no se ven afectados.
alter table mesociclos
  add column fecha_inicio date,
  add column fecha_fin date,
  add column orden integer;
```

- [ ] **Step 2: Aplicar la migración al proyecto Supabase real**

Usar la herramienta MCP `mcp__supabase__apply_migration` con `name: "planificacion_bloques"` y el SQL de arriba como `query`. Es un único proyecto de producción, no hay entorno de desarrollo separado — aplica directamente ahí, igual que las migraciones anteriores de este proyecto.

- [ ] **Step 3: Verificar que las columnas existen**

Usar `mcp__supabase__execute_sql` con:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'mesociclos' and column_name in ('fecha_inicio', 'fecha_fin', 'orden');
```

Esperado: 3 filas, `is_nullable = 'YES'` en las tres.

- [ ] **Step 4: Actualizar `MesociclosRow` en `src/types/database.ts`**

Sustituir (línea 74-83):

```ts
export type MesociclosRow = {
  id: UUID;
  equipo_id: UUID;
  periodo_id: UUID | null;
  nombre: string;
  objetivo: string | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};
```

por:

```ts
export type MesociclosRow = {
  id: UUID;
  equipo_id: UUID;
  periodo_id: UUID | null;
  nombre: string;
  objetivo: string | null;
  /** Rango propio de un "bloque" de Planifica la Temporada. En null para
   * los mesociclos del flujo antiguo (con periodo_id), que toman sus
   * fechas de `periodos` en su lugar. */
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /** Orden de presentación en Planifica la Temporada. En null para
   * mesociclos del flujo antiguo, que no se reordenan ahí. */
  orden: number | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 5: Actualizar el `TableDef` de `mesociclos`**

Sustituir (línea 370-373):

```ts
      mesociclos: TableDef<
        MesociclosRow,
        "id" | "periodo_id" | "objetivo" | "notas_adicionales" | "created_at" | "updated_at"
      >;
```

por:

```ts
      mesociclos: TableDef<
        MesociclosRow,
        | "id"
        | "periodo_id"
        | "objetivo"
        | "fecha_inicio"
        | "fecha_fin"
        | "orden"
        | "notas_adicionales"
        | "created_at"
        | "updated_at"
      >;
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc -b --noEmit`
Expected: sin errores (nada más usa todavía los campos nuevos).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0032_planificacion_bloques.sql src/types/database.ts
git commit -m "feat: añade fecha_inicio/fecha_fin/orden a mesociclos para Planifica la Temporada"
```

---

### Task 2: Generación y conciliación de semanas en `src/lib/microciclos.ts`

**Files:**
- Modify: `src/lib/microciclos.ts` (añadir funciones)
- Modify: `src/components/ajustes/AsistenteConfiguracionTemporada.tsx:1-42` (usar la función movida en vez de la propia)

**Interfaces:**
- Consumes: `MesociclosRow`/`MicrociclosRow` de Task 1, `addDays`/`startOfWeek`/`toISODate` de `src/lib/calendar.ts` (ya existen, firmas: `addDays(d: Date, n: number): Date`, `startOfWeek(d: Date): Date`, `toISODate(d: Date): string`).
- Produces (para Task 3):
  - `type SemanaRango = { fecha_inicio: string; fecha_fin: string }`
  - `semanasDeRango(fechaInicio: string, fechaFin: string): SemanaRango[]`
  - `type PlanConciliacion = { conservar: MicrociclosRow[]; crear: SemanaRango[]; borrarSinAviso: MicrociclosRow[]; borrarConAviso: MicrociclosRow[] }`
  - `conciliarSemanas(actuales: MicrociclosRow[], nuevaFechaInicio: string, nuevaFechaFin: string): PlanConciliacion`
  - `numerarSemanas<T extends { fecha_inicio: string | null }>(semanas: T[]): (T & { semana: number })[]`

- [ ] **Step 1: Añadir las funciones a `src/lib/microciclos.ts`**

Añadir al principio del archivo el import que falta y, al final, el bloque nuevo:

```ts
import { addDays, startOfWeek, toISODate } from "@/lib/calendar";
```

```ts
export type SemanaRango = { fecha_inicio: string; fecha_fin: string };

/** Semanas lunes-domingo que cubren [fechaInicio, fechaFin], alineadas con el resto del calendario. */
export function semanasDeRango(fechaInicio: string, fechaFin: string): SemanaRango[] {
  const fin = new Date(fechaFin);
  const semanas: SemanaRango[] = [];
  let cursor = startOfWeek(new Date(fechaInicio));
  while (cursor <= fin) {
    semanas.push({ fecha_inicio: toISODate(cursor), fecha_fin: toISODate(addDays(cursor, 6)) });
    cursor = addDays(cursor, 7);
  }
  return semanas;
}

/** Numera 1..N las semanas de un bloque en orden cronológico por fecha_inicio. */
export function numerarSemanas<T extends { fecha_inicio: string | null }>(semanas: T[]): (T & { semana: number })[] {
  return [...semanas]
    .sort((a, b) => (a.fecha_inicio ?? "").localeCompare(b.fecha_inicio ?? ""))
    .map((s, i) => ({ ...s, semana: i + 1 }));
}

function semanaTieneContenido(m: MicrociclosRow): boolean {
  const contenidos = m.contenidos as Record<string, unknown>;
  const contenidosRellenos = Object.values(contenidos ?? {}).some((v) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v),
  );
  return Boolean(m.objetivo?.trim() || m.rival?.trim() || m.competicion?.trim() || contenidosRellenos);
}

export type PlanConciliacion = {
  /** Semanas existentes que se conservan tal cual (su fecha_inicio sigue en el nuevo rango). */
  conservar: MicrociclosRow[];
  /** Semanas nuevas a insertar (el rango creció). */
  crear: SemanaRango[];
  /** Semanas existentes fuera del nuevo rango, sin ningún dato — se borran sin preguntar. */
  borrarSinAviso: MicrociclosRow[];
  /** Semanas existentes fuera del nuevo rango, con datos — requieren confirmación explícita antes de borrarlas. */
  borrarConAviso: MicrociclosRow[];
};

/**
 * Compara las semanas actuales de un bloque contra un nuevo rango de fechas
 * y calcula qué conservar, crear o borrar — no toca la base de datos.
 */
export function conciliarSemanas(
  actuales: MicrociclosRow[],
  nuevaFechaInicio: string,
  nuevaFechaFin: string,
): PlanConciliacion {
  const nuevasSemanas = semanasDeRango(nuevaFechaInicio, nuevaFechaFin);
  const fechasNuevas = new Set(nuevasSemanas.map((s) => s.fecha_inicio));
  const fechasActuales = new Set(actuales.map((m) => m.fecha_inicio));

  const conservar = actuales.filter((m) => m.fecha_inicio && fechasNuevas.has(m.fecha_inicio));
  const crear = nuevasSemanas.filter((s) => !fechasActuales.has(s.fecha_inicio));
  const fuera = actuales.filter((m) => !m.fecha_inicio || !fechasNuevas.has(m.fecha_inicio));

  return {
    conservar,
    crear,
    borrarSinAviso: fuera.filter((m) => !semanaTieneContenido(m)),
    borrarConAviso: fuera.filter(semanaTieneContenido),
  };
}
```

- [ ] **Step 2: Verificar la lógica con un script desechable**

No hay test runner en el proyecto — para esta lógica pura conviene comprobarla fuera de la UI antes de construir nada encima, igual que se hizo esta misma sesión para depurar el PDF (`scripts/diagnostico-pdf-partido.tsx`, ya borrado).

Crear `scripts/verifica-conciliacion.ts`:

```ts
import { conciliarSemanas, numerarSemanas, semanasDeRango } from "../src/lib/microciclos";
import type { MicrociclosRow } from "../src/types/database";

function microciclo(parcial: Partial<MicrociclosRow>): MicrociclosRow {
  return {
    id: parcial.fecha_inicio ?? "sin-id",
    equipo_id: "e1",
    mesociclo_id: "m1",
    semana: null,
    fecha_inicio: null,
    fecha_fin: null,
    rival: null,
    competicion: null,
    contenidos: {},
    objetivo: null,
    notas_adicionales: null,
    created_at: "",
    updated_at: "",
    ...parcial,
  };
}

// Caso 1: rango de 3 semanas completo, sin datos previos -> 3 filas a crear, nada que conservar/borrar.
const semanas = semanasDeRango("2026-09-01", "2026-09-20");
console.assert(semanas.length === 3, `esperaba 3 semanas, obtuve ${semanas.length}`);

const plan1 = conciliarSemanas([], "2026-09-01", "2026-09-20");
console.assert(plan1.crear.length === 3 && plan1.conservar.length === 0, "plan1 falló");

// Caso 2: había 3 semanas, el bloque se acorta a solo la primera. La 1ª se
// conserva, la 2ª estaba vacía (se borra sin aviso), la 3ª tiene objetivo
// (debe pedir aviso).
const existentes = [
  microciclo({ fecha_inicio: semanas[0].fecha_inicio, fecha_fin: semanas[0].fecha_fin }),
  microciclo({ fecha_inicio: semanas[1].fecha_inicio, fecha_fin: semanas[1].fecha_fin }),
  microciclo({ fecha_inicio: semanas[2].fecha_inicio, fecha_fin: semanas[2].fecha_fin, objetivo: "Defensa 6-0" }),
];
const plan2 = conciliarSemanas(existentes, semanas[0].fecha_inicio, semanas[0].fecha_fin);
console.assert(plan2.conservar.length === 1, `esperaba conservar 1, obtuve ${plan2.conservar.length}`);
console.assert(plan2.borrarSinAviso.length === 1, `esperaba borrarSinAviso 1, obtuve ${plan2.borrarSinAviso.length}`);
console.assert(plan2.borrarConAviso.length === 1, `esperaba borrarConAviso 1, obtuve ${plan2.borrarConAviso.length}`);
console.assert(plan2.crear.length === 0, `esperaba crear 0, obtuve ${plan2.crear.length}`);

// Caso 3: numerarSemanas ordena por fecha y numera 1..N aunque lleguen desordenadas.
const numeradas = numerarSemanas([
  { fecha_inicio: semanas[2].fecha_inicio },
  { fecha_inicio: semanas[0].fecha_inicio },
  { fecha_inicio: semanas[1].fecha_inicio },
]);
console.assert(
  numeradas[0].fecha_inicio === semanas[0].fecha_inicio && numeradas[0].semana === 1,
  "numerarSemanas no ordenó/numeró bien",
);

console.log("OK: verifica-conciliacion");
```

Run: `TSX_TSCONFIG_PATH=./tsconfig.app.json npx tsx scripts/verifica-conciliacion.ts`
Expected: `OK: verifica-conciliacion` y ningún `Assertion failed` en la salida.

- [ ] **Step 3: Borrar el script desechable**

```bash
rm scripts/verifica-conciliacion.ts
```

No se commitea — era solo para verificar la lógica antes de construir la UI encima, igual que el diagnóstico del PDF en esta misma sesión.

- [ ] **Step 4: Quitar la definición duplicada de `semanasDeRango` en `AsistenteConfiguracionTemporada.tsx`**

En `src/components/ajustes/AsistenteConfiguracionTemporada.tsx`, sustituir la línea de import:

```ts
import { addDays, startOfWeek, toISODate } from "@/lib/calendar";
```

por:

```ts
import { semanasDeRango } from "@/lib/microciclos";
```

Y borrar la función local (líneas 32-42):

```ts
/** Semanas lunes-domingo que cubren [fechaInicio, fechaFin], alineadas con el resto del calendario. */
function semanasDeRango(fechaInicio: string, fechaFin: string): { fecha_inicio: string; fecha_fin: string }[] {
  const fin = new Date(fechaFin);
  const semanas: { fecha_inicio: string; fecha_fin: string }[] = [];
  let cursor = startOfWeek(new Date(fechaInicio));
  while (cursor <= fin) {
    semanas.push({ fecha_inicio: toISODate(cursor), fecha_fin: toISODate(addDays(cursor, 6)) });
    cursor = addDays(cursor, 7);
  }
  return semanas;
}
```

El resto del archivo no cambia — ya llama a `semanasDeRango(f.fecha_inicio, f.fecha_fin)` con la misma firma.

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/lib/microciclos.ts src/components/ajustes/AsistenteConfiguracionTemporada.tsx`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/microciclos.ts src/components/ajustes/AsistenteConfiguracionTemporada.tsx
git commit -m "feat: añade generación y conciliación de semanas reutilizable en lib/microciclos"
```

---

### Task 3: `BloqueCard.tsx` y `PlanificacionPage.tsx` — CRUD completo

**Files:**
- Create: `src/components/planificacion/BloqueCard.tsx`
- Create: `src/pages/PlanificacionPage.tsx`

**Interfaces:**
- Consumes: `MesociclosRow`/`MicrociclosRow` (Task 1), `semanasDeRango`/`conciliarSemanas`/`numerarSemanas` (Task 2), `useEquipo()` (ya existe, devuelve `{ equipo, equipoId }`), `PageHeader`, `Field`/`Input`/`Textarea`, `Button` (ya existen, firmas vistas en el repo).
- Produces (para Task 4): componente exportado `PlanificacionPage` desde `src/pages/PlanificacionPage.tsx`, sin props (lee `equipoId` de `useEquipo()` internamente, igual que el resto de páginas de equipo).

- [ ] **Step 1: Crear `src/components/planificacion/BloqueCard.tsx`**

```tsx
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { MesociclosRow, MicrociclosRow } from "@/types/database";

/**
 * Tarjeta de un bloque de "Planifica la temporada": nombre y fechas
 * editables, objetivo del bloque, y la lista de sus semanas (microciclos)
 * también editables. Toda la persistencia vive en el padre (PlanificacionPage)
 * — este componente solo renderiza y dispara callbacks.
 */
export function BloqueCard({
  bloque,
  semanas,
  abierto,
  esPrimero,
  esUltimo,
  onToggle,
  onGuardarCampo,
  onGuardarFechas,
  onGuardarSemana,
  onBorrar,
  onMover,
}: {
  bloque: MesociclosRow;
  semanas: MicrociclosRow[];
  abierto: boolean;
  esPrimero: boolean;
  esUltimo: boolean;
  onToggle: () => void;
  onGuardarCampo: (campo: "nombre" | "objetivo", valor: string) => void;
  onGuardarFechas: (fechaInicio: string, fechaFin: string) => void;
  onGuardarSemana: (id: string, campo: "objetivo" | "rival" | "competicion", valor: string) => void;
  onBorrar: () => void;
  onMover: (direccion: "subir" | "bajar") => void;
}) {
  const [fechaInicioForm, setFechaInicioForm] = useState(bloque.fecha_inicio ?? "");
  const [fechaFinForm, setFechaFinForm] = useState(bloque.fecha_fin ?? "");

  const semanasOrdenadas = [...semanas].sort((a, b) => (a.fecha_inicio ?? "").localeCompare(b.fecha_inicio ?? ""));
  const fechasCambiadas = fechaInicioForm !== (bloque.fecha_inicio ?? "") || fechaFinForm !== (bloque.fecha_fin ?? "");

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <input
          className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[var(--color-text)] outline-none"
          defaultValue={bloque.nombre}
          onBlur={(e) => onGuardarCampo("nombre", e.target.value)}
        />
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Subir bloque"
            onClick={() => onMover("subir")}
            disabled={esPrimero}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            aria-label="Bajar bloque"
            onClick={() => onMover("bajar")}
            disabled={esUltimo}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
          >
            <ArrowDown size={16} />
          </button>
          <button
            type="button"
            aria-label="Borrar bloque"
            onClick={onBorrar}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
          >
            <Trash2 size={16} />
          </button>
          <button type="button" onClick={onToggle} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      <div className="text-xs text-[var(--color-text-muted)]">
        {bloque.fecha_inicio && bloque.fecha_fin ? `${bloque.fecha_inicio} → ${bloque.fecha_fin}` : "Sin fechas"} ·{" "}
        {semanas.length} semana{semanas.length === 1 ? "" : "s"}
      </div>

      {abierto && (
        <div className="flex flex-col gap-4 border-t border-[var(--color-border)] pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de inicio">
              <Input type="date" value={fechaInicioForm} onChange={(e) => setFechaInicioForm(e.target.value)} />
            </Field>
            <Field label="Fecha de fin">
              <Input type="date" value={fechaFinForm} onChange={(e) => setFechaFinForm(e.target.value)} />
            </Field>
          </div>
          {fechasCambiadas && (
            <Button size="sm" onClick={() => onGuardarFechas(fechaInicioForm, fechaFinForm)} className="self-start">
              Guardar fechas
            </Button>
          )}

          <Field label="Objetivo del bloque">
            <Textarea
              className="min-h-16"
              placeholder="Objetivo de este bloque..."
              defaultValue={bloque.objetivo ?? ""}
              onBlur={(e) => onGuardarCampo("objetivo", e.target.value)}
            />
          </Field>

          {semanasOrdenadas.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
              <div className="text-xs font-medium text-[var(--color-text-muted)]">Semanas</div>
              {semanasOrdenadas.map((s) => (
                <div key={s.id} className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    Semana {s.semana} · {s.fecha_inicio} → {s.fecha_fin}
                  </span>
                  <Field label="Objetivo">
                    <Textarea
                      className="min-h-10 text-sm"
                      placeholder="Sin rellenar todavía..."
                      defaultValue={s.objetivo ?? ""}
                      onBlur={(e) => onGuardarSemana(s.id, "objetivo", e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Rival (opcional)">
                      <Input defaultValue={s.rival ?? ""} onBlur={(e) => onGuardarSemana(s.id, "rival", e.target.value)} />
                    </Field>
                    <Field label="Competición (opcional)">
                      <Input
                        defaultValue={s.competicion ?? ""}
                        onBlur={(e) => onGuardarSemana(s.id, "competicion", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear `src/pages/PlanificacionPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { PageHeader } from "@/components/layout/PageHeader";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { BloqueCard } from "@/components/planificacion/BloqueCard";
import { conciliarSemanas, numerarSemanas, semanasDeRango } from "@/lib/microciclos";
import type { MesociclosRow, MicrociclosRow } from "@/types/database";

export function PlanificacionPage() {
  const { equipoId } = useEquipo();
  const [bloques, setBloques] = useState<MesociclosRow[]>([]);
  const [microciclos, setMicrociclos] = useState<MicrociclosRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoInicio, setNuevoInicio] = useState("");
  const [nuevoFin, setNuevoFin] = useState("");
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  async function cargar() {
    setCargando(true);
    const [{ data: meso }, { data: micro }] = await Promise.all([
      supabase.from("mesociclos").select("*").eq("equipo_id", equipoId).is("periodo_id", null).order("orden"),
      supabase.from("microciclos").select("*").eq("equipo_id", equipoId).order("fecha_inicio"),
    ]);
    setBloques(meso ?? []);
    setMicrociclos(micro ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  async function guardarCampoBloque(id: string, campo: "nombre" | "objetivo", valorRaw: string) {
    const valor = campo === "nombre" ? valorRaw.trim() : valorRaw.trim() || null;
    if (campo === "nombre" && !valor) return;
    const { error } = await supabase.from("mesociclos").update({ [campo]: valor }).eq("id", id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setBloques((bs) => bs.map((b) => (b.id === id ? { ...b, [campo]: valor } : b)));
  }

  async function guardarCampoSemana(id: string, campo: "objetivo" | "rival" | "competicion", valorRaw: string) {
    const valor = valorRaw.trim() || null;
    const { error } = await supabase.from("microciclos").update({ [campo]: valor }).eq("id", id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setMicrociclos((ms) => ms.map((m) => (m.id === id ? { ...m, [campo]: valor } : m)));
  }

  async function guardarFechasBloque(bloque: MesociclosRow, nuevaInicio: string, nuevaFin: string) {
    if (nuevaInicio > nuevaFin) {
      alert("La fecha de inicio no puede ser posterior a la de fin.");
      return;
    }
    const actuales = microciclos.filter((m) => m.mesociclo_id === bloque.id);
    const plan = conciliarSemanas(actuales, nuevaInicio, nuevaFin);

    if (plan.borrarConAviso.length > 0) {
      const detalle = plan.borrarConAviso
        .map(
          (m) =>
            `- Semana del ${m.fecha_inicio}: ${[m.objetivo, m.rival, m.competicion].filter(Boolean).join(" · ") || "contenido guardado"}`,
        )
        .join("\n");
      const confirmado = confirm(
        `Al cambiar las fechas se perderían estas semanas, que ya tienen datos:\n\n${detalle}\n\n¿Seguro que quieres continuar y borrarlas?`,
      );
      if (!confirmado) return;
    }

    const idsABorrar = [...plan.borrarSinAviso, ...plan.borrarConAviso].map((m) => m.id);
    if (idsABorrar.length > 0) {
      await supabase.from("microciclos").delete().in("id", idsABorrar);
    }
    if (plan.crear.length > 0) {
      await supabase.from("microciclos").insert(
        plan.crear.map((s) => ({
          equipo_id: bloque.equipo_id,
          mesociclo_id: bloque.id,
          fecha_inicio: s.fecha_inicio,
          fecha_fin: s.fecha_fin,
          contenidos: {},
          objetivo: null,
        })),
      );
    }

    const { data: supervivientes } = await supabase
      .from("microciclos")
      .select("*")
      .eq("mesociclo_id", bloque.id)
      .order("fecha_inicio");
    await Promise.all(
      numerarSemanas(supervivientes ?? []).map((m) => supabase.from("microciclos").update({ semana: m.semana }).eq("id", m.id)),
    );

    await supabase.from("mesociclos").update({ fecha_inicio: nuevaInicio, fecha_fin: nuevaFin }).eq("id", bloque.id);
    await cargar();
  }

  async function borrarBloque(bloque: MesociclosRow) {
    const numSemanas = microciclos.filter((m) => m.mesociclo_id === bloque.id).length;
    const confirmado = confirm(
      `¿Borrar el bloque "${bloque.nombre}" y sus ${numSemanas} semanas? Las sesiones o partidos que las tuvieran asociadas no se borran, pero perderán el objetivo semanal. No se puede deshacer.`,
    );
    if (!confirmado) return;
    const { error } = await supabase.from("mesociclos").delete().eq("id", bloque.id);
    if (error) {
      alert("No se pudo borrar: " + error.message);
      return;
    }
    await cargar();
  }

  async function moverBloque(id: string, direccion: "subir" | "bajar") {
    const ordenados = [...bloques].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const i = ordenados.findIndex((b) => b.id === id);
    const j = direccion === "subir" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ordenados.length) return;
    const a = ordenados[i];
    const b = ordenados[j];
    const ordenA = a.orden ?? i;
    const ordenB = b.orden ?? j;
    await Promise.all([
      supabase.from("mesociclos").update({ orden: ordenB }).eq("id", a.id),
      supabase.from("mesociclos").update({ orden: ordenA }).eq("id", b.id),
    ]);
    setBloques((bs) => bs.map((x) => (x.id === a.id ? { ...x, orden: ordenB } : x.id === b.id ? { ...x, orden: ordenA } : x)));
  }

  async function crearBloque() {
    if (!nuevoNombre.trim() || !nuevoInicio || !nuevoFin) {
      alert("Rellena nombre y fechas para crear el bloque.");
      return;
    }
    if (nuevoInicio > nuevoFin) {
      alert("La fecha de inicio no puede ser posterior a la de fin.");
      return;
    }
    setGuardandoNuevo(true);
    const ordenMax = Math.max(0, ...bloques.map((b) => b.orden ?? 0));
    const { data: nuevo, error } = await supabase
      .from("mesociclos")
      .insert({
        equipo_id: equipoId,
        periodo_id: null,
        nombre: nuevoNombre.trim(),
        fecha_inicio: nuevoInicio,
        fecha_fin: nuevoFin,
        orden: ordenMax + 1,
      })
      .select()
      .single();
    if (error || !nuevo) {
      alert("No se pudo crear el bloque: " + (error?.message ?? ""));
      setGuardandoNuevo(false);
      return;
    }
    const semanas = numerarSemanas(semanasDeRango(nuevoInicio, nuevoFin));
    if (semanas.length > 0) {
      await supabase.from("microciclos").insert(
        semanas.map((s) => ({
          equipo_id: equipoId,
          mesociclo_id: nuevo.id,
          semana: s.semana,
          fecha_inicio: s.fecha_inicio,
          fecha_fin: s.fecha_fin,
          contenidos: {},
          objetivo: null,
        })),
      );
    }
    setNuevoNombre("");
    setNuevoInicio("");
    setNuevoFin("");
    setCreando(false);
    setGuardandoNuevo(false);
    await cargar();
  }

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }

  const ordenados = [...bloques].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Planifica la temporada" />

      {ordenados.length === 0 && !creando && (
        <div className="card-surface p-4 text-sm text-[var(--color-text-muted)]">
          Todavía no has creado ningún bloque. Un bloque es un tramo de la temporada (por ejemplo, "Primera vuelta")
          con sus propias fechas — dentro se generan solas las semanas.
        </div>
      )}

      {ordenados.map((bloque, i) => (
        <BloqueCard
          key={bloque.id}
          bloque={bloque}
          semanas={microciclos.filter((m) => m.mesociclo_id === bloque.id)}
          abierto={abiertoId === bloque.id}
          esPrimero={i === 0}
          esUltimo={i === ordenados.length - 1}
          onToggle={() => setAbiertoId((id) => (id === bloque.id ? null : bloque.id))}
          onGuardarCampo={(campo, valor) => guardarCampoBloque(bloque.id, campo, valor)}
          onGuardarFechas={(inicio, fin) => guardarFechasBloque(bloque, inicio, fin)}
          onGuardarSemana={guardarCampoSemana}
          onBorrar={() => borrarBloque(bloque)}
          onMover={(dir) => moverBloque(bloque.id, dir)}
        />
      ))}

      {creando ? (
        <div className="card-surface flex flex-col gap-3 p-4">
          <Field label="Nombre del bloque">
            <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Primera vuelta" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de inicio">
              <Input type="date" value={nuevoInicio} onChange={(e) => setNuevoInicio(e.target.value)} />
            </Field>
            <Field label="Fecha de fin">
              <Input type="date" value={nuevoFin} onChange={(e) => setNuevoFin(e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCreando(false)} disabled={guardandoNuevo}>
              Cancelar
            </Button>
            <Button onClick={crearBloque} disabled={guardandoNuevo}>
              {guardandoNuevo ? "Creando..." : "Crear bloque"}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setCreando(true)} className="gap-2 self-start">
          <Plus size={16} /> Nuevo bloque
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/components/planificacion/BloqueCard.tsx src/pages/PlanificacionPage.tsx`
Expected: sin errores. (La página todavía no está enrutada — eso es la Task 4 — así que no es alcanzable desde la UI todavía, pero debe compilar sola.)

- [ ] **Step 4: Commit**

```bash
git add src/components/planificacion/BloqueCard.tsx src/pages/PlanificacionPage.tsx
git commit -m "feat: añade BloqueCard y PlanificacionPage con CRUD completo de bloques y semanas"
```

---

### Task 4: Ruta y entrada de menú

**Files:**
- Modify: `src/App.tsx` (import + `<Route>`)
- Modify: `src/lib/navConfig.ts`

**Interfaces:**
- Consumes: `PlanificacionPage` (Task 3).
- Produces: ruta `/equipos/:equipoId/planificacion` navegable, y entrada de menú con `key: "planificacion"` — Task 5 usa este mismo `key`/`path` para el enlace desde Ajustes.

- [ ] **Step 1: Registrar la ruta en `src/App.tsx`**

Añadir el import junto a los demás de `@/pages/...` (cerca de `ModeloJuegoPage`):

```ts
import { PlanificacionPage } from "@/pages/PlanificacionPage";
```

Añadir la ruta junto a `modelo-juego` (tras la línea `<Route path="modelo-juego" element={<ModeloJuegoPage />} />`):

```tsx
<Route path="planificacion" element={<PlanificacionPage />} />
```

- [ ] **Step 2: Añadir la entrada de navegación en `src/lib/navConfig.ts`**

Añadir el import del icono junto a los demás de `lucide-react`:

```ts
import {
  Home,
  CalendarDays,
  CalendarRange,
  Users,
  Trophy,
  BrainCircuit,
  Dumbbell,
  LineChart,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";
```

Añadir la entrada en `NAV_ITEMS`, justo después de `modelo-juego`:

```ts
  { key: "planificacion", label: "Planifica la temporada", path: "planificacion", icon: CalendarRange, enBarraInferior: false },
```

Queda con `enBarraInferior: false`, así que aparece bajo "Más" junto a Rivales/Modelo de juego/Ejercicios/Progreso — tal y como se pidió.

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/App.tsx src/lib/navConfig.ts`
Expected: sin errores.

- [ ] **Step 4: Build completo**

Run: `npm run build`
Expected: build correcto, sin errores.

- [ ] **Step 5: Comprobación manual**

Arrancar la app (`npm run dev`), entrar a un equipo, abrir "Más" y confirmar que aparece "Planifica la temporada" en el sitio esperado; abrirla y comprobar que carga sin bloques (equipo real, probablemente ya tiene `periodos`, así que puede aparecer vacía — es el comportamiento correcto, ver Global Constraints). Crear un bloque de prueba con fechas, comprobar que aparecen sus semanas, editar su nombre/objetivo, cambiarle las fechas para que pierda una semana con objetivo relleno y comprobar que pide confirmación, reordenarlo si hay más de uno, y borrarlo al terminar la prueba.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/lib/navConfig.ts
git commit -m "feat: registra la ruta y la entrada de menú de Planifica la Temporada"
```

---

### Task 5: Simplificar `PlanificacionAjustes.tsx` y actualizar `CLAUDE.md`

**Files:**
- Modify: `src/components/ajustes/PlanificacionAjustes.tsx:74-78`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: ruta `planificacion` (Task 4) para el enlace.

- [ ] **Step 1: Cambiar el hueco vacío de `PlanificacionAjustes.tsx`**

Sustituir (línea 74-78):

```tsx
  if (cargando) return null;

  if (periodos.length === 0) {
    return <AsistenteConfiguracionTemporada equipoId={equipoId} onCompletado={cargar} />;
  }
```

por:

```tsx
  if (cargando) return null;

  if (periodos.length === 0) {
    return (
      <div className="card-surface flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Planificación de temporada</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Este equipo todavía no tiene fases configuradas desde Excel. Para dar de alta y editar bloques y semanas
          directamente desde la app, usa la sección "Planifica la temporada" en el menú "Más".
        </p>
        <Link to={`/equipos/${equipoId}/planificacion`}>
          <Button variant="secondary" size="sm">
            Ir a Planifica la temporada
          </Button>
        </Link>
      </div>
    );
  }
```

Añadir los imports que ahora hacen falta, junto a los existentes al principio del archivo:

```ts
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
```

Quitar el import ahora sin uso:

```ts
import { AsistenteConfiguracionTemporada } from "@/components/ajustes/AsistenteConfiguracionTemporada";
```

`AsistenteConfiguracionTemporada.tsx` no se borra — sigue siendo el flujo de alta para equipos que sí quieren dar de alta `periodos` (Excel) a mano; solo deja de lanzarse automáticamente desde este hueco.

- [ ] **Step 2: Actualizar `CLAUDE.md`**

En la sección "## Base de datos", sustituir la frase:

```
- Todo dato es editable y borrable después de creado, no solo alta — **excepción deliberada**: `equipos`, `periodos`, `mesociclos` y `microciclos` no tienen CRUD en la app (decisión explícita del usuario). Se gestionan re-ejecutando `scripts/seed-*.ts` desde el Excel real o editando directamente en el SQL Editor de Supabase — son datos que se fijan una vez por temporada, no de uso frecuente. No construir pantallas de edición para estas tablas salvo que el usuario lo pida explícitamente.
```

por:

```
- Todo dato es editable y borrable después de creado, no solo alta — **excepción deliberada, parcial**: `equipos` no tiene CRUD en la app. `periodos` (y los `mesociclos`/`microciclos` que cuelgan de un `periodo_id`) tampoco: se gestionan re-ejecutando `scripts/seed-*.ts` desde el Excel real o editando directamente en el SQL Editor de Supabase, para quien ya planifica así. Los `mesociclos`/`microciclos` sin `periodo_id` ("bloques" de temporada) sí tienen alta y edición completa vía la sección "Planifica la temporada" (`src/pages/PlanificacionPage.tsx`) — pensada para quien no parte de un Excel. Ambos caminos conviven sobre las mismas tablas sin interferir entre sí.
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/components/ajustes/PlanificacionAjustes.tsx`
Expected: sin errores.

- [ ] **Step 4: Build completo**

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 5: Comprobación manual**

Si hay algún equipo de prueba sin `periodos`, entrar a Ajustes y comprobar que aparece el aviso nuevo con el enlace, y que al pinchar lleva a "Planifica la temporada". Para un equipo que ya tiene `periodos`, confirmar que Ajustes se ve exactamente igual que antes.

- [ ] **Step 6: Commit**

```bash
git add src/components/ajustes/PlanificacionAjustes.tsx CLAUDE.md
git commit -m "docs: enlaza Ajustes a Planifica la Temporada y corrige la nota de CLAUDE.md sobre CRUD"
```

---

## Revisión final

Tras la Task 5: revisión de rama completa (spec compliance + calidad + `ui-estetica`) antes de fusionar, siguiendo `superpowers:subagent-driven-development`. Puntos a los que prestar atención especial en esa revisión: que el borrado de semanas con contenido nunca ocurra sin el `confirm()` explícito, que un equipo con `periodos` no vea ningún cambio de comportamiento, y que los estilos de `BloqueCard`/`PlanificacionPage` sigan la paleta y tipografía del proyecto (crema/tinta/rojo, Barlow Condensed en cifras/títulos).
