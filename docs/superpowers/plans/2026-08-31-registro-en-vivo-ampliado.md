# Registro en vivo ampliado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el panel de "Partido en directo" del Punto 2 por una pantalla ampliada — origen del lanzamiento, tarjetas (amarilla/azul/roja), portero y robo atribuidos a jugador propio, selección de jugador obligatoria, flujo bidireccional acción↔zona, mapa de calor, panel de estadísticas en vivo, y layout responsive tablet-primero.

**Architecture:** Una migración añade `origen`/`color_tarjeta` a `eventos` y amplía el enum `tipo` con `'tarjeta'`. `partidoStats.ts` gana los tipos/funciones de conteo nuevos y pierde el patrón genérico `contarTabla`/`ACCIONES_INSTANTANEAS`-derivado (ya no hace falta: cada categoría tiene su propia función de conteo directa). Dos componentes nuevos (`OrigenChips`, `PanelStats`) más un `CuadriculaPorteria` extendido con mapa de calor. `ContadoresEnVivo.tsx` se reescribe por completo: grupos apilados (Tiro/Portero/Pérdida-Robo/Sanción/Otros), jugador obligatorio, layout de 2 grids responsive (colapsa a 1 columna en móvil, 3+2 columnas desde `lg`), atajos de teclado.

**Tech Stack:** React 19 + TypeScript + Vite, Supabase (Postgres + RLS). Sin test runner — verificación vía `tsc -b`, `eslint`, `npm run build`, revisión del agente `ui-estetica`, prueba manual del usuario.

**Spec:** `docs/superpowers/specs/2026-08-31-registro-en-vivo-ampliado-design.md`

## Global Constraints

- Todo en español (UI, comentarios, mensajes).
- Marca del proyecto, no la del mockup: tinta + rojo (`var(--color-accent)`), Barlow Condensed/Archivo autoalojadas — nunca el naranja/Public Sans/IBM Plex Mono del mockup ni Google Fonts CDN.
- **Task 1 (migración) la ejecuta el agente `db-schema`.**
- RLS ya cubierta por la política existente de `eventos` (`private.equipo_del_entrenador`) — esta migración solo añade columnas a una tabla ya protegida, no toca RLS.
- **Corrección respecto al spec aprobado:** el spec dice en dos sitios distintos cosas contradictorias sobre "Gol en contra" — la sección "Data Model" dice que "Parada / Gol recibido" (son la misma acción) se atribuyen al portero; la sección "Alcance del catálogo" dice más abajo que "Gol en contra" se queda sin jugador. El mockup original (`gk_gol`, categoría "Portero") confirma que SÍ se atribuye al portero seleccionado, igual que "Parada" — es la lectura correcta, la que se implementa aquí. Con esto, **todo evento requiere jugador seleccionado, sin ninguna excepción** (más simple que el spec, que dejaba una excepción).
- Sin test runner: cada task se verifica con `npx tsc -b --noEmit`, `npm run lint`, prueba manual en `npm run dev` para los tasks de UI.

---

## Task 1: Migración — `origen`, `color_tarjeta`, tipo `'tarjeta'`

**Ejecutar con el agente `db-schema`.**

**Files:**
- Create: `supabase/migrations/0018_eventos_tarjeta_origen.sql`

**Interfaces:**
- Produces: columnas `eventos.origen` (9 valores, solo `tipo='tiro'`) y `eventos.color_tarjeta` (3 valores, solo `tipo='tarjeta'`); `tipo` admite `'tarjeta'` además de `tiro`/`perdida`/`exclusion`.

- [ ] **Step 1: Escribir la migración**

Los nombres de constraint reales en la base ya se han verificado (`eventos_tipo_check` es el nombre autogenerado del check inline de `tipo` en 0017_eventos.sql):

```sql
-- supabase/migrations/0018_eventos_tarjeta_origen.sql
--
-- Amplía `eventos` para el registro en vivo ampliado (ver
-- docs/superpowers/specs/2026-08-31-registro-en-vivo-ampliado-design.md):
--   - Nuevo tipo 'tarjeta' (amonestación amarilla/azul/roja) — distinta de
--     'exclusion' (los 2 minutos): un jugador puede tener las dos a la vez,
--     así que van en filas separadas, no como variantes de la misma.
--   - `origen`: desde dónde se lanzó el tiro (lateral, extremo, pivote, 9m,
--     contragolpe, 7m...) — dato aparte de `zona`, que es a dónde entra/para
--     el tiro dentro de la portería. Solo aplica a tipo='tiro'.
--
-- Sin backfill: no hay filas de tipo 'tarjeta' históricas, y `origen` no se
-- puede reconstruir a posteriori para los tiros ya registrados — se queda
-- `null` en las filas antiguas, igual que `zona` quedó `null` en el backfill
-- de 0017_eventos.sql.

alter table eventos drop constraint eventos_tipo_check;
alter table eventos add constraint eventos_tipo_check
  check (tipo = any (array['tiro', 'perdida', 'exclusion', 'tarjeta']));

alter table eventos add column origen text
  check (origen = any (array['ext_izq', 'lat_izq', 'central', 'lat_der', 'ext_der', 'pivote', '9m', 'contragolpe', '7m']));
alter table eventos add constraint eventos_origen_solo_tiro
  check (origen is null or tipo = 'tiro');

alter table eventos add column color_tarjeta text
  check (color_tarjeta = any (array['amarilla', 'azul', 'roja']));
alter table eventos add constraint eventos_color_tarjeta_solo_tarjeta
  check (color_tarjeta is null or tipo = 'tarjeta');
```

- [ ] **Step 2: Aplicar y verificar**

Usar `mcp__supabase__apply_migration` (nombre `eventos_tarjeta_origen`) con el SQL de arriba, escribir el mismo SQL en el archivo del repo, y confirmar con `mcp__supabase__get_advisors` (tipo `security`) que no aparece nada nuevo. Sanity check:

```sql
select column_name, data_type from information_schema.columns where table_name = 'eventos' order by ordinal_position;
```

Debe mostrar `origen` y `color_tarjeta` como `text`, nullable.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0018_eventos_tarjeta_origen.sql
git commit -m "feat: añade origen del lanzamiento y tarjetas a la tabla eventos"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/eventos.ts:29-52` (función `registrarEvento`)

**Interfaces:**
- Produces: `OrigenLanzamiento`, `ColorTarjeta`, `TipoEvento` con `'tarjeta'`, `EventosRow` con `origen`/`color_tarjeta`, entrada `eventos` en `Database.public.Tables` actualizada. `registrarEvento` deja de perder `origen`/`color_tarjeta` al reconstruir la fila.

- [ ] **Step 1: Ampliar los tipos de `eventos`**

```ts
export type EquipoOrigenEvento = "propio" | "rival";
export type TipoEvento = "tiro" | "perdida" | "exclusion" | "tarjeta";
export type ResultadoTiro = "gol" | "fuera" | "parado" | "poste";
export type OrigenLanzamiento = "ext_izq" | "lat_izq" | "central" | "lat_der" | "ext_der" | "pivote" | "9m" | "contragolpe" | "7m";
export type ColorTarjeta = "amarilla" | "azul" | "roja";

