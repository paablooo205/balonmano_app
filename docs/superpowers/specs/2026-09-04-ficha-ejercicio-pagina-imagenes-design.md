# Página de detalle de ejercicio + imágenes — diseño

## Contexto

Hoy, ver un ejercicio (propio o compartido por otro equipo) abre
`EjercicioFormModal` — una tarjeta pequeña en el centro de la pantalla, que
además reutiliza el propio formulario de alta/edición: para un ejercicio
ajeno, se ve igual que el formulario pero con todos los campos
deshabilitados (gris). Se pide:

1. Poder adjuntar varias imágenes al guardar un ejercicio, visibles
   directamente (no solo un enlace) y ampliables a pantalla completa sin
   salir de la app.
2. Que ver un ejercicio abra una página completa, no una tarjeta.
3. Que esa vista no se vea "deshabilitada" — debe leerse con normalidad,
   aunque no se pueda editar.
4. Una página de detalle diseñada para mostrar, distinta del formulario de
   alta/edición.

Dos sitios abren hoy esa tarjeta pequeña y quedan cubiertos por este
cambio: la biblioteca de ejercicios (`EjerciciosPage.tsx`) y el bloque
enlazado a un ejercicio dentro de una sesión de entrenamiento
(`SesionDetailPage.tsx`).

## Decisiones ya acordadas con el usuario

- Varias imágenes por ejercicio (no una sola).
- Al pinchar un ejercicio **propio** en la biblioteca, también se abre la
  página de detalle nueva (no se edita directo con un toque, como hoy) —
  un lápiz "Editar" en esa página abre el formulario. Mismo patrón que
  jugador/partido/sesión en el resto de la app.
- Se añade una segunda excepción deliberada de aislamiento por equipo (la
  primera fue `ejercicios.compartido` en la tabla) para que las imágenes de
  un ejercicio compartido también se vean desde otros equipos — sin esto,
  compartir un ejercicio con fotos dejaría esas fotos rotas para los demás.

## Modelo de datos

### `ejercicios.imagenes`

Columna nueva, mismo patrón que `contenido` (array de strings en jsonb):

```sql
alter table ejercicios add column imagenes jsonb not null default '[]'::jsonb;
```

Tipo TypeScript: `imagenes: string[]` en `EjerciciosRow`, añadida a la
lista de claves opcionales del `TableDef` de `ejercicios` (por el
`default '[]'::jsonb`, un insert sin especificarla es válido).

Cada elemento es una ruta de Storage (bucket `adjuntos`, carpeta
`ejercicios/${equipoId}/...`), igual que ya hacen `sesiones.adjuntos` y
`jugadores.ficha_oficial_url` — nunca la URL firmada, que caduca.

### Excepción de Storage para imágenes de ejercicios compartidos

`storage.objects` ya tiene 4 políticas (`0009_storage_rls.sql`) que exigen
`equipo_del_entrenador(equipo_id_de_la_ruta)` para leer/escribir/borrar —
aislamiento estricto por equipo, sin excepción. Sin cambios, una imagen
subida por el equipo dueño de un ejercicio compartido no la podría leer
ningún otro equipo (la fila de `ejercicios` sí es legible por la excepción
de `compartido`, pero el archivo en Storage no).

Se añade una política de **solo lectura** adicional (las políticas del
mismo comando se combinan con OR en Postgres RLS — no sustituye a la
existente, que sigue dando acceso de lectura al equipo dueño):

