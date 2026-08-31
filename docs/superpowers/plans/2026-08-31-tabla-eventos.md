# Tabla de eventos unificada (Punto 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los contadores de partido (`partidos.estadisticas.eventos` jsonb, tipos gol_favor/gol_contra/parada_portero/balon_ganado/balon_perdido/tiro_fallado/siete_metido/siete_fallado/exclusion_2min) por filas individuales en una nueva tabla `eventos`, sin cambiar el comportamiento visible de "Partido en directo" todavía — es un cambio de almacenamiento puro. La cuadrícula de portería con zona (Punto 2) se construye después, sobre esta base.

**Architecture:** Nueva tabla `eventos` (equipo/partido/sesión/jugador, equipo_origen, tipo, resultado, zona nullable, es_penalti) con RLS igual que el resto de tablas (`private.equipo_del_entrenador(equipo_id)`). Los 9 tipos de contador migran a filas de `eventos`; el cronómetro, las sustituciones (`entra_pista`/`sale_pista`, minutos jugados) y los toques "7m provocado"/"7m cometido" se quedan tal cual en `estadisticas` jsonb — decisión explícita del usuario (ver conversación: alcance "híbrido"). Todas las pantallas que hoy leen `partido.estadisticas.eventos` para goles/tiros/pérdidas/exclusiones pasan a leer de la tabla `eventos` (cargada aparte y cruzada por `partido_id`/`jugador_id` en el cliente).

**Tech Stack:** React 19 + TypeScript + Vite, Supabase (Postgres + RLS), sin librería de estado ni de tests — verificación vía `tsc -b` (typecheck/build), `npm run lint`, y prueba manual en el navegador (no hay vitest/jest en este proyecto).

**Spec:** requisitos del usuario en esta conversación (mensaje "Quiero añadir varias funcionalidades nuevas...", punto 0 y orden de trabajo punto 1); contexto de la app en `CLAUDE.md`.

## Global Constraints

- Todo en español (UI, comentarios de migración, mensajes).
- RLS obligatoria en `eventos` vía `private.equipo_del_entrenador(equipo_id)` — mismo patrón que el resto de tablas (ver `supabase/migrations/0008_entrenadores_rls.sql`), nunca `auth.role() = 'authenticated'` a secas.
- **Este Task 1 (migración SQL) lo ejecuta el agente `db-schema`**, no directamente — instrucción explícita del usuario ("Usa db-schema para los puntos 1 y 6").
- `zona` es NULLABLE en `eventos` (desviación deliberada del DDL que propuso el usuario, que la pedía `not null` cuando `tipo='tiro'`) — necesario porque (a) los eventos históricos migrados no tienen zona y (b) el componente de cuadrícula de portería (Punto 2) todavía no existe, así que los botones de "Partido en directo" en este Punto 1 siguen sin capturar zona. Señalarlo al usuario al mostrar el resultado del Punto 1.
- No se toca el cronómetro, `entra_pista`/`sale_pista`/minutos jugados, ni `siete_provocado`/`siete_cometido` — siguen en `estadisticas` jsonb sin cambios de comportamiento.
- Sin test runner en el repo: cada task se verifica con `npx tsc -b --noEmit` (o `npm run build`) y `npm run lint`, más prueba manual en `npm run dev` para los tasks de UI.
- Sin backend de test/staging separado: la migración se aplica sobre la base real (proyecto Supabase único) — revisar el SQL con cuidado antes de aplicar, tal y como pide el usuario.

---

## Task 1: Migración `eventos` — tabla, RLS, backfill

**Ejecutar con el agente `db-schema`.**

**Files:**
- Create: `supabase/migrations/0017_eventos.sql`

**Interfaces:**
- Produces: tabla `eventos(id, equipo_id, partido_id, sesion_id, jugador_id, equipo_origen, tipo, resultado, zona, es_penalti, creado_en)`, política RLS `"equipo_del_entrenador"` `for all`, backfill de los 9 tipos de contador migrables desde `partidos.estadisticas.eventos`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/0017_eventos.sql
--
-- Tabla de eventos individuales de partido/entrenamiento, para poder guardar
-- datos por tiro (zona, resultado, si es penalti) en vez de solo un contador
-- acumulado. Sustituye la parte de `partidos.estadisticas.eventos` que hoy
-- funciona como "contador con deshacer" (goles, tiros, paradas, pérdidas,
-- exclusiones).
--
-- ALCANCE DELIBERADO (decisión explícita del usuario): esta migración NO toca
-- el cronómetro (`estadisticas.cronometro`) ni las sustituciones en pista
-- (`entra_pista`/`sale_pista`, usadas para minutos jugados) ni los toques de
-- "7m provocado"/"7m cometido" — son estado continuo o matices sin
-- equivalente limpio en esta tabla, y se quedan tal cual en `estadisticas`
-- jsonb. Solo se migran los 9 tipos de contador con equivalente directo:
-- gol_favor, gol_contra, parada_portero, balon_ganado, balon_perdido,
-- tiro_fallado, siete_metido, siete_fallado, exclusion_2min.
--
-- MAPEO tipo jsonb -> fila eventos:
--   gol_favor      -> equipo_origen=propio, tipo=tiro,     resultado=gol,    es_penalti=false
--   gol_contra     -> equipo_origen=rival,  tipo=tiro,     resultado=gol,    es_penalti=false
--   parada_portero -> equipo_origen=rival,  tipo=tiro,     resultado=parado, es_penalti=false
--     (mismo evento que "tiro rival"/"nos meten o para nuestro portero" — ver
--     nota de diseño del usuario; no se distingue qué portero propio paró,
--     jugador_id queda vacío igual que en el resto de eventos del rival)
--   balon_ganado   -> equipo_origen=rival,  tipo=perdida (el rival la pierde)
--   balon_perdido  -> equipo_origen=propio, tipo=perdida
--   tiro_fallado   -> equipo_origen=propio, tipo=tiro,     resultado=fuera,  es_penalti=false
--   siete_metido   -> equipo_origen=propio, tipo=tiro,     resultado=gol,    es_penalti=true
--   siete_fallado  -> equipo_origen=propio, tipo=tiro,     resultado=fuera,  es_penalti=true
--   exclusion_2min -> equipo_origen=propio, tipo=exclusion
--
-- `zona` es NULLABLE (a diferencia del `not null` del diseño original
-- planteado por el usuario para tipo='tiro') por dos motivos: (1) los eventos
-- históricos migrados abajo no tienen zona registrada, y (2) el componente de
-- cuadrícula de portería llega en la siguiente fase — hasta entonces los
-- botones de "Partido en directo" siguen escribiendo tiros sin zona, igual
-- que hoy. El check de tipo='tiro' solo exige `resultado`, no `zona`.

create table eventos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  partido_id uuid references partidos (id) on delete cascade,
  sesion_id uuid references sesiones (id) on delete cascade,
  jugador_id uuid references jugadores (id) on delete set null,
  equipo_origen text not null check (equipo_origen in ('propio', 'rival')),
  tipo text not null check (tipo in ('tiro', 'perdida', 'exclusion')),
  resultado text check (resultado in ('gol', 'fuera', 'parado', 'poste')),
  zona smallint check (zona between 1 and 9),
  es_penalti boolean not null default false,
  creado_en timestamptz not null default now(),
  check (partido_id is not null or sesion_id is not null),
  check (tipo != 'tiro' or resultado is not null)
);
create index idx_eventos_equipo on eventos (equipo_id);
create index idx_eventos_partido on eventos (partido_id);
create index idx_eventos_sesion on eventos (sesion_id);

alter table eventos enable row level security;

create policy "equipo_del_entrenador" on eventos
  for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));

-- ============================================================================
-- BACKFILL — migra los 9 tipos de contador de `partidos.estadisticas.eventos`
-- (jsonb) a filas de `eventos`, y limpia esos mismos tipos del jsonb para que
-- no queden duplicados. cronometro, entra_pista, sale_pista, siete_provocado
-- y siete_cometido se preservan sin tocar.
-- ============================================================================
insert into eventos (equipo_id, partido_id, jugador_id, equipo_origen, tipo, resultado, es_penalti, creado_en)
select
  p.equipo_id,
  p.id,
  (e ->> 'jugador_id')::uuid,
  case (e ->> 'tipo')
    when 'gol_contra' then 'rival'
    when 'parada_portero' then 'rival'
    when 'balon_ganado' then 'rival'
    else 'propio'
  end,
  case (e ->> 'tipo')
    when 'balon_ganado' then 'perdida'
    when 'balon_perdido' then 'perdida'
    when 'exclusion_2min' then 'exclusion'
    else 'tiro'
  end,
  case (e ->> 'tipo')
    when 'gol_favor' then 'gol'
    when 'gol_contra' then 'gol'
    when 'siete_metido' then 'gol'
    when 'parada_portero' then 'parado'
    when 'tiro_fallado' then 'fuera'
    when 'siete_fallado' then 'fuera'
    else null
  end,
  (e ->> 'tipo') in ('siete_metido', 'siete_fallado'),
  (e ->> 'creado_en')::timestamptz
