# Ejercicios compartidos entre equipos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un ejercicio marcado como "compartido" por su equipo dueño se pueda ver (nunca editar ni borrar) desde la biblioteca de cualquier otro equipo del club, con atribución de quién lo creó, sin abrir ninguna otra rendija de aislamiento en el resto de la app.

**Architecture:** Una única excepción de RLS, acotada a `SELECT` sobre `ejercicios` (`equipo_del_entrenador(equipo_id) OR compartido`), partida en 4 políticas independientes para que las escrituras sigan siendo estrictamente del equipo dueño. La atribución ("by {nombre}") se copia como texto plano en la propia fila del ejercicio al compartirlo — nunca un join en vivo contra `entrenadores`/`equipos`, evitando así cualquier segunda excepción de RLS. Los favoritos pasan de una columna en `ejercicios` a una tabla `ejercicio_favoritos` con PK `(equipo_id, ejercicio_id)`, para que cualquier equipo (dueño o solo lector) pueda favoritar sin tocar la fila ajena.

**Tech Stack:** TypeScript + React + Supabase (RLS). Sin tests automatizados nuevos — mismo criterio que el resto de fases de este proyecto: verificación con `tsc`+`lint`+`build`, más una prueba de seguridad real contra la base (no solo argumentada) y prueba manual del usuario antes de fusionar.

**Spec:** `docs/superpowers/specs/2026-09-03-ejercicios-compartidos-design.md`

## Global Constraints

- Todo en español — toda la UI y los textos nuevos.
- **Ninguna excepción de RLS fuera de `ejercicios`** — ni `entrenadores` ni `equipos` se tocan en ningún momento de este plan. Si una tarea necesitara tocarlos, es una señal de que algo se ha desviado del diseño (la atribución se resuelve copiando texto, nunca con un join).
- Las políticas de escritura (`insert`/`update`/`delete`) de `ejercicios` deben quedar **byte a byte equivalentes** a la política de escritura actual (`private.equipo_del_entrenador(equipo_id)`) — ningún equipo gana ninguna capacidad de escritura nueva sobre una fila ajena, esté compartida o no.
- No se construye ningún selector de ejercicio para bloques de sesión — no existe hoy, no se pide, sería adelantar fase (ver CLAUDE.md "Desarrollo por fases").
- Cualquier cambio de esquema va en una migración nueva (nunca editar una ya aplicada).

---

### Task 1: Migración — esquema, tabla de favoritos, backfill, y RLS de `ejercicios`

**Files:**
- Create: `supabase/migrations/0023_ejercicios_compartidos.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: columnas `ejercicios.compartido` (boolean), `ejercicios.creado_por` (uuid nullable), `ejercicios.creado_por_nombre` (text nullable), `ejercicios.equipo_origen_nombre` (text nullable); tabla `ejercicio_favoritos (equipo_id, ejercicio_id)`; tipo TS `EjercicioFavoritosRow = { equipo_id: UUID; ejercicio_id: UUID }`. Tareas posteriores consumen estos nombres exactos.

- [ ] **Step 1: Crear la migración**

```sql
-- Compartir ejercicios entre equipos: única excepción deliberada al
-- aislamiento por equipo_id de todo el proyecto. `compartido=true` amplía
-- solo la lectura (ver política ejercicios_select más abajo) — las
-- políticas de escritura no cambian ni un carácter.
alter table ejercicios add column compartido boolean not null default false;

-- `creado_por` se guarda como referencia real (uso futuro), pero la
-- atribución que se MUESTRA nunca sale de un join en vivo contra
-- `entrenadores`/`equipos` — ninguna de las dos tiene hoy lectura entre
-- equipos, y esta función no les añade ninguna. Se copia el nombre como
-- texto en el momento de compartir/guardar (ver EjercicioFormModal.tsx).
alter table ejercicios add column creado_por uuid references entrenadores (id);
alter table ejercicios add column creado_por_nombre text;
alter table ejercicios add column equipo_origen_nombre text;

