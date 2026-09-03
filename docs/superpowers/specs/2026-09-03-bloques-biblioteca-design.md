# Enlazar bloques de sesión a ejercicios de la biblioteca — diseño

## Contexto

Hoy `BloqueSesion` (dentro de `sesiones.bloques`, jsonb) ya tiene un campo
`ejercicio_id?` en el tipo, pero es una ruta de escritura muerta: ninguna UI
lo rellena nunca. Todos los bloques se crean como texto libre
(`descripcion_libre`/`objetivo`/`consignas`) desde el modal "Editar sesión"
(`SesionModal.tsx`), que guarda todo de golpe con un botón "Guardar".

Este es el sub-proyecto **A** de una petición más amplia sobre la vista de
detalle de sesión (`SesionDetailPage.tsx`). Cubre exactamente:

1. Pinchar un bloque existente para ver el detalle del ejercicio enlazado.
2. Un botón "+" siempre visible debajo del último bloque, para añadir uno nuevo.
3. Al añadir, elegir entre enlazar un ejercicio ya existente en la biblioteca
   (propio o compartido por otro equipo) o crearlo como hasta ahora (texto libre).

**Fuera de alcance** (sub-proyectos B y C, cada uno con su propio ciclo
diseño→plan→implementación):
- Imágenes o enlaces de YouTube/otra plataforma por ejercicio individual de la sesión.
- Reordenar bloques mediante arrastre.

## Decisión de arquitectura (ya aprobada)

Los bloques dejan de gestionarse dentro del modal "Editar sesión" con guardado
conjunto. Pasan a gestionarse **directamente en `SesionDetailPage.tsx`, con
guardado al instante por cada acción** (añadir, enlazar, editar un bloque
libre, borrar) — el mismo patrón que ya usa `ContadoresEnVivo` para el
marcador en directo. `SesionModal.tsx` deja de tocar `bloques` por completo;
se queda solo con duración, estado, valoración, notas y adjuntos de la sesión.

## Persistencia

`sesiones.bloques` sigue siendo el mismo array jsonb de siempre — no hay
tabla ni columna nueva, no hace falta migración. Cada mutación de un bloque
se guarda con un helper nuevo:

```ts
// src/lib/bloquesSesion.ts
export async function guardarBloques(sesion: SesionesRow, nuevosBloques: BloqueSesion[]): Promise<void>
```

**Detalle importante de compatibilidad con la cola offline:** `aplicarPendientes()`
(`src/lib/offline/queue.ts:147-164`) sustituye la fila cacheada completa por
`{...payload, id}` cuando reproduce una operación encolada — no la mezcla
con la fila existente. Si `guardarBloques` encolara solo `{bloques}`, una
sesión vista sin conexión tras encolar un cambio de bloque perdería
`fecha`, `duracion_min`, `estado`, etc. de la vista (y `SesionDetailPage`
rompería al construir `new Date(sesion.fecha + "T00:00:00")` con
`fecha` indefinida). Por eso `guardarBloques` construye y envía la **fila
`SesionesRow` completa** (igual que ya hace `SesionModal.guardar()` hoy),
solo con `bloques` y `updated_at` cambiados — nunca un payload parcial.
Usa exactamente el mismo patrón try-online/si-falla-por-red-encolar que ya
existe en `SesionModal.guardar()` y `crearSesionRapida`.

Tras cada mutación, `SesionDetailPage` llama a `recargar()` (ya expuesto por
`useCalendarData`) para refrescar desde la fuente de verdad — igual que hoy
hace `SesionModal` en su `onSaved`.

## Componentes nuevos

### `src/components/sesion/EjercicioPickerModal.tsx`
Modal de solo-selección: buscador por nombre/tag + lista de ejercicios
propios y compartidos (`.from("ejercicios").select("*").or(\`equipo_id.eq.${equipoId},compartido.eq.true\`).order("nombre")`,
el mismo patrón que ya usa `EjerciciosPage.tsx`). Cada fila muestra
nombre + categoría/dificultad, y el chip "Por {creado_por_nombre} ·
{equipo_origen_nombre}" cuando es ajeno — reutilizando el mismo criterio
visual que `EjerciciosPage`. Sin filtros de categoría/dificultad/favoritos
en esta primera versión (YAGNI; buscador es suficiente para elegir uno).
Pinchar una fila llama a `onPick(ejercicio)` y cierra.

