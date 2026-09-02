# Sección de Rivales — spec de diseño

**Contexto:** nueva sección `Rivales` (lista + ficha por rival), capa de lectura filtrada sobre datos ya existentes en `eventos`/`partidos` — no se recoge ningún dato nuevo de rival, se reutilizan `AnilloDonut`/`MapaCalorPorteria`/`BloqueTiro` ya construidos en la fase "ficha técnica de partido — gráficos", y el patrón de selector de ámbito (`useSearchParams`, `?partido=`) ya construido y revisado en la fase "ficha técnica de jugador — temporada". Esta rama parte del HEAD de esa fase (`worktree-ficha-tecnica-jugador`, commit `d9a4cda`), no de `master` — ambas dependencias ya existen aquí.

## Modelo de datos

Nueva tabla `rivales`:

```sql
create table rivales (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null,
  notas text,
  created_at timestamptz not null default now()
);
create index idx_rivales_equipo on rivales (equipo_id);
```

RLS: mismo patrón `private.equipo_del_entrenador(equipo_id)` ya usado en el resto de tablas con `equipo_id` (ver `0017_eventos.sql:81-84` como plantilla más reciente) — **no** el `equipo_del_entrenador` sin prefijo de esquema, que ya no existe (se endureció en `0010_harden_equipo_del_entrenador.sql`, ahora vive en `private.` y solo lo puede invocar Postgres vía RLS, no PostgREST).

`partidos` gana `rival_id uuid references rivales (id)`. Se mantiene la columna `rival text not null` existente sin tocar su tipo — pasa a ser el nombre denormalizado del rival enlazado (se sigue escribiendo en cada guardado, igual que hoy), para que **ningún lugar que ya lee `partido.rival` (Calendario, Inicio, `DayAgenda`, `PartidoDetailPage`, el `<option>` del selector de la Ficha de jugador...) necesite cambiar** — la migración es aditiva, no un reemplazo de columna.

**Backfill de partidos existentes** (patrón nuevo en este repo, no hay uno igual que copiar — el más cercano es el backfill jsonb→filas de `0017_eventos.sql`, pero aquí es texto-distinto→filas):

```sql
insert into rivales (equipo_id, nombre)
select distinct equipo_id, rival from partidos
on conflict do nothing;

update partidos p
set rival_id = r.id
from rivales r
where r.equipo_id = p.equipo_id and r.nombre = p.rival;
```

Nota importante: esto crea una fila de `rivales` distinta por cada combinación `(equipo_id, nombre)` — **cada equipo tiene su propia lista de rivales, aislada**, tal como pide el encargo, aunque dos equipos del club jueguen contra el mismo club rival (dos filas de `rivales` con el mismo `nombre` pero `equipo_id` distinto, sin relación entre sí). No hay `unique(equipo_id, nombre)` a nivel de esquema — el "no crear un duplicado" se resuelve en la UI (desplegable de rivales existentes), no con una constraint, porque forzarla complicaría el propio backfill si hubiera variantes de mayúsculas/espacios en el texto libre histórico.

**Ruling — la columna `microciclos.rival` (texto libre, planificación semanal, no relacionada con `partidos.rival`) no se toca.** Es un campo de planificación de temporada, gestionado hoy vía `scripts/seed-planificacion.ts` desde el Excel real, fuera del alcance de "capa de lectura sobre partidos jugados" que pide este encargo — enlazarlo a `rivales` no se pidió y añadiría una migración de datos no solicitada sobre una tabla que las reglas del proyecto ya tratan como "sin CRUD en la app".

`src/types/database.ts` gana `RivalesRow` y `PartidosRow.rival_id: UUID | null` — se actualiza a mano en el mismo commit que la migración (no hay generador de tipos conectado).

## Alta de partido — selector de rival

`PartidoModal.tsx` reemplaza el `Input` de texto libre de "Rival" por un selector de dos modos (mismo patrón visual `.tab-pill-group`/`.tab-pill` ya usado en Calendario/Partido/Ajustes, sin introducir un componente nuevo):

- **"Rival existente"**: `<Select>` con los rivales ya registrados de ese equipo (`cargarRivalesEquipo(equipoId)`, nuevo helper en `src/lib/rivales.ts` — sin filtro de competición: **incluye amistosos y pretemporada**, tal como pide el encargo, porque no hay ningún filtro de `competicion` en la consulta).
- **"Rival nuevo"**: `<Input>` de texto libre — al guardar, inserta en `rivales` y usa el id resultante.

**Modo por defecto**: al editar un partido ya enlazado (`partido.rival_id` no nulo), "Rival existente" preseleccionado a ese rival. Al crear uno nuevo, "Rival existente" si el equipo ya tiene algún rival registrado (fomenta reutilizar en vez de duplicar), si no "Rival nuevo".

