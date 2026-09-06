# Planifica la Temporada — diseño

## Contexto y problema

Hoy la planificación de temporada (`periodos` → `mesociclos` → `microciclos`) solo se puede dar de alta completa desde un Excel importado por script, o mediante el asistente `AsistenteConfiguracionTemporada.tsx` (dentro de Ajustes → `PlanificacionAjustes.tsx`), que crea la estructura una vez pero después solo permite editar el campo `objetivo` de cada mesociclo/microciclo — nunca el nombre, ni las fechas, ni reordenar. Los entrenadores que no parten de un Excel real quedan a medias: pueden arrancar la temporada, pero no pueden corregirla después sin editar la base de datos a mano.

`CLAUDE.md` afirma actualmente que "periodos, mesociclos y microciclos no tienen CRUD en la app" — eso ya no es cierto (existe alta y edición parcial) y se corrige como parte de este trabajo.

## Objetivo

Una sección nueva e independiente, **"Planifica la temporada"**, accesible desde el menú "Más" del equipo (mismo grupo que Rivales, Modelo de juego, Ejercicios), donde cualquier entrenador sin Excel puede crear y editar por completo su planificación: bloques con nombre y fechas propias, y las semanas dentro de cada bloque.

Fuera de alcance: el nivel `periodos` (fases tipo "Pretemporada/Liga/Playoff"). Los equipos que ya lo usan vía Excel/SQL directo siguen intactos y sin cambios — esta sección nunca toca filas con `periodo_id` no nulo.

## Modelo de datos

Reutiliza las tablas existentes `mesociclos` y `microciclos`, sin tocar `periodos` ni las tablas que ya dependen de ellas (`sesiones.microciclo_id`, `partidos.microciclo_id` — ambas `on delete set null`, así que borrar un bloque nunca borra una sesión o partido real, solo le quita el objetivo semanal asociado).

**Migración nueva** (`supabase/migrations/00XX_planificacion_bloques.sql`):

```sql
alter table mesociclos
  add column fecha_inicio date,
  add column fecha_fin date,
  add column orden integer;
```

Todas nullable — no rompe ninguna fila existente. Un "bloque" de esta sección es, a nivel de fila, un `mesociclos` con `periodo_id is null` y `fecha_inicio`/`fecha_fin` rellenos. Un mesociclo creado por el flujo antiguo (con `periodo_id`) nunca tiene estas columnas rellenas y no aparece en esta pantalla.

`orden` sustituye a la heurística actual de `PlanificacionAjustes.tsx` (parsear "Mesociclo N" del nombre con una regex) — aquí el nombre es libre y editable, así que necesita un campo real para ordenar.

`microciclos.semana` para las semanas de un bloque de esta sección se numera 1..N **dentro de ese bloque** (no como contador global entre bloques, que es como lo hace hoy el asistente entre fases — aquí no hay "fase" que las agrupe).

## Comportamiento

### Crear un bloque
Formulario: nombre, fecha inicio, fecha fin, objetivo (opcional). Al guardar:
1. Insertar fila en `mesociclos` (`periodo_id: null`, `orden`: máximo actual + 1).
2. Calcular las semanas lunes-domingo que cubren el rango (misma función `semanasDeRango` que ya existe en `AsistenteConfiguracionTemporada.tsx` — se mueve a `src/lib/microciclos.ts` para reutilizarla desde los dos sitios).
3. Insertar un `microciclos` por semana (`semana`: 1..N, `fecha_inicio`/`fecha_fin` de esa semana, `objetivo: null`, `contenidos: {}`).

### Editar nombre u objetivo de un bloque
Update directo, sin efectos secundarios.

### Editar las fechas de un bloque
Recalcular `semanasDeRango` con el nuevo rango y conciliar contra las semanas (`microciclos`) que ya existen:
- Semana cuyo `fecha_inicio` coincide con una del nuevo cálculo → se conserva tal cual (no se toca su `objetivo`/`rival`/`competicion`/`contenidos`).
- Semana nueva (el rango creció) → se inserta vacía.
- Semana que deja de estar en el rango (el rango se acortó) → si no tiene ningún dato relevante (`objetivo`, `rival`, `competicion` y `contenidos` todos vacíos), se borra sin más. Si tiene algo relevante, no se borra automáticamente: se muestra un aviso de confirmación listando esas semanas y lo que contienen, y solo se borran si el usuario confirma explícitamente. Esto es la única salvaguarda de la pantalla — en línea con no descartar nunca datos del usuario en silencio.

### Reordenar bloques
Botones subir/bajar (sin librería de arrastre nueva) que intercambian el campo `orden` entre el bloque y su vecino.

### Borrar un bloque
Confirmación con aviso de que sus semanas se borran en cascada (ya es `on delete cascade` a nivel de FK) y de que cualquier sesión/partido que las tuviera asociadas conserva sus datos pero pierde el objetivo semanal mostrado.

### Semanas dentro de un bloque
Lista editable igual que hoy en `PlanificacionAjustes.tsx`: objetivo, rival, competición por semana. Las fechas de cada semana no se editan sueltas — se derivan siempre del rango del bloque (evita que una semana quede huérfana o solapada).

## UI

- **Página nueva**: `src/pages/PlanificacionPage.tsx`, ruta `planificacion` (`/equipos/:equipoId/planificacion`), registrada en `src/App.tsx` junto al resto de rutas de equipo.
- **Nav**: entrada nueva en `src/lib/navConfig.ts` — `{ key: "planificacion", label: "Planifica la temporada", path: "planificacion", icon: CalendarRange, enBarraInferior: false }` (aparece bajo "Más", junto a Rivales/Modelo de juego/Ejercicios/Progreso).
- **Componente**: `src/components/planificacion/BloqueCard.tsx` — tarjeta expandible por bloque (nombre, rango de fechas, objetivo, lista de semanas), siguiendo el mismo patrón visual que `PlanificacionAjustes.tsx` (card-surface, acordeón).
- `PlanificacionAjustes.tsx` (Ajustes) se simplifica: para un equipo sin `periodos`, en vez de lanzar `AsistenteConfiguracionTemporada` ahí mismo, muestra un aviso corto con enlace a "Planifica la temporada". Para equipos que ya tienen `periodos` (Excel), sigue exactamente igual que hoy — sin cambios.
- `ModeloJuegoPage.tsx` no se toca — sigue leyendo `mesociclos`/`microciclos` para su vista de progreso de solo lectura, y ahora también mostrará ahí el progreso de los bloques creados desde la sección nueva (mismo dato, doble consumidor de lectura).

## Documentación

Actualizar en `CLAUDE.md` la frase sobre "periodos, mesociclos y microciclos no tienen CRUD en la app": pasa a reflejar que existe alta y edición completa para mesociclos/microciclos sin periodo asociado vía "Planifica la temporada", y que `periodos` (y los mesociclos/microciclos que cuelgan de un periodo) se mantienen como excepción manual (Excel/SQL), sin CRUD en la app.

## Verificación

Sin test runner en el proyecto (igual que el resto de fases): `tsc -b --noEmit`, `eslint`, `npm run build`, revisión de `ui-estetica`, y prueba manual del propio usuario: crear un bloque, editarle fechas para que gane y pierda semanas con datos, reordenar, borrar, y confirmar que una sesión de Calendario ya existente sigue funcionando cuando su microciclo se recorta fuera de rango (pierde objetivo, no se rompe).
