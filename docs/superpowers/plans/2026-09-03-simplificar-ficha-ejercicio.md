# Simplificar la ficha de ejercicio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar 8 campos estructurados de `ejercicios` (organización, reglas, consignas, progresión, regresión, errores frecuentes, correcciones, transferencia al partido), migrando su contenido al campo `notas_adicionales` ya existente, y simplificar el formulario a un único campo de notas libres.

**Architecture:** Una migración SQL concatena el contenido de los 8 campos en `notas_adicionales` (respetando cualquier contenido previo) y después elimina las columnas. `EjerciciosRow` y `EjercicioFormModal.tsx` se actualizan para no referenciarlas más. No hay una vista de detalle separada: `EjercicioFormModal.tsx` sirve de alta/edición/solo-lectura para los tres casos, así que un solo cambio de formulario cubre los tres.

**Tech Stack:** React + TypeScript, Supabase (Postgres), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-03-simplificar-ficha-ejercicio-design.md`

## Global Constraints

- Todo texto de UI en español.
- `notas_adicionales` es el único campo de notas libres — no crear un segundo campo. Ya existe en `EjerciciosRow` (`string | null`) y ya tiene su `<Field>` en el formulario; no cambia de tipo ni de comportamiento, solo pasa a ser también el destino de lo migrado.
- El campo `consignas` de `BloqueSesion` (`src/types/database.ts`, usado por `BloqueModal.tsx`/`SesionDetailPage.tsx`) es un campo homónimo pero de una tabla y un tipo totalmente distintos — **no tocar**, no tiene relación con `ejercicios.consignas`.
- `descripcion` se mantiene sin cambios — no estaba en la lista de campos a eliminar.
- La tabla `ejercicios` está vacía en producción en el momento de escribir este plan (verificado por consulta directa) — no hay ejercicios reales con estos campos rellenos. La verificación de la Task 1 usa datos de prueba insertados y borrados durante la propia tarea, no datos reales.
- Convención de tests de este proyecto: no hay tests de componentes ni de código que llama a Supabase directamente. Ninguna tarea de este plan lleva test de vitest — verificación mediante `tsc`/`eslint`/`build` y, para la migración, consultas SQL directas contra la base de datos real.

---

### Task 1: Migración de datos y esquema, con verificación

**Files:**
- Create: `supabase/migrations/0027_ejercicios_simplifica_ficha.sql`

**Interfaces:**
- Produces: la tabla `ejercicios` sin las columnas `organizacion`, `reglas`, `consignas`, `progresion`, `regresion`, `errores_frecuentes`, `correcciones`, `transferencia_partido` — usado por Task 2 (que actualiza `EjerciciosRow` para que coincida) y Task 3 (que actualiza el formulario).

Esta tarea usa las herramientas MCP de Supabase directamente (`mcp__supabase__execute_sql` para insertar/consultar/borrar datos de prueba, `mcp__supabase__apply_migration` para aplicar la migración) — no son comandos de shell, son llamadas de herramienta.

- [ ] **Step 1: Insertar ejercicios de prueba con los 8 campos rellenos**

Usa `mcp__supabase__execute_sql` con esta consulta exacta (usa el `equipo_id` real `0c8df037-7657-4a18-8e7c-7b5b6bf703ac`, ya verificado que existe):

```sql
insert into ejercicios (equipo_id, nombre, organizacion, reglas, consignas, progresion, regresion, errores_frecuentes, correcciones, transferencia_partido, notas_adicionales)
values
  ('0c8df037-7657-4a18-8e7c-7b5b6bf703ac', 'TEST_MIGRACION_1', 'Dos filas enfrentadas', 'Un toque por jugador', 'Rapidez en el pase', 'Añadir defensor pasivo', 'Sin bote', 'Pase picado', 'Corregir postura de brazo', 'Transición rápida a contraataque', null),
  ('0c8df037-7657-4a18-8e7c-7b5b6bf703ac', 'TEST_MIGRACION_2', null, null, 'Solo consignas rellenas', null, null, null, null, null, 'Nota previa que ya existía antes de la migración.')