from partidos p, jsonb_array_elements(p.estadisticas -> 'eventos') as e
where (e ->> 'tipo') in (
  'gol_favor', 'gol_contra', 'parada_portero', 'balon_ganado',
  'balon_perdido', 'tiro_fallado', 'siete_metido', 'siete_fallado', 'exclusion_2min'
);

-- Quita del jsonb los tipos ya migrados, conservando cronómetro (columna
-- aparte, no tocada) y el resto de toques (entra_pista, sale_pista,
-- siete_provocado, siete_cometido).
update partidos
set estadisticas = jsonb_set(
  estadisticas,
  '{eventos}',
  coalesce(
    (
      select jsonb_agg(e)
      from jsonb_array_elements(estadisticas -> 'eventos') as e
      where (e ->> 'tipo') not in (
        'gol_favor', 'gol_contra', 'parada_portero', 'balon_ganado',
        'balon_perdido', 'tiro_fallado', 'siete_metido', 'siete_fallado', 'exclusion_2min'
      )
    ),
    '[]'::jsonb
  )
)
where estadisticas -> 'eventos' is not null;
```

- [ ] **Step 2: Aplicar y verificar la migración**

Usar `mcp__supabase__apply_migration` (nombre `eventos`, con el SQL de arriba), luego `mcp__supabase__get_advisors` (tipo `security`) para confirmar que no aparece ningún aviso nuevo sobre `eventos` (RLS activa, sin funciones sin `search_path`, etc.).

Verificar el backfill con una consulta de sanity check (vía `mcp__supabase__execute_sql`):
```sql
select tipo, equipo_origen, resultado, es_penalti, count(*) from eventos group by 1,2,3,4 order by 1,2,3,4;
```
Comparar mentalmente el total de filas con el número de eventos de esos 9 tipos que hubiera en `partidos.estadisticas.eventos` antes de la migración (si el equipo aún no tiene partidos con toques en vivo, la tabla puede quedar vacía — es el resultado esperado, no un fallo).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0017_eventos.sql
git commit -m "feat: añade tabla eventos para estadísticas de partido por tiro"
```

---

## Task 2: Tipos TypeScript — `eventos` en `src/types/database.ts`

**Files:**
- Modify: `src/types/database.ts`

**Interfaces:**
- Consumes: ninguno (task independiente tras el Task 1).
- Produces: `EventosRow`, `TipoEvento`, `EquipoOrigenEvento`, `ResultadoTiro`, entrada `eventos` en `Database.public.Tables`. `TipoEventoPartido` queda reducido a los 4 tipos que siguen en jsonb.

- [ ] **Step 1: Añadir los tipos de `eventos`** (justo después de `AsistenciaRow`, línea 259)

```ts
export type EquipoOrigenEvento = "propio" | "rival";
export type TipoEvento = "tiro" | "perdida" | "exclusion";
export type ResultadoTiro = "gol" | "fuera" | "parado" | "poste";

/** Evento individual de partido/entrenamiento (tabla `eventos`, ver
 * 0017_eventos.sql) — sustituye a los contadores que antes vivían en
 * `partidos.estadisticas.eventos` para los 9 tipos con equivalente directo
 * (goles, tiros, paradas, pérdidas, exclusiones). El cronómetro, las
 * sustituciones en pista y los toques "7m provocado/cometido" siguen en
 * `EstadisticasPartido` (jsonb) — no tienen fila aquí. */
export type EventosRow = {
  id: UUID;
  equipo_id: UUID;
  partido_id: UUID | null;
  sesion_id: UUID | null;
  jugador_id: UUID | null;
  equipo_origen: EquipoOrigenEvento;
  tipo: TipoEvento;
  resultado: ResultadoTiro | null;
  /** Zona de portería 1-9 (rejilla 3x3). Null: zona desconocida (eventos
   * migrados antes de la cuadrícula de portería) o tipo != 'tiro'. */
  zona: number | null;
  es_penalti: boolean;
  creado_en: string;
};
```

- [ ] **Step 2: Reducir `TipoEventoPartido` a los tipos que se quedan en jsonb** (líneas 187-201)

```ts
/** Toques que siguen viviendo en `estadisticas.eventos` (jsonb) tras
 * 0017_eventos.sql — no son "contadores" con equivalente en la tabla
 * `eventos`: son matices (7m provocado/cometido) o estado ligado al
 * cronómetro (entra/sale de pista, para derivar minutos jugados). */
export type TipoEventoPartido = "siete_provocado" | "siete_cometido" | "entra_pista" | "sale_pista";
```

- [ ] **Step 3: Registrar la tabla en `Database.public.Tables`** (tras la entrada `asistencia`, línea 398)

```ts
      eventos: TableDef<
        EventosRow,
        "id" | "partido_id" | "sesion_id" | "jugador_id" | "resultado" | "zona" | "es_penalti" | "creado_en"
      >;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sigue habiendo errores en los archivos que todavía usan los tipos antiguos (`ContadoresEnVivo.tsx`, `FichaTecnica.tsx`, `partidoStats.ts`, etc.) — se resuelven en los tasks siguientes. Confirmar que el error es por esos usos concretos (p.ej. `Property 'gol_favor' does not exist on type 'TipoEventoPartido'`) y no por un typo en este archivo.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: añade tipos de la tabla eventos y reduce TipoEventoPartido"
```

---

## Task 3: Cola offline — soporte para `eventos`

**Files:**
- Modify: `src/lib/offline/queue.ts:9`

**Interfaces:**
- Consumes: ninguno.
- Produces: `TablaOffline` acepta `"eventos"`, así `encolarOperacion`/`guardarCache`/`leerCache`/`aplicarPendientes` funcionan también para esta tabla sin más cambios (son genéricos por `tabla: TablaOffline`).

- [ ] **Step 1: Ampliar el tipo**

```ts
export type TablaOffline = "sesiones" | "partidos" | "eventos";
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin nuevos errores en este archivo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/offline/queue.ts
git commit -m "feat: permite encolar operaciones offline sobre eventos"
```

---

## Task 4: `src/lib/eventos.ts` — carga, agrupación y escritura offline-aware

**Files:**
- Create: `src/lib/eventos.ts`

**Interfaces:**
- Consumes: `EventosRow` de `@/types/database` (Task 2); `encolarOperacion`, `esErrorDeRed`, `guardarCache`, `leerCache`, `obtenerCola`, `aplicarPendientes` de `@/lib/offline/queue` (Task 3).
- Produces: `cargarEventosEquipo(equipoId): Promise<EventosRow[]>`, `agruparPorPartido(eventos): Map<string, EventosRow[]>`, `registrarEvento(datos): Promise<EventosRow>`, `borrarEvento(id): Promise<void>`. Usados por `ContadoresEnVivo.tsx`, `PartidoDetailPage.tsx`, `PartidoPage.tsx`, `InicioPage.tsx`, `ProgresoPage.tsx`, `JugadorDetailPage.tsx`, `JugadoresSection.tsx` (Tasks 6-12).

- [ ] **Step 1: Escribir el archivo**

