# Sistema de multas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema de multas a jugadores por llegar tarde o faltar sin avisar a entrenamiento/partido, activable y configurable por equipo desde Ajustes, que se engancha automáticamente sobre el checklist de asistencia ya existente y muestra la deuda acumulada en la ficha de cada jugador.

**Architecture:** 3 tablas nuevas (`multas_config` interruptor por equipo, `multas_tipos` catálogo editable, `multas` histórico real) con RLS estándar del proyecto. `AsistenciaChecklist.tsx` (componente único ya compartido entre entrenamiento y partido) gana una función que sincroniza la multa correspondiente cada vez que se marca "llegó tarde" o motivo "injustificado", sin tocar su flujo de asistencia existente. Dos componentes nuevos y autocontenidos (`MultasAjustes.tsx`, `MultasSection.tsx`) se montan en las páginas de Ajustes y de ficha de jugador respectivamente, cada uno resolviendo su propio `equipoId`/datos, sin ensuciar la carga ya extensa de esas páginas.

**Tech Stack:** React + TypeScript + Supabase — sin librerías nuevas, sin tests automatizados nuevos (ver spec, "Testing": UI + queries Supabase + una suma trivial, sin la superficie de umbrales que justificó Vitest en otras fases).

**Spec:** `docs/superpowers/specs/2026-09-13-sistema-multas-design.md`

## Global Constraints

- Todo en español — toda la UI y los textos nuevos.
- Toda tabla nueva lleva `equipo_id` FK a `equipos` y política RLS `private.equipo_del_entrenador(equipo_id)` (nunca `auth.role() = 'authenticated'`, que es el patrón antiguo).
- Cualquier cambio de esquema va en una migración nueva (nunca editar una ya aplicada) — `supabase/migrations/`.
- El sistema debe ser cero-coste para un equipo que lo deja desactivado: si `multas_config.activo` es `false` (o no existe fila), el checklist de asistencia se comporta exactamente igual que hoy y la sección "Multas" no aparece en la ficha del jugador.
- No se toca el flujo de asistencia existente (`marcar`/`marcarLlegoTarde` en `AsistenciaChecklist.tsx`) — solo se añade la sincronización de multas al final de cada uno, sin cambiar su comportamiento actual.
- Radios/estilo: `card-surface`, `rounded-[15px]` en botones, título de sección `text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]` — mismo patrón visual que el resto de la app, sin introducir componentes ni colores nuevos (los estados de asistencia semánticos ya sancionados no se tocan).

---

### Task 1: Migración — tablas de multas

**Files:**
- Create: `supabase/migrations/0034_sistema_multas.sql`

**Interfaces:**
- Produces: tablas `multas_config` (`id`, `equipo_id` único, `activo`, `created_at`), `multas_tipos` (`id`, `equipo_id`, `nombre`, `importe`, `disparador` nullable `'tardanza'|'falta_injustificada'`, `activo`, `created_at`), `multas` (`id`, `equipo_id`, `jugador_id`, `tipo_id` nullable, `concepto`, `importe`, `origen` `'automatica'|'manual'`, `asistencia_id` nullable, `pagada`, `pagada_at` nullable, `fecha`, `notas_adicionales` nullable, `created_at`) — ninguna tarea posterior depende de los nombres exactos de índices/constraints, solo de que las columnas y sus tipos existan tal cual.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Sistema de multas por tardanza/falta injustificada a entrenamiento o
-- partido, activable y configurable por equipo desde Ajustes (ver
-- docs/superpowers/specs/2026-09-13-sistema-multas-design.md). Los tipos
-- con `disparador` no nulo se enganchan automáticamente a los campos ya
-- existentes en `asistencia` (`llego_tarde` / `motivo_ausencia =
-- 'injustificado'`); el resto son de aplicación manual desde la ficha del
-- jugador.

create table multas_config (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null unique references equipos (id) on delete cascade,
  activo boolean not null default false,
  created_at timestamptz not null default now()
);

