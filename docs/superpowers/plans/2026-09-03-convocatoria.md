# Convocatoria de partido — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la convocatoria (quién está disponible para un partido concreto, guardada en la tabla `asistencia` ya existente) determine tanto quién aparece en el panel de estadísticas en vivo de ese partido como qué partidos cuentan en la ficha técnica de temporada de cada jugador.

**Architecture:** Ningún dato nuevo — `asistencia` con `partido_id` ya existía y ya tenía un punto de entrada (`AsistenciaChecklist` desde el calendario); se añade un segundo punto de entrada desde la ficha de partido, se usa esa misma tabla para filtrar el panel en vivo y para redefinir "partidos jugados" en la ficha de jugador, y se separan los cálculos de asistencia-a-entrenamiento que hoy mezclan sesiones y partidos sin darse cuenta.

**Tech Stack:** React + TypeScript + Supabase — sin librerías nuevas, sin tests automatizados nuevos (ver spec, "Testing": esta funcionalidad es UI + queries + reordenación de arrays ya existentes, no justifica introducir Vitest aquí).

**Spec:** `docs/superpowers/specs/2026-09-03-convocatoria-design.md`

## Global Constraints

- Todo en español — toda la UI y los textos nuevos.
- No se modifica `AsistenciaChecklist.tsx` ni el punto de entrada ya existente en `DayAgenda.tsx` — se reutiliza tal cual, con sus botones de motivo (Justificado/Injustificado/Lesión) también para partidos.
- "Convocado" = existe una fila en `asistencia` con ese `partido_id` y `jugador_id`, `presente = true`. Cero filas para un partido = "convocatoria no hecha", distinto de "convocatoria hecha, este jugador excluido".
- Sin notificación push nueva — solo aviso dentro de la app (no se toca la lista cerrada de 3 casos de notificaciones de CLAUDE.md).
- Cualquier cambio de esquema va en una migración nueva (nunca editar una ya aplicada) — `supabase/migrations/`.
- Un único acento (`var(--color-accent)`) fuera de los estados de asistencia ya sancionados (presente/justificado/injustificado/lesión) — el aviso de "convocatoria pendiente" usa `var(--color-warning)`, no un color nuevo.

---

### Task 1: Migración — unicidad de convocatoria/asistencia

**Files:**
- Create: `supabase/migrations/0020_convocatoria_unica.sql`