```ts
// src/lib/eventos.ts
import { supabase } from "@/lib/supabaseClient";
import { aplicarPendientes, encolarOperacion, esErrorDeRed, guardarCache, leerCache, obtenerCola } from "@/lib/offline/queue";
import type { Database, EventosRow } from "@/types/database";

type EventoInsert = Database["public"]["Tables"]["eventos"]["Insert"];

/** Carga todos los eventos del equipo (mismo patrón que PartidoPage.tsx para
 * `partidos`: red primero, caché si falla, cola pendiente fusionada encima). */
export async function cargarEventosEquipo(equipoId: string): Promise<EventosRow[]> {
  const { data } = await supabase.from("eventos").select("*").eq("equipo_id", equipoId);
  const base = data ?? (await leerCache<EventosRow>("eventos", equipoId)) ?? [];
  if (data) void guardarCache("eventos", equipoId, data);
  const cola = await obtenerCola();
  return aplicarPendientes("eventos", base, cola);
}

/** Indexa una lista de eventos por partido_id, para pintar/leer por partido sin volver a consultar. */
export function agruparPorPartido(eventos: EventosRow[]): Map<string, EventosRow[]> {
  const mapa = new Map<string, EventosRow[]>();
  for (const e of eventos) {
    if (!e.partido_id) continue;
    const arr = mapa.get(e.partido_id);
    if (arr) arr.push(e);
    else mapa.set(e.partido_id, [e]);
  }
  return mapa;
}

/** Inserta un evento (tiro/pérdida/exclusión), con la misma cola offline que
 * el resto de escrituras en vivo (ver ContadoresEnVivo.tsx `persistir`). */
export async function registrarEvento(datos: Omit<EventoInsert, "id" | "creado_en">): Promise<EventosRow> {
  const fila: EventosRow = {
    id: crypto.randomUUID(),
    equipo_id: datos.equipo_id,
    partido_id: datos.partido_id ?? null,
    sesion_id: datos.sesion_id ?? null,
    jugador_id: datos.jugador_id ?? null,
    equipo_origen: datos.equipo_origen,
    tipo: datos.tipo,
    resultado: datos.resultado ?? null,
    zona: datos.zona ?? null,
    es_penalti: datos.es_penalti ?? false,
    creado_en: new Date().toISOString(),
  };
  if (!navigator.onLine) {
    await encolarOperacion({ tabla: "eventos", tipo: "insert", rowId: fila.id, payload: fila });
    return fila;
  }
  const { error, status } = await supabase.from("eventos").insert(fila);
  if (error && esErrorDeRed(status)) {
    await encolarOperacion({ tabla: "eventos", tipo: "insert", rowId: fila.id, payload: fila });
  }
  return fila;
}

/** Borra un evento (usado por "deshacer"), con la misma cola offline. */
export async function borrarEvento(id: string): Promise<void> {
  if (!navigator.onLine) {
    await encolarOperacion({ tabla: "eventos", tipo: "delete", rowId: id });
    return;
  }
  const { error, status } = await supabase.from("eventos").delete().eq("id", id);
  if (error && esErrorDeRed(status)) {
    await encolarOperacion({ tabla: "eventos", tipo: "delete", rowId: id });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores nuevos en `src/lib/eventos.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/eventos.ts
git commit -m "feat: añade helpers de carga y escritura offline-aware para eventos"
```

---

## Task 5: Reescribir `src/lib/partidoStats.ts`

**Files:**
- Modify: `src/lib/partidoStats.ts` (reescritura completa del archivo)

**Interfaces:**
- Consumes: `EventosRow`, `TipoEventoPartido` (reducido), `EventoPartido`, `CronometroPartido`, `PartidosRow` de `@/types/database`.
- Produces (firmas nuevas — quien las llama debe pasar `eventos: EventosRow[]` además del partido):
  - `ACCIONES_TABLA: { tipo: TipoEvento; equipoOrigen: EquipoOrigenEvento; resultado: ResultadoTiro | null; esPenalti: boolean; label: string; color: string }[]` — las 9 acciones que ahora escriben en la tabla.
  - `ACCIONES_JSONB: { tipo: TipoEventoPartido; label: string; color: string }[]` — las 2 restantes que siguen en jsonb (`siete_provocado`, `siete_cometido`); `entra_pista`/`sale_pista` se manejan aparte, igual que hoy.
  - `contarTabla(eventos: EventosRow[], accion: (typeof ACCIONES_TABLA)[number]): number`
  - `golesFavor(eventos: EventosRow[]): number`, `golesContra(eventos: EventosRow[]): number`
  - `resultadoPartido(p: PartidosRow, eventos: EventosRow[]): "victoria"|"derrota"|"empate"|null`
  - `marcadorPartido(p: PartidosRow, eventos: EventosRow[]): string`
  - `marcadorNumerico(p: PartidosRow, eventos: EventosRow[]): {favor:number;contra:number}|null`
  - `marcadorHastaTabla(eventosDesc: EventosRow[], hastaIndice: number): string`
  - `eficaciaLanzamiento(eventos: EventosRow[], jugadorId?: string): number|null`
  - `resumenResultados(partidos: PartidosRow[], eventosPorPartido: Map<string, EventosRow[]>): {g,e,p}`
  - `crearEventoTabla(...)`, `crearEventoJsonb(tipo, jugadorId, minuto)` (igual que el `crearEvento` actual, pero solo para los 4 tipos de `TipoEventoPartido` reducido).
  - Sin cambios: `RESULTADO_BADGE`, `ETIQUETAS_EVENTO` (recalculada para los 4 tipos jsonb), `segundosActuales`, `segundosPartido`, `minutoActual`, `formatoReloj`, `iniciarOReanudar`, `pausar`, `cambiarParte`, `minutosJugados` (sigue operando sobre `EventoPartido[]` del jsonb, sin tocar).

- [ ] **Step 1: Reescribir el archivo completo**

```ts
import type {
  CronometroPartido,
  EquipoOrigenEvento,
  EventoPartido,
  EventosRow,
  PartidosRow,
  ResultadoTiro,
  TipoEvento,
  TipoEventoPartido,
} from "@/types/database";

/** Las 9 acciones de contador que ahora escriben en la tabla `eventos` (ver
 * 0017_eventos.sql). Sin zona todavía — llega con la cuadrícula de portería
 * (siguiente fase); aquí solo se cambia el almacenamiento, no el flujo. */
export const ACCIONES_TABLA: {
  tipo: TipoEvento;
  equipoOrigen: EquipoOrigenEvento;
  resultado: ResultadoTiro | null;
  esPenalti: boolean;
  label: string;
  color: string;
  afectaMarcador: boolean;
}[] = [
  { tipo: "tiro", equipoOrigen: "propio", resultado: "gol", esPenalti: false, label: "Gol a favor", color: "var(--color-success)", afectaMarcador: true },
  { tipo: "tiro", equipoOrigen: "rival", resultado: "gol", esPenalti: false, label: "Gol en contra", color: "var(--color-accent)", afectaMarcador: true },
  { tipo: "tiro", equipoOrigen: "rival", resultado: "parado", esPenalti: false, label: "Parada portero", color: "#3d8ad6", afectaMarcador: false },
  { tipo: "perdida", equipoOrigen: "rival", resultado: null, esPenalti: false, label: "Balón ganado", color: "var(--color-success)", afectaMarcador: false },
  { tipo: "perdida", equipoOrigen: "propio", resultado: null, esPenalti: false, label: "Balón perdido", color: "var(--color-warning)", afectaMarcador: false },
  { tipo: "tiro", equipoOrigen: "propio", resultado: "fuera", esPenalti: false, label: "Tiro fallado", color: "var(--color-accent)", afectaMarcador: false },
  { tipo: "tiro", equipoOrigen: "propio", resultado: "gol", esPenalti: true, label: "7m metido", color: "var(--color-success)", afectaMarcador: true },
  { tipo: "tiro", equipoOrigen: "propio", resultado: "fuera", esPenalti: true, label: "7m fallado", color: "var(--color-accent)", afectaMarcador: false },
  { tipo: "exclusion", equipoOrigen: "propio", resultado: null, esPenalti: false, label: "Exclusión 2'", color: "var(--color-warning)", afectaMarcador: false },
];

/** Las 2 acciones que siguen viviendo en `estadisticas.eventos` (jsonb) —
 * matices sin fila propia en `eventos` (ver nota de alcance en
 * 0017_eventos.sql). No van en la rejilla de conteo: son toques puntuales,
 * no contadores con "deshacer" independiente por tipo. */
const ACCIONES_JSONB: { tipo: TipoEventoPartido; label: string }[] = [
  { tipo: "siete_provocado", label: "7m provocado" },
  { tipo: "siete_cometido", label: "7m cometido" },
];

/** Entrada/salida de pista — no son "acciones" de marcador, pero sí toques
 * con jugador+minuto para poder derivar minutos jugados. */
const SUSTITUCIONES: { tipo: TipoEventoPartido; label: string }[] = [
  { tipo: "entra_pista", label: "Entra a pista" },
  { tipo: "sale_pista", label: "Sale de pista" },
];

export const ETIQUETAS_EVENTO_JSONB: Record<TipoEventoPartido, string> = Object.fromEntries(
  [...ACCIONES_JSONB.map((a) => [a.tipo, a.label]), ...SUSTITUCIONES.map((s) => [s.tipo, s.label])],
) as Record<TipoEventoPartido, string>;

export function crearEventoJsonb(tipo: TipoEventoPartido, jugadorId: string | null, minuto: number | null): EventoPartido {
  return { id: crypto.randomUUID(), tipo, jugador_id: jugadorId, minuto, creado_en: new Date().toISOString() };
}

/** Cuenta cuántos eventos de la tabla `eventos` coinciden exactamente con una
 * acción de `ACCIONES_TABLA` (mismo tipo + equipo_origen + resultado + es_penalti). */
