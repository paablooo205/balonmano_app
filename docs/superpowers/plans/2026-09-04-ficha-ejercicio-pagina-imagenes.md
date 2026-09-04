# Página de detalle de ejercicio + imágenes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver un ejercicio (propio o compartido) abre una página completa de solo lectura bien diseñada, no la tarjeta/formulario actual; los ejercicios admiten varias imágenes, visibles directamente y ampliables a pantalla completa.

**Architecture:** Columna `imagenes` (array de rutas de Storage) en `ejercicios`, con una segunda excepción deliberada de RLS en `storage.objects` para que las imágenes de un ejercicio compartido se lean también desde otros equipos. `EjercicioFormModal.tsx` pierde su modo de solo lectura (ya no hace falta, nadie vuelve a abrirlo para ver un ejercicio ajeno) y gana el campo de imágenes. Una página nueva, `EjercicioDetailPage.tsx`, sustituye a la tarjeta para *ver* cualquier ejercicio; el lápiz "Editar" de esa página (solo si es tuyo) abre el formulario.

**Tech Stack:** React + TypeScript, Supabase (Postgres + Storage), Tailwind v4, react-router-dom.

**Spec:** `docs/superpowers/specs/2026-09-04-ficha-ejercicio-pagina-imagenes-design.md`

## Global Constraints

- Todo texto de UI en español.
- Ninguna estética de "campo de formulario deshabilitado" (gris, `fieldset disabled`) en la página de detalle nueva — es una vista de solo lectura con aspecto de página normal, no de formulario apagado.
- Las imágenes se ven directamente (miniatura real, no solo un nombre de archivo o un enlace) y se amplían a pantalla completa **dentro de la misma pantalla** (overlay), nunca en pestaña nueva.
- Segunda excepción deliberada de aislamiento por equipo (además de `ejercicios.compartido`, ya existente): una imagen es legible por cualquier equipo si su ruta exacta está en el array `imagenes` de un ejercicio con `compartido = true` — no basta con que el equipo dueño tenga *algún* ejercicio compartido.
- `EjercicioFormModal.tsx` deja de tener modo de solo lectura: a partir de este plan solo se abre para crear o editar **tu propio** ejercicio.
- Convención de tests del repo: no hay tests de componentes ni de código que llama a Supabase directamente. Ninguna tarea de este plan lleva test de vitest — verificación mediante tsc/eslint/build y, para la política de Storage, una prueba de RLS real contra la base de datos (transacción con rollback, simulando dos entrenadores reales de equipos distintos).

---

### Task 1: Migración — columna `imagenes` + política de Storage, con verificación RLS real

**Files:**
- Create: `supabase/migrations/0028_ejercicios_imagenes.sql`

**Interfaces:**
- Produces: la tabla `ejercicios` con una columna `imagenes jsonb not null default '[]'::jsonb`, y una política adicional de lectura en `storage.objects` — usado por Task 2 (tipos) y consumido en tiempo de ejecución por Task 4/Task 5 (subir/leer imágenes).

Esta tarea usa `mcp__supabase__execute_sql` (consultas/pruebas RLS) y `mcp__supabase__apply_migration` (aplicar el esquema) directamente — son llamadas de herramienta, no comandos de shell.

- [ ] **Step 1: Aplicar la migración**

Usa `mcp__supabase__apply_migration` con `name: "ejercicios_imagenes"` y esta query exacta:

```sql
alter table ejercicios add column imagenes jsonb not null default '[]'::jsonb;

create policy "auth_read_adjuntos_ejercicios_compartidos" on storage.objects
  for select using (
    bucket_id = 'adjuntos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = 'ejercicios'
    and exists (
      select 1 from ejercicios
      where equipo_id = ((storage.foldername(name))[2])::uuid
        and compartido = true
        and imagenes @> to_jsonb(array[name])
    )
  );
```

- [ ] **Step 2: Verificación RLS real con dos entrenadores reales de equipos distintos**