/** Evento individual de partido/entrenamiento (tabla `eventos`, ver
 * 0017_eventos.sql / 0018_eventos_tarjeta_origen.sql). */
export type EventosRow = {
  id: UUID;
  equipo_id: UUID;
  partido_id: UUID | null;
  sesion_id: UUID | null;
  jugador_id: UUID | null;
  equipo_origen: EquipoOrigenEvento;
  tipo: TipoEvento;
  resultado: ResultadoTiro | null;
  /** Zona de portería 1-9 (rejilla 3x3) — a dónde entra/para el tiro. Null:
   * zona desconocida (histórico) o tipo != 'tiro'. */
  zona: number | null;
  /** Desde dónde se lanzó. Null: histórico anterior a esta columna, puesto
   * del jugador sin mapeo conocido, o tipo != 'tiro'. */
  origen: OrigenLanzamiento | null;
  es_penalti: boolean;
  /** Solo tipo='tarjeta'. */
  color_tarjeta: ColorTarjeta | null;
  creado_en: string;
};
```

(Reemplaza el bloque `EquipoOrigenEvento`/`TipoEvento`/`ResultadoTiro`/`EventosRow` ya existente.)

- [ ] **Step 2: Actualizar `Database.public.Tables.eventos`**

```ts
      eventos: TableDef<
        EventosRow,
        "id" | "partido_id" | "sesion_id" | "jugador_id" | "resultado" | "zona" | "origen" | "es_penalti" | "color_tarjeta" | "creado_en"
      >;
```

- [ ] **Step 3: Corregir `registrarEvento` en `src/lib/eventos.ts` — no perder los campos nuevos**

`registrarEvento` reconstruye la fila campo a campo en vez de reenviar `datos` tal cual (para poder rellenar `id`/`creado_en` y aplicar los `?? null` de los opcionales) — sin este paso, `origen`/`color_tarjeta` se perderían silenciosamente al guardar, aunque el llamante los rellene. Añadir las dos líneas que faltan dentro del objeto `fila`:

```ts
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
    origen: datos.origen ?? null,
    es_penalti: datos.es_penalti ?? false,
    color_tarjeta: datos.color_tarjeta ?? null,
    creado_en: new Date().toISOString(),
  };
```

(`datos` es `Omit<EventoInsert, "id" | "creado_en">` — no tiene `creado_en`, por eso se sigue generando aquí, igual que antes.)

(El resto de la función, `registrarEvento`/`borrarEvento`/`cargarEventosEquipo`/`agruparPorPartido`, no cambia.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: errores solo en los archivos que usan los tipos/funciones que cambian en los tasks siguientes (`partidoStats.ts` y sus consumidores).

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts src/lib/eventos.ts
git commit -m "feat: tipos de origen del lanzamiento y tarjeta en la tabla eventos"
```

---

## Task 3: `partidoStats.ts` — nuevas funciones, limpieza de las que ya no hacen falta

**Files:**
- Modify: `src/lib/partidoStats.ts`

**Interfaces:**
- Consumes: `OrigenLanzamiento`, `ColorTarjeta` de `@/types/database` (Task 2).
- Produces: `ETIQUETAS_ORIGEN`, `ORIGENES`, `origenPorPuesto`, `esPortero`, `BOTONES_TARJETA` (con `hex`), `tirosTotales`, `robos`, `perdidas`, `exclusiones`, `tarjetas`. **Elimina** `ACCIONES_PERDIDA_EXCLUSION` y `contarTabla` (ya no los usa nadie tras este plan — cada categoría tiene ahora su propia función de conteo directa, más simple que el patrón genérico anterior).

- [ ] **Step 1: Sustituir `ACCIONES_PERDIDA_EXCLUSION` y `contarTabla` por las funciones directas**

Reemplazar el bloque (definido en el Punto 2):
```ts
export const ACCIONES_PERDIDA_EXCLUSION: { ... }[] = [ ... ];
```
y
```ts
export function contarTabla(eventos: EventosRow[], accion: (typeof ACCIONES_PERDIDA_EXCLUSION)[number]): number { ... }
```

por:

```ts
/** Balones robados (perdida del rival, atribuida al jugador propio que la hizo). */
export function robos(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "perdida" && e.equipo_origen === "rival").length;
}

/** Balones perdidos propios. */
export function perdidas(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "perdida" && e.equipo_origen === "propio").length;
}

export function exclusiones(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "exclusion").length;
}

export function tarjetas(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tarjeta").length;
}

/** Tiros propios totales, cualquier resultado (para el contador del grupo "Tiro" en el panel de stats). */
export function tirosTotales(eventos: EventosRow[]): number {
  return eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio").length;
}

export type BotonTarjeta = { color: ColorTarjeta; label: string; hex: string };

export const BOTONES_TARJETA: BotonTarjeta[] = [
  { color: "amarilla", label: "Amarilla", hex: "#f0c419" },
  { color: "azul", label: "Azul", hex: "#3d8ad6" },
  { color: "roja", label: "Roja", hex: "var(--color-accent)" },
];
```

- [ ] **Step 2: Añadir origen — etiquetas, lista, y preselección por puesto**