-- Favoritos por equipo que MIRA, no por equipo dueño del ejercicio — un
-- equipo que solo ve un ejercicio compartido debe poder marcarlo
-- favorito sin tocar la fila de otro equipo.
create table ejercicio_favoritos (
  equipo_id uuid not null references equipos (id) on delete cascade,
  ejercicio_id uuid not null references ejercicios (id) on delete cascade,
  primary key (equipo_id, ejercicio_id)
);
create index idx_ejercicio_favoritos_ejercicio on ejercicio_favoritos (ejercicio_id);

alter table ejercicio_favoritos enable row level security;
create policy "equipo_del_entrenador" on ejercicio_favoritos for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));

-- Backfill: el único favorito que existe hoy es el del propio equipo
-- dueño de cada ejercicio — sin ambigüedad posible.
insert into ejercicio_favoritos (equipo_id, ejercicio_id)
select equipo_id, id from ejercicios where favorito = true;

drop index if exists idx_ejercicios_favorito;
alter table ejercicios drop column favorito;

-- La política actual de ejercicios es una única "for all" (mismo
-- using/with check para select/insert/update/delete). Para que SELECT
-- sea más permisivo sin ampliar también las escrituras, hace falta
-- partirla en 4 políticas independientes.
drop policy "equipo_del_entrenador" on ejercicios;

create policy "ejercicios_select" on ejercicios for select
  using (private.equipo_del_entrenador(equipo_id) or compartido);

create policy "ejercicios_insert" on ejercicios for insert
  with check (private.equipo_del_entrenador(equipo_id));

create policy "ejercicios_update" on ejercicios for update
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));

create policy "ejercicios_delete" on ejercicios for delete
  using (private.equipo_del_entrenador(equipo_id));
```

- [ ] **Step 2: Actualizar `src/types/database.ts` — `EjerciciosRow`**

Cambia:

```ts
export type EjerciciosRow = {
  id: UUID;
  equipo_id: UUID;
  nombre: string;
  categoria: string | null;
  contenido: string[];
  jugadores_min: number | null;
  jugadores_max: number | null;
  espacio: string | null;
  material: string | null;
  duracion_min: number | null;
  dificultad: string | null;
  descripcion: string | null;
  organizacion: string | null;
  reglas: string | null;
  consignas: string | null;
  progresion: string | null;
  regresion: string | null;
  errores_frecuentes: string | null;
  correcciones: string | null;
  transferencia_partido: string | null;
  favorito: boolean;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};
