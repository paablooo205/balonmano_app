# Convocatoria de partido

Fecha: 2026-09-03

## Motivación

Hasta ahora, cualquier jugador de la plantilla aparece como seleccionable en
el panel de estadísticas en vivo de cualquier partido, y las estadísticas de
un jugador (partidos jugados, eficacia acumulada, zonas de tiro, tendencia)
se calculan a partir de "en qué partidos tiene al menos un evento registrado"
— no de si realmente estaba convocado a ese partido. Esto no distingue a un
suplente convocado que no llegó a tocar el balón (no cuenta como partido
jugado, debería) de alguien que ni siquiera fue convocado (no debería contar
nunca, y hoy tampoco cuenta, pero por la razón equivocada — porque no tiene
eventos, no porque se haya decidido que no juega).

El objetivo es introducir la convocatoria como el filtro real: qué jugadores
están disponibles para un partido concreto, decidido antes (o editable
después) por el entrenador, y que ese dato — no la presencia de eventos —
sea lo que determine tanto quién aparece en el panel en vivo como qué
partidos cuentan en la ficha técnica de cada jugador.

## Hallazgos previos al diseño (contexto necesario)

- **La tabla `asistencia` ya se usa para partidos**, aunque no para este
  propósito: `AsistenciaChecklist` (`src/components/equipo/AsistenciaChecklist.tsx`)
  ya acepta `partidoId` y ya se usa así desde `DayAgenda.tsx:208` (el día del
  calendario), con la semántica de "pasar lista" — Presente/Ausente +
  motivo (Justificado/Injustificado/Lesión). Se reutiliza tal cual, sin
  quitar los botones de motivo para partidos (decisión explícita del
  usuario) — la convocatoria **es** esa misma asistencia, con la misma
  pantalla, solo que ahora también accesible desde la ficha de partido.
- **Verificado contra la base real**: 8 partidos, 0 filas de `asistencia`
  con `partido_id` (nunca se ha usado en producción todavía), y 2 partidos
  ya tienen eventos de jugador registrados sin ninguna convocatoria. No se
  hace backfill automático — se resuelve con el aviso de "convocatoria
  pendiente" (ver más abajo), igual para estos 2 partidos ya jugados que
  para cualquier partido futuro.
- **Tres pantallas ya mezclan asistencia a entrenamiento y a partido en un
  mismo cálculo**, y las tres hay que separarlas para que la convocatoria no
  las distorsione:
  - `ProgresoPage.tsx` — "Asistencia por mes" / `mediaAsistencia`.
  - `ProgresoPage.tsx` — "Enfermería" (busca el registro de asistencia más
    reciente de cada jugador, sesión o partido, y lo marca lesionado si
    `presente === false && motivo_ausencia === "lesion"`).
  - `InicioPage.tsx` — KPI "Asistencia media" (líneas 82-83) y la lista de
    `alertas` de lesión (líneas 90-100), mismo patrón que "Enfermería".

## Alcance

Dentro:
- Migración: `unique (jugador_id, partido_id)` y `unique (jugador_id, sesion_id)`
  en `asistencia`.
- Nueva vista `"convocatoria"` en `PartidoDetailPage.tsx`, reutilizando
  `AsistenciaChecklist` sin modificarlo.
- Filtrado del panel en vivo (`ContadoresEnVivo`) a solo convocados, con
  aviso bloqueante si no hay ninguna fila de asistencia para ese partido.
- Redefinición de "partidos jugados"/agregados de temporada en
  `JugadorDetailPage.tsx` en base a convocatoria + partido resuelto, en vez
  de "tiene algún evento".
- Banner de "convocatoria pendiente" en `InicioPage.tsx`, sin notificación
  push (decisión explícita: no añade un 4º caso a la lista cerrada de
  notificaciones de CLAUDE.md).
- Separar entrenamiento/partido en los tres cálculos de asistencia
  mezclados (`ProgresoPage.tsx` ×2, `InicioPage.tsx` ×2).