**Ruling — crear un rival nuevo requiere conexión.** La cola offline (`src/lib/offline/queue.ts`) tiene un tipo cerrado `TablaOffline = "sesiones" | "partidos" | "eventos"` — añadir `"rivales"` sería una ampliación de la infraestructura offline no pedida por el encargo (que es explícitamente "capa de lectura", no una fase de trabajo offline). Elegir un rival **ya existente** sí funciona sin red (la lista ya está en memoria desde que se abrió el modal, y solo viaja como parte del payload de `partidos`, que ya está en la cola). Si el usuario intenta crear un rival nuevo sin conexión, se avisa y se le pide elegir uno existente o esperar a tener red — igual de honesto que cualquier otro aviso de error de guardado ya presente en el modal.

**Ruling — no hay pantalla de "renombrar/fusionar rival" en esta fase.** El encargo no la pide (su orden de trabajo es: modelo de datos → selector de alta → ficha de rival) y el proyecto ya trata la gestión "de una vez por temporada" de entidades similares (equipos, periodos, mesociclos, microciclos) como fuera del CRUD de la app. Si en el futuro hace falta, es una fase aparte.

## Ficha de Rival

Nueva página `RivalDetailPage.tsx` en `/equipos/:equipoId/rivales/:rivalId`, más una página de listado `RivalesPage.tsx` en `/equipos/:equipoId/rivales` (necesaria para llegar a la ficha — el encargo habla de una "sección", no solo de la ficha individual) y una entrada de navegación nueva en `navConfig.ts`.

- **Selector arriba**, mismo mecanismo que `JugadorDetailPage.tsx` (`useSearchParams`, `?partido=<id>` o ausente): "Todos los partidos" (agregado, por defecto) o un partido concreto de los jugados contra ese rival.
- **"Todos los partidos" (agregado)**:
  - Resumen de historial: partidos jugados, victorias/derrotas/empates y goles a favor/en contra acumulados — reutiliza tal cual `resultadoPartido(p, eventos)` y `marcadorNumerico(p, eventos)` de `src/lib/partidoStats.ts` (ya gestionan la prioridad "eventos en vivo > campo de texto `resultado`" y ya devuelven `null` cuando no hay ninguno de los dos) acumulados partido a partido — no se reimplementa ese criterio.
  - `AnilloDonut` de nuestra eficacia de tiro contra este rival — juego abierto/7m en dos anillos separados, igual patrón que `FichaTecnica.tsx`/`JugadorDetailPage.tsx` (nunca mezclados).
  - Dos `BloqueTiro` (que ya envuelven `MapaCalorPorteria` + el mismo texto de contexto "el X% han sido Y (A de B)"): uno con "dónde tiramos nosotros contra este rival" (`equipo_origen === "propio"`), otro con "dónde tira el rival contra nosotros" (`equipo_origen === "rival"` — literalmente los eventos ya capturados vía "dónde para nuestro portero"/"dónde nos meten gol", filtrados a los partidos contra este rival).
  - Lista de los partidos jugados contra este rival (fecha, resultado), cada fila enlaza a `/equipos/:equipoId/partido/:partidoId?vista=ficha` — misma integración bidireccional que ya tiene la Ficha de jugador (que ya añadió soporte de `?vista=` a `PartidoDetailPage.tsx` en la fase anterior).
  - **Sin línea de evolución.** El encargo no la pide para Rivales (a diferencia de la Ficha de jugador) — no se añade sin que se haya pedido.
- **Partido concreto seleccionado**: en vez de reconstruir un desglose nuevo, se embebe directamente `FichaTecnica.tsx` (el componente ya existente y revisado) para ese partido — mismo mecanismo que la Ficha de jugador (selector con un valor por defecto agregado y un componente ya construido para el caso "un partido concreto"), sin inventar una vista nueva. Requiere cargar `jugadores` del equipo además de `eventos`/`partidos` (mismo patrón de carga que `PartidoDetailPage.tsx`/`JugadorDetailPage.tsx`).

Toda la agregación (`distribucionPorZona`, `desgloseResultados`, `eficaciaConDetalle`, `porcentajeParadas`, `perdidas`, `robos`) ya opera sobre cualquier `EventosRow[]` sin conocer de qué partido vienen — la única pieza nueva de lógica es resolver el conjunto de `partido_id` de los partidos contra este rival y filtrar `eventos` a ese conjunto antes de pasarlo a las mismas funciones. Ninguna de ellas se modifica.

## Constraints globales (heredadas)

- 7 metros y juego abierto nunca se mezclan en el mismo porcentaje/anillo.
- Todo porcentaje/recuento se muestra siempre honesto (recuento real junto al %, `null` en vez de `0%` sin datos).
- Sin librerías de gráficos — solo los componentes ya construidos (`AnilloDonut`, `MapaCalorPorteria`, `BloqueTiro`).
- Tema claro estándar (`card-surface`, `hero-band`) — `MapaCalorPorteria` sigue siendo el único widget oscuro autocontenido.
- Cada tabla con datos de negocio propios de un equipo lleva `equipo_id` y su RLS — `rivales` no es una excepción.
- Todo en español.