```sql
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

`imagenes @> to_jsonb(array[name])` comprueba que la ruta exacta del
archivo está en el array `imagenes` de una fila de `ejercicios` — no basta
con que el equipo tenga *algún* ejercicio compartido, tiene que ser
exactamente esa imagen la que está enlazada desde un ejercicio compartido.
Sin esta condición de contenido exacto, cualquier archivo bajo
`ejercicios/{equipo_id}/` de un equipo con al menos un ejercicio compartido
sería legible por cualquiera, incluidas imágenes de ejercicios NO
compartidos de ese mismo equipo — la condición `imagenes @>` evita esa
fuga.

**Verificación antes de fusionar** (mismo rigor que `ejercicios_compartidos`
en su momento): con dos equipos reales, confirmar que el equipo B puede
generar una URL firmada para una imagen de un ejercicio compartido por el
equipo A, y que falla al intentarlo con una imagen de un ejercicio NO
compartido del equipo A.

## `EjercicioFormModal.tsx` — se simplifica y gana imágenes

Este componente deja de usarse nunca para *ver* un ejercicio (ese trabajo
lo hace la página nueva) — a partir de ahora solo crea o edita **tu propio**
ejercicio. Se elimina todo lo que existía solo para el caso de solo
lectura:

- El prop `permitirBorrar` (ya no hace falta — nadie vuelve a abrir este
  modal para un ejercicio ajeno).
- El cálculo `readOnly` y el `<fieldset disabled={readOnly}>` — el
  `<fieldset>` puede quedarse sin el prop `disabled`, o eliminarse si ya no
  aporta nada.
- El banner "Compartido por..." — ya no aplica, este modal nunca muestra un
  ejercicio ajeno.

Se añade un campo **Imágenes**, después de "Enlace" y antes del checkbox
"Compartir":

- Botón "Añadir imagen" (input de archivo, `accept="image/*"`, `multiple`)
  que sube cada archivo elegido con `subirArchivo(\`ejercicios/${equipoId}\`, file)`
  y añade la ruta devuelta al array `imagenes` del estado del formulario.
- Cada imagen ya subida se muestra como una miniatura real (no un nombre de
  archivo) en una cuadrícula, con una "×" para quitarla — nuevo componente
  `MiniaturaImagen` (obtiene su URL firmada con `urlFirmada(ruta)` al
  montarse y la usa como `src` de un `<img>`).
- Igual que ya hace `fichaUrl` en `JugadorFormModal.tsx`: si se cancela sin
  guardar, las imágenes subidas en esa sesión de edición (que no coincidan
  con las que ya tenía el ejercicio al abrir el modal) se borran de
  Storage para no dejar huérfanos; si se guarda, las que quedaron fuera del
  array final (borradas por el usuario) se eliminan de Storage tras
  confirmar el guardado.
- El payload de `handleSubmit` incluye `imagenes: form.imagenes`.

## Página nueva: `EjercicioDetailPage.tsx`

Ruta: `ejercicios/:ejercicioId`, anidada en el layout de equipo (junto a la
ya existente `ejercicios`), en `src/App.tsx`.

Estructura (mobile-first, mismo lenguaje visual que
`JugadorDetailPage.tsx`/`RivalDetailPage.tsx`):

- `PageHeader` con `onBack` → biblioteca de ejercicios, `eyebrow` =
  categoría del ejercicio (o "Ejercicio" si no tiene), `title` = nombre.
  - `action`: si el ejercicio es del equipo actual, un botón "Editar"
    (lápiz) que abre `EjercicioFormModal` en modo edición — igual patrón
    que el resto de fichas de la app. Si es de otro equipo, no hay acción;
    en su lugar, justo debajo de la cabecera, una banda de atribución
    normal y legible (mismo texto de siempre: "Compartido por {nombre} ·
    {equipo}"), con la estética habitual de una tarjeta informativa — nunca
    con aspecto de campo de formulario deshabilitado.
- Cuadrícula de imágenes (si `imagenes.length > 0`): 3 columnas, cada
  miniatura con su URL firmada, `object-cover`, esquinas redondeadas
  (`rounded-[14px]`, coherente con el resto de tarjetas). Tocar una abre un
  visor a pantalla completa (`fixed inset-0`, z-index por encima de
  cualquier otro overlay de la app) con la imagen ampliada, botón de cerrar,
  y flechas anterior/siguiente si hay más de una — todo dentro de la misma
  pantalla, sin navegar ni abrir pestaña nueva.
- Tarjetas de información, cada una en su propia `card-surface` con
  cabecera en mayúsculas pequeñas (mismo patrón que "Objetivo de la
  semana" en `SesionDetailPage.tsx`):
  - Datos rápidos: categoría, dificultad, jugadores mín./máx., duración —
    como chips o una cuadrícula pequeña de estadísticas.
  - Contenido/etiquetas: chips, igual que ya se ven en las tarjetas de
    `EjerciciosPage.tsx`.
  - Espacio y material, si tienen contenido.
  - Enlace, si tiene: un botón "Abrir enlace" (icono `ExternalLink`),
    prominente, no un campo de formulario.
  - Descripción, si tiene contenido: texto normal (`whitespace-pre-line`),
    no un `<textarea>`.
  - Notas adicionales, si tiene contenido: mismo tratamiento que
    Descripción.
  Ninguna de estas usa `<Textarea>`/`<Input>` ni ningún estilo de
  formulario deshabilitado — son bloques de texto normales, exactamente
  igual de legibles sea el ejercicio propio o ajeno.
- Sin botón "Borrar" en esta página — borrar sigue siendo una acción del
  formulario de edición (solo alcanzable para tu propio ejercicio, vía
  "Editar"), como ya es hoy.

## Dos sitios pasan a navegar en vez de abrir el modal

- **`EjerciciosPage.tsx`**: el `onClick` de cada tarjeta de ejercicio deja
  de llamar a `abrirEdicion(e)` y pasa a `navigate(\`/equipos/${equipoId}/ejercicios/${e.id}\`)`
  — para ejercicios propios y ajenos por igual. El botón "Nuevo" sigue
  abriendo `EjercicioFormModal` directo en modo alta, sin cambios. El
  toggle de favorito en la tarjeta (con `stopPropagation`) no cambia.
- **`SesionDetailPage.tsx`**: el `onClick` de un bloque con ejercicio
  enlazado y accesible deja de hacer `setEjercicioAbierto(ejercicio)` y
  pasa a `navigate(\`/equipos/${equipoId}/ejercicios/${ejercicio.id}\`)`.
  Se elimina el estado `ejercicioAbierto` y el `<EjercicioFormModal ejercicio={ejercicioAbierto} permitirBorrar={false} .../>`
  que renderizaba — ya no hace falta, `permitirBorrar` deja de existir en
  el componente (ver arriba). Los bloques `sinAcceso` (enlazados a un
  ejercicio ya no accesible) siguen sin ser clicables, sin cambios.

## Fuera de alcance

Ampliar la búsqueda de la biblioteca a `notas_adicionales`/`descripcion`
(mencionado como posible mejora en la revisión final de la simplificación
de la ficha) no forma parte de este cambio.