Estos son datos reales ya existentes en la base (no crear entrenadores nuevos):
- Equipo A = `0c8df037-7657-4a18-8e7c-7b5b6bf703ac` (Infantil Masculino B), entrenadora "Maddi Martinez", `auth_user_id = '4c547a55-a509-4a28-9bc4-d3512ff5a5bf'` — vinculada SOLO a este equipo, no admin.
- Equipo B = `136174e2-4ca8-43e3-ae76-42aa113e4257` (Cadete Femenino), entrenador "Oscar", `auth_user_id = '75a1a778-5f87-4d41-b9be-14e9505723e3'` — vinculado SOLO a este equipo, no admin.

Usa `mcp__supabase__execute_sql` con esta única transacción (con `rollback`, no persiste nada):

```sql
begin;

-- Dos ejercicios de prueba del equipo A: uno compartido con una imagen, otro NO compartido con otra imagen.
insert into ejercicios (id, equipo_id, nombre, contenido, compartido, imagenes)
values
  ('11111111-1111-1111-1111-111111111111', '0c8df037-7657-4a18-8e7c-7b5b6bf703ac', 'TEST_RLS_COMPARTIDO', '[]'::jsonb, true, '["ejercicios/0c8df037-7657-4a18-8e7c-7b5b6bf703ac/compartida.jpg"]'::jsonb),
  ('22222222-2222-2222-2222-222222222222', '0c8df037-7657-4a18-8e7c-7b5b6bf703ac', 'TEST_RLS_PRIVADO', '[]'::jsonb, false, '["ejercicios/0c8df037-7657-4a18-8e7c-7b5b6bf703ac/privada.jpg"]'::jsonb);

-- Filas de storage.objects correspondientes (sin contenido binario real, basta para probar la política de SELECT).
insert into storage.objects (bucket_id, name, owner)
values
  ('adjuntos', 'ejercicios/0c8df037-7657-4a18-8e7c-7b5b6bf703ac/compartida.jpg', null),
  ('adjuntos', 'ejercicios/0c8df037-7657-4a18-8e7c-7b5b6bf703ac/privada.jpg', null);

-- Simula al entrenador del equipo B (Oscar) leyendo storage.objects.
set local role authenticated;
set local request.jwt.claims = '{"sub": "75a1a778-5f87-4d41-b9be-14e9505723e3", "role": "authenticated"}';

select name from storage.objects where name in (
  'ejercicios/0c8df037-7657-4a18-8e7c-7b5b6bf703ac/compartida.jpg',
  'ejercicios/0c8df037-7657-4a18-8e7c-7b5b6bf703ac/privada.jpg'
);

rollback;
```

Expected: la consulta final devuelve **solo** `ejercicios/0c8df037-7657-4a18-8e7c-7b5b6bf703ac/compartida.jpg` (1 fila) — el entrenador del equipo B ve la imagen del ejercicio compartido del equipo A, pero no la del ejercicio privado. Si devuelve 0 filas, la política no se aplicó bien (revisar el `exists`); si devuelve 2 filas, la política es demasiado permisiva (revisar la condición `imagenes @>`).

Tras el `rollback`, confirma que no queda nada de la prueba (la transacción nunca se confirmó, así que no hace falta borrar nada aparte).

- [ ] **Step 3: Escribir el archivo de migración versionado**