returning id, nombre;
```

Guarda los dos `id` devueltos (los necesitarás en los pasos 3 y 5).

- [ ] **Step 2: Aplicar la migración**

Usa `mcp__supabase__apply_migration` con `name: "ejercicios_simplifica_ficha"` y esta query exacta:

```sql
update ejercicios
set notas_adicionales = concat_ws(
  E'\n\n',
  nullif(trim(notas_adicionales), ''),
  nullif(concat_ws(
    E'\n\n',
    case when trim(coalesce(organizacion, '')) <> '' then 'Organización:' || E'\n' || trim(organizacion) end,
    case when trim(coalesce(reglas, '')) <> '' then 'Reglas:' || E'\n' || trim(reglas) end,
    case when trim(coalesce(consignas, '')) <> '' then 'Consignas:' || E'\n' || trim(consignas) end,
    case when trim(coalesce(progresion, '')) <> '' then 'Progresión:' || E'\n' || trim(progresion) end,
    case when trim(coalesce(regresion, '')) <> '' then 'Regresión:' || E'\n' || trim(regresion) end,
    case when trim(coalesce(errores_frecuentes, '')) <> '' then 'Errores frecuentes:' || E'\n' || trim(errores_frecuentes) end,
    case when trim(coalesce(correcciones, '')) <> '' then 'Correcciones:' || E'\n' || trim(correcciones) end,
    case when trim(coalesce(transferencia_partido, '')) <> '' then 'Transferencia al partido:' || E'\n' || trim(transferencia_partido) end
  ), '')
)
where
  trim(coalesce(organizacion, '')) <> '' or
  trim(coalesce(reglas, '')) <> '' or
  trim(coalesce(consignas, '')) <> '' or
  trim(coalesce(progresion, '')) <> '' or
  trim(coalesce(regresion, '')) <> '' or
  trim(coalesce(errores_frecuentes, '')) <> '' or
  trim(coalesce(correcciones, '')) <> '';

alter table ejercicios
  drop column organizacion,
  drop column reglas,
  drop column consignas,
  drop column progresion,
  drop column regresion,
  drop column errores_frecuentes,
  drop column correcciones,
  drop column transferencia_partido;
```

- [ ] **Step 3: Verificar el resultado sobre los datos de prueba**

Usa `mcp__supabase__execute_sql`:

```sql
select id, nombre, notas_adicionales from ejercicios where nombre like 'TEST_MIGRACION_%' order by nombre;
```

Expected para `TEST_MIGRACION_1` (`notas_adicionales` era `null`, los 8 campos tenían contenido):

```
Organización:
Dos filas enfrentadas

Reglas:
Un toque por jugador

Consignas:
Rapidez en el pase

Progresión:
Añadir defensor pasivo

Regresión:
Sin bote

Errores frecuentes:
Pase picado

Correcciones:
Corregir postura de brazo

Transferencia al partido:
Transición rápida a contraataque
```

Expected para `TEST_MIGRACION_2` (`notas_adicionales` ya tenía "Nota previa que ya existía antes de la migración.", solo `consignas` tenía contenido):

```
Nota previa que ya existía antes de la migración.

Consignas:
Solo consignas rellenas
```

Si el resultado no coincide exactamente (orden de bloques, saltos de línea, o la nota previa desaparecida/sobrescrita), la migración tiene un error — no continúes a los siguientes pasos, revisa la query del Step 2.

- [ ] **Step 4: Confirmar que las columnas ya no existen**

```sql
select column_name from information_schema.columns
where table_name = 'ejercicios'
and column_name in ('organizacion','reglas','consignas','progresion','regresion','errores_frecuentes','correcciones','transferencia_partido');
```

Expected: 0 filas.

- [ ] **Step 5: Borrar los ejercicios de prueba**

```sql
delete from ejercicios where nombre like 'TEST_MIGRACION_%';
```

Expected: 2 filas borradas. La producción no debe quedar con datos de prueba.

- [ ] **Step 6: Escribir el archivo de migración versionado**

Crea `supabase/migrations/0027_ejercicios_simplifica_ficha.sql` con exactamente el mismo contenido SQL usado en el Step 2 (el `update` seguido del `alter table`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0027_ejercicios_simplifica_ficha.sql
git commit -m "feat: migra los 8 campos estructurados de ejercicios a notas_adicionales y elimina las columnas"
```

---

### Task 2: Actualizar tipos (`src/types/database.ts`)

**Files:**
- Modify: `src/types/database.ts:157-164` (campos de `EjerciciosRow`)
- Modify: `src/types/database.ts:407-414` (claves opcionales del `TableDef` de `ejercicios`)

**Interfaces:**
- Consumes: el esquema resultante de Task 1 (columnas ya eliminadas en la base de datos real).
- Produces: `EjerciciosRow` sin los 8 campos — usado por Task 3 (`EjercicioFormModal.tsx`).

- [ ] **Step 1: Eliminar los 8 campos de `EjerciciosRow`**

Localiza este bloque (líneas 157-164 del archivo actual):

```ts
  organizacion: string | null;
  reglas: string | null;
  consignas: string | null;
  progresion: string | null;
  regresion: string | null;
  errores_frecuentes: string | null;
  correcciones: string | null;
  transferencia_partido: string | null;
```

y bórralo por completo. El campo `descripcion: string | null;` (línea justo antes de este bloque) y el campo `enlace: string | null;` (línea justo después) no cambian.

- [ ] **Step 2: Eliminar las mismas 8 claves de la lista de opcionales en el `TableDef` de `ejercicios`**