Fuera:
- No se toca `AsistenciaChecklist.tsx` ni el punto de entrada ya existente
  en `DayAgenda.tsx` — siguen funcionando igual, sobre el mismo dato.
- No hay backfill automático de convocatoria para los 2 partidos ya
  jugados sin ella — se resuelve manualmente, con el aviso como recordatorio.
- No hay notificación push nueva.
- No se introduce ningún concepto de "convocado pero no vino" distinto de
  "no convocado" — ambos son la misma fila (`presente = false`, con o sin
  motivo), decisión explícita del usuario en el punto 2 del brainstorming.

## Modelo de datos

Migración `00XX_convocatoria_unica.sql` (sin tabla ni columna nueva):

```sql
alter table asistencia add constraint asistencia_jugador_partido_unico unique (jugador_id, partido_id);
alter table asistencia add constraint asistencia_jugador_sesion_unico unique (jugador_id, sesion_id);
```

Postgres no aplica la restricción `unique` a pares donde alguna columna es
`NULL` (comportamiento estándar: cada `NULL` se considera distinto), así
que una fila de entrenamiento (`partido_id` `NULL`) nunca choca con la
restricción de partido, y viceversa — ambas restricciones conviven sin
necesitar una cláusula `where`.

**"Convocado" se define como**: existe una fila en `asistencia` con ese
`partido_id` y ese `jugador_id`, con `presente = true`. Ninguna fila para
ese partido (ni una) significa "convocatoria no hecha todavía", distinto de
"convocatoria hecha pero excluye a este jugador" (fila con `presente = false`).

## Pantalla de convocatoria

`PartidoDetailPage.tsx` gana una 4ª vista, junto a `"info"`/`"live"`/`"ficha"`:

```ts
type Vista = "info" | "live" | "ficha" | "convocatoria";
```

El banner de Inicio (ver más abajo) enlaza directo con `?vista=convocatoria`,
así que la comprobación de `vistaParam` al inicializar el estado debe
aceptar el nuevo valor, no solo `"ficha"`/`"live"` como hoy:

```ts
const [vista, setVista] = useState<Vista>(
  vistaParam === "ficha" || vistaParam === "live" || vistaParam === "convocatoria" ? vistaParam : "info",
);
```

Accesible también desde un botón "Convocatoria" en la vista `"info"`, colocado
**antes** del botón "Iniciar/Continuar partido en directo" (es el paso
lógico previo). Al entrar:

```tsx
if (vista === "convocatoria") {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Convocatoria"
        eyebrow={`vs ${partido.rival}`}
        onBack={() => setVista("info")}
        backLabel="Partido"
      />
      <AsistenciaChecklist equipoId={equipoId} partidoId={partido.id} />
    </div>
  );
}
```

Ningún cambio en `AsistenciaChecklist.tsx` — es exactamente el mismo
componente que ya usa `DayAgenda.tsx`, con sus mismos botones de motivo.
Editable en cualquier momento, antes o después del partido — no hay
distinción de "convocatoria cerrada".

## Filtrado del panel en vivo

`PartidoDetailPage.tsx` ya carga `jugadores` (plantilla completa) y
`eventos` (ya filtrados a ese partido). Añade una carga de `asistencia`
para ese `partido_id`:

```ts
const [asistenciaPartido, setAsistenciaPartido] = useState<AsistenciaRow[]>([]);

useEffect(() => {
  if (!partidoId) return;
  supabase
    .from("asistencia")
    .select("*")
    .eq("partido_id", partidoId)
    .then(({ data }) => setAsistenciaPartido(data ?? []));
}, [partidoId]);
```

(Recargar también tras cerrar la vista de convocatoria, igual que ya se
hace con `cargar()` tras cerrar `PartidoModal` — ver Plan.)

```ts
const jugadoresConvocados = jugadores.filter((j) =>
  asistenciaPartido.some((a) => a.jugador_id === j.id && a.presente),
);
```

En la rama `vista === "live"`:

```tsx
if (vista === "live") {
  if (asistenciaPartido.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Partido en directo" eyebrow={`vs ${partido.rival}`} onBack={() => setVista("info")} backLabel="Partido" variant="accent" />
        <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">
          <p>Haz la convocatoria antes de registrar estadísticas.</p>
          <Button className="mt-4" onClick={() => setVista("convocatoria")}>Ir a convocatoria</Button>
        </div>
      </div>
    );
  }
  return (
    <ContadoresEnVivo
      partido={partido}
      equipoNombre={equipo?.nombre}
      jugadores={jugadoresConvocados}
      eventos={eventos}
      onActualizado={setPartido}
      onEventosActualizados={setEventos}
      onBack={() => setVista("info")}
    />
  );
}
```

`ContadoresEnVivo` en sí no cambia — sigue recibiendo `jugadores` y
mostrándolos todos tal cual (`jugadores.map(...)` en la línea 447); el
filtrado ocurre enteramente en el llamante, igual que ya hace
`FichaTecnica`/`RivalDetailPage` con sus propios arrays ya filtrados antes
de pasarlos a componentes de presentación.

El bloqueo es "cero filas de asistencia", no "cero convocados": si el
entrenador hizo la convocatoria y desmarcó a todo el mundo (raro, pero
válido), se respeta esa decisión y el panel se muestra vacío en vez de
bloquear — el aviso es solo para "todavía no se ha tocado nada".

## Estadísticas de jugador (el cambio de comportamiento)

En `JugadorDetailPage.tsx`, sustituye el bloque actual (líneas 69-84):

```ts
const partidosConEventoDelJugador = new Set<string>();
const eventosDelJugador = eventos.filter((e) => e.jugador_id === jugador.id);
for (const e of eventosDelJugador) {
  if (!e.partido_id) continue;
  partidosConEventoDelJugador.add(e.partido_id);
  ...
}
const partidosJugadosOrdenados = partidos
  .filter((p) => partidosConEventoDelJugador.has(p.id))
  .sort((a, b) => a.fecha.localeCompare(b.fecha));
```

por una versión basada en convocatoria + partido resuelto:

```ts
const partidosConvocado = new Set(
  asistencia.filter((a) => a.jugador_id === jugador.id && a.partido_id && a.presente).map((a) => a.partido_id!),
);
const eventosPorPartido = agruparPorPartido(eventos);
const partidosJugadosOrdenados = partidos
  .filter((p) => partidosConvocado.has(p.id) && resultadoPartido(p, eventosPorPartido.get(p.id) ?? []) !== null)
  .sort((a, b) => a.fecha.localeCompare(b.fecha));
const partidosJugados = partidosJugadosOrdenados.length;
```

`eventosDelJugador` (usado en todo el resto del fichero para calcular
zonas, eficacia y tendencia) pasa de "todos los eventos del jugador" a
"eventos del jugador en partidos donde estaba convocado y ya resueltos":

```ts
const idsPartidosJugados = new Set(partidosJugadosOrdenados.map((p) => p.id));
const eventosDelJugador = eventos.filter(
  (e) => e.jugador_id === jugador.id && e.partido_id !== null && idsPartidosJugados.has(e.partido_id),
);
```

Esto requiere cargar `asistencia` en `JugadorDetailPage.tsx` (hoy no se
carga — añadir a la carga en paralelo junto a `jugadores`/`partidos`/etc.,
filtrado por `equipo_id`).

Consecuencias explícitas de este cambio (para que quede documentado, no
solo implícito en el código):
- Un jugador convocado que no anota ni un solo evento en un partido
  **ahora sí** cuenta como partido jugado (antes no aparecía en absoluto,
  porque `partidosConEventoDelJugador` solo veía partidos con al menos un
  evento suyo).
- Un partido con eventos de un jugador pero **sin ninguna fila de
  asistencia para él** deja de contar en su ficha hasta que se haga la
  convocatoria — este es exactamente el caso de los 2 partidos ya jugados
  detectados antes de este diseño.
- Las zonas de tiro, eficacia acumulada, tendencia de temporada, y los
  insights automáticos que ya se calculan sobre `eventosDelJugador` en esta
  misma página heredan el filtro sin ningún cambio adicional — todos parten
  del mismo array ya filtrado.