Crea `supabase/migrations/0028_ejercicios_imagenes.sql` con exactamente el mismo SQL del Step 1 (el `alter table` seguido del `create policy`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0028_ejercicios_imagenes.sql
git commit -m "feat: añade ejercicios.imagenes y política de Storage para imágenes de ejercicios compartidos"
```

---

### Task 2: Actualizar tipos (`src/types/database.ts`)

**Files:**
- Modify: `src/types/database.ts`

**Interfaces:**
- Consumes: la columna `imagenes` de Task 1.
- Produces: `EjerciciosRow.imagenes: string[]` — usado por Task 3, 4 y 5.

- [ ] **Step 1: Añadir el campo a `EjerciciosRow`**

Busca esta línea en `EjerciciosRow` (justo después de `enlace: string | null;`):

```ts
  /** Enlace externo opcional (portal de ejercicios, vídeo, etc.) — se abre directamente, no se enruta dentro de la app. */
  enlace: string | null;
```

y añade justo después:

```ts
  /** Rutas de Storage (bucket "adjuntos") de las imágenes del ejercicio — nunca la URL firmada, que caduca. */
  imagenes: string[];
```

- [ ] **Step 2: Añadir la clave a las opcionales del `TableDef` de `ejercicios`**

Busca `| "enlace"` dentro de `ejercicios: TableDef<EjerciciosRow, ...>` y añade justo después `| "imagenes"` (tiene `default '[]'::jsonb`, así que es opcional en el insert, igual que `contenido`).

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: añade imagenes a EjerciciosRow"
```

---

### Task 3: Componente `MiniaturaImagen`

**Files:**
- Create: `src/components/ejercicios/MiniaturaImagen.tsx`

**Interfaces:**
- Consumes: `urlFirmada` de `@/lib/storage` (ya existente, firma `(ruta: string, segundos?: number) => Promise<string>`).
- Produces: componente `MiniaturaImagen` con props `{ ruta: string; className?: string; onClick?: () => void }` — usado por Task 4 (`EjercicioFormModal.tsx`) y Task 5 (`EjercicioDetailPage.tsx`).

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/ejercicios/MiniaturaImagen.tsx
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { urlFirmada } from "@/lib/storage";
import { cn } from "@/lib/utils";

/** Miniatura real de una imagen de ejercicio (nunca solo un nombre de archivo o un enlace) — obtiene su URL firmada al montarse. */
export function MiniaturaImagen({
  ruta,
  className,
  onClick,
}: {
  ruta: string;
  className?: string;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setUrl(null);
    urlFirmada(ruta)
      .then((u) => {
        if (vivo) setUrl(u);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ruta]);

  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-[var(--color-card-hover)]", className)}>
        <Loader2 size={18} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      onClick={onClick}
      className={cn("object-cover", onClick && "cursor-pointer", className)}
    />
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc -b --noEmit`
Expected: sin errores nuevos relacionados con `MiniaturaImagen.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ejercicios/MiniaturaImagen.tsx
git commit -m "feat: añade MiniaturaImagen para mostrar imágenes de ejercicio como miniaturas reales"
```

---

### Task 4: `EjercicioFormModal.tsx` — quita el modo de solo lectura, añade imágenes

**Files:**
- Modify: `src/components/ejercicios/EjercicioFormModal.tsx`

**Interfaces:**
- Consumes: `MiniaturaImagen` (Task 3), `subirArchivo`/`borrarArchivo` de `@/lib/storage` (ya existentes).
- Produces: `EjercicioFormModal` sin el prop `permitirBorrar` — usado por Task 6 al actualizar sus llamadores (`EjerciciosPage.tsx` no lo pasaba, sigue igual; `SesionDetailPage.tsx` deja de usar este componente por completo en la Task 6).

- [ ] **Step 1: Quitar `permitirBorrar` y toda la lógica de solo lectura**

Reemplaza la firma del componente (líneas 48-64 del archivo actual):

```tsx
export function EjercicioFormModal({
  open,
  onClose,
  equipoId,
  ejercicio,
  onSaved,
  onDeleted,
  permitirBorrar = true,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  ejercicio: EjerciciosRow | null;
  onSaved: () => void;
  onDeleted: () => void;
  permitirBorrar?: boolean;
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
```

por (nota: este `EjercicioFormModal` ahora solo crea o edita ejercicios propios — nunca se abre ya en modo solo-lectura, así que además de quitar `readOnly`/`permitirBorrar` se añade el estado para las imágenes, siguiendo el mismo patrón de "original vs. actual" que `ficha_oficial_url` en `JugadorFormModal.tsx` pero para un array):

```tsx
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
  const [imagenesOriginales] = useState<string[]>(ejercicio?.imagenes ?? []);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // El modal permanece montado entre aperturas, así que sin este efecto
  // reabrirlo (para el mismo ejercicio tras cancelar, para uno distinto, o
  // para "nuevo" otra vez) mostraría datos de la sesión de edición anterior.
  useEffect(() => {
    if (open) setForm(toFormState(ejercicio));

  }, [open, ejercicio]);
```

- [ ] **Step 2: Añadir `imagenes` a `FormState` y `toFormState`**

Reemplaza (líneas 14-28):

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
  imagenes: string[];
  compartido: boolean;
  notas_adicionales: string;
};
```

Reemplaza (líneas 30-46):

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
    imagenes: e?.imagenes ?? [],
    compartido: e?.compartido ?? false,
    notas_adicionales: e?.notas_adicionales ?? "",
  };
}
```

- [ ] **Step 3: Manejadores de subir/quitar imagen**

Añade estas dos funciones justo después de la función `set` (que queda sin cambios):

```ts
  async function subirImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setSubiendoImagen(true);
    try {
      for (const file of files) {
        const ruta = await subirArchivo(`ejercicios/${equipoId}`, file);
        setForm((f) => ({ ...f, imagenes: [...f.imagenes, ruta] }));
      }
    } catch (err) {
      alert("No se pudo subir la imagen: " + (err as Error).message);
    } finally {
      setSubiendoImagen(false);
    }
  }

  function quitarImagen(ruta: string) {
    setForm((f) => ({ ...f, imagenes: f.imagenes.filter((r) => r !== ruta) }));
  }
```

Añade el import de `subirArchivo` (junto al resto de imports, después del import de `useEntrenador`):

```ts
import { subirArchivo, borrarArchivo } from "@/lib/storage";
```

- [ ] **Step 4: Limpieza de imágenes huérfanas al cancelar y al guardar**

Reemplaza el JSX del `<Modal>` para envolver `onClose` con una limpieza — busca esta línea (línea 150 del archivo actual):

```tsx
    <Modal open={open} onClose={onClose} title={readOnly ? "Ejercicio compartido" : ejercicio ? "Editar ejercicio" : "Nuevo ejercicio"}>
```

por:

```tsx
    <Modal open={open} onClose={cancelar} title={ejercicio ? "Editar ejercicio" : "Nuevo ejercicio"}>
```

y añade esta función `cancelar` justo antes del `return` del componente (después de `handleDelete`):

```ts
  function cancelar() {
    // Imágenes subidas en esta sesión de edición que nunca llegaron a
    // guardarse no deben quedar huérfanas en Storage.
    for (const ruta of form.imagenes) {
      if (!imagenesOriginales.includes(ruta)) void borrarArchivo(ruta).catch(() => {});
    }
    onClose();
  }
```

En `handleSubmit`, después de la línea `onSaved();` (última línea de la función, antes de la llave de cierre), añade la limpieza de imágenes quitadas y confirmadas:

```ts
    // Imágenes que estaban antes y ya no están en el array final: se
    // quitaron deliberadamente y el guardado se confirmó — ahora sí se
    // borran de Storage.
    for (const ruta of imagenesOriginales) {
      if (!form.imagenes.includes(ruta)) void borrarArchivo(ruta).catch(() => {});
    }
    onSaved();
```

(Sustituye la línea `onSaved();` existente al final de `handleSubmit` por este bloque completo — las dos líneas de arriba más el `onSaved();` que ya estaba.)

No toques todavía los botones "Cancelar" del footer — el Step 5 reemplaza el footer entero (incluidos ambos) de una vez, ya con `onClick={cancelar}` incluido en el texto de reemplazo.

- [ ] **Step 5: Eliminar el banner de solo lectura y el `fieldset disabled`, añadir el campo Imágenes, simplificar el footer**

Reemplaza el bloque completo desde el banner de solo lectura hasta el cierre del `<fieldset>` (líneas 152-160 del archivo actual, el inicio del formulario):

```tsx
      {readOnly && (
        <div className="mb-3 rounded-lg bg-[var(--color-card-hover)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
          Compartido por {ejercicio?.creado_por_nombre ?? "otro equipo"}
          {ejercicio?.equipo_origen_nombre ? ` · ${ejercicio.equipo_origen_nombre}` : ""}
        </div>
      )}

      <form id="ejercicio-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <fieldset disabled={readOnly} className="contents">
          <Field label="Nombre *">
```

por:

```tsx
      <form id="ejercicio-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nombre *">
```

(El `<fieldset>` desaparece por completo — su cierre `</fieldset>` más abajo, justo antes de `</form>`, también se quita en este mismo paso.)

Añade el campo Imágenes justo después del bloque del Enlace (después del `<a>` "Abrir enlace" y antes del `<label>` del checkbox "Compartir"):

```tsx
          <Field label="Imágenes">
            <div className="flex flex-col gap-2">
              {form.imagenes.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {form.imagenes.map((ruta) => (
                    <div key={ruta} className="relative">
                      <MiniaturaImagen ruta={ruta} className="aspect-square w-full rounded-[10px]" />
                      <button
                        type="button"
                        onClick={() => quitarImagen(ruta)}
                        aria-label="Quitar imagen"
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]">
                {subiendoImagen ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {subiendoImagen ? "Subiendo..." : "Añadir imagen"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={subirImagen}
                  disabled={subiendoImagen}
                />
              </label>
            </div>
          </Field>
```

Añade los imports que necesita este bloque (`X`, `Upload`, `Loader2` de lucide-react, y `MiniaturaImagen`):

```ts
import { ExternalLink, Loader2, Upload, X } from "lucide-react";
import { MiniaturaImagen } from "@/components/ejercicios/MiniaturaImagen";
```

(Sustituye la línea `import { ExternalLink } from "lucide-react";` existente por la primera de estas dos líneas.)

Por último, simplifica el footer — reemplaza (líneas 260-284 del archivo actual):

```tsx
      {readOnly ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2">
          {ejercicio && permitirBorrar ? (
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
```

por:

```tsx
      <div className="mt-2 flex items-center justify-between gap-2">
        {ejercicio ? (
          <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={borrando}>
            {borrando ? "Borrando..." : "Borrar"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={cancelar}>
            Cancelar
          </Button>
          <Button type="submit" form="ejercicio-form" size="sm" disabled={guardando || subiendoImagen}>
            {guardando ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
```

- [ ] **Step 6: Incluir `imagenes` en el payload de guardado**

En `handleSubmit`, dentro del objeto `payload`, añade `imagenes: form.imagenes,` justo después de la línea `enlace: form.enlace.trim() || null,`.

- [ ] **Step 7: Verificar tipos, lint y build**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 8: Commit**

```bash
git add src/components/ejercicios/EjercicioFormModal.tsx
git commit -m "refactor: EjercicioFormModal pierde el modo de solo lectura y gana imágenes"
```

---

### Task 5: Página nueva `EjercicioDetailPage.tsx` + ruta

**Files:**
- Create: `src/pages/EjercicioDetailPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `MiniaturaImagen` (Task 3), `EjercicioFormModal` (Task 4, sin `permitirBorrar`), `EjerciciosRow` con `imagenes` (Task 2).
- Produces: ruta `ejercicios/:ejercicioId` — usada por Task 6 (`EjerciciosPage.tsx`, `SesionDetailPage.tsx` navegan aquí).

- [ ] **Step 1: Crear la página**

```tsx
// src/pages/EjercicioDetailPage.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock, ExternalLink, Pencil, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { MiniaturaImagen } from "@/components/ejercicios/MiniaturaImagen";
import { EjercicioFormModal } from "@/components/ejercicios/EjercicioFormModal";
import type { EjerciciosRow } from "@/types/database";

export function EjercicioDetailPage() {
  const { equipoId } = useEquipo();
  const { ejercicioId } = useParams<{ ejercicioId: string }>();
  const navigate = useNavigate();
  const [ejercicio, setEjercicio] = useState<EjerciciosRow | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [imagenAbierta, setImagenAbierta] = useState<number | null>(null);

  async function cargar() {
    if (!ejercicioId) return;
    setCargando(true);
    const { data } = await supabase.from("ejercicios").select("*").eq("id", ejercicioId).maybeSingle();
    setEjercicio(data ?? null);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejercicioId]);

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }
  if (!ejercicio) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Ejercicio no encontrado.</div>;
  }

  const esPropio = ejercicio.equipo_id === equipoId;
  const datosRapidos = [
    ejercicio.dificultad,
    (ejercicio.jugadores_min || ejercicio.jugadores_max) && `${ejercicio.jugadores_min ?? "?"}–${ejercicio.jugadores_max ?? "?"} jugadores`,
    ejercicio.duracion_min && `${ejercicio.duracion_min} min`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={ejercicio.nombre}
        eyebrow={ejercicio.categoria ?? "Ejercicio"}
        onBack={() => navigate(-1)}
        backLabel="Ejercicios"
        action={
          esPropio ? (
            <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>
              <Pencil size={16} /> Editar
            </Button>
          ) : undefined
        }
      />

      {!esPropio && (
        <div className="card-surface p-4 text-sm text-[var(--color-text-muted)]">
          Compartido por {ejercicio.creado_por_nombre ?? "otro equipo"}
          {ejercicio.equipo_origen_nombre ? ` · ${ejercicio.equipo_origen_nombre}` : ""}
        </div>
      )}

      {ejercicio.imagenes.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {ejercicio.imagenes.map((ruta, i) => (
            <MiniaturaImagen
              key={ruta}
              ruta={ruta}
              onClick={() => setImagenAbierta(i)}
              className="aspect-square w-full rounded-[14px]"
            />
          ))}
        </div>
      )}

      {datosRapidos.length > 0 && (
        <div className="card-surface flex flex-wrap gap-4 p-4 text-sm text-[var(--color-text-muted)]">
          {datosRapidos.map((d) => (
            <span key={d} className="flex items-center gap-1.5">
              {d.includes("jugadores") && <Users size={15} />}
              {d.includes("min") && <Clock size={15} />}
              {d}
            </span>
          ))}
        </div>
      )}

      {ejercicio.contenido.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ejercicio.contenido.map((tag) => (
            <span key={tag} className="rounded-full bg-[var(--color-card-hover)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
              {tag}
            </span>
          ))}
        </div>
      )}

      {(ejercicio.espacio || ejercicio.material) && (
        <div className="card-surface grid grid-cols-2 gap-3 p-4">
          {ejercicio.espacio && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">Espacio</div>
              <div className="text-sm">{ejercicio.espacio}</div>
            </div>
          )}
          {ejercicio.material && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">Material</div>
              <div className="text-sm">{ejercicio.material}</div>
            </div>
          )}
        </div>
      )}

      {ejercicio.enlace && (
        <a
          href={ejercicio.enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="card-surface flex items-center justify-center gap-2 p-3.5 text-sm font-medium text-[var(--color-accent)]"
        >
          <ExternalLink size={16} /> Abrir enlace
        </a>
      )}

      {ejercicio.descripcion && (
        <div className="card-surface p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">Descripción</div>
          <p className="whitespace-pre-line text-sm leading-relaxed">{ejercicio.descripcion}</p>
        </div>
      )}

      {ejercicio.notas_adicionales && (
        <div className="card-surface p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">Notas adicionales</div>
          <p className="whitespace-pre-line text-sm leading-relaxed">{ejercicio.notas_adicionales}</p>
        </div>
      )}

      <EjercicioFormModal
        open={editando}
        onClose={() => setEditando(false)}
        equipoId={equipoId}
        ejercicio={ejercicio}
        onSaved={() => {
          setEditando(false);
          cargar();
        }}
        onDeleted={() => {
          setEditando(false);
          navigate(-1);
        }}
      />

      {imagenAbierta !== null && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/95"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-white/60">
              {imagenAbierta + 1} / {ejercicio.imagenes.length}
            </span>
            <button onClick={() => setImagenAbierta(null)} aria-label="Cerrar" className="text-white/80 hover:text-white">
              <X size={22} />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-4">
            <MiniaturaImagen ruta={ejercicio.imagenes[imagenAbierta]} className="max-h-full max-w-full rounded-[10px] object-contain" />
            {imagenAbierta > 0 && (
              <button
                onClick={() => setImagenAbierta((i) => (i !== null ? i - 1 : i))}
                aria-label="Imagen anterior"
                className="absolute left-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            {imagenAbierta < ejercicio.imagenes.length - 1 && (
              <button
                onClick={() => setImagenAbierta((i) => (i !== null ? i + 1 : i))}
                aria-label="Imagen siguiente"
                className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Registrar la ruta**

En `src/App.tsx`, añade el import:

```tsx
import { EjercicioDetailPage } from "@/pages/EjercicioDetailPage";
```

junto al resto de imports de páginas, y añade la ruta justo después de `<Route path="ejercicios" element={<EjerciciosPage />} />`:

```tsx
            <Route path="ejercicios/:ejercicioId" element={<EjercicioDetailPage />} />
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 4: Commit**

```bash
git add src/pages/EjercicioDetailPage.tsx src/App.tsx
git commit -m "feat: añade la página de detalle de ejercicio con galería de imágenes ampliable"
```

---

### Task 6: `EjerciciosPage.tsx` y `SesionDetailPage.tsx` navegan a la página nueva

**Files:**
- Modify: `src/pages/EjerciciosPage.tsx`
- Modify: `src/pages/SesionDetailPage.tsx`

**Interfaces:**
- Consumes: la ruta `ejercicios/:ejercicioId` (Task 5).

- [ ] **Step 1: `EjerciciosPage.tsx` — pinchar una tarjeta navega, ya no abre el modal de edición**

Añade el import de `useNavigate`:

```tsx
import { useNavigate } from "react-router-dom";
```

Añade la línea `const navigate = useNavigate();` justo después de `const { equipoId } = useEquipo();`.

Las tarjetas ya nunca abren el formulario para editar — solo el botón "Nuevo" lo abre, y siempre en modo alta. El estado `editando` (que guardaba qué ejercicio se estaba editando) deja de tener sentido: tras este cambio nunca podría contener otra cosa que `null`. Se elimina por completo en vez de dejarlo como código muerto.

Reemplaza (el bloque de estado y las funciones que lo tocan):

```tsx
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<EjerciciosRow | null>(null);
```

por:

```tsx
  const [modalAbierto, setModalAbierto] = useState(false);
```

Reemplaza:

```tsx
  function abrirNuevo() {
    setEditando(null);
    setModalAbierto(true);
  }
  function abrirEdicion(e: EjerciciosRow) {
    setEditando(e);
    setModalAbierto(true);
  }
```

por:

```tsx
  function abrirNuevo() {
    setModalAbierto(true);
  }
```

Reemplaza (en el `.map` de tarjetas):

```tsx
            <button
              key={e.id}
              onClick={() => abrirEdicion(e)}
              className="card-surface flex flex-col gap-2 p-4 text-left transition-colors hover:border-[var(--color-accent)]"
            >
```

por:

```tsx
            <button
              key={e.id}
              onClick={() => navigate(`/equipos/${equipoId}/ejercicios/${e.id}`)}
              className="card-surface flex flex-col gap-2 p-4 text-left transition-colors hover:border-[var(--color-accent)]"
            >
```

Reemplaza (el `<EjercicioFormModal>` al final del componente):

```tsx
      <EjercicioFormModal
        open={modalAbierto}
        onClose={cerrarModal}
        equipoId={equipoId}
        ejercicio={editando}
        onSaved={alGuardar}
        onDeleted={alBorrar}
      />
```

por:

```tsx
      <EjercicioFormModal
        open={modalAbierto}
        onClose={cerrarModal}
        equipoId={equipoId}
        ejercicio={null}
        onSaved={alGuardar}
        onDeleted={alBorrar}
      />
```

- [ ] **Step 2: `SesionDetailPage.tsx` — un bloque enlazado navega, ya no abre el modal**

Elimina el estado `ejercicioAbierto` (línea `const [ejercicioAbierto, setEjercicioAbierto] = useState<EjerciciosRow | null>(null);`) y el import de `EjercicioFormModal` (ya no se usa en este archivo).

Reemplaza (dentro del `onAbrir` de `<BloqueRow>`):

```tsx
                      onAbrir={() => {
                        if (ejercicio) setEjercicioAbierto(ejercicio);
                        else {
                          setBloqueEditIndex(i);
                          setBloqueModalAbierto(true);
                        }
                      }}
```

por:

```tsx
                      onAbrir={() => {
                        if (ejercicio) navigate(`/equipos/${equipoId}/ejercicios/${ejercicio.id}`);
                        else {
                          setBloqueEditIndex(i);
                          setBloqueModalAbierto(true);
                        }
                      }}
```

Elimina por completo el bloque `<EjercicioFormModal ... />` (todo el elemento, incluido `permitirBorrar={false}`, que ya no existe como prop tras la Task 4):

```tsx
      <EjercicioFormModal
        open={ejercicioAbierto !== null}
        onClose={() => setEjercicioAbierto(null)}
        equipoId={equipoId}
        ejercicio={ejercicioAbierto}
        permitirBorrar={false}
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

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `npx tsc -b --noEmit`
Expected: sin errores (en particular, ningún import ni variable sin usar tras quitar `ejercicioAbierto`/`EjercicioFormModal` de `SesionDetailPage.tsx`, ni `EjerciciosRow` sin usar en `EjerciciosPage.tsx` si dejó de hacer falta — comprobar antes de dar por bueno).

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 4: Prueba manual**

Run: `npm run dev` y comprobar:
1. En la biblioteca de ejercicios, pinchar un ejercicio propio abre la página de detalle nueva (no la tarjeta), con botón "Editar".
2. "Editar" abre el formulario, con el campo "Imágenes" — subir una imagen, guardar, y confirmar que aparece en la página de detalle.
3. Tocar una imagen en la página de detalle la abre a pantalla completa, con zoom/ampliada, dentro de la misma pantalla; cerrar funciona.
4. Desde una sesión de entrenamiento, pinchar un bloque enlazado a un ejercicio abre la misma página de detalle (no la tarjeta).
5. Un ejercicio compartido por otro equipo se ve en texto normal, sin aspecto de campo deshabilitado, sin botón "Editar".

Expected: los 5 puntos funcionan sin errores en consola.

- [ ] **Step 5: Commit**

```bash
git add src/pages/EjerciciosPage.tsx src/pages/SesionDetailPage.tsx
git commit -m "refactor: ver un ejercicio navega a la página de detalle en vez de abrir la tarjeta"
```

---

## Verificación final antes de fusionar

Además de la revisión de rama completa (whole-branch review) del flujo subagent-driven-development:

1. Repetir la prueba manual de la Task 6 (Step 4).
2. Confirmar en la base de datos real que la política de Storage sigue dando el resultado esperado (repetir la transacción con rollback de la Task 1, Step 2).
3. Con dos equipos reales (o los mismos usados en la Task 1), compartir un ejercicio con imágenes desde un equipo y comprobar en el navegador que se ve correctamente desde el otro — solo lectura, con atribución, imágenes cargando bien.