```ts
export const ETIQUETAS_ORIGEN: Record<OrigenLanzamiento, string> = {
  ext_izq: "Ext. izq.",
  lat_izq: "Lat. izq.",
  central: "Central",
  lat_der: "Lat. der.",
  ext_der: "Ext. der.",
  pivote: "Pivote",
  "9m": "9 m",
  contragolpe: "Contragolpe",
  "7m": "7 m",
};

export const ORIGENES: OrigenLanzamiento[] = [
  "ext_izq", "lat_izq", "central", "lat_der", "ext_der", "pivote", "9m", "contragolpe", "7m",
];

/** Preselecciona el origen del lanzamiento según el puesto del jugador.
 * `jugadores.puesto` es texto libre (poblado desde la carga de Excel) — los
 * valores reales en producción son "Central", "Extremo derecho", "Lateral
 * derecho", "Lateral izquierdo", "Pivote", "Portero" (verificado contra la
 * base en vivo). Coincidencia laxa (insensible a mayúsculas, por palabras
 * clave) para tolerar variantes futuras; si no reconoce nada, no
 * preselecciona — nunca debe bloquear el registro. */
export function origenPorPuesto(puesto: string | null): OrigenLanzamiento | null {
  if (!puesto) return null;
  const p = puesto.toLowerCase();
  if (p.includes("pivote")) return "pivote";
  if (p.includes("extremo") && p.includes("izquierd")) return "ext_izq";
  if (p.includes("extremo") && p.includes("derech")) return "ext_der";
  if (p.includes("lateral") && p.includes("izquierd")) return "lat_izq";
  if (p.includes("lateral") && p.includes("derech")) return "lat_der";
  if (p.includes("central")) return "central";
  return null;
}

/** Mismo criterio laxo que `origenPorPuesto`. */
export function esPortero(puesto: string | null): boolean {
  return !!puesto && puesto.toLowerCase().includes("portero");
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: errores en `ContadoresEnVivo.tsx` y `FichaTecnica.tsx` (usan `ACCIONES_PERDIDA_EXCLUSION`/`contarTabla`, que ya no existen) — se resuelven en los Tasks 7 y 8. Ningún error debe apuntar ya a `partidoStats.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/partidoStats.ts
git commit -m "refactor: partidoStats.ts añade origen/tarjetas y sustituye contarTabla por conteos directos"
```

---

## Task 4: `CuadriculaPorteria.tsx` — mapa de calor, `tocable`/`resaltado`

**Files:**
- Modify: `src/components/partido/CuadriculaPorteria.tsx` (reescritura completa, es corto)

**Interfaces:**
- Produces: props `{ tocable: boolean; resaltado: boolean; compacto?: boolean; onZona: (zona: number) => void; conteosPorZona: Record<number, number> }` — sustituye la firma anterior `{ activo, compacto, onZona }` del Punto 2. `tocable` = hay jugador seleccionado (si no, atenuada e inerte). `resaltado` = hay una acción o zona pendiente (borde en acento). Mapa de calor con toggle propio, por defecto activado.

- [ ] **Step 1: Reescribir el archivo**

```tsx
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Rejilla 3×3 de zonas de portería (1-9, de izquierda a derecha y de arriba a
 * abajo, vista de frente a la portería). Siempre presente en el panel de
 * "Partido en directo": atenuada e intocable sin jugador seleccionado
 * (`tocable=false`); tocable en cuanto hay alguien seleccionado, y resaltada
 * en acento cuando hay una acción o una zona ya armada esperando la otra
 * mitad del registro (flujo bidireccional, ver ContadoresEnVivo.tsx).
 *
 * El mapa de calor (activado por defecto) tiñe cada zona según su recuento en
 * `conteosPorZona` — lo calcula el llamante (normalmente filtrado por el
 * jugador seleccionado, o total de equipo si no hay selección).
 *
 * El componente no decide QUÉ evento se crea al tocar una zona (lo decide
 * `onZona`, en el llamante): solo dibuja la portería y reporta el toque.
 * Reutilizable en los tres contextos donde hace falta zona: tiro propio y del
 * rival en partido, y tiro propio en entrenamiento.
 *
 * Tarjeta oscura + acento rojo, igual que el resto de "Partido en directo" —
 * deliberado, no el `card-surface` claro habitual, para que se vea igual en
 * cualquier pantalla donde se monte.
 */