Localiza este bloque dentro de `ejercicios: TableDef<EjerciciosRow, ...>` (líneas 407-414 del archivo actual):

```ts
        | "organizacion"
        | "reglas"
        | "consignas"
        | "progresion"
        | "regresion"
        | "errores_frecuentes"
        | "correcciones"
        | "transferencia_partido"
```

y bórralo por completo. Las líneas `| "descripcion"` (justo antes) y `| "enlace"` (justo después) no cambian.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc -b --noEmit`
Expected: **errores** en `src/components/ejercicios/EjercicioFormModal.tsx` (todavía referencia los 8 campos eliminados) — es lo esperado en este punto, Task 3 los corrige. Confirma que los únicos errores nuevos están en ese archivo y son sobre estas 8 propiedades (no otros errores inesperados en otros archivos).

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "refactor: elimina los 8 campos estructurados de EjerciciosRow"
```

---

### Task 3: Simplificar el formulario (`EjercicioFormModal.tsx`)

**Files:**
- Modify: `src/components/ejercicios/EjercicioFormModal.tsx`

**Interfaces:**
- Consumes: `EjerciciosRow` de Task 2 (ya sin los 8 campos).

- [ ] **Step 1: Eliminar los 8 campos de `FormState`**

Reemplaza (líneas 14-36 del archivo actual):

```ts
type FormState = {
  nombre: string;
  categoria: string;
  contenido: string;
  jugadores_min: string;
  jugadores_max: string;
  espacio: string;
  material: string;
  duracion_min: string;
  dificultad: string;
  descripcion: string;
  organizacion: string;
  reglas: string;
  consignas: string;
  progresion: string;
  regresion: string;
  errores_frecuentes: string;
  correcciones: string;
  transferencia_partido: string;
  enlace: string;
  compartido: boolean;
  notas_adicionales: string;
};
```

por:

```ts
type FormState = {
  nombre: string;
  categoria: string;
  contenido: string;
  jugadores_min: string;
  jugadores_max: string;
  espacio: string;
  material: string;
  duracion_min: string;
  dificultad: string;
  descripcion: string;
  enlace: string;
  compartido: boolean;
  notas_adicionales: string;
};
```

- [ ] **Step 2: Eliminar los 8 campos de `toFormState`**

Reemplaza (líneas 38-62 del archivo actual):

```ts
function toFormState(e: EjerciciosRow | null): FormState {
  return {
    nombre: e?.nombre ?? "",
    categoria: e?.categoria ?? "",
    contenido: e?.contenido?.join(", ") ?? "",
    jugadores_min: e?.jugadores_min?.toString() ?? "",
    jugadores_max: e?.jugadores_max?.toString() ?? "",
    espacio: e?.espacio ?? "",
    material: e?.material ?? "",
    duracion_min: e?.duracion_min?.toString() ?? "",
    dificultad: e?.dificultad ?? "",
    descripcion: e?.descripcion ?? "",
    organizacion: e?.organizacion ?? "",
    reglas: e?.reglas ?? "",
    consignas: e?.consignas ?? "",
    progresion: e?.progresion ?? "",
    regresion: e?.regresion ?? "",
    errores_frecuentes: e?.errores_frecuentes ?? "",
    correcciones: e?.correcciones ?? "",
    transferencia_partido: e?.transferencia_partido ?? "",
    enlace: e?.enlace ?? "",
    compartido: e?.compartido ?? false,
    notas_adicionales: e?.notas_adicionales ?? "",
  };
}
```

por:

```ts
function toFormState(e: EjerciciosRow | null): FormState {
  return {
    nombre: e?.nombre ?? "",
    categoria: e?.categoria ?? "",
    contenido: e?.contenido?.join(", ") ?? "",
    jugadores_min: e?.jugadores_min?.toString() ?? "",
    jugadores_max: e?.jugadores_max?.toString() ?? "",
    espacio: e?.espacio ?? "",
    material: e?.material ?? "",
    duracion_min: e?.duracion_min?.toString() ?? "",
    dificultad: e?.dificultad ?? "",
    descripcion: e?.descripcion ?? "",
    enlace: e?.enlace ?? "",
    compartido: e?.compartido ?? false,
    notas_adicionales: e?.notas_adicionales ?? "",
  };
}
```

- [ ] **Step 3: Eliminar los 8 campos del payload en `handleSubmit`**

Reemplaza (dentro de la construcción de `payload`, líneas 120-147 del archivo actual):