create table multas_tipos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null,
  importe numeric(10, 2) not null check (importe >= 0),
  disparador text check (disparador in ('tardanza', 'falta_injustificada')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_multas_tipos_equipo on multas_tipos (equipo_id);
-- Como mucho un tipo activo con cada disparador por equipo — evita
-- ambigüedad en el enganche automático (ver AsistenciaChecklist en la
-- Tarea 4).
create unique index idx_multas_tipos_disparador_unico on multas_tipos (equipo_id, disparador)
  where disparador is not null;

create table multas (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  jugador_id uuid not null references jugadores (id) on delete cascade,
  tipo_id uuid references multas_tipos (id) on delete set null,
  -- Copia de multas_tipos.nombre/importe en el momento de crear la multa:
  -- si luego se edita el importe del tipo, las multas ya puestas no cambian.
  concepto text not null,
  importe numeric(10, 2) not null check (importe >= 0),
  origen text not null check (origen in ('automatica', 'manual')),
  asistencia_id uuid references asistencia (id) on delete cascade,
  constraint multas_origen_asistencia_check check (
    (origen = 'automatica' and asistencia_id is not null) or
    (origen = 'manual' and asistencia_id is null)
  ),
  pagada boolean not null default false,
  pagada_at timestamptz,
  constraint multas_pagada_at_check check (
    (pagada and pagada_at is not null) or (not pagada and pagada_at is null)
  ),
  fecha date not null default current_date,
  notas_adicionales text,
  created_at timestamptz not null default now()
);
create index idx_multas_equipo on multas (equipo_id);
create index idx_multas_jugador on multas (jugador_id);
-- Un registro de asistencia genera como mucho una multa automática.
create unique index idx_multas_asistencia_unica on multas (asistencia_id)
  where asistencia_id is not null;

alter table multas_config enable row level security;
alter table multas_tipos enable row level security;
alter table multas enable row level security;

create policy "equipo_del_entrenador" on multas_config for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
create policy "equipo_del_entrenador" on multas_tipos for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
create policy "equipo_del_entrenador" on multas for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0034_sistema_multas.sql
git commit -m "feat: migración — tablas del sistema de multas"
```

Nota para el controlador (no es parte del trabajo del implementador de esta
tarea): esta migración se aplica al proyecto Supabase real con
`mcp__supabase__apply_migration` cuando el resto de la rama esté lista para
probarse manualmente (Tarea 7) — mismo criterio que se siguió con
`0019_rivales.sql` y `0020_convocatoria_unica.sql`. No la apliques tú mismo
si eres el subagente de esta tarea: tu trabajo termina en crear y commitear
el archivo SQL.

---

### Task 2: Tipos TypeScript (`src/types/database.ts`)

**Files:**
- Modify: `src/types/database.ts:335-336` (insertar tipos nuevos justo después de `AsistenciaRow`, antes del comentario de `TableDef`)
- Modify: `src/types/database.ts:500-501` (añadir entradas a `Database.public.Tables`, justo después de `eventos`, antes del `};` que cierra `Tables`)

**Interfaces:**
- Consumes: patrón `TableDef<Row, OptionalInsert>` ya definido en el propio archivo (línea 342-350) — no cambia.
- Produces: tipos `DisparadorMulta`, `OrigenMulta`, `MultasConfigRow`, `MultasTiposRow`, `MultasRow`, y las claves `multas_config`/`multas_tipos`/`multas` en `Database["public"]["Tables"]` — toda tarea posterior que use `supabase.from("multas"|"multas_tipos"|"multas_config")` depende de estos nombres exactos.

- [ ] **Step 1: Añadir los tipos de fila**

En `src/types/database.ts`, justo después del cierre de `AsistenciaRow` (línea 335, `};`) y antes de la línea 337 (`// \`OptionalInsert\` lista las columnas...`), añade:

```ts

export type DisparadorMulta = "tardanza" | "falta_injustificada";
export type OrigenMulta = "automatica" | "manual";

export type MultasConfigRow = {
  id: UUID;
  equipo_id: UUID;
  activo: boolean;
  created_at: string;
};

export type MultasTiposRow = {
  id: UUID;
  equipo_id: UUID;
  nombre: string;
  importe: number;
  disparador: DisparadorMulta | null;
  activo: boolean;
  created_at: string;
};

export type MultasRow = {
  id: UUID;
  equipo_id: UUID;
  jugador_id: UUID;
  tipo_id: UUID | null;
  concepto: string;
  importe: number;
  origen: OrigenMulta;
  asistencia_id: UUID | null;
  pagada: boolean;
  pagada_at: string | null;
  fecha: string;
  notas_adicionales: string | null;
  created_at: string;
};
```

- [ ] **Step 2: Registrar las tablas en `Database.public.Tables`**

En el mismo archivo, dentro del objeto `Tables`, justo después de la entrada `eventos: TableDef<...>` (línea 487-500) y antes del `};` que cierra `Tables` (línea 501), añade:

```ts
      multas_config: TableDef<MultasConfigRow, "id" | "activo" | "created_at">;
      multas_tipos: TableDef<MultasTiposRow, "id" | "activo" | "created_at">;
      multas: TableDef<
        MultasRow,
        "id" | "tipo_id" | "asistencia_id" | "pagada" | "pagada_at" | "fecha" | "notas_adicionales" | "created_at"
      >;
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc -b --noEmit`
Expected: sin errores (los tipos nuevos no se usan todavía en ningún otro archivo, así que solo se comprueba que el propio `database.ts` es válido).

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: tipos TypeScript del sistema de multas"
```

---

### Task 3: Ajustes — interruptor y catálogo (`MultasAjustes.tsx`)

**Files:**
- Create: `src/components/ajustes/MultasAjustes.tsx`
- Modify: `src/pages/AjustesPage.tsx:1-13` (import), `src/pages/AjustesPage.tsx:126` (montaje)

**Interfaces:**
- Consumes: `useEquipo()` de `@/hooks/useEquipo` (produce `{ equipo, equipoId }`); `supabase` de `@/lib/supabaseClient`; tipos `MultasConfigRow`/`MultasTiposRow` de `@/types/database` (Tarea 2); `Field`/`Input`/`Switch`/`Button`/`Modal` de `@/components/ui/*` (ya existen).
- Produces: componente `MultasAjustes` sin props, exportado con nombre — se monta en `AjustesPage.tsx` sin argumentos, igual que `<NotificacionesAjustes />`.

- [ ] **Step 1: Crear `MultasAjustes.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { Field, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { DisparadorMulta, MultasConfigRow, MultasTiposRow } from "@/types/database";

const ETIQUETA_DISPARADOR: Record<DisparadorMulta, string> = {
  tardanza: "Automático: llegar tarde",
  falta_injustificada: "Automático: falta sin avisar",
};

export function MultasAjustes() {
  const { equipoId } = useEquipo();
  const [config, setConfig] = useState<MultasConfigRow | null>(null);
  const [tipos, setTipos] = useState<MultasTiposRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoToggle, setGuardandoToggle] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoImporte, setNuevoImporte] = useState("");
  const [creandoTipo, setCreandoTipo] = useState(false);

  async function cargar() {
    const [cfg, t] = await Promise.all([
      supabase.from("multas_config").select("*").eq("equipo_id", equipoId).maybeSingle(),
      supabase.from("multas_tipos").select("*").eq("equipo_id", equipoId).order("created_at"),
    ]);
    setConfig(cfg.data);
    setTipos(t.data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  async function toggleActivo(activo: boolean) {
    setGuardandoToggle(true);
    const { error } = await supabase
      .from("multas_config")
      .upsert({ equipo_id: equipoId, activo }, { onConflict: "equipo_id" });
    if (error) {
      alert("No se pudo guardar: " + error.message);
      setGuardandoToggle(false);
      return;
    }
    // Primera activación con catálogo vacío: siembra los dos tipos
    // automáticos con importes por defecto, editables al momento — da
    // valor inmediato sin exigir configurar nada antes de usarlo.
    if (activo && tipos.length === 0) {
      await supabase.from("multas_tipos").insert([
        { equipo_id: equipoId, nombre: "Llegar tarde", importe: 1, disparador: "tardanza" },
        { equipo_id: equipoId, nombre: "Falta sin avisar", importe: 3, disparador: "falta_injustificada" },
      ]);
    }
    setGuardandoToggle(false);
    cargar();
  }

  async function guardarTipo(id: string, campo: "nombre" | "importe", valor: string) {
    const cambios = campo === "nombre" ? { nombre: valor.trim() } : { importe: Number(valor) || 0 };
    if (campo === "nombre" && !cambios.nombre) return;
    const { error } = await supabase.from("multas_tipos").update(cambios).eq("id", id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setTipos((ts) => ts.map((t) => (t.id === id ? { ...t, ...cambios } : t)));
  }

  async function borrarTipo(id: string, nombre: string) {
    if (!confirm(`¿Borrar el tipo "${nombre}"? Las multas ya puestas con este tipo no se borran.`)) return;
    const { error } = await supabase.from("multas_tipos").delete().eq("id", id);
    if (error) {
      alert("No se pudo borrar: " + error.message);
      return;
    }
    setTipos((ts) => ts.filter((t) => t.id !== id));
  }

  async function crearTipo() {
    if (!nuevoNombre.trim()) {
      alert("El nombre es obligatorio.");
      return;
    }
    setCreandoTipo(true);
    const { data, error } = await supabase
      .from("multas_tipos")
      .insert({ equipo_id: equipoId, nombre: nuevoNombre.trim(), importe: Number(nuevoImporte) || 0, disparador: null })
      .select("*")
      .single();
    setCreandoTipo(false);
    if (error || !data) {
      alert("No se pudo crear: " + error?.message);
      return;
    }
    setTipos((ts) => [...ts, data]);
    setNuevoNombre("");
    setNuevoImporte("");
  }

  if (cargando) return null;

  const activo = config?.activo ?? false;

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Sistema de multas</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Multa automática al marcar "llegó tarde" o falta injustificada en el checklist de asistencia.
          </p>
        </div>
        <Switch checked={activo} onChange={toggleActivo} label="Sistema de multas activo" className={guardandoToggle ? "opacity-50" : ""} />
      </div>

      {activo && (
        <div className="mt-1 flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
          {tipos.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  defaultValue={t.nombre}
                  onBlur={(e) => guardarTipo(t.id, "nombre", e.target.value)}
                  className="text-sm"
                />
                {t.disparador && (
                  <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-accent)]">
                    {ETIQUETA_DISPARADOR[t.disparador]}
                  </span>
                )}
              </div>
              <Input
                type="number"
                min={0}
                step="0.5"
                defaultValue={t.importe}
                onBlur={(e) => guardarTipo(t.id, "importe", e.target.value)}
                className="w-20 text-sm"
              />
              <span className="text-xs text-[var(--color-text-muted)]">€</span>
              <button
                onClick={() => borrarTipo(t.id, t.nombre)}
                aria-label={`Borrar tipo "${t.nombre}"`}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          <div className="mt-2 flex items-end gap-2 border-t border-[var(--color-border)] pt-3">
            <Field label="Nuevo tipo" className="flex-1">
              <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej. Equipación olvidada" />
            </Field>
            <Field label="Importe">
              <Input type="number" min={0} step="0.5" value={nuevoImporte} onChange={(e) => setNuevoImporte(e.target.value)} className="w-20" />
            </Field>
            <Button size="sm" onClick={crearTipo} disabled={creandoTipo}>
              {creandoTipo ? "..." : "+ Añadir"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Montar en Ajustes**

En `src/pages/AjustesPage.tsx`, añade el import junto a los demás de `@/components/ajustes/*` (tras la línea 9):

```ts
import { MultasAjustes } from "@/components/ajustes/MultasAjustes";
```

Y monta el componente después de `<NotificacionesAjustes />` (línea 126):

```tsx
      <NotificacionesAjustes />

      <MultasAjustes />
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc -b --noEmit && npm run lint`
Expected: ambos limpios.

- [ ] **Step 4: Commit**

```bash
git add src/components/ajustes/MultasAjustes.tsx src/pages/AjustesPage.tsx
git commit -m "feat: sección de Ajustes del sistema de multas"
```

---

### Task 4: Enganche automático en `AsistenciaChecklist.tsx`

**Files:**
- Modify: `src/components/equipo/AsistenciaChecklist.tsx:7` (import de tipos), `:47` (nuevo estado), `:66` (nuevo efecto de carga), `:86` (nuevas funciones `tipoPorDisparador`/`sincronizarMulta`), `:103` y `:119` (llamada desde `marcar`), `:134` (llamada desde `marcarLlegoTarde`)

**Interfaces:**
- Consumes: `multas_config`/`multas_tipos`/`multas` de Supabase (Tarea 1); tipos `MultasTiposRow`/`DisparadorMulta` de `@/types/database` (Tarea 2).
- Produces: ningún cambio de interfaz pública del componente (mismas props `{ equipoId, sesionId?, partidoId? }`) — el efecto es enteramente interno, no rompe a `DayAgenda.tsx` ni `SesionDetailPage.tsx`, que lo usan hoy sin cambios.

- [ ] **Step 1: Ampliar el import de tipos**

Cambia la línea 7:

```ts
import type { AsistenciaRow, JugadoresRow, MotivoAusencia } from "@/types/database";
```

por:

```ts
import type { AsistenciaRow, DisparadorMulta, JugadoresRow, MotivoAusencia, MultasTiposRow } from "@/types/database";
```

- [ ] **Step 2: Añadir estado de multas**

Justo después de la declaración de `faltasPorJugador` (línea 45-47), añade:

```ts
  const [multasActivo, setMultasActivo] = useState(false);
  const [tiposMulta, setTiposMulta] = useState<MultasTiposRow[]>([]);
```

- [ ] **Step 3: Cargar config y catálogo de multas**

Justo después del segundo `useEffect` ya existente (el de `faltasPorJugador`, que termina en la línea 85 con `}, [equipoId, asistencias]);`), añade un tercer efecto:

```ts
  useEffect(() => {
    (async () => {
      const [cfg, tipos] = await Promise.all([
        supabase.from("multas_config").select("*").eq("equipo_id", equipoId).maybeSingle(),
        supabase.from("multas_tipos").select("*").eq("equipo_id", equipoId).eq("activo", true),
      ]);
      setMultasActivo(cfg.data?.activo ?? false);
      setTiposMulta(tipos.data ?? []);
    })();
  }, [equipoId]);
```

- [ ] **Step 4: Añadir `tipoPorDisparador` y `sincronizarMulta`**

Justo antes de `async function marcar(...)` (línea 87), añade:

```ts
  function tipoPorDisparador(disparador: DisparadorMulta): MultasTiposRow | null {
    return tiposMulta.find((t) => t.disparador === disparador) ?? null;
  }

  /** Crea, actualiza o borra la multa ligada a una fila de asistencia según
   * el disparador que le corresponda ahora mismo (o ninguno). No toca nada
   * si el sistema de multas está desactivado, si no hay tipo configurado
   * para ese disparador, o si la multa ya existente está saldada (no se
   * deshace retroactivamente una cuenta ya cerrada por el entrenador). */
  async function sincronizarMulta(
    asistenciaId: string,
    jugadorId: string,
    disparadorActivo: DisparadorMulta | null,
  ) {
    if (!multasActivo) return;
    const { data: existente } = await supabase
      .from("multas")
      .select("*")
      .eq("asistencia_id", asistenciaId)
      .maybeSingle();
    if (existente?.pagada) return;

    const tipo = disparadorActivo ? tipoPorDisparador(disparadorActivo) : null;
    if (!tipo) {
      if (existente) await supabase.from("multas").delete().eq("id", existente.id);
      return;
    }
    if (existente) {
      if (existente.tipo_id !== tipo.id) {
        await supabase
          .from("multas")
          .update({ tipo_id: tipo.id, concepto: tipo.nombre, importe: tipo.importe })
          .eq("id", existente.id);
      }
    } else {
      await supabase.from("multas").insert({
        equipo_id: equipoId,
        jugador_id: jugadorId,
        tipo_id: tipo.id,
        concepto: tipo.nombre,
        importe: tipo.importe,
        origen: "automatica",
        asistencia_id: asistenciaId,
      });
    }
  }
