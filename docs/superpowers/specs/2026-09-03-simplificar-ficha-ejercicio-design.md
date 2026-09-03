# Simplificar la ficha de ejercicio — diseño

## Contexto

El formulario de ejercicio (`EjercicioFormModal.tsx`, único componente que
sirve de alta, edición y vista de solo-lectura para ejercicios ajenos
compartidos) tiene 8 campos de texto estructurado que se quieren eliminar:
`organizacion`, `reglas`, `consignas`, `progresion`, `regresion`,
`errores_frecuentes`, `correcciones`, `transferencia_partido`. En su lugar,
un único campo de texto libre para anotar lo que sea sin estructura fija.

`ejercicios.notas_adicionales` ya existe (parte del principio de diseño
global "cada ficha tiene un campo de notas libres", aplicado a todas las
tablas de negocio del proyecto) y ya tiene su campo en el formulario — se
reutiliza tal cual, no se crea un segundo campo de notas.

**Estado real de los datos:** la tabla `ejercicios` está vacía en producción
en el momento de escribir esto (0 filas) — verificado por consulta directa.
No hay ejercicios reales con estos campos rellenos que puedan perderse. La
migración de datos se escribe igualmente con la lógica completa (por
corrección y porque es exactamente lo que se pidió), y se verifica con datos
de prueba insertados y borrados durante la revisión, no con datos reales
porque no existen.

**Alcance verificado:** los 8 campos solo se usan en `EjercicioFormModal.tsx`
y `src/types/database.ts`. Existe un campo `consignas` homónimo en
`BloqueSesion` (bloques de sesión de entrenamiento) — es un tipo y una tabla
completamente distintos, no relacionado con `ejercicios.consignas`, y queda
fuera de este cambio.

## Migración de datos y esquema

Un único archivo, `supabase/migrations/0027_ejercicios_simplifica_ficha.sql`:

1. **Concatenación en `notas_adicionales`.** Para cada fila de `ejercicios`,
   por cada uno de los 8 campos con contenido no vacío (tras `trim`), añade
   un bloque con este formato exacto:

   ```
   Organización:
   [contenido]
   ```

   Los bloques se separan entre sí por una línea en blanco, en este orden:
   Organización, Reglas, Consignas, Progresión, Regresión, Errores
   frecuentes, Correcciones, Transferencia al partido. Un campo vacío o nulo
   no genera bloque (nunca una etiqueta sin contenido debajo).

   Si `notas_adicionales` ya tenía contenido antes de esta migración, el
   contenido migrado se **añade después** (separado por una línea en
   blanco), nunca lo sustituye — ninguna nota previa se pierde.

   Si un ejercicio no tiene contenido en ninguno de los 8 campos,
   `notas_adicionales` no se toca.

2. **Eliminar las 8 columnas** una vez migrado su contenido:
   `organizacion`, `reglas`, `consignas`, `progresion`, `regresion`,
   `errores_frecuentes`, `correcciones`, `transferencia_partido`.

## Tipos (`src/types/database.ts`)

- Se eliminan los 8 campos de `EjerciciosRow`.
- Se eliminan de la lista de claves opcionales en el `TableDef` de
  `ejercicios`.
- `notas_adicionales` no cambia de tipo (ya era `string | null`).

## Formulario (`EjercicioFormModal.tsx`)

Se eliminan los 8 `<Field>` correspondientes y sus referencias en
`FormState`, `toFormState` y el payload de `handleSubmit`. El orden final
del formulario queda:

Nombre → Categoría/Dificultad → Contenido/tags → Jugadores mín./máx. y
Duración → Espacio/Material → Compartir con los demás equipos (checkbox,
función ya existente, no se toca) → Enlace (ya existente, no se toca) →
Descripción (se mantiene, no estaba en la lista de campos a quitar) →
**Notas adicionales**, al final, sin cambios de etiqueta ni de tipo de
campo (sigue siendo el mismo `Textarea` de siempre) — es el único sitio
para anotar lo que antes iba en los 8 campos eliminados.

No hay una "vista de detalle" separada de este formulario: el modo
solo-lectura (`readOnly`, para ejercicios compartidos por otro equipo) es
el mismo componente con el `fieldset` deshabilitado — al quitar los 8
campos del formulario, automáticamente desaparecen también de esa vista.
No hace falta tocar nada más para cumplir "vista de detalle actualizada".

## Verificación antes de fusionar

Como no hay ejercicios reales con estos campos rellenos, la verificación
usa datos de prueba: insertar 1-2 ejercicios con varios de los 8 campos
rellenos (y, en uno de ellos, `notas_adicionales` ya con contenido previo,
para probar el caso "no debe pisar lo que ya había"), aplicar la migración,
confirmar el contenido final de `notas_adicionales` bloque a bloque, y
borrar esas filas de prueba antes de fusionar — la producción no debe
quedar con datos de prueba.