**Interfaces:**
- Produces: restricciones `unique (jugador_id, partido_id)` y `unique (jugador_id, sesion_id)` sobre `asistencia` — ninguna tarea posterior depende del nombre exacto de la restricción, solo de que exista.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Evita filas duplicadas de convocatoria/asistencia para el mismo
-- jugador en el mismo partido o la misma sesión (p.ej. un doble toque en
-- el checklist creando dos filas en vez de reutilizar la existente).
-- Postgres no aplica `unique` a pares donde alguna columna es NULL (cada
-- NULL cuenta como distinto), así que una fila de entrenamiento
-- (partido_id NULL) nunca choca con la restricción de partido, y
-- viceversa — ambas conviven sin necesitar una cláusula WHERE.
alter table asistencia add constraint asistencia_jugador_partido_unico unique (jugador_id, partido_id);
alter table asistencia add constraint asistencia_jugador_sesion_unico unique (jugador_id, sesion_id);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0020_convocatoria_unica.sql
git commit -m "feat: migración — unicidad de convocatoria/asistencia por jugador y partido/sesión"
```

Nota para el controlador (no es parte del trabajo del implementador de esta
tarea): esta migración se aplica al proyecto Supabase real con
`mcp__supabase__apply_migration` cuando el resto de la rama esté lista para
probarse manualmente — mismo criterio que se siguió con `0019_rivales.sql`.
No la apliques tú mismo si eres el subagente de esta tarea: tu trabajo
termina en crear y commitear el archivo SQL.

---

### Task 2: Vista "Convocatoria" en la ficha de partido

**Files:**
- Modify: `src/pages/PartidoDetailPage.tsx`

**Interfaces:**
- Consumes: `AsistenciaChecklist` de `@/components/equipo/AsistenciaChecklist` (ya existe, sin cambios) — props `{ equipoId: string; partidoId: string }`.
- Produces: vista `"convocatoria"` accesible vía `?vista=convocatoria` en la URL (consumida por el banner de Inicio en la Tarea 6) y vía un botón en la vista `"info"`.

- [ ] **Step 1: Añadir el import de `AsistenciaChecklist`**

En `src/pages/PartidoDetailPage.tsx`, junto a los imports de componentes ya existentes:

```ts
import { AsistenciaChecklist } from "@/components/equipo/AsistenciaChecklist";
```

- [ ] **Step 2: Ampliar el tipo `Vista` y aceptar el nuevo valor por URL**

Cambia:

```ts
type Vista = "info" | "live" | "ficha";
```

por:

```ts
type Vista = "info" | "live" | "ficha" | "convocatoria";
```

Y cambia la inicialización del estado (línea siguiente a `vistaParam`):

```ts
const [vista, setVista] = useState<Vista>(vistaParam === "ficha" || vistaParam === "live" ? vistaParam : "info");
```

por:

```ts
const [vista, setVista] = useState<Vista>(
  vistaParam === "ficha" || vistaParam === "live" || vistaParam === "convocatoria" ? vistaParam : "info",
);
```

- [ ] **Step 3: Añadir la rama de render de la vista "convocatoria"**

Justo antes de `if (vista === "live") {`, añade:

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

- [ ] **Step 4: Añadir el botón de acceso desde la vista "info"**

Cambia:

```tsx
      <Button size="lg" variant="ink" className="w-full gap-2.5" onClick={() => setVista("live")}>
        <span className="h-[7px] w-[7px] rounded-full bg-[var(--color-accent)]" />
        {eventos.length > 0 || (partido.estadisticas.eventos ?? []).length > 0
          ? "Continuar partido en directo"
          : "Iniciar partido en directo"}
      </Button>
      <button
        onClick={() => setVista("ficha")}
        className="text-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
      >
        Ver ficha técnica
      </button>
```

por:

```tsx
      <button
        onClick={() => setVista("convocatoria")}
        className="text-center text-sm font-medium text-[var(--color-ink)] hover:text-[var(--color-accent)]"
      >
        Convocatoria
      </button>
      <Button size="lg" variant="ink" className="w-full gap-2.5" onClick={() => setVista("live")}>
        <span className="h-[7px] w-[7px] rounded-full bg-[var(--color-accent)]" />
        {eventos.length > 0 || (partido.estadisticas.eventos ?? []).length > 0
          ? "Continuar partido en directo"
          : "Iniciar partido en directo"}
      </Button>
      <button
        onClick={() => setVista("ficha")}
        className="text-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
      >
        Ver ficha técnica
      </button>
```

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/pages/PartidoDetailPage.tsx`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PartidoDetailPage.tsx
git commit -m "feat: añade la vista de convocatoria a la ficha de partido"
```

---

### Task 3: Filtrar el panel en vivo a solo convocados

**Files:**
- Modify: `src/pages/PartidoDetailPage.tsx`

**Interfaces:**
- Consumes: la vista `"convocatoria"` de la Tarea 2 (para el enlace del aviso bloqueante).
- Produces: ninguna interfaz nueva para otras tareas — `ContadoresEnVivo` en sí no cambia de firma, solo recibe un array `jugadores` ya filtrado por el llamante.

- [ ] **Step 1: Añadir el tipo `AsistenciaRow` al import de tipos**

Cambia:

```ts
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";
```

por:

```ts
import type { AsistenciaRow, EventosRow, JugadoresRow, PartidosRow } from "@/types/database";
```

- [ ] **Step 2: Cargar la asistencia de este partido**

Junto al resto de `useState`, añade:

```ts
const [asistenciaPartido, setAsistenciaPartido] = useState<AsistenciaRow[]>([]);
```

Junto a la función `cargar()` ya existente (antes de su `useEffect`), añade:

```ts
async function cargarAsistenciaPartido() {
  if (!partidoId) return;
  const { data } = await supabase.from("asistencia").select("*").eq("partido_id", partidoId);
  setAsistenciaPartido(data ?? []);
}
```

Y un nuevo `useEffect` (junto a los otros dos `useEffect` ya existentes en el fichero):

```ts
useEffect(() => {
  cargarAsistenciaPartido();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [partidoId]);
```

- [ ] **Step 3: Recargar la asistencia al volver de la vista de convocatoria**

En la rama `if (vista === "convocatoria")` añadida en la Tarea 2, cambia el `onBack`:

```tsx
onBack={() => setVista("info")}
```

por:

```tsx
onBack={() => {
  setVista("info");
  cargarAsistenciaPartido();
}}
```

- [ ] **Step 4: Calcular los jugadores convocados**

Justo después del guard `if (!partido) { ... }` (antes de la rama `if (vista === "live")`), añade:

```ts
const jugadoresConvocados = jugadores.filter((j) =>
  asistenciaPartido.some((a) => a.jugador_id === j.id && a.presente),
);
```

- [ ] **Step 5: Bloquear el panel en vivo sin convocatoria, y pasarle solo convocados**

Cambia:

```tsx
  if (vista === "live") {
    return (
      <ContadoresEnVivo
        partido={partido}
        equipoNombre={equipo?.nombre}
        jugadores={jugadores}
        eventos={eventos}
        onActualizado={setPartido}
        onEventosActualizados={setEventos}
        onBack={() => setVista("info")}
      />
    );
  }
```

por:

```tsx
  if (vista === "live") {
    if (asistenciaPartido.length === 0) {
      return (
        <div className="flex flex-col gap-4">
          <PageHeader
            title="Partido en directo"
            eyebrow={`vs ${partido.rival}`}
            onBack={() => setVista("info")}
            backLabel="Partido"
            variant="accent"
          />
          <div className="card-surface flex flex-col items-center gap-4 p-6 text-center text-[var(--color-text-muted)]">
            <p>Haz la convocatoria antes de registrar estadísticas.</p>
            <Button onClick={() => setVista("convocatoria")}>Ir a convocatoria</Button>
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

- [ ] **Step 6: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/pages/PartidoDetailPage.tsx`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PartidoDetailPage.tsx
git commit -m "fix: el panel en vivo solo muestra jugadores convocados, avisa si no hay convocatoria"
```

---

### Task 4: Redefinir "partidos jugados" en la ficha de jugador

**Files:**
- Modify: `src/pages/JugadorDetailPage.tsx`

**Interfaces:**
- Consumes: `resultadoPartido` de `@/lib/partidoStats` (ya existe); `agruparPorPartido` de `@/lib/eventos` (ya existe, usado igual en `RivalDetailPage.tsx`); el estado `asistencia` ya cargado en este fichero (`supabase.from("asistencia").select("*").eq("equipo_id", equipoId).eq("jugador_id", jugadorId)` — ya viene filtrado a este jugador, no hace falta ninguna carga nueva).
- Produces: `partidosJugadosOrdenados`/`eventosDelJugador` con el mismo nombre y forma que ya usa el resto del fichero (zonas de tiro, eficacia, tendencia, insights) — ninguna otra parte del fichero cambia.

- [ ] **Step 1: Añadir los imports que faltan**

Cambia:

```ts
import {
  desgloseResultados,
  distribucionPorZona,
  eficaciaConDetalle,
  esPortero,
  perdidas,
  porcentajeParadas,
  robos,
} from "@/lib/partidoStats";
```

por:

```ts
import {
  desgloseResultados,
  distribucionPorZona,
  eficaciaConDetalle,
  esPortero,
  perdidas,
  porcentajeParadas,
  resultadoPartido,
  robos,
} from "@/lib/partidoStats";
```

Y cambia:

```ts
import { cargarEventosEquipo } from "@/lib/eventos";
```

por:

```ts
import { agruparPorPartido, cargarEventosEquipo } from "@/lib/eventos";
```

- [ ] **Step 2: Reemplazar el cálculo de "partidos jugados"**

Cambia todo este bloque:

```ts
  // Goles y demás: eventos de la tabla `eventos` atribuidos a este jugador.
  let goles = 0;
  let exclusiones = 0;
  const partidosConEventoDelJugador = new Set<string>();
  const eventosDelJugador = eventos.filter((e) => e.jugador_id === jugador.id);
  for (const e of eventosDelJugador) {
    if (!e.partido_id) continue;
    partidosConEventoDelJugador.add(e.partido_id);
    if (e.tipo === "tiro" && e.equipo_origen === "propio" && e.resultado === "gol") goles++;
    if (e.tipo === "exclusion") exclusiones++;
  }
  const partidosJugados = partidosConEventoDelJugador.size;

  const partidosJugadosOrdenados = partidos
    .filter((p) => partidosConEventoDelJugador.has(p.id))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
```

por:

```ts
  // "Jugado" = convocado (asistencia.presente=true para ese partido_id) y
  // el partido ya tiene resultado resuelto — no "tiene algún evento", que
  // contaba de más (un partido con eventos pero sin convocatoria hecha) y
  // de menos (un suplente convocado que no llegó a tocar el balón) a la vez.
  const partidosConvocado = new Set(
    asistencia.filter((a) => a.partido_id && a.presente).map((a) => a.partido_id!),
  );
  const eventosPorPartido = agruparPorPartido(eventos);
  const partidosJugadosOrdenados = partidos
    .filter((p) => partidosConvocado.has(p.id) && resultadoPartido(p, eventosPorPartido.get(p.id) ?? []) !== null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const partidosJugados = partidosJugadosOrdenados.length;

  const idsPartidosJugados = new Set(partidosJugadosOrdenados.map((p) => p.id));
  const eventosDelJugador = eventos.filter(
    (e) => e.jugador_id === jugador.id && e.partido_id !== null && idsPartidosJugados.has(e.partido_id),
  );

  // Goles y demás: solo de los partidos que ahora cuentan como jugados.
  let goles = 0;
  let exclusiones = 0;
  for (const e of eventosDelJugador) {
    if (e.tipo === "tiro" && e.equipo_origen === "propio" && e.resultado === "gol") goles++;
    if (e.tipo === "exclusion") exclusiones++;
  }
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/pages/JugadorDetailPage.tsx`
Expected: sin errores. (El resto del fichero — zonas de tiro, eficacia, tendencia, `ambitoValido`, los insights automáticos — no necesita ningún cambio: todos consumen `eventosDelJugador`/`partidosJugadosOrdenados`, que ya llegan correctamente filtrados desde este punto.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/JugadorDetailPage.tsx
git commit -m "fix: la ficha de jugador solo cuenta partidos donde estaba convocado y ya resueltos"
```

---

### Task 5: Separar entrenamiento y partido en Progreso

**Files:**
- Modify: `src/pages/ProgresoPage.tsx`

**Interfaces:**
- Ninguna — cambios locales a dos cálculos ya existentes, ninguna otra tarea depende de esto.

- [ ] **Step 1: "Asistencia por mes" — solo entrenamientos**

Cambia:

```ts
  const porMes = new Map<string, { presentes: number; total: number }>();
  for (const reg of asistencia) {
```

por:

```ts
  const porMes = new Map<string, { presentes: number; total: number }>();
  for (const reg of asistencia.filter((a) => a.sesion_id)) {
```

- [ ] **Step 2: "Enfermería" — solo entrenamientos**

Cambia:

```ts
    const registros = asistencia
      .filter((a) => a.jugador_id === jugador.id)
      .map((a) => ({ registro: a, fecha: fechaDeAsistencia(a, sesiones, partidos) }))
```

por:

```ts
    const registros = asistencia
      .filter((a) => a.jugador_id === jugador.id && a.sesion_id)
      .map((a) => ({ registro: a, fecha: fechaDeAsistencia(a, sesiones, partidos) }))
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/pages/ProgresoPage.tsx`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProgresoPage.tsx
git commit -m "fix: Progreso — la asistencia a entrenamientos ya no se mezcla con convocatorias a partido"
```

---

### Task 6: Separar entrenamiento y partido en Inicio, y avisar de convocatoria pendiente

**Files:**
- Modify: `src/pages/InicioPage.tsx`

**Interfaces:**
- Consumes: la vista `"convocatoria"` de la Tarea 2 (destino del enlace del aviso).
- Ninguna otra tarea depende de esto.

- [ ] **Step 1: "Asistencia media" — solo entrenamientos**

Cambia:

```ts
  const asistenciaMedia =
    asistencia.length > 0 ? Math.round((asistencia.filter((a) => a.presente).length / asistencia.length) * 100) : null;
```

por:

```ts
  const asistenciaEntreno = asistencia.filter((a) => a.sesion_id);
  const asistenciaMedia =
    asistenciaEntreno.length > 0
      ? Math.round((asistenciaEntreno.filter((a) => a.presente).length / asistenciaEntreno.length) * 100)
      : null;
```

- [ ] **Step 2: Alertas de lesión — solo entrenamientos**

Cambia:

```ts
  const alertas: { dot: string; texto: string; sub: string }[] = [];
  for (const j of jugadores) {
    const registros = asistencia
      .filter((a) => a.jugador_id === j.id)
```

por:

```ts
  const alertas: { dot: string; texto: string; sub: string; partidoId?: string }[] = [];
  for (const j of jugadores) {
    const registros = asistencia
      .filter((a) => a.jugador_id === j.id && a.sesion_id)
```

- [ ] **Step 3: Añadir alertas de "convocatoria pendiente"**

Justo después del cierre del bucle `for (const j of jugadores) { ... }` de las alertas (antes de la línea `const todayLong = ...`), añade:

```ts
  const partidosSinConvocatoria = partidos.filter((p) => !asistencia.some((a) => a.partido_id === p.id));
  for (const p of partidosSinConvocatoria) {
    alertas.push({
      dot: "var(--color-warning)",
      texto: `Convocatoria pendiente: vs ${p.rival}`,
      sub: `${new Date(p.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} — hazla antes de registrar el partido en directo`,
      partidoId: p.id,
    });
  }
```

- [ ] **Step 4: Hacer clicables las alertas que llevan partido**

Cambia:

```tsx
          <div className="flex flex-col gap-2">
            {alertas.map((a, i) => (
              <div key={i} className="flex items-center gap-3 rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.dot }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-white">{a.texto}</div>
                  <div className="mt-0.5 truncate text-[11px] text-white/50">{a.sub}</div>
                </div>
              </div>
            ))}
          </div>
```

por:

```tsx
          <div className="flex flex-col gap-2">
            {alertas.map((a, i) => {
              const contenido = (
                <>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.dot }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-white">{a.texto}</div>
                    <div className="mt-0.5 truncate text-[11px] text-white/50">{a.sub}</div>
                  </div>
                </>
              );
              return a.partidoId ? (
                <button
                  key={i}
                  onClick={() => navigate(`/equipos/${equipoId}/partido/${a.partidoId}?vista=convocatoria`)}
                  className="flex w-full items-center gap-3 rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5 text-left"
                >
                  {contenido}
                </button>
              ) : (
                <div key={i} className="flex items-center gap-3 rounded-[14px] bg-[var(--color-ink)] px-4 py-3.5">
                  {contenido}
                </div>
              );
            })}
          </div>
```

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/pages/InicioPage.tsx`
Expected: sin errores. (El KPI "Bajas activas", que cuenta `alertas.filter((a) => a.dot === "var(--color-accent)").length`, no cambia de comportamiento: las alertas de convocatoria pendiente usan `var(--color-warning)`, no `var(--color-accent)`, así que no se cuelan en ese contador.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/InicioPage.tsx
git commit -m "feat: avisa en Inicio de los partidos sin convocatoria, separa la asistencia a entrenamientos de la convocatoria a partido"
```

---

### Task 7: Verificación final, `ui-estetica`, prueba manual

**Files:** ninguno nuevo — comandos + revisión de agente + aplicar la migración.

- [ ] **Step 1: Typecheck + lint + build completos**

Run: `npx tsc -b --noEmit && npm run lint && npm run build`
Expected: los tres limpios.

- [ ] **Step 2: Aplicar la migración al proyecto Supabase real**

El controlador (no un subagente) aplica `supabase/migrations/0020_convocatoria_unica.sql` con `mcp__supabase__apply_migration`, igual que se hizo con `0019_rivales.sql`.

- [ ] **Step 3: Revisión de `ui-estetica`**

Dispatch al agente `ui-estetica` para revisar la vista de convocatoria en `PartidoDetailPage.tsx`, el aviso bloqueante del panel en vivo, y el aviso de "convocatoria pendiente" en `InicioPage.tsx`, frente a CLAUDE.md: tema claro estándar en la vista de convocatoria (reutiliza `AsistenciaChecklist` sin tocarlo), coherencia del aviso bloqueante con el resto de estados vacíos de la app (mismo patrón que "Todavía no hay partidos registrados..." en Rivales), y que el nuevo dot de aviso en Inicio use `var(--color-warning)` y no invente un color nuevo. Aplicar los hallazgos reales que encuentre.

- [ ] **Step 4: Prueba manual del usuario**

Pedir al usuario que, con datos reales (incluyendo los 2 partidos que ya tienen estadísticas registradas sin convocatoria, detectados antes de este plan):

1. Abra Inicio y confirme que aparece un aviso de "Convocatoria pendiente" para esos 2 partidos (y para cualquier otro sin convocatoria), y que al tocarlo lleva directo a la pantalla de convocatoria de ese partido.
2. Haga la convocatoria de uno de esos 2 partidos ya jugados (marcando presentes a quienes ya tienen goles/eventos registrados en él) y confirme que, tras guardarla, ese partido empieza a contar en "Partidos" y en la eficacia acumulada de la ficha técnica de esos jugadores — **este es el caso crítico**: confirmar que las cifras que ya se mostraban antes de esta función no se rompen ni se distorsionan al añadir la convocatoria retroactiva, solo dejan de estar "flotando" sin convocatoria.
3. Abra un partido sin convocatoria y confirme que "Partido en directo" bloquea con el aviso, y que desde ahí se puede ir directo a convocatoria.
4. Haga la convocatoria de un partido nuevo dejando fuera a 1-2 jugadores, y confirme que el selector del panel en vivo de ese partido no los muestra.
5. Confirme que "Asistencia media" y "Enfermería"/las alertas de baja en Inicio y Progreso siguen reflejando solo entrenamientos, sin que una convocatoria a partido cambie esos números.

- [ ] **Step 5: Commit final si `ui-estetica` aplicó cambios**

```bash
git add -A
git commit -m "fix: ajustes de ui-estetica sobre la convocatoria de partido"
```