```

por:

```ts
export type EjerciciosRow = {
  id: UUID;
  equipo_id: UUID;
  nombre: string;
  categoria: string | null;
  contenido: string[];
  jugadores_min: number | null;
  jugadores_max: number | null;
  espacio: string | null;
  material: string | null;
  duracion_min: number | null;
  dificultad: string | null;
  descripcion: string | null;
  organizacion: string | null;
  reglas: string | null;
  consignas: string | null;
  progresion: string | null;
  regresion: string | null;
  errores_frecuentes: string | null;
  correcciones: string | null;
  transferencia_partido: string | null;
  /** Visible en la biblioteca de cualquier equipo del club, no solo el dueño (ver 0023_ejercicios_compartidos.sql) — solo lectura para los demás. */
  compartido: boolean;
  /** Referencia real al entrenador que lo creó; nullable porque los ejercicios de antes de esta función no tienen autor conocido. */
  creado_por: UUID | null;
  /** Copia de texto del nombre del entrenador en el momento de compartir/guardar — nunca un join en vivo contra `entrenadores` (esa tabla no tiene lectura entre equipos). */
  creado_por_nombre: string | null;
  /** Copia de texto del nombre del equipo dueño en ese mismo momento — mismo motivo que creado_por_nombre. */
  equipo_origen_nombre: string | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

/** Favorito de un ejercicio, por equipo que lo marca — independiente del equipo dueño del ejercicio (ver 0023_ejercicios_compartidos.sql). */
export type EjercicioFavoritosRow = {
  equipo_id: UUID;
  ejercicio_id: UUID;
};
```

- [ ] **Step 3: Actualizar la sección `TableDef` de `ejercicios` y añadir `ejercicio_favoritos`**

Cambia:

```ts
      ejercicios: TableDef<
        EjerciciosRow,
        | "id"
        | "categoria"
        | "contenido"
        | "jugadores_min"
        | "jugadores_max"
        | "espacio"
        | "material"
        | "duracion_min"
        | "dificultad"
        | "descripcion"
        | "organizacion"
        | "reglas"
        | "consignas"
        | "progresion"
        | "regresion"
        | "errores_frecuentes"
        | "correcciones"
        | "transferencia_partido"
        | "favorito"
        | "notas_adicionales"
        | "created_at"
        | "updated_at"
      >;
```

por:

```ts
      ejercicios: TableDef<
        EjerciciosRow,
        | "id"
        | "categoria"
        | "contenido"
        | "jugadores_min"
        | "jugadores_max"
        | "espacio"
        | "material"
        | "duracion_min"
        | "dificultad"
        | "descripcion"
        | "organizacion"
        | "reglas"
        | "consignas"
        | "progresion"
        | "regresion"
        | "errores_frecuentes"
        | "correcciones"
        | "transferencia_partido"
        | "compartido"
        | "creado_por"
        | "creado_por_nombre"
        | "equipo_origen_nombre"
        | "notas_adicionales"
        | "created_at"
        | "updated_at"
      >;
      ejercicio_favoritos: TableDef<EjercicioFavoritosRow>;
```

(`ejercicio_favoritos` no lleva ninguna columna opcional — ambas partes de la clave compuesta son obligatorias en cualquier `.insert()`, por eso el segundo parámetro de `TableDef` se omite, igual que hace `never` por defecto según su propia declaración.)

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc -b --noEmit`
Expected: errores esperados en `EjerciciosPage.tsx`/`EjercicioFormModal.tsx` por referenciar `favorito` (se arreglan en las Tareas 3-4) — ningún otro error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0023_ejercicios_compartidos.sql src/types/database.ts
git commit -m "feat: migración — compartir ejercicios entre equipos, favoritos por equipo que mira"
```

Nota para el controlador: esta migración se aplica al proyecto Supabase real con `mcp__supabase__apply_migration` cuando el resto de la rama esté listo para probarse — comprobar antes si hay filas con `favorito = true` para confirmar que el backfill las recoge, mismo criterio que en migraciones anteriores de esta rama de trabajo.

---

### Task 2: `useEntrenador` — exponer también el `id`

**Files:**
- Modify: `src/hooks/useEntrenador.ts`

**Interfaces:**
- Produces: `useEntrenador(): { id: string | null; nombre: string | null; cargando: boolean }` — la Tarea 3 consume `id` y `nombre`.

- [ ] **Step 1: Reemplazar el fichero completo**

```ts
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Entrenador con la sesión activa (fila propia en `entrenadores`, vía RLS) — id y nombre. */
export function useEntrenador() {
  const [id, setId] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (activo) setCargando(false);
        return;
      }
      const { data } = await supabase
        .from("entrenadores")
        .select("id, nombre")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!activo) return;
      setId(data?.id ?? null);
      setNombre(data?.nombre ?? null);
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, []);

  return { id, nombre, cargando };
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/hooks/useEntrenador.ts`
Expected: sin errores nuevos en este fichero (el resto de errores del Task 1 siguen ahí, se arreglan en la Tarea 3).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useEntrenador.ts
git commit -m "feat: useEntrenador expone también el id, para atribuir ejercicios compartidos"
```

---

