# Enlazar bloques de sesión a ejercicios de la biblioteca — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el editor de bloques dentro del modal "Editar sesión" por gestión con guardado instantáneo directamente en `SesionDetailPage.tsx`, con capacidad de enlazar un bloque a un ejercicio ya creado (propio o compartido) además de seguir permitiendo texto libre.

**Architecture:** Un helper nuevo (`guardarBloques`) hace read-modify-write de la columna `sesiones.bloques` enviando siempre la fila `SesionesRow` completa (necesario para no romper la cola offline). Dos componentes nuevos (`EjercicioPickerModal`, `BloqueModal`) sustituyen la sección "Bloques" que hoy vive en `SesionModal.tsx`. Los bloques de `SesionDetailPage` pasan a ser clicables: uno enlazado a un ejercicio abre el `EjercicioFormModal` ya existente (reutilizado tal cual, con sus reglas de solo-lectura para ejercicios ajenos); uno de texto libre abre `BloqueModal` en modo edición.

**Tech Stack:** React + TypeScript, Supabase (`sesiones`, `ejercicios`, `ejercicio_favoritos`), Tailwind v4, `vitest` (sin tests nuevos en este plan — ver Global Constraints).

**Spec:** `docs/superpowers/specs/2026-09-03-bloques-biblioteca-design.md`

## Global Constraints

- Español en toda la UI (textos, labels, mensajes de error) — regla del proyecto.
- Ningún componente nuevo introduce colores fuera de la paleta tinta/rojo/blanco del proyecto; reutiliza las clases y componentes (`card-surface`, `tab-pill`/`tab-pill-group`, `Button`, `Field`, `Input`, `Textarea`, `Modal`) exactamente como ya se usan en `PartidoModal.tsx` y `EjerciciosPage.tsx` — no crear estilos nuevos.
- **Convención de tests de este proyecto (excepción explícita al TDD por defecto):** el único archivo de test existente (`src/lib/insights.test.ts`) cubre funciones puras sin I/O. Ningún código que llama a Supabase tiene test (`SesionModal.guardar()`, `crearSesionRapida`, etc.) — no hay mocks de `supabase-js` en el repo. Este plan sigue esa misma convención: `guardarBloques`, `BloqueModal` y `EjercicioPickerModal` NO llevan test de vitest (forzar un mock rompería la convención del repo sin aportar cobertura real). La verificación de cada tarea es `tsc -b` limpio + `npm run lint` limpio + prueba manual descrita en cada tarea.
- **Guardado instantáneo de bloques envía SIEMPRE la fila `SesionesRow` completa**, nunca solo `{bloques}` — ver la sección "Persistencia" de la spec: `aplicarPendientes()` (`src/lib/offline/queue.ts:147-164`) sustituye la fila cacheada completa por el payload de una operación "update" encolada, así que un payload parcial rompería la vista offline de la sesión (perdería `fecha`, `duracion_min`, etc.).
- `SesionModal.tsx` debe seguir incluyendo `bloques: sesion?.bloques ?? []` en su payload de guardado aunque ya no tenga UI para ellos — omitirlo borraría los bloques de cualquier sesión al editar solo duración/estado/notas.
- No se toca nada de los sub-proyectos B (imágenes/enlaces por ejercicio) ni C (arrastrar para reordenar) — quedan fuera de este plan.

---

### Task 1: Helper de guardado instantáneo de bloques

**Files:**
- Create: `src/lib/bloquesSesion.ts`

**Interfaces:**
- Produces: `guardarBloques(sesion: SesionesRow, nuevosBloques: BloqueSesion[]): Promise<void>` — usado por Task 3 (`BloqueModal.tsx`). Lanza (`throw`) el error de Supabase si no es un error de red (el llamador decide cómo mostrarlo); si es un error de red, encola la operación y resuelve normalmente (no lanza).

- [ ] **Step 1: Crear el helper**

