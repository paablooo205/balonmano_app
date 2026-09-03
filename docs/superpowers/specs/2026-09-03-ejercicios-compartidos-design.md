# Ejercicios compartidos entre equipos

Fecha: 2026-09-03

## Motivación

Todo en esta app está aislado por `equipo_id` sin excepciones — es la
invariante central del proyecto (multi-equipo desde el origen). Esta
funcionalidad abre la **única** rendija deliberada a esa regla: los
ejercicios que un entrenador marca como compartidos deben poder verse
(nunca editarse) desde la biblioteca de cualquier otro equipo del club,
con atribución de quién los creó.

## Hallazgos previos al diseño

Investigación contra el código real antes de diseñar, porque cambian el
diseño literal que se pidió:

- **No existe `creado_por` en `ejercicios`** — confirmado, hay que añadirlo.
- **`favorito` es hoy una columna booleana en la propia fila del ejercicio**
  (`0001_init_schema.sql`), compartida por todo el equipo, no por usuario —
  exactamente el problema ya anticipado, resuelto con la tabla
  `ejercicio_favoritos` aparte.
- **Ni `entrenadores` ni `equipos` tienen ningún mecanismo de lectura entre
  equipos** — sus políticas RLS (`entrenadores_select_own`,
  `equipos_select_own`, `0008_entrenadores_rls.sql`) son estrictamente de
  un único equipo, igual que todo lo demás. Con el diseño literal
  (`creado_por uuid` → FK a `entrenadores`), mostrar "by {nombre}" para un
  visor de otro equipo habría exigido una **segunda** excepción de RLS,
  esta vez sobre `entrenadores` — decisión explícitamente descartada (ver
  "Modelo de datos" más abajo: se copia el nombre como texto en su lugar).
- **`BloqueSesion.ejercicio_id` es una ruta de escritura muerta hoy**: es
  un campo dentro del jsonb `sesiones.bloques`, sin ninguna FK real, y
  ninguna pantalla actual (`SesionModal.tsx`) permite enlazar un bloque a
  un ejercicio de la biblioteca — solo `tiempo_min`, `descripcion_libre`,
  `objetivo`, `consignas`. `SesionDetailPage.tsx:152` sí lo *lee*
  defensivamente si estuviera presente. El requisito de "Ejercicio ya no
  disponible" se implementa igualmente (barato, cambio de una línea), pero
  hoy no es alcanzable desde ninguna UI existente — no construir un
  selector de ejercicio para bloques de sesión, sería adelantar una fase
  no pedida.

## Alcance

Dentro:
- Migración: 4 columnas nuevas en `ejercicios`, tabla `ejercicio_favoritos`,
  backfill de favoritos existentes, borrado de la columna `favorito` vieja,
  reescritura de la política RLS de `ejercicios` en 4 políticas separadas
  (select/insert/update/delete).
- Toggle "Compartir con los demás equipos del club" en el formulario.
- Biblioteca de ejercicios: propios + compartidos mezclados, atribución
  visible, modal de solo lectura para ejercicios ajenos.
- Favoritos reescritos sobre `ejercicio_favoritos`, por equipo que mira,
  no por equipo dueño.
- Distinción "ejercicio no encontrado por falta de enlace" vs "ejercicio
  no encontrado porque ya no es accesible" en `SesionDetailPage.tsx`.

Fuera:
- Ningún selector de ejercicio para bloques de sesión (no existe hoy, no
  se pide explícitamente, sería adelantar fase).
- Ninguna excepción de RLS en `entrenadores` ni `equipos` — se evita por
  completo con la copia de texto plano (ver más abajo).
- Ninguna notificación cuando alguien más comparte o deja de compartir.

## Modelo de datos