### `src/components/sesion/BloqueModal.tsx`
Gestiona añadir un bloque nuevo y editar/borrar uno de texto libre ya
existente:

- **Modo "añadir"** (`bloque == null`): dos pestañas con el mismo patrón
  visual de pestañas que ya usa `PartidoModal` para rival existente/nuevo:
  - **"De la biblioteca"**: un campo de minutos + `EjercicioPickerModal`
    embebido; elegir un ejercicio guarda de inmediato
    `{ tiempo_min, ejercicio_id }`.
  - **"Bloque libre"**: los mismos campos de hoy (tiempo, descripción,
    objetivo, consignas), tal cual estaban en `SesionModal`.
- **Modo "editar bloque libre"** (`bloque` con `ejercicio_id` ausente):
  se abre directo en el formulario de texto libre, precargado, con botón
  "Borrar". (Un bloque enlazado a un ejercicio no se edita aquí — pinchar
  un bloque enlazado abre `EjercicioFormModal` sobre el ejercicio, no este
  modal; ver siguiente sección.)

Al guardar/borrar, construye el nuevo array `bloques` completo y llama a
`guardarBloques`.

## Cambios en `SesionDetailPage.tsx`

- La consulta de `ejercicios` pasa de `.eq("equipo_id", equipoId)` a la
  misma `.or(equipo_id.eq,compartido.eq.true)` que usa `EjerciciosPage` —
  cierra el hueco señalado al terminar "ejercicios compartidos" (un bloque
  podía enlazar un ejercicio compartido que esta página no era capaz de
  resolver).
- Cada fila de bloque pasa de `<div>` a comportamiento clicable según su
  tipo:
  - Enlazado y accesible (`ejercicio` resuelto) → abre `EjercicioFormModal`
    reutilizado tal cual (mismo componente que `EjerciciosPage`), pasando
    `equipoId` de la vista actual — las reglas de solo-lectura para
    ejercicios ajenos ya las aplica el propio componente, sin lógica nueva.
  - Libre (sin `ejercicio_id`) → abre `BloqueModal` en modo edición para
    ese índice.
  - `sinAcceso` (enlazado pero ya no accesible) → no clicable, se queda
    como hoy ("Ejercicio ya no disponible").
- Botón "+" fijo debajo de la lista de bloques (visible siempre que
  `sesion.bloques.length > 0`; el estado vacío ya tiene su propio botón
  central "Añadir ejercicios" con el mismo icono, que pasa a abrir
  `BloqueModal` en vez de `setEditando(true)`).
- El botón "Editar" (lápiz, cabecera) sigue abriendo `SesionModal` para los
  campos de sesión que le quedan (duración/estado/valoración/notas/adjuntos).

## Cambios en `SesionModal.tsx`

- Se elimina el estado `bloques`, `actualizarBloque`/`añadirBloque`/`quitarBloque`
  y toda la sección JSX "Bloques".
- **`guardar()` deja de exponer `bloques` en el formulario pero debe seguir
  incluyéndolo en el payload sin modificar**: `bloques: sesion?.bloques ?? []`.
  Omitir esto rompería datos reales — al guardar solo duración/estado/notas
  se borrarían silenciosamente todos los bloques de la sesión. Este es el
  punto de mayor riesgo de regresión del cambio y debe verificarse
  explícitamente (crear sesión con bloques → editar solo la valoración desde
  el modal → confirmar que los bloques siguen intactos).

## Testing / verificación manual antes de fusionar

1. Añadir un bloque enlazando un ejercicio propio → aparece en la lista,
   pinchar lo abre editable en `EjercicioFormModal`.
2. Añadir un bloque enlazando un ejercicio **compartido por otro equipo** →
   aparece con su nombre/categoría, pinchar lo abre en modo solo-lectura con
   atribución (sin botones de editar/borrar).
3. Añadir un bloque libre, pincharlo, editarlo y borrarlo.
4. Editar la sesión desde el lápiz (cambiar valoración/notas) y confirmar
   que los bloques no se alteran.
5. Probar sin conexión: añadir un bloque, confirmar que la sesión se sigue
   viendo correctamente (fecha, duración, etc. no desaparecen) mientras la
   operación está en cola, y que se sincroniza al reconectar.