```ts
// src/lib/bloquesSesion.ts
import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import type { BloqueSesion, SesionesRow } from "@/types/database";

/**
 * Guarda un cambio en los bloques de una sesión al instante (añadir, editar
 * o quitar un bloque). Envía siempre la fila `SesionesRow` completa, no solo
 * la columna `bloques`: la cola offline (`aplicarPendientes` en
 * src/lib/offline/queue.ts) sustituye la fila cacheada entera por el payload
 * de una operación "update" encolada, así que un payload parcial dejaría la
 * sesión sin `fecha`/`duracion_min`/etc. mientras la operación esté pendiente.
 */
export async function guardarBloques(sesion: SesionesRow, nuevosBloques: BloqueSesion[]): Promise<void> {
  const payload: SesionesRow = {
    ...sesion,
    bloques: nuevosBloques,
    updated_at: new Date().toISOString(),
  };

  if (!navigator.onLine) {
    await encolarOperacion({ tabla: "sesiones", tipo: "update", rowId: sesion.id, payload });
    return;
  }

  const { error, status } = await supabase.from("sesiones").update(payload).eq("id", sesion.id);
  if (error) {
    if (esErrorDeRed(status)) {
      await encolarOperacion({ tabla: "sesiones", tipo: "update", rowId: sesion.id, payload });
      return;
    }
    throw error;
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc -b --noEmit` (desde la raíz del worktree)
Expected: sin errores nuevos relacionados con `src/lib/bloquesSesion.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/bloquesSesion.ts
git commit -m "feat: añade guardarBloques para persistir bloques de sesión al instante"
```

---

### Task 2: Selector de ejercicio de la biblioteca (`EjercicioPickerModal`)

**Files:**
- Create: `src/components/sesion/EjercicioPickerModal.tsx`

**Interfaces:**
- Consumes: nada de tareas anteriores (usa `supabase` y tipos existentes directamente).
- Produces: componente `EjercicioPickerModal` con props `{ open: boolean; onClose: () => void; equipoId: string; onPick: (ejercicio: EjerciciosRow) => void }` — usado por Task 3 (`BloqueModal.tsx`).

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/sesion/EjercicioPickerModal.tsx
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/field";
import { supabase } from "@/lib/supabaseClient";
import type { EjerciciosRow } from "@/types/database";