export function contarTabla(eventos: EventosRow[], accion: (typeof ACCIONES_TABLA)[number]): number {
  return eventos.filter(
    (e) =>
      e.tipo === accion.tipo &&
      e.equipo_origen === accion.equipoOrigen &&
      e.resultado === accion.resultado &&
      e.es_penalti === accion.esPenalti,
  ).length;
}

/** Goles a favor: "gol a favor" + "7m metido" (ambos suman al marcador propio). */
export function golesFavor(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.resultado === "gol").length;
}

export function golesContra(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && e.resultado === "gol").length;
}

/** Resultado del partido: prioriza los toques en vivo (fuente de verdad) sobre el campo `resultado` escrito a mano. */
export function resultadoPartido(p: PartidosRow, eventos: EventosRow[]): "victoria" | "derrota" | "empate" | null {
  if (eventos.length > 0) {
    const favor = golesFavor(eventos);
    const contra = golesContra(eventos);
    if (favor === contra) return "empate";
    return favor > contra ? "victoria" : "derrota";
  }
  const m = p.resultado?.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (!m) return null;
  const [, a, b] = m;
  if (a === b) return "empate";
  return Number(a) > Number(b) ? "victoria" : "derrota";
}

/** Marcador textual: prioriza los toques en vivo (fuente de verdad) sobre el campo escrito a mano. */
export function marcadorPartido(p: PartidosRow, eventos: EventosRow[]): string {
  if (golesFavor(eventos) > 0 || golesContra(eventos) > 0) {
    return `${golesFavor(eventos)}-${golesContra(eventos)}`;
  }
  return p.resultado ?? "—";
}

/**
 * Marcador como par numérico, mismo criterio de prioridad que
 * `resultadoPartido`/`marcadorPartido` (eventos en vivo > resultado escrito a
 * mano). `null` si no hay ninguno de los dos.
 */
export function marcadorNumerico(p: PartidosRow, eventos: EventosRow[]): { favor: number; contra: number } | null {
  if (eventos.length > 0) {
    return { favor: golesFavor(eventos), contra: golesContra(eventos) };
  }
  const m = p.resultado?.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (!m) return null;
  return { favor: Number(m[1]), contra: Number(m[2]) };
}

/** Letra + color del badge de resultado (G/E/P), reutilizado en Partido e Inicio. */
export const RESULTADO_BADGE: Record<"victoria" | "empate" | "derrota", { letra: string; bg: string }> = {
  victoria: { letra: "G", bg: "var(--color-success)" },
  empate: { letra: "E", bg: "var(--color-warning)" },
  derrota: { letra: "P", bg: "var(--color-accent)" },
};

/** Recuento G·E·P de una lista de partidos (solo cuenta los que ya tienen
 * resultado). `eventosPorPartido` debe traer, como mínimo, los eventos de
 * cada partido en la lista (ver `agruparPorPartido` en `@/lib/eventos`). */
export function resumenResultados(
  partidos: PartidosRow[],
  eventosPorPartido: Map<string, EventosRow[]>,
): { g: number; e: number; p: number } {
  let g = 0;
  let e = 0;
  let p = 0;
  for (const partido of partidos) {
    const r = resultadoPartido(partido, eventosPorPartido.get(partido.id) ?? []);
    if (r === "victoria") g++;
    else if (r === "empate") e++;
    else if (r === "derrota") p++;
  }
  return { g, e, p };
}

/** Marcador "a–b" tal como estaba justo después de los primeros `hastaIndice`
 * eventos de gol más recientes (orden desc por fecha, ya filtrado a tiro). */
export function marcadorHastaTabla(eventosDesc: EventosRow[], hastaIndice: number): string {
  let favor = 0;
  let contra = 0;
  for (let i = eventosDesc.length - 1; i >= hastaIndice; i--) {
    const e = eventosDesc[i];
    if (e.tipo !== "tiro" || e.resultado !== "gol") continue;
    if (e.equipo_origen === "propio") favor++;
    else contra++;
  }
  return `${favor}–${contra}`;
}

/** Segundos transcurridos de la parte en curso ahora mismo (incluye el tramo en marcha si está corriendo). */
export function segundosActuales(c: CronometroPartido | undefined): number {
  if (!c) return 0;
  if (!c.corriendo || !c.ultimaMarca) return c.segundosAcumulados;
  const transcurrido = (Date.now() - new Date(c.ultimaMarca).getTime()) / 1000;
  return c.segundosAcumulados + Math.max(0, transcurrido);
}

/** Segundos de partido "para mostrar" (1ª parte tal cual, 2ª parte con el offset de los 30' de la primera). */
export function segundosPartido(c: CronometroPartido | undefined): number {
  if (!c) return 0;
  return (c.parte - 1) * 1800 + segundosActuales(c);
}

export function minutoActual(c: CronometroPartido | undefined): number | null {
  if (!c || (c.segundosAcumulados === 0 && !c.corriendo && c.parte === 1)) return null;
  return Math.floor(segundosPartido(c) / 60) + 1;
}