export function CuadriculaPorteria({
  tocable,
  resaltado,
  compacto,
  onZona,
  conteosPorZona,
}: {
  tocable: boolean;
  resaltado: boolean;
  /** En el layout apaisado de una mano, la columna donde vive es muy estrecha
   * — sin este límite, la rejilla al 100% del ancho se estira tanto de alto
   * que empuja el resto de grupos de botones fuera de la vista sin scroll. */
  compacto?: boolean;
  onZona: (zona: number) => void;
  conteosPorZona: Record<number, number>;
}) {
  const [mapaCalor, setMapaCalor] = useState(true);
  const max = Math.max(1, ...Object.values(conteosPorZona));

  return (
    <div className={cn("mx-auto flex flex-col gap-1.5", compacto && "max-w-[160px]")}>
      <div className="flex justify-end">
        <button
          onClick={() => setMapaCalor((v) => !v)}
          className={cn(
            "flex h-6 items-center rounded-md px-2 text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors",
            mapaCalor ? "bg-[var(--color-accent)] text-white" : "bg-white/[.08] text-white/50",
          )}
        >
          Mapa de calor
        </button>
      </div>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border-[3px] bg-[#15151a] transition-[border-color,opacity]",
          !tocable ? "border-white/25 opacity-40" : resaltado ? "border-[var(--color-accent)]/70" : "border-white/30",
        )}
        style={{ aspectRatio: "3 / 2" }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[.22]" preserveAspectRatio="none">
          {[1, 2].map((i) => (
            <line key={`v${i}`} x1={`${i * 33.33}%`} y1="0" x2={`${i * 33.33}%`} y2="100%" stroke="white" strokeWidth="1.5" />
          ))}
          {[1, 2].map((i) => (
            <line key={`h${i}`} x1="0" y1={`${i * 33.33}%`} x2="100%" y2={`${i * 33.33}%`} stroke="white" strokeWidth="1.5" />
          ))}
        </svg>
        <div className="relative grid h-full grid-cols-3 grid-rows-3 gap-[3px] p-[3px]">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((zona) => {
            const cnt = conteosPorZona[zona] ?? 0;
            const hot = mapaCalor && cnt > 0;
            return (
              <button
                key={zona}
                disabled={!tocable}
                onClick={() => onZona(zona)}
                aria-label={`Zona ${zona}`}
                className="flex items-center justify-center rounded-md transition-colors active:scale-[0.96] disabled:pointer-events-none"
                style={{
                  background: hot
                    ? `color-mix(in oklab, var(--color-accent) ${Math.round(22 + 58 * (cnt / max))}%, #15151a)`
                    : "rgba(255,255,255,.06)",
                }}
              >
                {hot && <span className="stat-number text-sm text-white">{cnt}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: `CuadriculaPorteria.tsx` sin errores propios (el consumidor, `ContadoresEnVivo.tsx`, se corrige en el Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/components/partido/CuadriculaPorteria.tsx
git commit -m "feat: mapa de calor y estados tocable/resaltado en CuadriculaPorteria"
```

---

## Task 5: `OrigenChips.tsx` (nuevo)

**Files:**
- Create: `src/components/partido/OrigenChips.tsx`

**Interfaces:**
- Consumes: `ETIQUETAS_ORIGEN`, `ORIGENES` de `@/lib/partidoStats` (Task 3); `OrigenLanzamiento` de `@/types/database`.
- Produces: `<OrigenChips valor={OrigenLanzamiento | null} onCambiar={(o: OrigenLanzamiento) => void} />`.

- [ ] **Step 1: Escribir el componente**

```tsx
import { cn } from "@/lib/utils";
import { ETIQUETAS_ORIGEN, ORIGENES } from "@/lib/partidoStats";
import type { OrigenLanzamiento } from "@/types/database";

/**
 * Fila de chips para marcar desde dónde se lanzó un tiro — dato aparte de la
 * zona de portería (a dónde entra). Se preselecciona según el puesto del
 * jugador (`origenPorPuesto` en partidoStats.ts, en el llamante) y queda fijo
 * hasta que se cambie a mano. Reutilizable en los mismos contextos que
 * `CuadriculaPorteria`.
 */
export function OrigenChips({
  valor,
  onCambiar,
}: {
  valor: OrigenLanzamiento | null;
  onCambiar: (o: OrigenLanzamiento) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ORIGENES.map((o) => (
        <button
          key={o}
          onClick={() => onCambiar(o)}
          className={cn(
            "flex h-7 items-center rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors",
            valor === o ? "bg-[var(--color-accent)] text-white" : "bg-white/[.08] text-white/60",
          )}
        >
          {ETIQUETAS_ORIGEN[o]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en `src/components/partido/OrigenChips.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/partido/OrigenChips.tsx
git commit -m "feat: componente de chips de origen del lanzamiento"
```

---

## Task 6: `PanelStats.tsx` (nuevo)

**Files:**
- Create: `src/components/partido/PanelStats.tsx`

**Interfaces:**
- Consumes: `eficaciaLanzamiento`, `exclusiones`, `golesFavor`, `perdidas`, `robos`, `tarjetas`, `tirosTotales` de `@/lib/partidoStats` (Task 3); `EventosRow` de `@/types/database`.
- Produces: `<PanelStats eventos={EventosRow[]} jugadorId={string | null} titulo={string} />`.

- [ ] **Step 1: Escribir el componente**

```tsx
import {
  eficaciaLanzamiento,
  exclusiones,
  golesFavor,
  perdidas,
  robos,
  tarjetas,
  tirosTotales,
} from "@/lib/partidoStats";
import type { EventosRow } from "@/types/database";

/**
 * Tarjetas de estadísticas acumuladas del partido en vivo — filtradas por
 * `jugadorId` si se pasa, totales de equipo si no. Reutiliza las mismas
 * funciones de conteo que `FichaTecnica.tsx`.
 */
export function PanelStats({
  eventos,
  jugadorId,
  titulo,
}: {
  eventos: EventosRow[];
  jugadorId: string | null;
  titulo: string;
}) {
  const filtrados = jugadorId ? eventos.filter((e) => e.jugador_id === jugadorId) : eventos;
  const eficacia = eficaciaLanzamiento(filtrados);

  const stats: { label: string; valor: string }[] = [
    { label: "Tiros", valor: String(tirosTotales(filtrados)) },
    { label: "Goles", valor: String(golesFavor(filtrados)) },
    { label: "Eficacia", valor: eficacia !== null ? `${eficacia}%` : "—" },
    { label: "Pérdidas", valor: String(perdidas(filtrados)) },
    { label: "Robos", valor: String(robos(filtrados)) },
    { label: "Exclusiones", valor: String(exclusiones(filtrados)) },
    { label: "Tarjetas", valor: String(tarjetas(filtrados)) },
  ];

  return (
    <div className="rounded-xl border border-white/[.09] bg-white/[.03] p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">{titulo}</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">Acumulado del partido</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-white/[.07] bg-white/[.04] px-2 py-1.5">
            <div className="text-[8px] font-semibold uppercase leading-tight tracking-[0.06em] text-white/40">{s.label}</div>
            <div className="stat-number mt-0.5 text-base text-white">{s.valor}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en `src/components/partido/PanelStats.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/partido/PanelStats.tsx
git commit -m "feat: panel de estadísticas acumuladas para el registro en vivo"
```

---

## Task 7: `ContadoresEnVivo.tsx` — reescritura completa

**Files:**
- Modify: `src/components/partido/ContadoresEnVivo.tsx` (reescritura completa)

**Interfaces:**
- Consumes: todo lo de los Tasks 2-6 (`OrigenChips`, `PanelStats`, `CuadriculaPorteria` extendido, funciones/tipos de `partidoStats.ts`).
- Produces: mismo contrato de props que el Punto 2 (`partido`, `equipoNombre`, `jugadores`, `eventos`, `onActualizado`, `onEventosActualizados`, `onBack`) — no cambia la firma que usa `PartidoDetailPage.tsx`, así que **ese archivo no necesita tocarse en este plan**.

**Comportamiento nuevo respecto al Punto 2:**
- Selección de jugador **obligatoria** para registrar cualquier cosa (se quita el chip "Sin asignar"). El grupo "Portero" además exige que el jugador seleccionado sea portero.
- Al seleccionar un jugador se preselecciona `origen` según su puesto y se limpian pendientes.
- Flujo bidireccional: tocar una acción de tiro/portero arma esa acción (o, si ya hay una zona pendiente de tocarse primero, completa el registro con esa zona); tocar una zona arma esa zona (o completa si ya había una acción pendiente). Tocar el mismo botón/zona ya armado lo desarma. Botón "Anular" limpia ambos pendientes sin registrar.
- Grupos: **Tiro** (Gol/Parado/Fuera/Poste, como el Punto 2) · **Portero** (Parada/Gol en contra, ahora exige portero seleccionado y se atribuyen a su `jugador_id`) · **Pérdida / Robo** (2 botones) · **Sanción** (Exclusión 2' + 3 tarjetas) · **Otros** (7m provocado/cometido, jsonb, sin cambios).
- Barra de estado de una línea + botón "Anular" al pie del panel de acción.
- Atajos de teclado `Z` (deshacer) y `Espacio` (pausa/inicia, solo si el foco está en `body`).
- Cronología: nueva columna de detalle (zona + origen) para tiros, nueva etiqueta/color para tarjetas.
- Layout: dos grids responsive (`Jugador | Zona | Acción` y `Stats | Cronología`), una columna en móvil, la estructura completa desde `lg:`. El layout apaisado de una mano (`compacto`, viewport corto) se mantiene como variante estrecha aparte, sin el panel de stats (para no perder espacio vertical en ese caso).

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { useEffect, useState } from "react";
import { ChevronLeft, LogIn, LogOut, Pause, Play, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import { borrarEvento, registrarEvento } from "@/lib/eventos";
import { CuadriculaPorteria } from "@/components/partido/CuadriculaPorteria";
import { OrigenChips } from "@/components/partido/OrigenChips";
import { PanelStats } from "@/components/partido/PanelStats";
import { useFullscreenHorizontal } from "@/hooks/useFullscreenHorizontal";
import { useMovilHorizontal } from "@/hooks/useMovilHorizontal";
import {
  ACCIONES_JSONB,
  BOTONES_TARJETA,
  BOTONES_TIRO_PROPIO,
  BOTONES_TIRO_RIVAL,
  cambiarParte,
  colorTiro,
  contarBotonTiro,
  crearEventoJsonb,
  esPortero,
  etiquetaTiro,
  ETIQUETAS_EVENTO_JSONB,
  ETIQUETAS_ORIGEN,
  exclusiones,
  formatoReloj,
  golesContra,
  golesFavor,
  iniciarOReanudar,
  marcadorHastaTabla,
  minutoActual,
  origenPorPuesto,
  pausar,
  perdidas,
  requiereZona,
  robos,
  segundosPartido,
  type BotonTiro,
} from "@/lib/partidoStats";
import { cn } from "@/lib/utils";
import type {
  ColorTarjeta,
  EquipoOrigenEvento,
  EventosRow,
  JugadoresRow,
  OrigenLanzamiento,
  PartidosRow,
  ResultadoTiro,
  TipoEventoPartido,
} from "@/types/database";

/**
 * Marcador en vivo — reloj por partes, selector de jugador/a por chips
 * (obligatorio para registrar), panel de acción agrupado, cuadrícula de
 * portería siempre visible con mapa de calor, panel de estadísticas y
 * cronología. Ocupa toda la pantalla (overlay `fixed inset-0`, fuera del
 * `<main>` con nav/paddings) e intenta forzar horizontal + pantalla completa
 * del navegador vía `useFullscreenHorizontal` (mejor esfuerzo: no soportado
 * en iOS Safari). Diseñado principalmente para tablet/iPad (layout de grids
 * responsive, colapsa a una columna en móvil vertical); en móvil apaisado y
 * viewport corto (una mano) usa el layout `compacto` de dos columnas, sin
 * panel de estadísticas para no perder espacio vertical.
 *
 * Desde 0017/0018_eventos.sql, tiros/pérdidas/exclusiones/tarjetas escriben
 * en la tabla `eventos`; "7m provocado"/"7m cometido" y las sustituciones
 * (entra/sale pista) siguen en `partido.estadisticas` (jsonb), igual que el
 * cronómetro. La cronología y "deshacer" fusionan ambas fuentes por
 * `creado_en`.
 *
 * Flujo de registro (bidireccional a propósito, ver spec de esta fase):
 * seleccionar jugador (obligatorio, sin excepciones — incluida "Gol en
 * contra": se atribuye al portero seleccionado) → tocar una acción de tiro
 * arma esa acción y espera zona, o tocar una zona primero arma la zona y
 * espera acción — lo que llegue primero completa el registro. "Anular"
 * limpia lo pendiente sin registrar.
 */
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
  useFullscreenHorizontal();
  const compacto = useMovilHorizontal();
  const [tick, setTick] = useState(0);
  const [jugadorSel, setJugadorSel] = useState<string | null>(null);
  const [sietePendiente, setSietePendiente] = useState(false);
  const [accionPendiente, setAccionPendiente] = useState<BotonTiro | null>(null);
  const [zonaPendiente, setZonaPendiente] = useState<number | null>(null);
  const [origenSel, setOrigenSel] = useState<OrigenLanzamiento | null>(null);
  const cronometro = partido.estadisticas.cronometro;
  const eventosJsonb = partido.estadisticas.eventos ?? [];

  const jugadorActual = jugadores.find((j) => j.id === jugadorSel) ?? null;
  const esJugadorActualPortero = jugadorActual ? esPortero(jugadorActual.puesto) : false;

  // Cronología unificada: eventos de tabla (tiros/pérdidas/exclusiones/
  // tarjetas) + eventos jsonb (7m provocado/cometido, entra/sale pista),
  // todos con la misma forma para poder ordenarlos y "deshacer" el más
  // reciente sea cual sea su origen.
  type ToqueUnificado = {
    id: string;
    origen: "tabla" | "jsonb";
    label: string;
    color: string;
    jugadorId: string | null;
    esRival: boolean;
    minuto: number | null;
    creadoEn: string;
    afectaMarcador: boolean;
    detalle: string;
  };
  const toquesTabla: ToqueUnificado[] = eventos.map((e) => {
    if (e.tipo === "tiro") {
      return {
        id: e.id,
        origen: "tabla",
        label: etiquetaTiro(e),
        color: colorTiro(e),
        jugadorId: e.jugador_id,
        esRival: e.equipo_origen === "rival",
        minuto: null,
        creadoEn: e.creado_en,
        afectaMarcador: e.resultado === "gol",
        detalle: [e.zona ? `Z${e.zona}` : null, e.origen ? ETIQUETAS_ORIGEN[e.origen] : null].filter(Boolean).join(" · "),
      };
    }
    if (e.tipo === "tarjeta") {
      const b = BOTONES_TARJETA.find((x) => x.color === e.color_tarjeta);
      return {
        id: e.id,
        origen: "tabla",
        label: `Tarjeta ${b?.label.toLowerCase() ?? ""}`.trim(),
        color: b?.hex ?? "rgba(255,255,255,.35)",
        jugadorId: e.jugador_id,
        esRival: false,
        minuto: null,
        creadoEn: e.creado_en,
        afectaMarcador: false,
        detalle: "",
      };
    }
    const label = e.tipo === "perdida" ? (e.equipo_origen === "rival" ? "Balón ganado" : "Balón perdido") : "Exclusión 2'";
    const color = e.tipo === "perdida" ? (e.equipo_origen === "rival" ? "var(--color-success)" : "var(--color-warning)") : "var(--color-warning)";
    return {
      id: e.id,
      origen: "tabla",
      label,
      color,
      jugadorId: e.jugador_id,
      esRival: e.equipo_origen === "rival",
      minuto: null,
      creadoEn: e.creado_en,
      afectaMarcador: false,
      detalle: "",
    };
  });
  const toquesJsonb: ToqueUnificado[] = eventosJsonb.map((e) => ({
    id: e.id,
    origen: "jsonb",
    label: ETIQUETAS_EVENTO_JSONB[e.tipo],
    color:
      e.tipo === "siete_provocado"
        ? "var(--color-success)"
        : e.tipo === "siete_cometido"
          ? "var(--color-accent)"
          : "rgba(255,255,255,.35)",
    jugadorId: e.jugador_id,
    esRival: false,
    minuto: e.minuto,
    creadoEn: e.creado_en,
    afectaMarcador: false,
    detalle: "",
  }));
  const toquesDesc = [...toquesTabla, ...toquesJsonb].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  const golesEventosTabla = eventos.filter((e) => e.tipo === "tiro" && e.resultado === "gol");
  const golesDesc = [...golesEventosTabla].sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  const conteosPorZona: Record<number, number> = {};
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.zona === null) continue;
    if (jugadorSel && e.jugador_id !== jugadorSel) continue;
    conteosPorZona[e.zona] = (conteosPorZona[e.zona] ?? 0) + 1;
  }

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

  function seleccionarJugador(j: JugadoresRow) {
    setJugadorSel(j.id);
    setAccionPendiente(null);
    setZonaPendiente(null);
    setOrigenSel(origenPorPuesto(j.puesto));
  }

  function registrarTiro(equipoOrigen: EquipoOrigenEvento, resultado: ResultadoTiro, zona: number | null) {
    if (!jugadorSel) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: jugadorSel,
      equipo_origen: equipoOrigen,
      tipo: "tiro",
      resultado,
      zona,
      origen: origenSel,
      es_penalti: sietePendiente,
      color_tarjeta: null,
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    setSietePendiente(false);
  }

  function esBotonArmado(boton: BotonTiro): boolean {
    return accionPendiente?.resultado === boton.resultado && accionPendiente?.equipoOrigen === boton.equipoOrigen;
  }

  function tocarBotonTiro(boton: BotonTiro) {
    if (!jugadorSel) return;
    if (!requiereZona(boton.resultado)) {
      registrarTiro(boton.equipoOrigen, boton.resultado, null);
      return;
    }
    if (zonaPendiente !== null) {
      registrarTiro(boton.equipoOrigen, boton.resultado, zonaPendiente);
      setZonaPendiente(null);
      return;
    }
    setAccionPendiente(esBotonArmado(boton) ? null : boton);
  }

  function tocarZona(zona: number) {
    if (!jugadorSel) return;
    if (accionPendiente) {
      registrarTiro(accionPendiente.equipoOrigen, accionPendiente.resultado, zona);
      setAccionPendiente(null);
      return;
    }
    setZonaPendiente(zonaPendiente === zona ? null : zona);
  }

  function anular() {
    setAccionPendiente(null);
    setZonaPendiente(null);
  }

  function registrarPerdidaRobo(equipoOrigen: EquipoOrigenEvento) {
    if (!jugadorSel) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: jugadorSel,
      equipo_origen: equipoOrigen,
      tipo: "perdida",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: null,
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
  }

  function registrarExclusion() {
    if (!jugadorSel) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: jugadorSel,
      equipo_origen: "propio",
      tipo: "exclusion",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: null,
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
  }

  function registrarTarjeta(color: ColorTarjeta) {
    if (!jugadorSel) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: jugadorSel,
      equipo_origen: "propio",
      tipo: "tarjeta",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: color,
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
  }

  function registrarJsonb(tipo: TipoEventoPartido) {
    if (!jugadorSel) return;
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

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "z" || ev.key === "Z") deshacer();
      if (ev.code === "Space" && ev.target === document.body) {
        ev.preventDefault();
        alternarCronometro();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toquesDesc, cronometro]);

  const corriendo = !!cronometro?.corriendo;
  const estado = corriendo ? "En juego" : toquesDesc.length > 0 ? "Pausado" : "Sin empezar";

  let statusMain = "Selecciona un jugador";
  let statusHint = "Paso 1 de 2";
  if (jugadorActual) {
    statusMain = `#${jugadorActual.dorsal ?? "—"} ${jugadorActual.nombre}`;
    statusHint = "Elige la acción";
    if (accionPendiente) {
      statusMain += ` — ${accionPendiente.label}`;
      statusHint = "Toca la zona de la portería";
    } else if (zonaPendiente !== null) {
      statusMain += ` — zona ${zonaPendiente}`;
      statusHint = "Elige el resultado del tiro";
    }
  }

  const jugadorBlock = (
    <div>
      <div className="mb-2.5 flex items-center justify-between px-4 lg:px-0">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Jugador</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => registrarSustitucion("entra_pista")}
            className="flex h-7 items-center gap-1 rounded-full bg-white/[.08] px-2.5 text-[11px] font-medium text-[#4ddc8a]"
          >
            <LogIn size={12} /> Entra
          </button>
          <button
            onClick={() => registrarSustitucion("sale_pista")}
            className="flex h-7 items-center gap-1 rounded-full bg-white/[.08] px-2.5 text-[11px] font-medium text-white/60"
          >
            <LogOut size={12} /> Sale
          </button>
        </div>
      </div>
      {/* Fila horizontal con scroll en móvil/apaisado; en el layout tablet
          (`lg:`) se convierte en lista vertical dentro de la columna de
          200px — mismo markup, solo cambia flex-direction (ver ChipJugador). */}
      <div className="flex gap-1.5 overflow-x-auto px-4 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
        {jugadores.map((j) => (
          <ChipJugador
            key={j.id}
            nombre={j.nombre.split(" ")[0]}
            numero={j.dorsal != null ? String(j.dorsal) : "—"}
            activo={jugadorSel === j.id}
            onClick={() => seleccionarJugador(j)}
          />
        ))}
      </div>
    </div>
  );

  const zonaBlock = (
    <div className="flex flex-col gap-3">
      <CuadriculaPorteria
        tocable={!!jugadorSel}
        resaltado={!!accionPendiente || zonaPendiente !== null}
        compacto={compacto}
        onZona={tocarZona}
        conteosPorZona={conteosPorZona}
      />
      <OrigenChips valor={origenSel} onCambiar={setOrigenSel} />
    </div>
  );

  const accionesBlock = (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => setSietePendiente((v) => !v)}
        className={cn(
          "flex h-11 items-center justify-center rounded-xl text-[12px] font-semibold transition-colors",
          sietePendiente ? "bg-[var(--color-accent)] text-white" : "bg-white/[.08] text-white/60",
        )}
      >
        Penalti (7m)
      </button>

      <GrupoBotones titulo="Tiro" cols={4}>
        {BOTONES_TIRO_PROPIO.map((b) => (
          <BotonAccion
            key={`${b.equipoOrigen}-${b.resultado}`}
            label={b.label}
            color={b.color}
            count={contarBotonTiro(eventos, b)}
            armado={esBotonArmado(b)}
            disabled={!jugadorSel}
            onClick={() => tocarBotonTiro(b)}
          />
        ))}
      </GrupoBotones>

      <GrupoBotones titulo="Portero" cols={2} conBorde>
        {BOTONES_TIRO_RIVAL.map((b) => (
          <BotonAccion
            key={`${b.equipoOrigen}-${b.resultado}`}
            label={b.label}
            color={b.color}
            count={contarBotonTiro(eventos, b)}
            armado={esBotonArmado(b)}
            disabled={!jugadorSel || !esJugadorActualPortero}
            onClick={() => tocarBotonTiro(b)}
          />
        ))}
      </GrupoBotones>

      <GrupoBotones titulo="Pérdida / Robo" cols={2} conBorde>
        <BotonAccion label="Robo" color="var(--color-success)" count={robos(eventos)} disabled={!jugadorSel} onClick={() => registrarPerdidaRobo("rival")} />
        <BotonAccion label="Pérdida" color="var(--color-warning)" count={perdidas(eventos)} disabled={!jugadorSel} onClick={() => registrarPerdidaRobo("propio")} />
      </GrupoBotones>

      <GrupoBotones titulo="Sanción" cols={4} conBorde>
        <BotonAccion label="Exclusión 2'" color="var(--color-warning)" count={exclusiones(eventos)} disabled={!jugadorSel} onClick={registrarExclusion} />
        {BOTONES_TARJETA.map((b) => (
          <BotonAccion
            key={b.color}
            label={b.label}
            color={b.hex}
            count={eventos.filter((e) => e.tipo === "tarjeta" && e.color_tarjeta === b.color).length}
            disabled={!jugadorSel}
            onClick={() => registrarTarjeta(b.color)}
          />
        ))}
      </GrupoBotones>

      <GrupoBotones titulo="Otros" cols={2} conBorde>
        {ACCIONES_JSONB.map((a) => (
          <BotonAccion
            key={a.tipo}
            label={a.label}
            color={a.color}
            count={eventosJsonb.filter((e) => e.tipo === a.tipo).length}
            disabled={!jugadorSel}
            onClick={() => registrarJsonb(a.tipo)}
          />
        ))}
      </GrupoBotones>

      <div className="flex items-center gap-2 border-t border-white/[.06] pt-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white">{statusMain}</div>
          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/45">{statusHint}</div>
        </div>
        <button
          onClick={anular}
          className="flex h-8 shrink-0 items-center rounded-lg bg-white/[.08] px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60"
        >
          Anular
        </button>
      </div>
    </div>
  );

  const cronologiaBlock = (
    <div className="min-h-0">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Cronología</span>
        <span className="text-[10px] text-white/30">{toquesDesc.length} acciones</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {toquesDesc.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/[.14] px-3.5 py-5 text-center text-xs text-white/35">
            Sin acciones registradas. Selecciona un jugador y pulsa una acción.
          </div>
        )}
        {toquesDesc.map((t) => {
          const jugador = t.jugadorId ? jugadores.find((j) => j.id === t.jugadorId) : null;
          const quien = jugador ? `#${jugador.dorsal ?? "—"} ${jugador.nombre}` : t.esRival ? partido.rival : "Sin asignar";
          const indiceGol = golesDesc.findIndex((g) => g.id === t.id);
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-[11px] bg-white/[.05] px-3.5 py-2.5"
              style={{ borderLeft: `3px solid ${t.color}` }}
            >
              <span className="stat-number w-8 shrink-0 text-[15px] text-white">
                {t.minuto ?? minutoActual(cronometro) ?? "—"}&apos;
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-white">{t.label}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/42">{quien}</div>
              </div>
              {t.detalle && <span className="stat-number shrink-0 text-[10px] tracking-[0.04em] text-white/40">{t.detalle}</span>}
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

  const panelStatsTitulo = jugadorActual ? `#${jugadorActual.dorsal ?? "—"} ${jugadorActual.nombre}` : "Totales del equipo";

  if (compacto) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0f]"
        style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[.09] bg-[var(--color-ink)] px-3 py-2">
          <button onClick={onBack} aria-label="Volver a Partido" className="shrink-0 text-white/55 hover:text-white/80">
            <ChevronLeft size={18} className="text-[var(--color-accent)]" />
          </button>
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: corriendo ? "#4ddc8a" : "#8a8a92" }}
          />

          <div className="flex flex-1 items-center justify-center gap-4">
            <div className="min-w-0 text-center">
              <div className="truncate text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--color-accent)]">
                {equipoNombre ?? "Nosotros"}
              </div>
              <div className="stat-number text-2xl leading-none text-white">{golesFavor(eventos)}</div>
            </div>
            <div className="text-center">
              <div className="stat-number text-lg leading-none text-white">{formatoReloj(segundosPartido(cronometro))}</div>
              <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-white/45">
                {cronometro?.parte === 2 ? "2ª parte" : "1ª parte"}
              </div>
            </div>
            <div className="min-w-0 text-center">
              <div className="truncate text-[8px] font-semibold uppercase tracking-[0.1em] text-white/50">{partido.rival}</div>
              <div className="stat-number text-2xl leading-none text-white/55">{golesContra(eventos)}</div>
            </div>
          </div>

          <button
            onClick={alternarCronometro}
            aria-label={corriendo ? "Pausar cronómetro" : "Iniciar cronómetro"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: corriendo ? "rgba(255,255,255,.12)" : "var(--color-accent)" }}
          >
            {corriendo ? <Pause size={15} className="text-white" /> : <Play size={15} className="text-white" />}
          </button>
          <button
            onClick={siguienteParte}
            className="flex h-9 shrink-0 items-center justify-center rounded-lg bg-white/[.08] px-2.5 text-[11px] font-semibold text-white/75"
          >
            {cronometro?.parte === 2 ? "1ª" : "2ª"}
          </button>
          <button
            onClick={deshacer}
            aria-label="Deshacer último toque"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[.08] text-white/60"
          >
            <Undo2 size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[46%] shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-white/[.07] py-2.5">
            {jugadorBlock}
            <div className="px-3">{zonaBlock}</div>
            <div className="px-3">{accionesBlock}</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2.5">{cronologiaBlock}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#0d0d0f]"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="border-b border-white/[.09] bg-[var(--color-ink)] px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/55 hover:text-white/80">
            <ChevronLeft size={16} className="text-[var(--color-accent)]" /> Partido
          </button>
          <div className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: corriendo ? "#4ddc8a" : "#8a8a92" }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">{estado}</span>
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
              {equipoNombre ?? "Nosotros"}
            </div>
            <div className="stat-number text-[52px] leading-[0.86] text-white">{golesFavor(eventos)}</div>
          </div>
          <div className="shrink-0 px-1 text-center">
            <div className="stat-number text-3xl tracking-[0.04em] text-white">
              {formatoReloj(segundosPartido(cronometro))}
            </div>
            <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">
              {cronometro?.parte === 2 ? "2ª parte" : "1ª parte"}
            </div>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
              {partido.rival}
            </div>
            <div className="stat-number text-[52px] leading-[0.86] text-white/55">{golesContra(eventos)}</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={alternarCronometro}
            className="flex h-[42px] flex-1 items-center justify-center rounded-xl text-sm font-semibold text-white active:scale-[0.985]"
            style={{ backgroundColor: corriendo ? "rgba(255,255,255,.12)" : "var(--color-accent)" }}
          >
            {corriendo ? "Pausar cronómetro" : toquesDesc.length > 0 ? "Reanudar" : "Iniciar partido"}
          </button>
          <button
            onClick={siguienteParte}
            className="flex h-[42px] shrink-0 items-center justify-center rounded-xl bg-white/[.08] px-4 text-sm font-semibold text-white/75"
          >
            {cronometro?.parte === 2 ? "1ª parte" : "2ª parte"}
          </button>
          <button
            onClick={deshacer}
            aria-label="Deshacer último toque"
            className="flex h-[42px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-white/[.08] text-white/60"
          >
            <Undo2 size={17} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Bajo `lg:`, jugadorBlock ocupa la primera columna (se convierte en
            lista vertical, ver arriba) — por eso no lleva envoltorio propio
            con borde inferior aquí, ese borde solo tiene sentido en móvil
            donde va apilado encima de Zona/Acción. */}
        <div className="border-b border-white/[.07] pb-3 lg:hidden">{jugadorBlock}</div>

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[200px_minmax(0,1fr)_320px] lg:items-start">
          <div className="hidden lg:block">{jugadorBlock}</div>
          {zonaBlock}
          {accionesBlock}
        </div>

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <PanelStats eventos={eventos} jugadorId={jugadorSel} titulo={panelStatsTitulo} />
          {cronologiaBlock}
        </div>
      </div>
    </div>
  );
}

function GrupoBotones({
  titulo,
  cols,
  conBorde,
  children,
}: {
  titulo: string;
  cols: 2 | 4;
  /** Separador sutil arriba del grupo — ayuda a que varios grupos seguidos se
   * lean como categorías distintas y no como una sola masa de botones. Se
   * omite en el primero (ya lo separa el interruptor "Penalti" de encima). */
  conBorde?: boolean;
  children: React.ReactNode;
}) {
  const colsClass = cols === 2 ? "grid-cols-2" : "grid-cols-4";
  return (
    <div className={cn(conBorde && "border-t border-white/[.06] pt-4")}>
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">{titulo}</div>
      <div className={cn("grid gap-1.5", colsClass)}>{children}</div>
    </div>
  );
}

function BotonAccion({
  label,
  color,
  count,
  armado,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  count: number;
  armado?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-11 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 text-center transition-colors active:scale-[0.96] disabled:opacity-35 disabled:pointer-events-none",
        armado ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15" : "border-white/[.09] bg-white/[.05]",
      )}
    >
      <span className="text-[10px] leading-[1.15] text-white/85">{label}</span>
      <span className="stat-number text-sm" style={{ color }}>
        {count}
      </span>
    </button>
  );
}

function ChipJugador({
  nombre,
  numero,
  activo,
  onClick,
}: {
  nombre: string;
  numero: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 lg:w-full lg:justify-start",
        activo ? "bg-[var(--color-accent)]" : "bg-white/[.08]",
      )}
    >
      <span className="stat-number text-sm" style={{ color: activo ? "#fff" : "rgba(255,255,255,.6)" }}>
        {numero}
      </span>
      <span className="text-xs font-medium" style={{ color: activo ? "#fff" : "rgba(255,255,255,.6)" }}>
        {nombre}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: `ContadoresEnVivo.tsx` sin errores propios. `FichaTecnica.tsx` puede seguir marcando error (Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/components/partido/ContadoresEnVivo.tsx
git commit -m "refactor: registro en vivo ampliado — jugador obligatorio, portero/robo atribuidos, tarjetas, origen, flujo bidireccional, layout tablet"
```

---

## Task 8: `FichaTecnica.tsx` — Robos y Tarjetas

**Files:**
- Modify: `src/components/partido/FichaTecnica.tsx`

- [ ] **Step 1: Actualizar imports y stats**

```tsx
import {
  BOTONES_TIRO_RIVAL,
  contarBotonTiro,
  eficaciaLanzamiento,
  exclusiones,
  golesContra,
  golesFavor,
  marcadorPartido,
  perdidas,
  robos,
  sieteFallados,
  tarjetas,
  tirosFallados,
} from "@/lib/partidoStats";
```

```tsx
  const buscarTiroRival = (label: string) => BOTONES_TIRO_RIVAL.find((b) => b.label === label)!;
  const stats: { label: string; valor: number | string }[] = [
    { label: "Goles a favor", valor: favor },
    { label: "Goles en contra", valor: contra },
    { label: "Paradas portero", valor: contarBotonTiro(eventos, buscarTiroRival("Parada")) },
    { label: "Robos", valor: robos(eventos) },
    { label: "Pérdidas", valor: perdidas(eventos) },
    { label: "Tiros fallados", valor: tirosFallados(eventos) },
    { label: "7m fallados", valor: sieteFallados(eventos) },
    { label: "Exclusiones", valor: exclusiones(eventos) },
    { label: "Tarjetas", valor: tarjetas(eventos) },
    { label: "Eficacia de tiro", valor: eficacia !== null ? `${eficacia}%` : "—" },
  ];
```

(Quita el import de `ACCIONES_PERDIDA_EXCLUSION`/`contarTabla` y la función `buscarPerdidaExclusion` — ya no existen tras el Task 3.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en todo el proyecto.

- [ ] **Step 3: Commit**

```bash
git add src/components/partido/FichaTecnica.tsx
git commit -m "feat: Ficha técnica muestra robos y tarjetas"
```

---

## Task 9: Verificación final, revisión de `ui-estetica`, y prueba manual

**Files:** ninguno nuevo — comandos + revisión de agente.

- [ ] **Step 1: Typecheck + lint + build completos**

Run: `npx tsc -b --noEmit && npm run lint && npm run build`
Expected: los tres limpios.

- [ ] **Step 2: Revisión de `ui-estetica`**

Dispatch al agente `ui-estetica` para revisar `ContadoresEnVivo.tsx`, `CuadriculaPorteria.tsx`, `OrigenChips.tsx` y `PanelStats.tsx` frente a CLAUDE.md — específicamente que se haya seguido la marca del proyecto (no la del mockup), la jerarquía entre grupos, los estados deshabilitado/armado/resaltado, y el layout responsive en las tres anchuras (móvil vertical, tablet ≥`lg`, apaisado `compacto`). Aplicar los hallazgos reales que encuentre.

- [ ] **Step 3: Prueba manual del usuario**

No hay credenciales de login disponibles para probarlo automáticamente — pedir al usuario que abra un partido en directo y compruebe: selección de jugador obligatoria (los botones deben estar deshabilitados sin selección), flujo acción→zona y zona→acción, atribución de portero/robo al jugador correcto, preselección de origen según puesto (y que un puesto no reconocido no bloquee nada), las 3 tarjetas, "Anular", "Deshacer" (botón y tecla `Z`), el mapa de calor, y que el layout tablet (pantalla ancha) y el apaisado de una mano funcionen ambos.

- [ ] **Step 4: Commit final si `ui-estetica` aplicó cambios**

```bash
git add -A
git commit -m "fix: ajustes de ui-estetica sobre el registro en vivo ampliado"
```