- La ficha técnica de UN partido concreto (`FichaTecnica.tsx`, vista
  `ambitoValido !== "temporada"`) no cambia: sigue mostrando lo que esté
  registrado para ese partido, sea cual sea su convocatoria — el filtro de
  convocatoria aplica a la agregación de temporada, no a la ficha de un
  partido aislado.

## Aviso de convocatoria pendiente

**Sin notificación push** — decisión explícita para no añadir un 4º caso a
la lista cerrada de CLAUDE.md ("partido próximo, cambio de mesociclo,
recordatorio semanal"). Solo aviso dentro de la app:

- **`InicioPage.tsx`**: un banner cuando `partidosSinConvocatoria.length > 0`,
  calculado como los partidos (pasados o futuros, sin distinción de fecha)
  sin ninguna fila de `asistencia` con ese `partido_id`. Un partido por
  fila, con enlace directo a `/equipos/:equipoId/partido/:id?vista=convocatoria`.
- **Dentro del propio partido**: el aviso bloqueante del panel en vivo (ver
  arriba) ya cubre el caso "quiero registrar en directo sin convocar" — no
  hace falta un banner adicional en la vista `"info"` del partido, el botón
  "Convocatoria" ya está visible ahí siempre.

## Separar entrenamiento y partido en Progreso e Inicio

Mismo criterio en los cuatro sitios: filtrar a `sesion_id !== null` antes
de calcular.

**`ProgresoPage.tsx`** — "Asistencia por mes" (línea ~102-121): cambiar el
bucle `for (const reg of asistencia)` para iterar solo
`asistencia.filter((a) => a.sesion_id)`.

**`ProgresoPage.tsx`** — "Enfermería" (línea ~138-149): el filtro de
`registros` por jugador (línea 141-145) añade `&& a.sesion_id` a su
`.filter(...)`, de modo que el "último registro" de cada jugador para
decidir si está lesionado solo mira entrenamientos, nunca convocatorias.

**`InicioPage.tsx`** — KPI "Asistencia media" (línea 82-83): mismo cambio,
`asistencia.filter((a) => a.sesion_id)` antes de calcular `asistenciaMedia`.

**`InicioPage.tsx`** — lista de `alertas` de lesión (línea 90-100): el
`.filter((a) => a.jugador_id === j.id)` de la línea 93 añade
`&& a.sesion_id` por el mismo motivo que en Enfermería.

Ninguno de los cuatro necesita lógica nueva — es añadir una condición a un
`.filter()` ya existente en cada caso.

## Testing

Sin Vitest nuevo — esta funcionalidad es principalmente UI + queries
Supabase + reordenación de arrays ya existentes, sin la superficie de
umbrales/scoring que justificó introducir tests unitarios para los insights
automáticos. Verificación: `tsc` + `lint` + `build` limpios, más prueba
manual del usuario (ver Plan) — mismo criterio que el resto de fases del
proyecto antes de esta.

## Casos límite

- **Partido sin ninguna fila de asistencia**: panel en vivo bloqueado (ver
  arriba); no cuenta como "partido sin convocatoria" distinto de "partido
  con convocatoria vacía" para el banner de Inicio — ambos casos son
  simplemente "0 filas", tratados igual.
- **Partido con convocatoria pero todos desmarcados**: panel en vivo
  vacío (no bloqueado) — decisión válida del entrenador, no un olvido.
- **Los 2 partidos ya jugados con eventos pero sin convocatoria**: dejan de
  contar en la ficha de cualquier jugador implicado hasta que se convoque
  retroactivamente desde la pantalla de convocatoria (editable en
  cualquier momento, incluye partidos pasados) — aparecen en el banner de
  Inicio como pendientes, sin backfill automático.
- **Jugador dado de baja de la plantilla después de haber sido convocado**:
  fuera de alcance — no se trata aquí, mismo comportamiento que ya existe
  hoy con cualquier fila de `asistencia` huérfana de un jugador borrado (no
  hay borrado de jugadores implementado en la app, ver CLAUDE.md).