export function formatoReloj(segundos: number): string {
  const s = Math.floor(segundos);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

const CRONOMETRO_INICIAL: CronometroPartido = { parte: 1, segundosAcumulados: 0, corriendo: false, ultimaMarca: null };

export function iniciarOReanudar(c: CronometroPartido | undefined): CronometroPartido {
  const base = c ?? CRONOMETRO_INICIAL;
  if (base.corriendo) return base;
  return { ...base, corriendo: true, ultimaMarca: new Date().toISOString() };
}

export function pausar(c: CronometroPartido | undefined): CronometroPartido {
  const base = c ?? CRONOMETRO_INICIAL;
  if (!base.corriendo) return base;
  return { ...base, segundosAcumulados: segundosActuales(base), corriendo: false, ultimaMarca: null };
}

/** Cambia de parte (alterna 1ª/2ª) y reinicia el contador de la parte, en pausa. */
export function cambiarParte(c: CronometroPartido | undefined): CronometroPartido {
  const base = c ?? CRONOMETRO_INICIAL;
  return { parte: base.parte === 1 ? 2 : 1, segundosAcumulados: 0, corriendo: false, ultimaMarca: null };
}

/**
 * Eficacia de lanzamiento en juego abierto + 7m: aciertos (resultado='gol')
 * sobre intentos (aciertos + fallos), solo tiros propios. Si se pasa
 * `jugadorId`, se acota a los toques atribuidos a ese jugador.
 */
export function eficaciaLanzamiento(eventos: EventosRow[], jugadorId?: string): number | null {
  const propios = eventos.filter(
    (e) => e.tipo === "tiro" && e.equipo_origen === "propio" && (jugadorId === undefined || e.jugador_id === jugadorId),
  );
  const aciertos = propios.filter((e) => e.resultado === "gol").length;
  const fallos = propios.filter((e) => e.resultado !== "gol").length;
  const intentos = aciertos + fallos;
  return intentos > 0 ? Math.round((aciertos / intentos) * 100) : null;
}

/**
 * Minutos jugados por un jugador en un partido, a partir de los toques
 * "entra_pista"/"sale_pista" (siguen en `estadisticas.eventos`, jsonb — no
 * migran a la tabla `eventos`, ver alcance en 0017_eventos.sql). Empareja
 * cronológicamente por minuto; si queda una entrada sin salida, cuenta hasta
 * el final del partido (60' por convenio, dos partes de 30').
 */
export function minutosJugados(eventosJsonb: EventoPartido[], jugadorId: string, duracionTotalMin = 60): number {
  const propios = eventosJsonb
    .filter((e) => e.jugador_id === jugadorId && (e.tipo === "entra_pista" || e.tipo === "sale_pista"))
    .slice()
    .sort((a, b) => (a.minuto ?? 0) - (b.minuto ?? 0) || a.creado_en.localeCompare(b.creado_en));

  let total = 0;
  let entradaMin: number | null = null;
  for (const e of propios) {
    if (e.tipo === "entra_pista") {
      entradaMin = e.minuto ?? entradaMin ?? 0;
    } else if (entradaMin !== null) {
      total += Math.max(0, (e.minuto ?? entradaMin) - entradaMin);
      entradaMin = null;
    }
  }
  if (entradaMin !== null) total += Math.max(0, duracionTotalMin - entradaMin);
  return total;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: los errores restantes están todos en los archivos consumidores (`ContadoresEnVivo.tsx`, `FichaTecnica.tsx`, `PartidoDetailPage.tsx`, `PartidoPage.tsx`, `InicioPage.tsx`, `ProgresoPage.tsx`, `JugadorDetailPage.tsx`, `JugadoresSection.tsx`) — se resuelven en los Tasks 6-12. Ninguno debe apuntar ya a `src/lib/partidoStats.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/partidoStats.ts
git commit -m "refactor: partidoStats.ts opera sobre la tabla eventos para goles/tiros/pérdidas/exclusiones"
```

---

## Task 6: Reescribir `ContadoresEnVivo.tsx`

**Files:**
- Modify: `src/components/partido/ContadoresEnVivo.tsx`

**Interfaces:**
- Consumes: `ACCIONES_TABLA`, `ACCIONES_JSONB`(interno), `ETIQUETAS_EVENTO_JSONB`, `contarTabla`, `crearEventoJsonb`, `marcadorHastaTabla`, `cambiarParte`, `formatoReloj`, `iniciarOReanudar`, `minutoActual`, `pausar`, `segundosPartido`, `golesFavor`, `golesContra` de `@/lib/partidoStats` (Task 5); `registrarEvento`, `borrarEvento` de `@/lib/eventos` (Task 4).
- Produces: nueva prop `eventos: EventosRow[]` (eventos de tabla de este partido) y `onEventosActualizados: (eventos: EventosRow[]) => void`, añadidas a las props existentes (`partido`, `equipoNombre`, `jugadores`, `onActualizado`, `onBack`).

**Contexto de diseño:** la cronología y "deshacer" hoy mezclan TODO en una sola lista (`partido.estadisticas.eventos`). Con la tabla separada, hay que fusionar dos fuentes — eventos de tabla (9 tipos) + eventos jsonb (`siete_provocado`, `siete_cometido`, `entra_pista`, `sale_pista`) — en una única vista cronológica ordenada por `creado_en`, y "deshacer" debe borrar el más reciente de las DOS fuentes juntas (comparando `creado_en`), no solo de una.

- [ ] **Step 1: Actualizar imports y props**

```tsx
import { useEffect, useState } from "react";
import { ChevronLeft, LogIn, LogOut, Pause, Play, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import { borrarEvento, registrarEvento } from "@/lib/eventos";
import { useFullscreenHorizontal } from "@/hooks/useFullscreenHorizontal";
import { useMovilHorizontal } from "@/hooks/useMovilHorizontal";
import {
  ACCIONES_TABLA,
  cambiarParte,
  contarTabla,
  crearEventoJsonb,
  ETIQUETAS_EVENTO_JSONB,
  formatoReloj,
  golesContra,
  golesFavor,
  iniciarOReanudar,
  marcadorHastaTabla,
  minutoActual,
  pausar,
  segundosPartido,
} from "@/lib/partidoStats";
import { cn } from "@/lib/utils";
import type { EventoPartido, EventosRow, JugadoresRow, PartidosRow, TipoEventoPartido } from "@/types/database";

const ACCIONES_JSONB_UI: { tipo: TipoEventoPartido; label: string; color: string }[] = [
  { tipo: "siete_provocado", label: "7m provocado", color: "var(--color-success)" },
  { tipo: "siete_cometido", label: "7m cometido", color: "var(--color-accent)" },
];

export function ContadoresEnVivo({
  partido,
  equipoNombre,
  jugadores,
  eventos,
  onActualizado,
  onEventosActualizados,
  onBack,
}: {
  partido: PartidosRow;
  equipoNombre?: string;
  jugadores: JugadoresRow[];
  eventos: EventosRow[];
  onActualizado: (p: PartidosRow) => void;
  onEventosActualizados: (eventos: EventosRow[]) => void;
  onBack: () => void;
}) {
```

- [ ] **Step 2: Reemplazar el estado derivado y `persistir`/`registrar`/`deshacer`**

```tsx
  useFullscreenHorizontal();
  const compacto = useMovilHorizontal();
  const [tick, setTick] = useState(0);
  const [jugadorSel, setJugadorSel] = useState<string | null>(null);
  const cronometro = partido.estadisticas.cronometro;
  const eventosJsonb = partido.estadisticas.eventos ?? [];

  // Cronología unificada: eventos de tabla (goles/tiros/paradas/pérdidas/
  // exclusiones) + eventos jsonb (7m provocado/cometido, entra/sale pista),
  // todos con la misma forma para poder ordenarlos y "deshacer" el más
  // reciente sea cual sea su origen.
  type ToqueUnificado = {
    id: string;
    origen: "tabla" | "jsonb";
    label: string;
    color: string;
    jugadorId: string | null;
    minuto: number | null;
    creadoEn: string;
    afectaMarcador: boolean;
  };
  const toquesTabla: ToqueUnificado[] = eventos.map((e) => {
    const accion = ACCIONES_TABLA.find(
      (a) => a.tipo === e.tipo && a.equipoOrigen === e.equipo_origen && a.resultado === e.resultado && a.esPenalti === e.es_penalti,
    );
    return {
      id: e.id,
      origen: "tabla",
      label: accion?.label ?? e.tipo,
      color: accion?.color ?? "rgba(255,255,255,.35)",
      jugadorId: e.jugador_id,
      minuto: null,
      creadoEn: e.creado_en,
      afectaMarcador: accion?.afectaMarcador ?? false,
    };
  });
  const toquesJsonb: ToqueUnificado[] = eventosJsonb.map((e) => ({
    id: e.id,
    origen: "jsonb",
    label: ETIQUETAS_EVENTO_JSONB[e.tipo],
    color: e.tipo === "siete_provocado" ? "var(--color-success)" : e.tipo === "siete_cometido" ? "var(--color-accent)" : "rgba(255,255,255,.35)",
    jugadorId: e.jugador_id,
    minuto: e.minuto,
    creadoEn: e.creado_en,
    afectaMarcador: false,
  }));
  const toquesDesc = [...toquesTabla, ...toquesJsonb].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  const golesEventosTabla = eventos.filter((e) => e.tipo === "tiro" && e.resultado === "gol");
  const golesDesc = [...golesEventosTabla].sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  useEffect(() => {
    if (!cronometro?.corriendo) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [cronometro?.corriendo]);
  void tick;

  async function persistirEstadisticas(estadisticas: PartidosRow["estadisticas"]) {
    const actualizado: PartidosRow = { ...partido, estadisticas, updated_at: new Date().toISOString() };
    onActualizado(actualizado);
    if (!navigator.onLine) {
      await encolarOperacion({ tabla: "partidos", tipo: "update", rowId: partido.id, payload: actualizado });
      return;
    }
    const { error, status } = await supabase.from("partidos").update({ estadisticas }).eq("id", partido.id);
    if (error && esErrorDeRed(status)) {
      await encolarOperacion({ tabla: "partidos", tipo: "update", rowId: partido.id, payload: actualizado });
    }
  }

  function alternarCronometro() {
    const nuevo = cronometro?.corriendo ? pausar(cronometro) : iniciarOReanudar(cronometro);
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: nuevo });
  }

  function siguienteParte() {
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: cambiarParte(cronometro) });
  }

  function registrarTabla(accion: (typeof ACCIONES_TABLA)[number]) {
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: accion.equipoOrigen === "rival" ? null : jugadorSel,
      equipo_origen: accion.equipoOrigen,
      tipo: accion.tipo,
      resultado: accion.resultado,
      zona: null,
      es_penalti: accion.esPenalti,
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
  }

  function registrarJsonb(tipo: TipoEventoPartido) {
    const evento = crearEventoJsonb(tipo, jugadorSel, minutoActual(cronometro));
    void persistirEstadisticas({ ...partido.estadisticas, eventos: [...eventosJsonb, evento] });
  }

  function registrarSustitucion(tipo: "entra_pista" | "sale_pista") {
    if (!jugadorSel) {
      alert("Selecciona primero un jugador/a en la fila de arriba.");
      return;
    }
    const evento = crearEventoJsonb(tipo, jugadorSel, minutoActual(cronometro));
    void persistirEstadisticas({ ...partido.estadisticas, eventos: [...eventosJsonb, evento] });
  }

  function deshacer() {
    if (toquesDesc.length === 0) return;
    const ultimo = toquesDesc[0];
    if (ultimo.origen === "tabla") {
      onEventosActualizados(eventos.filter((e) => e.id !== ultimo.id));
      void borrarEvento(ultimo.id);
    } else {
      void persistirEstadisticas({ ...partido.estadisticas, eventos: eventosJsonb.filter((e) => e.id !== ultimo.id) });
    }
  }

  const corriendo = !!cronometro?.corriendo;
  const estado = corriendo ? "En juego" : toquesDesc.length > 0 ? "Pausado" : "Sin empezar";
```

- [ ] **Step 3: Actualizar el bloque de marcador (goles a favor/contra)**

Quitar las dos líneas que calculaban `golesFavor`/`golesContra` a mano sobre `eventos` (jsonb) — ya no hacen falta, las funciones importadas del mismo nombre se llaman directamente en el JSX. Sustituir los 4 usos:

En la cabecera compacta:
```tsx
              <div className="stat-number text-2xl leading-none text-white">{golesFavor(eventos)}</div>
```
```tsx
              <div className="stat-number text-2xl leading-none text-white/55">{golesContra(eventos)}</div>
```

En la cabecera normal:
```tsx
            <div className="stat-number text-[52px] leading-[0.86] text-white">{golesFavor(eventos)}</div>
```
```tsx
            <div className="stat-number text-[52px] leading-[0.86] text-white/55">{golesContra(eventos)}</div>
```

- [ ] **Step 4: Actualizar `accionesBlock` para usar `ACCIONES_TABLA` + `ACCIONES_JSONB_UI`**

```tsx
  const accionesBlock = (
    <div className={cn("grid gap-1.5", compacto ? "grid-cols-4" : "grid-cols-3")}>
      {ACCIONES_TABLA.map((a, i) => (
        <button
          key={i}
          onClick={() => registrarTabla(a)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl border border-white/[.09] bg-white/[.05] px-1.5 text-center active:scale-[0.96]",
            compacto ? "h-[46px]" : "h-[60px]",
          )}
        >
          <span className={cn("leading-[1.15] text-white/85", compacto ? "text-[9px]" : "text-[11px]")}>{a.label}</span>
          <span className="stat-number text-sm" style={{ color: a.color }}>
            {contarTabla(eventos, a)}
          </span>
        </button>
      ))}
      {ACCIONES_JSONB_UI.map((a) => (
        <button
          key={a.tipo}
          onClick={() => registrarJsonb(a.tipo)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl border border-white/[.09] bg-white/[.05] px-1.5 text-center active:scale-[0.96]",
            compacto ? "h-[46px]" : "h-[60px]",
          )}
        >
          <span className={cn("leading-[1.15] text-white/85", compacto ? "text-[9px]" : "text-[11px]")}>{a.label}</span>
          <span className="stat-number text-sm" style={{ color: a.color }}>
            {eventosJsonb.filter((e) => e.tipo === a.tipo).length}
          </span>
        </button>
      ))}
    </div>
  );
```

- [ ] **Step 5: Actualizar `cronologiaBlock` y `EventoRow` para la lista unificada**

```tsx
  const cronologiaBlock = (
    <div className="min-h-0">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Cronología</span>
        <span className="text-[10px] text-white/30">{toquesDesc.length} acciones</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {toquesDesc.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/[.14] px-3.5 py-5 text-center text-xs text-white/35">
            Sin acciones registradas. Arranca el cronómetro y pulsa una acción.
          </div>
        )}
        {toquesDesc.map((t) => {
          const jugador = t.jugadorId ? jugadores.find((j) => j.id === t.jugadorId) : null;
          const quien = jugador ? `#${jugador.dorsal ?? "—"} ${jugador.nombre}` : t.jugadorId === null && t.afectaMarcador ? partido.rival : "Sin asignar";
          const indiceGol = golesDesc.findIndex((g) => g.id === t.id);
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-[11px] bg-white/[.05] px-3.5 py-2.5"
              style={{ borderLeft: `3px solid ${t.color}` }}
            >
              <span className="stat-number w-8 shrink-0 text-[15px] text-white">{t.minuto ?? minutoActual(cronometro) ?? "—"}&apos;</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-white">{t.label}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/42">{quien}</div>
              </div>
              {t.afectaMarcador && indiceGol >= 0 && (
                <span className="stat-number shrink-0 text-xs tracking-[0.04em] text-white/45">
                  {marcadorHastaTabla(golesDesc, indiceGol)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
```

Borrar la función `EventoRow` (líneas 350-385 del original) y el import de `EventoPartido` que ya no se usa fuera de este archivo (sigue haciendo falta para `eventosJsonb: EventoPartido[]`, así que se mantiene el import, solo se quita `ACCIONES`/`ETIQUETAS_EVENTO` del import de `partidoStats` si ya no se referencian directamente).

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: `src/components/partido/ContadoresEnVivo.tsx` sin errores propios (pueden quedar errores en `PartidoDetailPage.tsx`, resuelto en Task 7).

- [ ] **Step 7: Commit**

```bash
git add src/components/partido/ContadoresEnVivo.tsx
git commit -m "refactor: ContadoresEnVivo escribe en la tabla eventos y fusiona cronología con el jsonb restante"
```

---

## Task 7: `PartidoDetailPage.tsx` — cargar eventos y pasarlos a `ContadoresEnVivo`/`FichaTecnica`

**Files:**
- Modify: `src/pages/PartidoDetailPage.tsx`

**Interfaces:**
- Consumes: `cargarEventosEquipo` de `@/lib/eventos` (Task 4); nuevas props de `ContadoresEnVivo` (Task 6) y `FichaTecnica` (Task 8).

- [ ] **Step 1: Cargar eventos del partido**

```tsx
import { cargarEventosEquipo } from "@/lib/eventos";
// ...
  const [eventos, setEventos] = useState<EventosRow[]>([]);
// ...
  useEffect(() => {
    cargarEventosEquipo(equipoId).then((todos) => setEventos(todos.filter((e) => e.partido_id === partidoId)));
  }, [equipoId, partidoId]);
```
(Añadir `EventosRow` al import de tipos: `import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";`)

- [ ] **Step 2: Quitar la línea `const eventos = partido.estadisticas.eventos ?? [];`** (línea 75 del original) — el nombre `eventos` pasa a referirse al nuevo estado de la tabla (Step 1). Cambiar el botón que decide "Iniciar" vs "Continuar partido en directo" (línea 188 del original) de:
```tsx
        {eventos.length > 0 ? "Continuar partido en directo" : "Iniciar partido en directo"}
```
a:
```tsx
        {eventos.length > 0 || (partido.estadisticas.eventos ?? []).length > 0
          ? "Continuar partido en directo"
          : "Iniciar partido en directo"}
```
para no perder el "Continuar" si el partido solo tiene toques jsonb (7m provocado, sustituciones) todavía.

- [ ] **Step 3: Pasar las nuevas props**

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
  // ...
  if (vista === "ficha") {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Ficha técnica" eyebrow={`vs ${partido.rival}`} onBack={() => setVista("info")} backLabel="Partido" />
        <FichaTecnica partido={partido} jugadores={jugadores} eventos={eventos} />
      </div>
    );
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: `src/pages/PartidoDetailPage.tsx` sin errores propios.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PartidoDetailPage.tsx
git commit -m "feat: PartidoDetailPage carga los eventos de la tabla y los pasa al marcador en vivo y la ficha técnica"
```

---

## Task 8: `FichaTecnica.tsx` — leer de la tabla `eventos`

**Files:**
- Modify: `src/components/partido/FichaTecnica.tsx` (reescritura completa, es corto)

- [ ] **Step 1: Reescribir**

```tsx
import { ACCIONES_TABLA, contarTabla, eficaciaLanzamiento, golesContra, golesFavor, marcadorPartido } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

export function FichaTecnica({
  partido,
  jugadores,
  eventos,
}: {
  partido: PartidosRow;
  jugadores: JugadoresRow[];
  eventos: EventosRow[];
}) {
  const favor = golesFavor(eventos);
  const contra = golesContra(eventos);
  const eficacia = eficaciaLanzamiento(eventos);
  const hayEventos = eventos.length > 0;

  const buscar = (label: string) => ACCIONES_TABLA.find((a) => a.label === label)!;
  const stats: { label: string; valor: number | string }[] = [
    { label: "Goles a favor", valor: favor },
    { label: "Goles en contra", valor: contra },
    { label: "Paradas portero", valor: contarTabla(eventos, buscar("Parada portero")) },
    { label: "Balones ganados", valor: contarTabla(eventos, buscar("Balón ganado")) },
    { label: "Balones perdidos", valor: contarTabla(eventos, buscar("Balón perdido")) },
    { label: "Tiros fallados", valor: contarTabla(eventos, buscar("Tiro fallado")) },
    { label: "7m fallados", valor: contarTabla(eventos, buscar("7m fallado")) },
    { label: "Exclusiones", valor: contarTabla(eventos, buscar("Exclusión 2'")) },
    { label: "Eficacia de tiro", valor: eficacia !== null ? `${eficacia}%` : "—" },
  ];

  const goleadas = eventos
    .filter((e) => e.tipo === "tiro" && e.resultado === "gol")
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));

  return (
    <div className="flex flex-col gap-4">
      <div className="card-surface p-4 text-center">
        <div className="text-sm text-[var(--color-text-muted)]">
          Resultado {hayEventos && <span className="text-[var(--color-text-muted)]">(de los toques en vivo)</span>}
        </div>
        <div className="stat-number text-3xl">{marcadorPartido(partido, eventos)}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card-surface p-4">
            <div className="stat-number text-2xl">{s.valor}</div>
            <div className="text-sm text-[var(--color-text-muted)]">{s.label}</div>
          </div>
        ))}
      </div>

      {goleadas.length > 0 && (
        <div className="card-surface p-4">
          <div className="mb-3 text-sm font-medium text-[var(--color-accent)]">Goles</div>
          <div className="flex flex-col gap-1.5">
            {goleadas.map((e) => {
              const jugador = e.jugador_id ? jugadores.find((j) => j.id === e.jugador_id) : null;
              const esPropio = e.equipo_origen === "propio";
              return (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={esPropio ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>
                    {esPropio
                      ? jugador
                        ? `Gol de ${jugador.nombre}${e.es_penalti ? " (7m)" : ""}`
                        : `Gol propio${e.es_penalti ? " (7m)" : ""}`
                      : `Gol de ${partido.rival}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(partido.problemas_detectados || partido.acciones_siguiente_semana || partido.notas_adicionales) && (
        <div className="card-surface flex flex-col gap-3 p-4">
          {partido.problemas_detectados && (
            <div>
              <div className="text-sm font-medium text-[var(--color-accent)]">Problemas detectados</div>
              <p className="whitespace-pre-line text-sm">{partido.problemas_detectados}</p>
            </div>
          )}
          {partido.acciones_siguiente_semana && (
            <div>
              <div className="text-sm font-medium text-[var(--color-accent)]">Acciones para la semana siguiente</div>
              <p className="whitespace-pre-line text-sm">{partido.acciones_siguiente_semana}</p>
            </div>
          )}
          {partido.notas_adicionales && (
            <div>
              <div className="text-sm font-medium text-[var(--color-accent)]">Notas adicionales</div>
              <p className="whitespace-pre-line text-sm">{partido.notas_adicionales}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

Nota: se pierde el orden "por minuto" y la etiqueta de minuto en "Goles" (la tabla `eventos` no guarda `minuto`, a diferencia del jsonb — el minuto de partido no formaba parte del diseño que pidió el usuario para esta tabla). Señalarlo al mostrar el resultado del Punto 1; si el usuario lo quiere de vuelta, la opción más simple es ordenar por `creado_en` (ya hecho) y, si hace falta el minuto, añadir una columna `minuto` a `eventos` en una migración posterior.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: `src/components/partido/FichaTecnica.tsx` sin errores propios.

- [ ] **Step 3: Commit**

```bash
git add src/components/partido/FichaTecnica.tsx
git commit -m "refactor: FichaTecnica lee estadísticas de la tabla eventos"
```

---

## Task 9: `PartidoPage.tsx` e `InicioPage.tsx` — marcador/resultado en listas

**Files:**
- Modify: `src/pages/PartidoPage.tsx`
- Modify: `src/pages/InicioPage.tsx`

**Interfaces:**
- Consumes: `cargarEventosEquipo`, `agruparPorPartido` de `@/lib/eventos` (Task 4); firmas nuevas de `resultadoPartido`/`marcadorPartido`/`resumenResultados` (Task 5).

- [ ] **Step 1: `PartidoPage.tsx` — cargar eventos junto a partidos**

```tsx
import { cargarEventosEquipo, agruparPorPartido } from "@/lib/eventos";
import type { EventosRow, PartidosRow } from "@/types/database";
// ...
  const [eventosPorPartido, setEventosPorPartido] = useState<Map<string, EventosRow[]>>(new Map());
// ...
  async function cargar() {
    const { data } = await supabase.from("partidos").select("*").eq("equipo_id", equipoId).order("fecha", { ascending: false });
    const base = data ?? (await leerCache<PartidosRow>("partidos", equipoId)) ?? [];
    if (data) void guardarCache("partidos", equipoId, data);
    const cola = await obtenerCola();
    setPartidos(aplicarPendientes("partidos", base, cola).sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setEventosPorPartido(agruparPorPartido(await cargarEventosEquipo(equipoId)));
    setCargando(false);
  }
```

Actualizar `PartidoItem`:
```tsx
  function PartidoItem({ p }: { p: PartidosRow }) {
    const eventosP = eventosPorPartido.get(p.id) ?? [];
    const resultado = resultadoPartido(p, eventosP);
    const badge = resultado ? RESULTADO_BADGE[resultado] : null;
    // ... (el resto igual, cambiando `marcadorPartido(p)` por `marcadorPartido(p, eventosP)`)
```

- [ ] **Step 2: `InicioPage.tsx` — cargar eventos junto al resto de datos del `Promise.all`**

```tsx
import { cargarEventosEquipo, agruparPorPartido } from "@/lib/eventos";
import type { EventosRow, /* resto igual */ } from "@/types/database";
// ...
  const [eventosPorPartido, setEventosPorPartido] = useState<Map<string, EventosRow[]>>(new Map());
// ...
      const [s, p, h, mc, ms, j, a, ev] = await Promise.all([
        supabase.from("sesiones").select("*").eq("equipo_id", equipoId),
        supabase.from("partidos").select("*").eq("equipo_id", equipoId).order("fecha", { ascending: false }),
        supabase.from("horario_recurrente").select("*").eq("equipo_id", equipoId),
        supabase.from("microciclos").select("*").eq("equipo_id", equipoId),
        supabase.from("mesociclos").select("*").eq("equipo_id", equipoId),
        supabase.from("jugadores").select("*").eq("equipo_id", equipoId),
        supabase.from("asistencia").select("*").eq("equipo_id", equipoId),
        cargarEventosEquipo(equipoId),
      ]);
      // ...
      setEventosPorPartido(agruparPorPartido(ev));
```

Actualizar los 3 usos:
```tsx
  const ultimosResultados = partidos.filter((p) => resultadoPartido(p, eventosPorPartido.get(p.id) ?? []) !== null).slice(0, 4);
  const record = resumenResultados(partidos, eventosPorPartido);
  // ... dentro del .map de ultimosResultados:
              const r = resultadoPartido(p, eventosPorPartido.get(p.id) ?? [])!;
              // ...
              <span className="stat-number shrink-0 text-lg">{marcadorPartido(p, eventosPorPartido.get(p.id) ?? [])}</span>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: `PartidoPage.tsx` e `InicioPage.tsx` sin errores propios.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PartidoPage.tsx src/pages/InicioPage.tsx
git commit -m "refactor: PartidoPage e InicioPage calculan resultado/marcador desde la tabla eventos"
```

---

## Task 10: `ProgresoPage.tsx` — agregados de temporada

**Files:**
- Modify: `src/pages/ProgresoPage.tsx`

- [ ] **Step 1: Cargar eventos junto al resto**

```tsx
import { agruparPorPartido, cargarEventosEquipo } from "@/lib/eventos";
import type { EventosRow, /* resto igual */ } from "@/types/database";
// ...
  const [eventos, setEventos] = useState<EventosRow[]>([]);
// ...
      const [{ data: p }, { data: a }, { data: s }, { data: j }, ev] = await Promise.all([
        supabase.from("partidos").select("*").eq("equipo_id", equipoId).order("fecha", { ascending: true }),
        supabase.from("asistencia").select("*").eq("equipo_id", equipoId),
        supabase.from("sesiones").select("*").eq("equipo_id", equipoId),
        supabase.from("jugadores").select("*").eq("equipo_id", equipoId),
        cargarEventosEquipo(equipoId),
      ]);
      setPartidos(p ?? []);
      setAsistencia(a ?? []);
      setSesiones(s ?? []);
      setJugadores(j ?? []);
      setEventos(ev);
```

- [ ] **Step 2: `eventosPorPartido` (map, reutilizando `agruparPorPartido` de `@/lib/eventos`) para los usos por partido, y sustituir los bucles sobre jsonb**

```tsx
  const eventosPorPartido = agruparPorPartido(eventos);

  // --- Resultados / jornadas ---------------------------------------------
  const jornadas = partidos
    .map((partido) => ({ partido, marcador: marcadorNumerico(partido, eventosPorPartido.get(partido.id) ?? []) }))
    .filter((x): x is { partido: PartidosRow; marcador: { favor: number; contra: number } } => x.marcador !== null);

  const { g, e, p: perd } = resumenResultados(partidos, eventosPorPartido);
  // ... (resto de jornadas/puntos/etc. sin cambios, ya usan `jornadas`/`g`/`e`/`perd`)

  // --- Juego vs 7 metros ---------------------------------------------------
  let favorJuego = 0;
  let favor7m = 0;
  for (const e of eventos) {
    if (e.tipo === "tiro" && e.equipo_origen === "propio" && e.resultado === "gol") {
      if (e.es_penalti) favor7m++;
      else favorJuego++;
    }
  }
```

Y en "Máximos goleadores":
```tsx
  const golesPorJugador = new Map<string, number>();
  for (const e of eventos) {
    if (!e.jugador_id) continue;
    if (e.tipo === "tiro" && e.equipo_origen === "propio" && e.resultado === "gol") {
      golesPorJugador.set(e.jugador_id, (golesPorJugador.get(e.jugador_id) ?? 0) + 1);
    }
  }
```

Y en "Racha" (dentro del JSX, `resultadoPartido(partido)!` → `resultadoPartido(partido, eventosPorPartido.get(partido.id) ?? [])!`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: `src/pages/ProgresoPage.tsx` sin errores propios.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ProgresoPage.tsx
git commit -m "refactor: ProgresoPage calcula agregados de temporada desde la tabla eventos"
```

---

## Task 11: `JugadorDetailPage.tsx` — estadísticas individuales

**Files:**
- Modify: `src/pages/JugadorDetailPage.tsx`

- [ ] **Step 1: Cargar eventos del jugador junto al resto**

```tsx
import { cargarEventosEquipo } from "@/lib/eventos";
import { eficaciaLanzamiento, minutosJugados } from "@/lib/partidoStats";
import type { AsistenciaRow, EventosRow, JugadoresRow, PartidosRow, SesionesRow } from "@/types/database";
// ...
  const [eventos, setEventos] = useState<EventosRow[]>([]);
// ...
  async function cargar() {
    if (!jugadorId) return;
    setCargando(true);
    const [j, p, a, s, ev] = await Promise.all([
      supabase.from("jugadores").select("*").eq("id", jugadorId).maybeSingle(),
      supabase.from("partidos").select("*").eq("equipo_id", equipoId),
      supabase.from("asistencia").select("*").eq("equipo_id", equipoId).eq("jugador_id", jugadorId),
      supabase.from("sesiones").select("*").eq("equipo_id", equipoId),
      cargarEventosEquipo(equipoId),
    ]);
    setJugador(j.data ?? null);
    setPartidos(p.data ?? []);
    setAsistencia(a.data ?? []);
    setSesiones(s.data ?? []);
    setEventos(ev);
    setCargando(false);
  }
```

- [ ] **Step 2: Sustituir el bucle de estadísticas**

```tsx
  // Goles y demás: eventos de la tabla `eventos` atribuidos a este jugador.
  // Minutos jugados sigue viniendo del jsonb (entra_pista/sale_pista, sin migrar).
  let goles = 0;
  let exclusiones = 0;
  let balonesPerdidos = 0;
  let minutosTotales = 0;
  let partidosConMinutos = 0;
  const partidosConEventoDelJugador = new Set<string>();
  const eventosDelJugador = eventos.filter((e) => e.jugador_id === jugador.id);
  for (const e of eventosDelJugador) {
    if (!e.partido_id) continue;
    partidosConEventoDelJugador.add(e.partido_id);
    if (e.tipo === "tiro" && e.resultado === "gol") goles++;
    if (e.tipo === "perdida" && e.equipo_origen === "propio") balonesPerdidos++;
    if (e.tipo === "exclusion") exclusiones++;
  }
  for (const p of partidos) {
    const minParaEstePartido = minutosJugados(p.estadisticas.eventos ?? [], jugador.id);
    if (minParaEstePartido > 0) {
      minutosTotales += minParaEstePartido;
      partidosConMinutos++;
    }
  }
  const partidosJugados = partidosConEventoDelJugador.size;
  const eficaciaLanzamientoPct = eficaciaLanzamiento(eventosDelJugador, jugador.id);
  const perdidasPorPartido = partidosJugados > 0 ? (balonesPerdidos / partidosJugados).toFixed(1) : null;
  const minutosPorPartido = partidosConMinutos > 0 ? Math.round(minutosTotales / partidosConMinutos) : null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: `src/pages/JugadorDetailPage.tsx` sin errores propios.

- [ ] **Step 4: Commit**

```bash
git add src/pages/JugadorDetailPage.tsx
git commit -m "refactor: JugadorDetailPage lee estadísticas individuales de la tabla eventos"
```

---

## Task 12: `JugadoresSection.tsx` — goles en la lista de plantilla

**Files:**
- Modify: `src/components/equipo/JugadoresSection.tsx`

- [ ] **Step 1: Cargar eventos junto a jugadores/partidos**

```tsx
import { cargarEventosEquipo } from "@/lib/eventos";
import type { EventosRow, JugadoresRow } from "@/types/database";
// ...
  const [eventos, setEventos] = useState<EventosRow[]>([]);
// ...
  async function cargar() {
    setCargando(true);
    const [j, ev] = await Promise.all([
      supabase.from("jugadores").select("*").eq("equipo_id", equipoId).order("dorsal", { nullsFirst: false }),
      cargarEventosEquipo(equipoId),
    ]);
    setJugadores(j.data ?? []);
    setEventos(ev);
    setCargando(false);
  }
```

(Se retira `partidos`/`PartidosRow`, ya no hace falta — `golesDe` pasa a leer directamente de `eventos`.)

- [ ] **Step 2: Reescribir `golesDe`**

```tsx
  function golesDe(jugadorId: string): number {
    return eventos.filter((e) => e.jugador_id === jugadorId && e.tipo === "tiro" && e.equipo_origen === "propio" && e.resultado === "gol").length;
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: `src/components/equipo/JugadoresSection.tsx` sin errores propios. En este punto, `npx tsc -b --noEmit` sobre todo el proyecto debería quedar limpio.

- [ ] **Step 4: Commit**

```bash
git add src/components/equipo/JugadoresSection.tsx
git commit -m "refactor: JugadoresSection cuenta goles desde la tabla eventos"
```

---

## Task 13: Verificación final y lint

**Files:** ninguno nuevo — solo comandos.

- [ ] **Step 1: Typecheck completo**

Run: `npx tsc -b --noEmit`
Expected: sin errores en todo el proyecto.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sin errores (los `eslint-disable-next-line @typescript-eslint/no-explicit-any` existentes en `queue.ts` no cambian).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build correcto (confirma también que `vite-plugin-pwa` no falla con el bundle nuevo).

- [ ] **Step 4: Prueba manual en el navegador**

Run: `npm run dev`, y con un equipo/partido real:
1. Abrir un partido existente (o crear uno) → "Iniciar partido en directo".
2. Pulsar cada botón del grid de acciones (gol a favor, gol en contra, parada portero, balón ganado, balón perdido, tiro fallado, 7m metido, 7m fallado, exclusión) y comprobar que el contador de cada botón sube y que aparece en la cronología con el jugador correcto.
3. Pulsar "7m provocado"/"7m cometido" y "Entra"/"Sale" y comprobar que también aparecen en la cronología, mezclados cronológicamente con los anteriores.
4. Pulsar "Deshacer" varias veces seguidas y comprobar que borra siempre el toque más reciente de la cronología, sea cual sea su tipo.
5. Volver a "Partido" (vista info) y a "Ficha técnica": marcador y estadísticas deben coincidir con lo registrado.
6. Ir a la lista de Partido (`/equipos/:id/partido`) y a Inicio: marcador/badge de resultado correctos para el partido recién tocado.
7. Ir a Progreso: "Juego vs 7 metros" y "Máximos goleadores" reflejan los goles metidos.
8. Ir a la ficha de un jugador que haya marcado/perdido balones/sido excluido en la prueba: los contadores cuadran.
9. Con el DevTools en modo "Offline", repetir el paso 2 un par de veces, comprobar que el marcador se actualiza igual (optimista) y que al volver a marcar "Online" los eventos se sincronizan (recargar la página y comprobar que persisten).

Si algo no cuadra, anotar el desajuste concreto (pantalla + dato esperado vs mostrado) antes de continuar — no hay suite automática que lo detecte por este cambio.

- [ ] **Step 5: Resumen para mostrar al usuario**

No es un commit — es el cierre del Punto 1: preparar un resumen breve con (a) las dos desviaciones deliberadas del DDL original (`zona` nullable, sin migrar cronómetro/sustituciones/7m-provocado-cometido), (b) la pérdida de "orden por minuto" y etiqueta de minuto en los goles de la Ficha técnica (Task 8), y (c) confirmación de que `mcp__supabase__get_advisors` no marcó nada nuevo, para que el usuario decida si sigue con el Punto 2 (cuadrícula de portería) tal cual o pide ajustar algo primero.