```

- [ ] **Step 5: Llamar a `sincronizarMulta` desde `marcar`**

Dentro de `async function marcar(...)` (línea 87-121), en la rama `if (existente)` (actualización), justo después de `setAsistencias((as) => as.map(...))` (línea 103), añade:

```ts
      void sincronizarMulta(existente.id, jugadorId, presente ? (llego_tarde ? "tardanza" : null) : motivo_ausencia === "injustificado" ? "falta_injustificada" : null);
```

Y en la rama `else` (inserción nueva), justo después de `setAsistencias((as) => [...as, data]);` (línea 119), añade:

```ts
      void sincronizarMulta(data.id, jugadorId, presente ? (llego_tarde ? "tardanza" : null) : motivo_ausencia === "injustificado" ? "falta_injustificada" : null);
```

- [ ] **Step 6: Llamar a `sincronizarMulta` desde `marcarLlegoTarde`**

Dentro de `async function marcarLlegoTarde(...)` (línea 126-135), justo después de `setAsistencias((as) => as.map(...))` (línea 134), añade:

```ts
    void sincronizarMulta(existente.id, jugadorId, llego_tarde ? "tardanza" : null);
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc -b --noEmit && npm run lint`
Expected: ambos limpios.

- [ ] **Step 8: Commit**

```bash
git add src/components/equipo/AsistenciaChecklist.tsx
git commit -m "feat: enganche automático de multas en el checklist de asistencia"
```

---

### Task 5: Modal de multa manual (`MultaManualModal.tsx`)

**Files:**
- Create: `src/components/jugador/MultaManualModal.tsx`

**Interfaces:**
- Consumes: `Modal`/`Field`/`Input`/`Select`/`Textarea`/`Button` de `@/components/ui/*` (patrón visto en `JugadorFormModal.tsx`); tipo `MultasTiposRow` de `@/types/database` (Tarea 2).
- Produces: componente `MultaManualModal` con props `{ open: boolean; onClose: () => void; equipoId: string; jugadorId: string; tipos: MultasTiposRow[]; onSaved: () => void }` — consumido por `MultasSection.tsx` en la Tarea 6, que depende de este nombre y forma exactos.

- [ ] **Step 1: Crear `MultaManualModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { MultasTiposRow } from "@/types/database";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export function MultaManualModal({
  open,
  onClose,
  equipoId,
  jugadorId,
  tipos,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  jugadorId: string;
  tipos: MultasTiposRow[];
  onSaved: () => void;
}) {
  const [tipoId, setTipoId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) {
      setTipoId(tipos[0]?.id ?? "");
      setFecha(hoyISO());
      setNota("");
    }
  }, [open, tipos]);

  async function guardar() {
    const tipo = tipos.find((t) => t.id === tipoId);
    if (!tipo) {
      alert("Elige un tipo de multa.");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from("multas").insert({
      equipo_id: equipoId,
      jugador_id: jugadorId,
      tipo_id: tipo.id,
      concepto: tipo.nombre,
      importe: tipo.importe,
      origen: "manual",
      fecha,
      notas_adicionales: nota.trim() || null,
    });
    setGuardando(false);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Añadir multa">
      <div className="flex flex-col gap-4">
        {tipos.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No hay ningún tipo de multa configurado. Añade uno desde Ajustes.
          </p>
        ) : (
          <>
            <Field label="Tipo">
              <Select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} — {t.importe.toFixed(2)} €
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Nota (opcional)">
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={guardando || tipos.length === 0}>
          {guardando ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -b --noEmit && npm run lint`
Expected: ambos limpios (este componente todavía no se usa desde ningún sitio, así que solo se comprueba que compila en aislamiento).

- [ ] **Step 3: Commit**

```bash
git add src/components/jugador/MultaManualModal.tsx
git commit -m "feat: modal de multa manual"
```

---

### Task 6: Sección "Multas" en la ficha de jugador (`MultasSection.tsx`)

**Files:**
- Create: `src/components/jugador/MultasSection.tsx`
- Modify: `src/pages/JugadorDetailPage.tsx:29` (import), `:335-337` (montaje, entre la sección "Asistencia a entrenamientos" y la sección "Ficha técnica")

**Interfaces:**
- Consumes: `MultaManualModal` de `@/components/jugador/MultaManualModal` (Tarea 5), props `{ open, onClose, equipoId, jugadorId, tipos, onSaved }`; tipos `MultasRow`/`MultasTiposRow` de `@/types/database` (Tarea 2).
- Produces: componente `MultasSection` con props `{ equipoId: string; jugadorId: string }`, montado en `JugadorDetailPage.tsx` sin devolver nada al padre (autocontenido, `null` si el sistema está desactivado).

- [ ] **Step 1: Crear `MultasSection.tsx`**

```tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { MultaManualModal } from "./MultaManualModal";
import type { MultasRow, MultasTiposRow } from "@/types/database";

const FORMATO_EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function MultasSection({ equipoId, jugadorId }: { equipoId: string; jugadorId: string }) {
  const [activo, setActivo] = useState(false);
  const [multas, setMultas] = useState<MultasRow[]>([]);
  const [tipos, setTipos] = useState<MultasTiposRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [saldando, setSaldando] = useState(false);

  async function cargar() {
    const [cfg, m, t] = await Promise.all([
      supabase.from("multas_config").select("*").eq("equipo_id", equipoId).maybeSingle(),
      supabase.from("multas").select("*").eq("jugador_id", jugadorId).order("fecha", { ascending: false }),
      supabase.from("multas_tipos").select("*").eq("equipo_id", equipoId).eq("activo", true),
    ]);
    setActivo(cfg.data?.activo ?? false);
    setMultas(m.data ?? []);
    setTipos(t.data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId, jugadorId]);

  if (cargando || !activo) return null;

  const deuda = multas.filter((m) => !m.pagada).reduce((s, m) => s + m.importe, 0);

  async function saldar() {
    setSaldando(true);
    const { error } = await supabase
      .from("multas")
      .update({ pagada: true, pagada_at: new Date().toISOString() })
      .eq("jugador_id", jugadorId)
      .eq("pagada", false);
    setSaldando(false);
    if (error) {
      alert("No se pudo saldar: " + error.message);
      return;
    }
    cargar();
  }

  return (
    <div>
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
        Multas
      </div>
      <div className="card-surface p-4">
        <div className="flex items-end justify-between gap-2">
          <div className="stat-number text-[2.375rem] leading-none text-[var(--color-accent)]">
            {FORMATO_EUR.format(deuda)}
          </div>
          <div className="flex shrink-0 gap-2">
            {deuda > 0 && (
              <Button size="sm" variant="secondary" onClick={saldar} disabled={saldando}>
                {saldando ? "..." : "Saldar"}
              </Button>
            )}
            <Button size="sm" onClick={() => setModalAbierto(true)}>
              + Multa
            </Button>
          </div>
        </div>
        {multas.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3">
            {multas.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-xs">
                <span
                  className={
                    m.pagada
                      ? "text-[var(--color-text-faint)] line-through"
                      : "text-[var(--color-text-muted)]"
                  }
                >
                  {m.fecha} · {m.concepto}
                </span>
                <span className="font-medium">{m.importe.toFixed(2)} €</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MultaManualModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        equipoId={equipoId}
        jugadorId={jugadorId}
        tipos={tipos}
        onSaved={() => {
          setModalAbierto(false);
          cargar();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Montar en la ficha de jugador**

En `src/pages/JugadorDetailPage.tsx`, añade el import junto a los demás de componentes (tras la línea 11, `InsightsCard`):

```ts
import { MultasSection } from "@/components/jugador/MultasSection";
```

Y monta el componente justo después del `</div>` que cierra la sección "Asistencia a entrenamientos" (línea 335) y antes del `<div>` que abre "Ficha técnica" (línea 337):

```tsx
      </div>

      <MultasSection equipoId={equipoId} jugadorId={jugador.id} />

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Ficha técnica
        </div>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc -b --noEmit && npm run lint`
Expected: ambos limpios.

- [ ] **Step 4: Commit**

```bash
git add src/components/jugador/MultasSection.tsx src/pages/JugadorDetailPage.tsx
git commit -m "feat: sección de multas en la ficha de jugador"
```

---

### Task 7: Verificación final, aplicar migración, `ui-estetica`, prueba manual

**Files:** ninguno nuevo — comandos + aplicar la migración + revisión de agente.

- [ ] **Step 1: Typecheck + lint + build completos**

Run: `npx tsc -b --noEmit && npm run lint && npm run build`
Expected: los tres limpios.

- [ ] **Step 2: Aplicar la migración al proyecto Supabase real**

El controlador (no un subagente) aplica `supabase/migrations/0034_sistema_multas.sql` con `mcp__supabase__apply_migration`, igual que se hizo con `0019_rivales.sql` y `0020_convocatoria_unica.sql`.

- [ ] **Step 3: Revisión de `ui-estetica`**

Lanza el agente `ui-estetica` para revisar `MultasAjustes.tsx`, `MultasSection.tsx` y `MultaManualModal.tsx` contra la especificación visual del proyecto (radios, tipografía, paleta, patrón de tarjeta). Aplica los cambios que proponga si son coherentes con el resto de la app.

- [ ] **Step 4: Prueba manual del usuario**

Con el servidor de desarrollo corriendo (`npm run dev`):
1. En Ajustes de un equipo, activa "Sistema de multas activo" — confirma que se siembran los dos tipos automáticos ("Llegar tarde" 1€, "Falta sin avisar" 3€) y que son editables (nombre e importe) al hacer blur en los campos.
2. Ve a una sesión de entrenamiento, marca "llegó tarde" a un jugador en el checklist — entra a su ficha y confirma que aparece 1,00 € de deuda con el concepto "Llegar tarde". Desmárcalo en el checklist — confirma que la deuda vuelve a 0,00 €.
3. En un partido, marca motivo "Injustificado" a un jugador — confirma en su ficha que se suma 3,00 € con el concepto "Falta sin avisar".
4. Desde la ficha del jugador, pulsa "+ Multa", elige un tipo, guarda — confirma que aparece en el historial y suma a la deuda.
5. Pulsa "Saldar" — confirma que la deuda vuelve a 0,00 € y que el historial muestra las multas anteriores tachadas (saldadas), no borradas.
6. En Ajustes, borra el tipo "Llegar tarde" y vuelve a marcar "llegó tarde" a otro jugador en un entrenamiento — confirma que no se crea ninguna multa nueva (el disparador ya no tiene tipo).
7. Desactiva el sistema de multas en Ajustes — confirma que la sección "Multas" desaparece de la ficha de cualquier jugador de ese equipo.
8. Repite el paso 2 en un segundo equipo con el sistema desactivado — confirma que no aparece ninguna sección de multas ni se crea ninguna fila.

- [ ] **Step 5: Commit final si `ui-estetica` aplicó cambios**

```bash
git add -A
git commit -m "fix: ajustes de ui-estetica sobre el sistema de multas"
```