```ts
    const payload = {
      equipo_id: equipoId,
      nombre: form.nombre.trim(),
      categoria: form.categoria || null,
      contenido: form.contenido
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      jugadores_min: form.jugadores_min ? Number(form.jugadores_min) : null,
      jugadores_max: form.jugadores_max ? Number(form.jugadores_max) : null,
      espacio: form.espacio || null,
      material: form.material || null,
      duracion_min: form.duracion_min ? Number(form.duracion_min) : null,
      dificultad: form.dificultad || null,
      descripcion: form.descripcion || null,
      organizacion: form.organizacion || null,
      reglas: form.reglas || null,
      consignas: form.consignas || null,
      progresion: form.progresion || null,
      regresion: form.regresion || null,
      errores_frecuentes: form.errores_frecuentes || null,
      correcciones: form.correcciones || null,
      transferencia_partido: form.transferencia_partido || null,
      enlace: form.enlace.trim() || null,
      compartido: form.compartido,
      notas_adicionales: form.notas_adicionales || null,
      ...atribucion,
    };
```

por:

```ts
    const payload = {
      equipo_id: equipoId,
      nombre: form.nombre.trim(),
      categoria: form.categoria || null,
      contenido: form.contenido
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      jugadores_min: form.jugadores_min ? Number(form.jugadores_min) : null,
      jugadores_max: form.jugadores_max ? Number(form.jugadores_max) : null,
      espacio: form.espacio || null,
      material: form.material || null,
      duracion_min: form.duracion_min ? Number(form.duracion_min) : null,
      dificultad: form.dificultad || null,
      descripcion: form.descripcion || null,
      enlace: form.enlace.trim() || null,
      compartido: form.compartido,
      notas_adicionales: form.notas_adicionales || null,
      ...atribucion,
    };
```

- [ ] **Step 4: Eliminar los 8 `<Field>` del JSX**

Reemplaza (líneas 270-303 del archivo actual):

```tsx
          <Field label="Descripción">
            <Textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
          </Field>
          <Field label="Organización">
            <Textarea value={form.organizacion} onChange={(e) => set("organizacion", e.target.value)} />
          </Field>
          <Field label="Reglas">
            <Textarea value={form.reglas} onChange={(e) => set("reglas", e.target.value)} />
          </Field>
          <Field label="Consignas">
            <Textarea value={form.consignas} onChange={(e) => set("consignas", e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Progresión">
              <Textarea value={form.progresion} onChange={(e) => set("progresion", e.target.value)} />
            </Field>
            <Field label="Regresión">
              <Textarea value={form.regresion} onChange={(e) => set("regresion", e.target.value)} />
            </Field>
          </div>

          <Field label="Errores frecuentes">
            <Textarea value={form.errores_frecuentes} onChange={(e) => set("errores_frecuentes", e.target.value)} />
          </Field>
          <Field label="Correcciones">
            <Textarea value={form.correcciones} onChange={(e) => set("correcciones", e.target.value)} />
          </Field>
          <Field label="Transferencia al partido">
            <Textarea value={form.transferencia_partido} onChange={(e) => set("transferencia_partido", e.target.value)} />
          </Field>
          <Field label="Notas adicionales">
            <Textarea value={form.notas_adicionales} onChange={(e) => set("notas_adicionales", e.target.value)} />
          </Field>
```

por:

```tsx
          <Field label="Descripción">
            <Textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
          </Field>
          <Field label="Notas adicionales">
            <Textarea value={form.notas_adicionales} onChange={(e) => set("notas_adicionales", e.target.value)} />
          </Field>
```

- [ ] **Step 5: Verificar tipos, lint y build**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build correcto (los mismos avisos preexistentes de tamaño de chunk son aceptables, no son errores).

- [ ] **Step 6: Prueba manual**

Run: `npm run dev`, abrir la biblioteca de ejercicios y comprobar:
1. Crear un ejercicio nuevo: el formulario solo muestra Nombre, Categoría, Dificultad, Contenido/tags, Jugadores mín./máx., Duración, Espacio, Material, Enlace, Compartir, Descripción y Notas adicionales — ningún campo de los 8 eliminados.
2. Guardar con texto en Notas adicionales y volver a abrir el ejercicio: el texto persiste.
3. Abrir un ejercicio compartido por otro equipo (modo solo lectura): tampoco aparecen los 8 campos, y Notas adicionales se ve pero deshabilitado, igual que el resto de campos.

Expected: los 3 puntos funcionan sin errores en consola.

- [ ] **Step 7: Commit**

```bash
git add src/components/ejercicios/EjercicioFormModal.tsx
git commit -m "refactor: simplifica el formulario de ejercicio a un único campo de notas libres"
```

---

## Verificación final antes de fusionar

Además de la revisión de rama completa (whole-branch review) del flujo subagent-driven-development:

1. Repetir la prueba manual de la Task 3 (Step 6).
2. Confirmar en la base de datos real que las 8 columnas ya no existen (repetir la consulta del Task 1, Step 4) y que no quedan filas `TEST_MIGRACION_%` en `ejercicios` (repetir la consulta del Task 1, Step 3 — debe devolver 0 filas).