```sql
-- Nuevas columnas en ejercicios. `creado_por` se mantiene como referencia
-- real (uso futuro), pero la atribución que se MUESTRA nunca sale de un
-- join en vivo contra `entrenadores`/`equipos` — se copia como texto en
-- el momento de compartir, precisamente para no necesitar ninguna
-- excepción de RLS en esas dos tablas (ninguna de las dos tiene hoy
-- lectura entre equipos, y no se les añade aquí).
alter table ejercicios add column compartido boolean not null default false;
alter table ejercicios add column creado_por uuid references entrenadores (id);
alter table ejercicios add column creado_por_nombre text;
alter table ejercicios add column equipo_origen_nombre text;

-- Favoritos, por equipo que mira — no por equipo dueño del ejercicio (un
-- equipo que solo VE un ejercicio compartido debe poder marcarlo favorito
-- sin tocar la fila de otro equipo).
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
```

## RLS de `ejercicios` — el punto crítico de seguridad de todo el diseño

La política actual es una única `for all` (`0008_entrenadores_rls.sql`)
que aplica el mismo `using`/`with check` a select/insert/update/delete.
Para que SELECT sea más permisivo que las escrituras, **hace falta
partirla en 4 políticas independientes** — no se puede ampliar solo el
`using` de una política `for all`, porque eso ampliaría también
insert/update/delete:

```sql
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

`ejercicios_insert`/`_update`/`_delete` son **idénticas** a la política
de escritura de hoy — ningún equipo gana ninguna capacidad de escritura
sobre una fila que no es la suya, esté compartida o no. Esto es
exactamente lo que la revisión de seguridad de la Fase de verificación
debe confirmar explícitamente (ver Plan): que un `update`/`delete` desde
un equipo no propietario contra un ejercicio ajeno compartido es
rechazado por RLS, no solo oculto por la UI.

## UI

### Formulario (`EjercicioFormModal.tsx`)

- Se quita el checkbox "Marcar como favorito" y el campo `favorito` de
  `FormState`/payload por completo — favoritar deja de ser parte de
  "editar el ejercicio", pasa a ser una acción independiente por equipo
  (ver "Biblioteca" más abajo). El único punto de favoritar sigue siendo
  la estrella de la tarjeta, igual que hoy.
- Nuevo checkbox "Compartir con los demás equipos del club", ligado a
  `compartido`, mismo estilo que el checkbox que sustituye.
- **Regla de atribución**: al guardar, si el ejercicio que se está
  guardando NO tiene ya `creado_por_nombre` (null — es un ejercicio nuevo,
  o uno ya existente de antes de esta función, nunca atribuido), se
  rellenan `creado_por`/`creado_por_nombre`/`equipo_origen_nombre` desde
  la sesión activa (entrenador y equipo actuales) en ESE guardado — se
  incluyan o no en el payload en guardados posteriores. Si ya tiene
  `creado_por_nombre`, nunca se vuelve a tocar, aunque lo edite otro
  entrenador del mismo equipo más tarde. Esto resuelve tanto los
  ejercicios nuevos (atribuidos al crearlos) como los ya existentes hoy
  sin ningún autor conocido (se atribuyen la primera vez que alguien los
  guarda, típicamente al activar "Compartir").
- **Modo de solo lectura**: si `ejercicio !== null && ejercicio.equipo_id !== equipoId` (viendo un ejercicio ajeno compartido), el modal:
  - Muestra una línea de atribución arriba: "Compartido por {creado_por_nombre} · {equipo_origen_nombre}".
  - Envuelve TODOS los campos del formulario en un único `<fieldset disabled>` (deshabilita nativamente cada `Input`/`Select`/`Textarea` interior sin tocar los ~20 campos uno a uno; usar `className="contents"` en el `fieldset` para que no rompa los `grid`/`flex` ya existentes) — se ve todo, incluido si está compartido, nada es editable.
  - El pie del modal muestra solo un botón "Cerrar" — nada de "Guardar" ni "Borrar".
- Necesita el nombre y el id del entrenador activo (hoy `useEntrenador()` solo devuelve `nombre` — se amplía para devolver también `id`) y el nombre del equipo activo (ya disponible vía `useEquipo()` → `equipo.nombre`, que el modal puede llamar directamente en vez de recibirlo como prop nueva).

### Biblioteca (`EjerciciosPage.tsx`)

- Query: de `.eq("equipo_id", equipoId)` a
  `.or(\`equipo_id.eq.${equipoId},compartido.eq.true\`)` — trae propios y
  compartidos (de cualquier equipo) en una sola consulta, mezclados en la
  misma lista/filtros de siempre (texto, categoría, dificultad) sin
  ninguna lógica nueva de filtrado.
- Carga en paralelo `ejercicio_favoritos` filtrado por el equipo que mira
  (`equipoId`, el que está viendo la biblioteca, no el dueño del
  ejercicio) para saber qué está marcado como favorito desde este equipo.
- Tarjeta de un ejercicio ajeno (`e.equipo_id !== equipoId`): añade una
  etiqueta "by {e.creado_por_nombre}" (y el nombre del equipo de origen,
  `e.equipo_origen_nombre`, si visualmente ayuda a no confundirlo con
  contenido propio — mismo estilo de chip ya usado para los tags de
  `contenido`).
- La estrella de favorito pasa de `update ejercicios set favorito=...` a
  leer/escribir `ejercicio_favoritos` (insertar/borrar la fila
  `(equipoId, ejercicio.id)`) — funciona igual de bien sobre un ejercicio
  propio que sobre uno ajeno compartido, porque nunca toca la fila de
  `ejercicios` en sí.

## Bloque de sesión (`SesionDetailPage.tsx`)

```ts
const ejercicio = b.ejercicio_id ? ejercicios.find((e) => e.id === b.ejercicio_id) : null;
const sinAcceso = Boolean(b.ejercicio_id) && !ejercicio;
const nombre = ejercicio?.nombre || (sinAcceso ? "Ejercicio ya no disponible" : b.descripcion_libre || "Bloque sin descripción");
```

Distingue "el bloque nunca tuvo un ejercicio enlazado" (cae a
`descripcion_libre`, comportamiento actual sin cambios) de "tenía uno
enlazado pero ya no es accesible" (mensaje explícito) — sin romper la
carga de la sesión en ningún caso, tal y como se pidió. Como se explicó
arriba, hoy esta segunda rama es inalcanzable desde la UI (nada escribe
`ejercicio_id`), pero el cambio es de una línea y dejarlo ya escrito
evita tener que volver a este archivo cuando se construya el selector de
ejercicio para bloques, en una fase futura.

## Testing

Sin Vitest — mismo criterio que el resto de fases de UI+RLS de este
proyecto: verificación con `tsc`+`lint`+`build`, revisión de seguridad
explícita sobre las políticas RLS (ver Plan, tarea de verificación final:
un `update`/`delete` real contra un ejercicio ajeno compartido debe
fallar por RLS, probado contra la base real, no solo argumentado), más
prueba manual del usuario compartiendo un ejercicio entre dos equipos
reales antes de fusionar.

## Casos límite

- **Ejercicio compartido por un equipo que luego dejó de compartirlo,
  usado en una sesión de otro equipo**: cubierto por el cambio de
  `SesionDetailPage.tsx` de arriba — aunque hoy sea inalcanzable en la
  práctica (nada permite enlazarlo todavía).
- **Ejercicios ya existentes sin autor conocido**: `creado_por_nombre`
  queda `null` hasta que alguien (del equipo dueño) los vuelva a guardar
  — no se inventa un autor retroactivo. Si nunca se compraten, nunca hace
  falta mostrarlo.
- **Un mismo ejercicio compartido, favorito para varios equipos a la
  vez**: cada equipo tiene su propia fila en `ejercicio_favoritos`,
  totalmente independiente — favoritar desde un equipo no afecta a lo que
  ven los demás.
- **Borrado de un ejercicio compartido**: `ejercicio_favoritos` tiene
  `on delete cascade` sobre `ejercicio_id`, así que borrar el ejercicio
  original limpia automáticamente los favoritos de todos los equipos que
  lo habían marcado — no quedan filas huérfanas.