export function EjercicioPickerModal({
  open,
  onClose,
  equipoId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  onPick: (ejercicio: EjerciciosRow) => void;
}) {
  const [ejercicios, setEjercicios] = useState<EjerciciosRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!open) return;
    setCargando(true);
    supabase
      .from("ejercicios")
      .select("*")
      .or(`equipo_id.eq.${equipoId},compartido.eq.true`)
      .order("nombre")
      .then(({ data }) => {
        setEjercicios(data ?? []);
        setCargando(false);
      });
  }, [open, equipoId]);

  const filtrados = ejercicios.filter((e) => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    const enTags = e.contenido.some((t) => t.toLowerCase().includes(q));
    return e.nombre.toLowerCase().includes(q) || enTags;
  });

  return (
    <Modal open={open} onClose={onClose} title="Elegir ejercicio de la biblioteca">
      <div className="flex flex-col gap-3">
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

        {cargando && <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">Cargando...</div>}

        {!cargando && filtrados.length === 0 && (
          <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            {ejercicios.length === 0
              ? "Todavía no hay ejercicios en la biblioteca."
              : "Ningún ejercicio coincide con la búsqueda."}
          </div>
        )}

        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {filtrados.map((e) => {
            const esAjeno = e.equipo_id !== equipoId;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onPick(e)}
                className="card-surface flex flex-col gap-1 p-3 text-left transition-colors hover:border-[var(--color-accent)]"
              >
                <div className="font-semibold">{e.nombre}</div>
                <div className="text-sm text-[var(--color-text-muted)]">
                  {[e.categoria, e.dificultad].filter(Boolean).join(" · ") || "Sin clasificar"}
                </div>
                {esAjeno && (
                  <span className="w-fit rounded-full bg-[var(--color-card-hover)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                    Por {e.creado_por_nombre ?? "otro equipo"}
                    {e.equipo_origen_nombre ? ` · ${e.equipo_origen_nombre}` : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc -b --noEmit`
Expected: sin errores nuevos relacionados con `EjercicioPickerModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/sesion/EjercicioPickerModal.tsx
git commit -m "feat: añade EjercicioPickerModal para elegir un ejercicio de la biblioteca"
```

---

### Task 3: Modal de añadir/editar bloque (`BloqueModal`)

**Files:**
- Create: `src/components/sesion/BloqueModal.tsx`

**Interfaces:**
- Consumes: `guardarBloques` (Task 1), `EjercicioPickerModal` (Task 2).
- Produces: componente `BloqueModal` con props `{ open: boolean; onClose: () => void; equipoId: string; sesion: SesionesRow; bloqueIndex: number | null; onSaved: () => void }` — usado por Task 4 (`SesionDetailPage.tsx`). Contrato: `bloqueIndex === null` significa "añadir un bloque nuevo" (muestra pestañas biblioteca/libre); `bloqueIndex` con un número significa "editar el bloque libre en `sesion.bloques[bloqueIndex]`" — el llamador solo debe pasar el índice de un bloque **sin** `ejercicio_id` (uno enlazado a un ejercicio se edita abriendo `EjercicioFormModal` sobre ese ejercicio, no este modal).

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/sesion/BloqueModal.tsx
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { guardarBloques } from "@/lib/bloquesSesion";
import { EjercicioPickerModal } from "@/components/sesion/EjercicioPickerModal";
import type { BloqueSesion, EjerciciosRow, SesionesRow } from "@/types/database";

export function BloqueModal({
  open,
  onClose,
  equipoId,
  sesion,
  bloqueIndex,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  sesion: SesionesRow;
  bloqueIndex: number | null;
  onSaved: () => void;
}) {
  const editandoLibre = bloqueIndex !== null;

  const [tab, setTab] = useState<"biblioteca" | "libre">("biblioteca");
  const [tiempoBiblioteca, setTiempoBiblioteca] = useState("10");
  const [pickerAbierto, setPickerAbierto] = useState(false);
  const [tiempo, setTiempo] = useState("10");
  const [descripcion, setDescripcion] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [consignas, setConsignas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // El modal permanece montado entre aperturas (Modal solo oculta su
  // contenido), así que hay que resetear el formulario cada vez que se abre
  // — mismo patrón que EjercicioFormModal.tsx.
  useEffect(() => {
    if (!open) return;
    const bloque = bloqueIndex !== null ? sesion.bloques[bloqueIndex] : null;
    setTab("biblioteca");
    setTiempoBiblioteca("10");
    setPickerAbierto(false);
    setTiempo((bloque?.tiempo_min ?? 10).toString());
    setDescripcion(bloque?.descripcion_libre ?? "");
    setObjetivo(bloque?.objetivo ?? "");
    setConsignas(bloque?.consignas ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bloqueIndex]);

  async function guardarLibre() {
    setGuardando(true);
    try {
      const nuevoBloque: BloqueSesion = {
        tiempo_min: Number(tiempo) || 0,
        descripcion_libre: descripcion || undefined,
        objetivo: objetivo || undefined,
        consignas: consignas || undefined,
      };
      const nuevosBloques =
        bloqueIndex !== null
          ? sesion.bloques.map((b, i) => (i === bloqueIndex ? nuevoBloque : b))
          : [...sesion.bloques, nuevoBloque];
      await guardarBloques(sesion, nuevosBloques);
      onSaved();
    } catch (err) {
      alert("No se pudo guardar: " + (err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function elegirDeLaBiblioteca(ejercicio: EjerciciosRow) {
    setPickerAbierto(false);
    setGuardando(true);
    try {
      const nuevoBloque: BloqueSesion = { tiempo_min: Number(tiempoBiblioteca) || 0, ejercicio_id: ejercicio.id };
      await guardarBloques(sesion, [...sesion.bloques, nuevoBloque]);
      onSaved();
    } catch (err) {
      alert("No se pudo guardar: " + (err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (bloqueIndex === null) return;
    if (!confirm("¿Quitar este bloque de la sesión?")) return;
    setBorrando(true);
    try {
      const nuevosBloques = sesion.bloques.filter((_, i) => i !== bloqueIndex);
      await guardarBloques(sesion, nuevosBloques);
      onSaved();
    } catch (err) {
      alert("No se pudo borrar: " + (err as Error).message);
    } finally {
      setBorrando(false);
    }
  }

  const mostrarFormularioLibre = editandoLibre || tab === "libre";

  return (
    <>
      <Modal open={open} onClose={onClose} title={editandoLibre ? "Editar bloque" : "Añadir ejercicio"}>
        <div className="flex flex-col gap-4">
          {!editandoLibre && (
            <div className="tab-pill-group">
              <button type="button" className="tab-pill" data-active={tab === "biblioteca"} onClick={() => setTab("biblioteca")}>
                De la biblioteca
              </button>
              <button type="button" className="tab-pill" data-active={tab === "libre"} onClick={() => setTab("libre")}>
                Bloque libre
              </button>
            </div>
          )}

          {!mostrarFormularioLibre ? (
            <>
              <Field label="Minutos">
                <Input
                  type="number"
                  min={0}
                  value={tiempoBiblioteca}
                  onChange={(e) => setTiempoBiblioteca(e.target.value)}
                  className="w-24"
                />
              </Field>
              <Button type="button" variant="secondary" onClick={() => setPickerAbierto(true)} disabled={guardando}>
                Elegir ejercicio...
              </Button>
            </>
          ) : (
            <>
              <Field label="Minutos">
                <Input type="number" min={0} value={tiempo} onChange={(e) => setTiempo(e.target.value)} className="w-24" />
              </Field>
              <Field label="Descripción">
                <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="min-h-16" />
              </Field>
              <Field label="Objetivo">
                <Input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
              </Field>
              <Field label="Consignas">
                <Input value={consignas} onChange={(e) => setConsignas(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {editandoLibre ? (
            <Button type="button" variant="destructive" size="sm" onClick={borrar} disabled={borrando}>
              {borrando ? "Borrando..." : "Borrar"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            {mostrarFormularioLibre && (
              <Button type="button" size="sm" onClick={guardarLibre} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <EjercicioPickerModal
        open={pickerAbierto}
        onClose={() => setPickerAbierto(false)}
        equipoId={equipoId}
        onPick={elegirDeLaBiblioteca}
      />
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc -b --noEmit` y `npm run lint`
Expected: sin errores nuevos relacionados con `BloqueModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/sesion/BloqueModal.tsx
git commit -m "feat: añade BloqueModal para añadir o editar bloques de sesión al instante"
```

---

### Task 4: Integrar en `SesionDetailPage.tsx`

**Files:**
- Modify: `src/pages/SesionDetailPage.tsx`

**Interfaces:**
- Consumes: `BloqueModal` (Task 3, props `{ open, onClose, equipoId, sesion, bloqueIndex, onSaved }`), `EjercicioFormModal` (ya existente en `src/components/ejercicios/EjercicioFormModal.tsx`, props `{ open, onClose, equipoId, ejercicio, onSaved, onDeleted }`).

- [ ] **Step 1: Extraer la carga de ejercicios a una función reutilizable y ampliarla a ejercicios compartidos**

Reemplaza (líneas 20-31 del archivo actual):

```tsx
  const { horario, microciclos, mesociclos, sesiones, cargando, recargar } = useCalendarData(equipoId);
  const [ejercicios, setEjercicios] = useState<EjerciciosRow[]>([]);
  const [editando, setEditando] = useState(false);
  const [vista, setVista] = useState<"detalle" | "asistencia">("detalle");

  useEffect(() => {
    supabase
      .from("ejercicios")
      .select("*")
      .eq("equipo_id", equipoId)
      .then(({ data }) => setEjercicios(data ?? []));
  }, [equipoId]);
```

por:

```tsx
  const { horario, microciclos, mesociclos, sesiones, cargando, recargar } = useCalendarData(equipoId);
  const [ejercicios, setEjercicios] = useState<EjerciciosRow[]>([]);
  const [editando, setEditando] = useState(false);
  const [vista, setVista] = useState<"detalle" | "asistencia">("detalle");
  const [bloqueModalAbierto, setBloqueModalAbierto] = useState(false);
  const [bloqueEditIndex, setBloqueEditIndex] = useState<number | null>(null);
  const [ejercicioAbierto, setEjercicioAbierto] = useState<EjerciciosRow | null>(null);

  async function cargarEjercicios() {
    const { data } = await supabase
      .from("ejercicios")
      .select("*")
      .or(`equipo_id.eq.${equipoId},compartido.eq.true`)
      .order("nombre");
    setEjercicios(data ?? []);
  }

  useEffect(() => {
    cargarEjercicios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  function abrirNuevoBloque() {
    setBloqueEditIndex(null);
    setBloqueModalAbierto(true);
  }
```

(La consulta pasa de `.eq("equipo_id", equipoId)` a `.or(...)` — el mismo patrón que ya usa `EjerciciosPage.tsx` — porque un bloque puede enlazar un ejercicio compartido por otro equipo, y hasta ahora esta página no era capaz de resolverlo.)

- [ ] **Step 2: Hacer clicable cada fila de bloque**

Reemplaza el bloque de renderizado de bloques (líneas 150-174 del archivo actual):

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
              return (
                <div key={i} className="card-surface flex items-center gap-3 p-3">
                  <span className="stat-number flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--color-ink)] text-base text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{nombre}</div>
                    {detalle && <div className="truncate text-xs text-[var(--color-text-muted)]">{detalle}</div>}
                  </div>
                  <span className="stat-number shrink-0 text-[var(--color-accent)]">{b.tiempo_min}&apos;</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
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

              const contenido = (
                <>
                  <span className="stat-number flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--color-ink)] text-base text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{nombre}</div>
                    {detalle && <div className="truncate text-xs text-[var(--color-text-muted)]">{detalle}</div>}
                  </div>
                  <span className="stat-number shrink-0 text-[var(--color-accent)]">{b.tiempo_min}&apos;</span>
                </>
              );

              if (sinAcceso) {
                return (
                  <div key={i} className="card-surface flex items-center gap-3 p-3">
                    {contenido}
                  </div>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (ejercicio) setEjercicioAbierto(ejercicio);
                    else {
                      setBloqueEditIndex(i);
                      setBloqueModalAbierto(true);
                    }
                  }}
                  className="card-surface flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-[var(--color-accent)]"
                >
                  {contenido}
                </button>
              );
            })}
          </div>
        )}

        {sesion.bloques.length > 0 && (
          <button
            onClick={abrirNuevoBloque}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <Plus size={18} /> Añadir ejercicio
          </button>
        )}
      </div>
```

- [ ] **Step 3: Cambiar el botón del estado vacío para que abra `BloqueModal` en vez de `SesionModal`**

Reemplaza (líneas 139-148 del archivo actual):

```tsx
        {sesion.bloques.length === 0 ? (
          <button
            onClick={() => setEditando(true)}
            className="flex w-full flex-col items-center justify-center gap-3 py-14"
          >
```

por:

```tsx
        {sesion.bloques.length === 0 ? (
          <button
            onClick={abrirNuevoBloque}
            className="flex w-full flex-col items-center justify-center gap-3 py-14"
          >
```

- [ ] **Step 4: Renderizar `BloqueModal` y `EjercicioFormModal`**

Añade estos imports junto a los existentes (tras la línea `import { SesionModal } from "@/components/calendario/SesionModal";`):

```tsx
import { BloqueModal } from "@/components/sesion/BloqueModal";
import { EjercicioFormModal } from "@/components/ejercicios/EjercicioFormModal";
```

Y añade estos dos componentes justo antes del `<SesionModal ... />` final (antes de la línea `<SesionModal`):

```tsx
      <BloqueModal
        open={bloqueModalAbierto}
        onClose={() => setBloqueModalAbierto(false)}
        equipoId={equipoId}
        sesion={sesion}
        bloqueIndex={bloqueEditIndex}
        onSaved={() => {
          setBloqueModalAbierto(false);
          recargar();
        }}
      />

      <EjercicioFormModal
        open={ejercicioAbierto !== null}
        onClose={() => setEjercicioAbierto(null)}
        equipoId={equipoId}
        ejercicio={ejercicioAbierto}
        onSaved={() => {
          setEjercicioAbierto(null);
          cargarEjercicios();
        }}
        onDeleted={() => {
          setEjercicioAbierto(null);
          cargarEjercicios();
        }}
      />
```

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc -b --noEmit` y `npm run lint`
Expected: sin errores nuevos relacionados con `SesionDetailPage.tsx`.

- [ ] **Step 6: Prueba manual (dev server)**

Run: `npm run dev`, abrir una sesión de entrenamiento en el navegador y comprobar:
1. Con la sesión vacía, el botón central "Añadir ejercicios" abre `BloqueModal` (no `SesionModal`).
2. En la pestaña "De la biblioteca", elegir un ejercicio propio crea el bloque y aparece en la lista.
3. Pinchar ese bloque abre `EjercicioFormModal` en modo edición (equipo propio).
4. En la pestaña "Bloque libre", crear un bloque de texto libre; pincharlo abre `BloqueModal` en modo edición con los datos precargados, y el botón "Borrar" lo quita de la lista.
5. El botón "Añadir ejercicio" bajo la lista (con al menos un bloque ya creado) sigue abriendo el flujo de añadir.

Expected: los 5 puntos funcionan sin errores en consola.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SesionDetailPage.tsx
git commit -m "feat: bloques de sesión clicables y enlazables a ejercicios de la biblioteca"
```

---

### Task 5: Retirar la edición de bloques de `SesionModal.tsx`

**Files:**
- Modify: `src/components/calendario/SesionModal.tsx`

**Interfaces:**
- Consumes: nada nuevo — solo elimina UI/estado, mantiene el contrato de props existente (`SesionModal({ open, onClose, equipoId, microcicloId, fecha, diaSemana, duracionSugerida, sesion, onSaved, onDeleted })`) sin cambios.

- [ ] **Step 1: Quitar `bloques` del estado y sus manejadores**

Elimina estas líneas (líneas 44 y 50-58 del archivo actual):

```tsx
  const [bloques, setBloques] = useState<BloqueSesion[]>(sesion?.bloques ?? []);
```

```tsx
  function actualizarBloque(i: number, cambios: Partial<BloqueSesion>) {
    setBloques((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...cambios } : b)));
  }
  function añadirBloque() {
    setBloques((bs) => [...bs, { tiempo_min: 10, descripcion_libre: "" }]);
  }
  function quitarBloque(i: number) {
    setBloques((bs) => bs.filter((_, idx) => idx !== i));
  }
```

- [ ] **Step 2: Preservar los bloques existentes en el payload de guardado**

En `guardar()`, reemplaza (línea 95 del archivo actual):

```tsx
      bloques,
```

por:

```tsx
      // Los bloques ya no se editan desde este modal (ver SesionDetailPage.tsx
      // y BloqueModal.tsx) — se preservan tal cual para no borrarlos al
      // guardar cambios de duración/estado/valoración/notas.
      bloques: sesion?.bloques ?? [],
```

- [ ] **Step 3: Quitar la sección "Bloques" del formulario**

Elimina el bloque JSX completo (líneas 184-230 del archivo actual, el `<div>` que empieza en `<div>` justo después del `Field` de "Valoración" y contiene el encabezado "Bloques" + el `.map` de bloques):

```tsx
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-muted)]">Bloques</span>
            <button onClick={añadirBloque} className="flex items-center gap-1 text-sm text-[var(--color-accent)]">
              <Plus size={16} /> Añadir bloque
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {bloques.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)]">Sin bloques todavía.</p>
            )}
            {bloques.map((b, i) => (
              <div key={i} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={b.tiempo_min}
                    onChange={(e) => actualizarBloque(i, { tiempo_min: Number(e.target.value) })}
                    className="w-20"
                  />
                  <span className="text-sm text-[var(--color-text-muted)]">min</span>
                  <button onClick={() => quitarBloque(i)} className="ml-auto text-[var(--color-text-muted)] hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
                <Textarea
                  placeholder="Descripción libre del bloque"
                  value={b.descripcion_libre ?? ""}
                  onChange={(e) => actualizarBloque(i, { descripcion_libre: e.target.value })}
                  className="mb-2 min-h-16"
                />
                <Input
                  placeholder="Objetivo"
                  value={b.objetivo ?? ""}
                  onChange={(e) => actualizarBloque(i, { objetivo: e.target.value })}
                  className="mb-2"
                />
                <Input
                  placeholder="Consignas"
                  value={b.consignas ?? ""}
                  onChange={(e) => actualizarBloque(i, { consignas: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

```

- [ ] **Step 4: Limpiar imports que ya no se usan**

En el import de `lucide-react` (línea 2 del archivo actual), quita `Plus` y `Trash2` si tras el Step 3 ya no se usan en el archivo (siguen usándose en la sección de adjuntos — comprobar con una búsqueda antes de quitarlos: `Trash2` se sigue usando en `quitarAdjunto`'s botón, así que **no** se quita; `Plus` solo lo usaba "Añadir bloque", así que sí se quita):

```tsx
import { Trash2, Upload, Loader2 } from "lucide-react";
```

En el import de tipos (línea 9 del archivo actual), quita `BloqueSesion` si ya no se usa en el archivo:

```tsx
import type { DiaSemana, EstadoSesion, SesionesRow } from "@/types/database";
```

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc -b --noEmit` y `npm run lint`
Expected: sin errores ni imports sin usar.

- [ ] **Step 6: Prueba manual — verificación anti-regresión crítica**

Run: `npm run dev`
1. Abrir una sesión que ya tenga bloques (creados en la Task 4).
2. Pulsar el lápiz "Editar" (abre `SesionModal`), cambiar solo la valoración o las notas, y guardar.
3. Volver a la vista de detalle y confirmar que los bloques siguen exactamente igual que antes de editar.

Expected: los bloques no se alteran ni desaparecen al guardar cambios de sesión desde `SesionModal`.

- [ ] **Step 7: Commit**

```bash
git add src/components/calendario/SesionModal.tsx
git commit -m "refactor: retira la edición de bloques de SesionModal, ahora vive en SesionDetailPage"
```

---

## Verificación final antes de fusionar

Además de la revisión de rama completa (whole-branch review) del flujo subagent-driven-development:

1. Repetir el flujo manual de la Task 4 (Step 6) y la verificación anti-regresión de la Task 5 (Step 6) sobre el estado final de la rama.
2. Enlazar un bloque a un ejercicio **compartido por otro equipo** (no el propio) y confirmar que al pincharlo se abre en modo solo lectura, con atribución, sin botones de editar/borrar — reutiliza las reglas ya existentes de `EjercicioFormModal`, pero es el primer sitio donde se ejercitan desde `SesionDetailPage`, así que hay que comprobarlo explícitamente aquí.
3. Probar sin conexión (DevTools → Network → Offline): añadir un bloque, confirmar que la sesión se sigue viendo con todos sus datos (fecha, duración) mientras la operación está en cola, y que se sincroniza al reconectar.