### Task 3: Formulario de ejercicio — toggle de compartir, atribución, y modo de solo lectura

**Files:**
- Modify: `src/components/ejercicios/EjercicioFormModal.tsx`

**Interfaces:**
- Consumes: `useEntrenador()` de la Tarea 2 (`{ id, nombre }`); `useEquipo()` (ya existe, `{ equipo, equipoId }`, `equipo.nombre` disponible).
- Produces: ninguna interfaz nueva para otras tareas — este modal se sigue invocando con las mismas props (`open`, `onClose`, `equipoId`, `ejercicio`, `onSaved`, `onDeleted`) desde `EjerciciosPage.tsx`.

- [ ] **Step 1: Reemplazar el fichero completo**

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { useEntrenador } from "@/hooks/useEntrenador";
import type { EjerciciosRow } from "@/types/database";

const CATEGORIAS = ["Calentamiento", "Técnica individual", "Táctica colectiva", "Sistema de juego", "Físico", "Portero", "Otro"];
const DIFICULTADES = ["Iniciación", "Medio", "Avanzado"];

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
  compartido: boolean;
  notas_adicionales: string;
};

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
    compartido: e?.compartido ?? false,
    notas_adicionales: e?.notas_adicionales ?? "",
  };
}

export function EjercicioFormModal({
  open,
  onClose,
  equipoId,
  ejercicio,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  ejercicio: EjerciciosRow | null;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { equipo } = useEquipo();
  const { id: entrenadorId, nombre: entrenadorNombre } = useEntrenador();
  const [form, setForm] = useState<FormState>(() => toFormState(ejercicio));
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // Un ejercicio ajeno compartido se ve, nunca se edita — ver spec
  // "Formulario", modo de solo lectura.
  const readOnly = ejercicio !== null && ejercicio.equipo_id !== equipoId;

  // El modal permanece montado entre aperturas, así que sin este efecto
  // reabrirlo (para el mismo ejercicio tras cancelar, para uno distinto, o
  // para "nuevo" otra vez) mostraría datos de la sesión de edición anterior.
  useEffect(() => {
    if (open) setForm(toFormState(ejercicio));
     
  }, [open, ejercicio]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);

    // Un ejercicio nuevo, o uno ya existente de antes de esta función sin
    // autor conocido, se atribuye a quien lo guarda ahora mismo. Uno ya
    // atribuido nunca se vuelve a tocar, aunque lo edite otro entrenador
    // del mismo equipo más tarde.
    const necesitaAtribucion = !ejercicio?.creado_por_nombre;
    const atribucion = necesitaAtribucion
      ? {
          creado_por: entrenadorId,
          creado_por_nombre: entrenadorNombre,
          equipo_origen_nombre: equipo?.nombre ?? null,
        }
      : {};

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
      compartido: form.compartido,
      notas_adicionales: form.notas_adicionales || null,
      ...atribucion,
    };

    const { error } = ejercicio
      ? await supabase.from("ejercicios").update(payload).eq("id", ejercicio.id)
      : await supabase.from("ejercicios").insert(payload);

    setGuardando(false);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!ejercicio) return;
    if (!confirm(`¿Borrar "${ejercicio.nombre}"? No se puede deshacer.`)) return;
    setBorrando(true);
    const { error } = await supabase.from("ejercicios").delete().eq("id", ejercicio.id);
    setBorrando(false);
    if (error) {
      alert("No se pudo borrar: " + error.message);
      return;
    }
    onDeleted();
  }

  return (
    <Modal open={open} onClose={onClose} title={readOnly ? "Ejercicio compartido" : ejercicio ? "Editar ejercicio" : "Nuevo ejercicio"}>
      {readOnly && (
        <div className="mb-3 rounded-lg bg-[var(--color-card-hover)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
          Compartido por {ejercicio?.creado_por_nombre ?? "otro equipo"}
          {ejercicio?.equipo_origen_nombre ? ` · ${ejercicio.equipo_origen_nombre}` : ""}
        </div>
      )}

      <form id="ejercicio-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <fieldset disabled={readOnly} className="contents">
          <Field label="Nombre *">
            <Input required value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <Select value={form.categoria} onChange={(e) => set("categoria", e.target.value)}>
                <option value="">—</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dificultad">
              <Select value={form.dificultad} onChange={(e) => set("dificultad", e.target.value)}>
                <option value="">—</option>
                {DIFICULTADES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Contenido / tags (separados por comas)">
            <Input
              placeholder="lanzamiento, 2x2, ataque vs 6:0..."
              value={form.contenido}
              onChange={(e) => set("contenido", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Jugadores mín.">
              <Input type="number" min={0} value={form.jugadores_min} onChange={(e) => set("jugadores_min", e.target.value)} />
            </Field>
            <Field label="Jugadores máx.">
              <Input type="number" min={0} value={form.jugadores_max} onChange={(e) => set("jugadores_max", e.target.value)} />
            </Field>
            <Field label="Duración (min)">
              <Input type="number" min={0} value={form.duracion_min} onChange={(e) => set("duracion_min", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Espacio">
              <Input value={form.espacio} onChange={(e) => set("espacio", e.target.value)} />
            </Field>
            <Field label="Material">
              <Input value={form.material} onChange={(e) => set("material", e.target.value)} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.compartido}
              onChange={(e) => set("compartido", e.target.checked)}
              className="h-5 w-5 accent-[var(--color-accent)]"
            />
            Compartir con los demás equipos del club
          </label>

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
        </fieldset>
      </form>

      {readOnly ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2">
          {ejercicio ? (
            <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={borrando}>
              {borrando ? "Borrando..." : "Borrar"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="ejercicio-form" size="sm" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/components/ejercicios/EjercicioFormModal.tsx`
Expected: sin errores en este fichero (quedan los de `EjerciciosPage.tsx`, se arreglan en la Tarea 4).

- [ ] **Step 3: Commit**

```bash
git add src/components/ejercicios/EjercicioFormModal.tsx
git commit -m "feat: toggle de compartir, atribución y modo de solo lectura en el formulario de ejercicio"
```

---

### Task 4: Biblioteca de ejercicios — propios + compartidos, atribución, favoritos nuevos

**Files:**
- Modify: `src/pages/EjerciciosPage.tsx`

**Interfaces:**
- Consumes: `EjercicioFavoritosRow` de la Tarea 1; `EjercicioFormModal` sin cambios de props (Tarea 3).

- [ ] **Step 1: Reemplazar el fichero completo**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Plus, Star, Search, Users, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import type { EjerciciosRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/layout/PageHeader";
import { EjercicioFormModal } from "@/components/ejercicios/EjercicioFormModal";

export function EjerciciosPage() {
  const { equipoId } = useEquipo();
  const [ejercicios, setEjercicios] = useState<EjerciciosRow[]>([]);
  const [favoritoIds, setFavoritoIds] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [dificultad, setDificultad] = useState("");
  const [soloFavoritos, setSoloFavoritos] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<EjerciciosRow | null>(null);

  async function cargar() {
    setCargando(true);
    const [ej, fav] = await Promise.all([
      supabase
        .from("ejercicios")
        .select("*")
        .or(`equipo_id.eq.${equipoId},compartido.eq.true`)
        .order("nombre"),
      supabase.from("ejercicio_favoritos").select("ejercicio_id").eq("equipo_id", equipoId),
    ]);
    setEjercicios(ej.data ?? []);
    setFavoritoIds(new Set((fav.data ?? []).map((f) => f.ejercicio_id)));
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  const categorias = useMemo(
    () => Array.from(new Set(ejercicios.map((e) => e.categoria).filter(Boolean))) as string[],
    [ejercicios],
  );
  const dificultades = useMemo(
    () => Array.from(new Set(ejercicios.map((e) => e.dificultad).filter(Boolean))) as string[],
    [ejercicios],
  );

  const filtrados = ejercicios.filter((e) => {
    if (soloFavoritos && !favoritoIds.has(e.id)) return false;
    if (categoria && e.categoria !== categoria) return false;
    if (dificultad && e.dificultad !== dificultad) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const enTags = e.contenido.some((t) => t.toLowerCase().includes(q));
      if (!e.nombre.toLowerCase().includes(q) && !enTags) return false;
    }
    return true;
  });

  function abrirNuevo() {
    setEditando(null);
    setModalAbierto(true);
  }
  function abrirEdicion(e: EjerciciosRow) {
    setEditando(e);
    setModalAbierto(true);
  }
  function cerrarModal() {
    setModalAbierto(false);
  }
  function alGuardar() {
    setModalAbierto(false);
    cargar();
  }
  function alBorrar() {
    setModalAbierto(false);
    cargar();
  }

  async function toggleFavorito(e: EjerciciosRow) {
    if (favoritoIds.has(e.id)) {
      await supabase.from("ejercicio_favoritos").delete().eq("equipo_id", equipoId).eq("ejercicio_id", e.id);
    } else {
      await supabase.from("ejercicio_favoritos").insert({ equipo_id: equipoId, ejercicio_id: e.id });
    }
    cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Ejercicios"
        action={
          <Button size="sm" onClick={abrirNuevo}>
            <Plus size={18} /> Nuevo
          </Button>
        }
      />

      <div className="card-surface flex flex-col gap-3 p-4">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            pill
            placeholder="Buscar por nombre o tag..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={dificultad} onChange={(e) => setDificultad(e.target.value)}>
            <option value="">Toda dificultad</option>
            {dificultades.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
        <button
          onClick={() => setSoloFavoritos((v) => !v)}
          className={`flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-sm transition-colors ${
            soloFavoritos
              ? "border-[var(--color-accent)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-text-muted)]"
          }`}
        >
          <Star size={16} fill={soloFavoritos ? "currentColor" : "none"} />
          Solo favoritos
        </button>
      </div>

      {cargando && <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>}

      {!cargando && filtrados.length === 0 && (
        <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">
          {ejercicios.length === 0
            ? "Todavía no hay ejercicios. Crea el primero."
            : "Ningún ejercicio coincide con el filtro."}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {filtrados.map((e) => {
          const esAjeno = e.equipo_id !== equipoId;
          const esFavorito = favoritoIds.has(e.id);
          return (
            <button
              key={e.id}
              onClick={() => abrirEdicion(e)}
              className="card-surface flex flex-col gap-2 p-4 text-left transition-colors hover:border-[var(--color-accent)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{e.nombre}</div>
                  <div className="text-sm text-[var(--color-text-muted)]">
                    {[e.categoria, e.dificultad].filter(Boolean).join(" · ") || "Sin clasificar"}
                  </div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleFavorito(e);
                  }}
                  className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                >
                  <Star size={20} fill={esFavorito ? "currentColor" : "none"} className={esFavorito ? "text-[var(--color-accent)]" : ""} />
                </span>
              </div>

              {esAjeno && (
                <span className="w-fit rounded-full bg-[var(--color-card-hover)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                  by {e.creado_por_nombre ?? "otro equipo"}
                  {e.equipo_origen_nombre ? ` · ${e.equipo_origen_nombre}` : ""}
                </span>
              )}

              {e.contenido.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {e.contenido.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--color-card-hover)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-4 text-xs text-[var(--color-text-muted)]">
                {(e.jugadores_min || e.jugadores_max) && (
                  <span className="flex items-center gap-1">
                    <Users size={14} />
                    {e.jugadores_min ?? "?"}–{e.jugadores_max ?? "?"}
                  </span>
                )}
                {e.duracion_min && (
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    {e.duracion_min} min
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <EjercicioFormModal
        open={modalAbierto}
        onClose={cerrarModal}
        equipoId={equipoId}
        ejercicio={editando}
        onSaved={alGuardar}
        onDeleted={alBorrar}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos, lint y build completos**

Run: `npx tsc -b --noEmit && npm run lint && npm run build`
Expected: los tres limpios — a partir de aquí ya no debería quedar ningún error de las Tareas 1-3.

- [ ] **Step 3: Commit**

```bash
git add src/pages/EjerciciosPage.tsx
git commit -m "feat: biblioteca de ejercicios muestra propios y compartidos, con atribución y favoritos por equipo"
```

---

### Task 5: Bloque de sesión — distinguir "sin enlazar" de "ya no disponible"

**Files:**
- Modify: `src/pages/SesionDetailPage.tsx:151-156`

**Interfaces:** Ninguna — cambio local a la resolución de un bloque, ninguna otra tarea depende de esto.

- [ ] **Step 1: Aplicar el cambio**

Cambia:

```tsx
            {sesion.bloques.map((b, i) => {
              const ejercicio = b.ejercicio_id ? ejercicios.find((e) => e.id === b.ejercicio_id) : null;
              const nombre = ejercicio?.nombre || b.descripcion_libre || "Bloque sin descripción";
              const detalle = ejercicio
                ? [ejercicio.categoria, ejercicio.dificultad].filter(Boolean).join(" · ")
                : b.objetivo || b.consignas || "";
```

por:

```tsx
            {sesion.bloques.map((b, i) => {
              const ejercicio = b.ejercicio_id ? ejercicios.find((e) => e.id === b.ejercicio_id) : null;
              // Distingue "el bloque nunca tuvo un ejercicio enlazado" (cae al
              // texto libre, comportamiento de siempre) de "tenía uno enlazado
              // pero ya no es accesible" (dejó de compartirse desde otro
              // equipo, o se borró) — nunca debe romper la carga de la sesión.
              const sinAcceso = Boolean(b.ejercicio_id) && !ejercicio;
              const nombre = ejercicio?.nombre || (sinAcceso ? "Ejercicio ya no disponible" : b.descripcion_libre || "Bloque sin descripción");
              const detalle = ejercicio
                ? [ejercicio.categoria, ejercicio.dificultad].filter(Boolean).join(" · ")
                : sinAcceso ? "" : b.objetivo || b.consignas || "";
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/pages/SesionDetailPage.tsx`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SesionDetailPage.tsx
git commit -m "fix: distingue bloque sin ejercicio enlazado de ejercicio ya no disponible"
```

---

### Task 6: Verificación final — seguridad RLS, `ui-estetica`, prueba manual

**Files:** ninguno nuevo — comandos + verificación directa contra la base + revisión de agente.

- [ ] **Step 1: Typecheck + lint + build completos**

Run: `npx tsc -b --noEmit && npm run lint && npm run build`
Expected: los tres limpios.

- [ ] **Step 2: Aplicar la migración al proyecto Supabase real**

El controlador aplica `supabase/migrations/0023_ejercicios_compartidos.sql` con `mcp__supabase__apply_migration`, tras comprobar cuántas filas tienen `favorito = true` hoy (para verificar después que el backfill las recogió todas).

- [ ] **Step 3: Verificación de seguridad — el punto crítico de todo este plan**

La conexión que usan `mcp__supabase__execute_sql`/`apply_migration` corre con privilegios elevados (bypassa RLS por defecto) — probar la política sin cambiar de rol daría un "sí funciona" que no demuestra nada. Hay que forzar explícitamente el rol `authenticated` con un JWT simulado, la técnica estándar de Supabase para probar RLS desde SQL directo. No hace falta un segundo equipo real: un `sub` arbitrario que no esté vinculado al equipo dueño ya prueba el rechazo (para CUALQUIER identidad ajena, no solo una en concreto).

Primero, localizar (o crear temporalmente) un ejercicio real para la prueba:

```sql
-- Un ejercicio cualquiera del equipo que sea, para usarlo de sujeto de prueba.
select id, equipo_id, nombre, compartido from ejercicios limit 1;
```

Con el `id`/`equipo_id` de esa fila (llámalos `<ejercicio_id>` y `<equipo_dueño_id>` de aquí en adelante):

```sql
begin;

-- Lo comparte su propio equipo dueño (con privilegios elevados, como si
-- fuera el dueño guardando desde el formulario).
update ejercicios set compartido = true where id = '<ejercicio_id>';

-- A partir de aquí, la sesión pasa a ser literalmente el rol `authenticated`
-- con un uid arbitrario que NO pertenece a `entrenadores_equipos` para
-- `<equipo_dueño_id>` — exactamente "un entrenador de cualquier otro equipo".
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000000"}';

-- 1) SELECT debe funcionar — es la excepción que se acaba de construir.
select id, nombre, compartido from ejercicios where id = '<ejercicio_id>';
-- Expected: devuelve la fila.

-- 2) UPDATE debe fallar — bajo RLS, un USING que no matchea ninguna fila
-- no lanza error, simplemente afecta 0 filas. Comprobar eso, no un error.
update ejercicios set nombre = 'INTENTO DE EDICIÓN AJENA' where id = '<ejercicio_id>';
-- Expected: "UPDATE 0" (cero filas afectadas).

-- 3) DELETE debe fallar igual.
delete from ejercicios where id = '<ejercicio_id>';
-- Expected: "DELETE 0" (cero filas afectadas).

-- Vuelve a privilegios elevados para poder hacer el rollback con normalidad.
reset role;
rollback;
```

Después, sin transacción (para dejar el estado real como estaba antes de la prueba):

```sql
update ejercicios set compartido = false where id = '<ejercicio_id>';
```

(el `rollback` ya deshace el `compartido = true` de dentro de la transacción, pero como el `id` de la fila de prueba pudo haber tenido `compartido = true` de forma legítima ya antes de la prueba si se reutilizó una fila existente, confirmar con un `select` que el estado final coincide con el que tenía antes de empezar.)

Documenta el resultado exacto de los pasos UPDATE/DELETE ("0 filas afectadas" en ambos) antes de continuar — si cualquiera de los dos afecta alguna fila, es un agujero de seguridad real y hay que volver a la Tarea 1 antes de seguir.

- [ ] **Step 4: Revisión de `ui-estetica`**

Dispatch al agente `ui-estetica` para revisar el formulario de ejercicio (toggle de compartir, banner de atribución, modo de solo lectura) y la tarjeta de ejercicio ajeno en la biblioteca, frente a CLAUDE.md: tema claro estándar, un único acento (sin inventar un color nuevo para "compartido"), coherencia del chip de atribución con el resto de chips ya usados (tags de `contenido`). Aplicar los hallazgos reales que encuentre.

- [ ] **Step 5: Prueba manual del usuario**

Pedir al usuario que, con dos equipos reales:
1. Comparta un ejercicio desde un equipo y confirme que aparece en la biblioteca del otro equipo, con la etiqueta "by {nombre}" correcta.
2. Confirme que ese ejercicio ajeno se abre en modo de solo lectura (sin botones de editar/borrar, campos deshabilitados) y que se puede marcar favorito sin error.
3. Confirme que dejar de compartirlo desde el equipo dueño lo hace desaparecer de la biblioteca del otro equipo.
4. Confirme que el equipo dueño lo sigue viendo y pudiendo editar con normalidad en todo momento.

- [ ] **Step 6: Commit final si `ui-estetica` aplicó cambios**

```bash
git add -A
git commit -m "fix: ajustes de ui-estetica sobre ejercicios compartidos"
```
