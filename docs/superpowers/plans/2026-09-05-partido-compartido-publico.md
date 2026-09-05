# Ficha de Partido Compartida Públicamente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al entrenador compartir un enlace público (sin cuenta) de la ficha técnica de un partido concreto, para que los jugadores vean el rendimiento del equipo y descarguen su ficha individual, sin poder navegar por el resto de la app.

**Architecture:** Una columna nueva `partidos.token_publico` (generada solo al pulsar "Compartir") + una única función Postgres `SECURITY DEFINER` (`obtener_partido_compartido`) que es la exclusiva vía de lectura para el rol `anon` en todo el proyecto — construye su respuesta campo a campo (allowlist), sin ninguna política RLS nueva en las tablas base. En el cliente: una ruta pública `/compartido/:token` fuera del `AuthGate`, que reutiliza `FichaTecnica`/`PanelJugadorPartido` ya existentes.

**Tech Stack:** React 19 + TypeScript, react-router-dom v7, Supabase (Postgres RPC `SECURITY DEFINER`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-05-partido-compartido-publico-design.md`

## Global Constraints

- El enlace es por partido concreto (no un resumen de equipo/temporada).
- Protección: solo el token de la URL (largo, no adivinable, UUID). Sin contraseña ni caducidad automática — explícitamente fuera de alcance.
- Token propio (`partidos.token_publico`, `uuid`), nunca el `id` real del partido — se genera solo cuando el entrenador pulsa "Compartir", nunca por defecto.
- Cero políticas RLS nuevas para `anon` en `partidos`, `eventos`, `jugadores` o `asistencia`. Toda la lectura pública pasa por `obtener_partido_compartido`, la única función de todo el esquema con `grant execute` a `anon`.
- La función construye el JSON de salida campo a campo (allowlist explícita), nunca `to_jsonb(fila)` completo — así un futuro `alter table` no se cuela automáticamente en la respuesta pública.
- Excluidos explícitamente de la respuesta pública: `problemas_detectados`, `acciones_siguiente_semana`, `notas_adicionales` de `partidos` (notas internas del entrenador); y de `jugadores`, todo salvo `id`/`equipo_id`/`nombre`/`dorsal`/`puesto` (nada de `año_nacimiento`, `altura_cm`, `peso_kg`, `notas_adicionales`, etc.).
- Convenciones SQL del proyecto: `security definer` + `set search_path = public`; `revoke all on function ... from public` seguido de `grant execute ... to <roles concretos>` (ver `0014_crear_equipo.sql`).
- Todo en español. Sin `rounded-full` en botones. Estética coherente con el resto de la app (`.card-surface`, `.hero-band`, paleta ink/accent).
- Selector de ficha individual en la página pública: input con búsqueda que filtra una lista (mismo patrón ya usado en `EjercicioPickerModal.tsx`), no un dropdown nativo `<select>`.

---

### Task 1: Migración SQL + tipos TypeScript

**Files:**
- Create: `supabase/migrations/0031_partido_compartido.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: columna `partidos.token_publico: string | null`; función RPC `obtener_partido_compartido(p_token: string) => PartidoCompartidoPayload | null`; tipo exportado `PartidoCompartidoPayload = { partido: PartidosRow; equipo_nombre: string; eventos: EventosRow[]; jugadores: JugadoresRow[] } | null`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 0031_partido_compartido.sql
alter table partidos add column token_publico uuid unique;

-- Única función de todo el esquema con acceso `anon` — decisión deliberada
-- de esta feature (compartir la ficha de un partido sin cuenta), ver spec
-- docs/superpowers/specs/2026-09-05-partido-compartido-publico-design.md.
-- Construye la respuesta campo a campo (allowlist), nunca to_jsonb(fila)
-- completo, para que un alter table futuro no se cuele en lo expuesto.
-- Excluye deliberadamente: problemas_detectados/acciones_siguiente_semana/
-- notas_adicionales de partidos (notas internas del entrenador) y todo
-- dato personal de jugadores salvo id/equipo_id/nombre/dorsal/puesto.
create or replace function obtener_partido_compartido(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partido partidos%rowtype;
  v_resultado jsonb;
begin
  select * into v_partido from partidos where token_publico = p_token;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'partido', jsonb_build_object(
      'id', v_partido.id,
      'equipo_id', v_partido.equipo_id,
      'microciclo_id', null,
      'rival', v_partido.rival,
      'rival_id', null,
      'fecha', v_partido.fecha,
      'hora', v_partido.hora,
      'casa_fuera', v_partido.casa_fuera,
      'competicion', v_partido.competicion,
      'duracion_parte_min', v_partido.duracion_parte_min,
      'resultado', v_partido.resultado,
      'sistema_propio', v_partido.sistema_propio,
      'sistema_rival', v_partido.sistema_rival,
      'estadisticas', v_partido.estadisticas,
      'problemas_detectados', null,
      'acciones_siguiente_semana', null,
      'notas_adicionales', null,
      'token_publico', null,
      'created_at', v_partido.created_at,
      'updated_at', v_partido.updated_at
    ),
    'equipo_nombre', (select nombre from equipos where id = v_partido.equipo_id),
    'eventos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'equipo_id', e.equipo_id,
        'partido_id', e.partido_id,
        'sesion_id', null,
        'jugador_id', e.jugador_id,
        'equipo_origen', e.equipo_origen,
        'tipo', e.tipo,
        'resultado', e.resultado,
        'zona', e.zona,
        'origen', e.origen,
        'es_penalti', e.es_penalti,
        'color_tarjeta', e.color_tarjeta,
        'minuto', e.minuto,
        'creado_en', e.creado_en
      )), '[]'::jsonb)
      from eventos e
      where e.partido_id = v_partido.id
    ),
    'jugadores', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id,
        'equipo_id', j.equipo_id,
        'nombre', j.nombre,
        'año_nacimiento', null,
        'dorsal', j.dorsal,
        'altura_cm', null,
        'peso_kg', null,
        'puesto', j.puesto,
        'puestos_secundarios', '[]'::jsonb,
        'nivel_actual', null,
        'fortalezas', null,
        'aspectos_a_mejorar', null,
        'objetivo_individual', null,
        'ficha_oficial_url', null,
        'notas_adicionales', null,
        'created_at', j.created_at,
        'updated_at', j.updated_at
      )), '[]'::jsonb)
      from jugadores j
      join asistencia a on a.jugador_id = j.id
      where a.partido_id = v_partido.id and a.presente = true
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

-- El propio entrenador (autenticado) también debe poder abrir/probar su
-- propio link compartido en el mismo navegador con sesión iniciada, así
-- que el grant cubre ambos roles no-owner: anon (visitante sin cuenta) y
-- authenticated (el entrenador probando el link, o cualquier otro
-- entrenador del club). Ningún otro rol tiene permiso.
revoke all on function obtener_partido_compartido(uuid) from public;
grant execute on function obtener_partido_compartido(uuid) to anon, authenticated;
```

- [ ] **Step 2: Aplicar la migración a la base real**

Usa la herramienta MCP de Supabase (`apply_migration`, nombre `partido_compartido`) con el contenido exacto del Step 1. Esta app tiene un único proyecto Supabase real (no hay entorno de staging) — la migración se aplica directamente ahí, igual que todas las anteriores de este proyecto.

- [ ] **Step 3: Actualizar `src/types/database.ts` — `PartidosRow`**

Modifica la definición existente (busca `export type PartidosRow`), añadiendo el campo nuevo justo antes de `created_at`:

```ts
export type PartidosRow = {
  id: UUID;
  equipo_id: UUID;
  microciclo_id: UUID | null;
  rival: string;
  rival_id: UUID | null;
  fecha: string;
  hora: string | null;
  casa_fuera: "casa" | "fuera" | null;
  competicion: string | null;
  duracion_parte_min: number;
  resultado: string | null;
  sistema_propio: string | null;
  sistema_rival: string | null;
  estadisticas: EstadisticasPartido;
  problemas_detectados: string | null;
  acciones_siguiente_semana: string | null;
  notas_adicionales: string | null;
  token_publico: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 4: Añadir el tipo `PartidoCompartidoPayload`**

Justo después de la definición de `PartidosRow` (antes de `export type MotivoAusencia`), añade:

```ts
/** Forma exacta que devuelve la función RPC `obtener_partido_compartido` —
 * ver 0031_partido_compartido.sql. `null` cuando el token no existe/es
 * inválido. Los tipos de `partido`/`jugadores` son los mismos `PartidosRow`/
 * `JugadoresRow` de siempre porque la función ya rellena a `null` los campos
 * que no expone — no hace falta un tipo reducido aparte. */
export type PartidoCompartidoPayload = {
  partido: PartidosRow;
  equipo_nombre: string;
  eventos: EventosRow[];
  jugadores: JugadoresRow[];
} | null;
```

`EventosRow` está definido más abajo en el mismo archivo — TypeScript no exige orden de declaración entre `type` de nivel de módulo, así que esta referencia hacia adelante compila sin problema (ya ocurre hoy en este archivo con otros tipos).

- [ ] **Step 5: Registrar la columna como opcional-en-insert y la función RPC en `Database`**

Busca la entrada `partidos: TableDef<PartidosRow, ...>` dentro de `export type Database` y añade `"token_publico"` a la lista (nullable con default `null`, así que un `.insert()` sin ese campo debe seguir compilando):

```ts
      partidos: TableDef<
        PartidosRow,
        | "id"
        | "microciclo_id"
        | "rival_id"
        | "casa_fuera"
        | "competicion"
        | "resultado"
        | "sistema_propio"
        | "sistema_rival"
        | "estadisticas"
        | "problemas_detectados"
        | "acciones_siguiente_semana"
        | "notas_adicionales"
        | "token_publico"
        | "created_at"
        | "updated_at"
      >;
```

Y en el bloque `Functions` del mismo `Database` (junto a `crear_equipo`, `crear_invitacion`, `canjear_invitacion`), añade:

```ts
      // RPC de 0031_partido_compartido.sql — única función del esquema con
      // grant a `anon`; ver esa migración para el detalle de qué expone.
      obtener_partido_compartido: {
        Args: { p_token: string };
        Returns: unknown;
      };
```

`Returns: unknown` porque el tipo real (`PartidoCompartidoPayload`) no puede describirse dentro de `TableDef`/el shape genérico de `Functions` sin duplicar la definición — el código que llama a `supabase.rpc("obtener_partido_compartido", ...)` hace el cast explícito a `PartidoCompartidoPayload` (Task 3), que es donde vive el tipo real y verificable.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc -b --noEmit`
Expected: 0 errores (este paso no debería romper nada existente — solo añade campos/tipos nuevos).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0031_partido_compartido.sql src/types/database.ts
git commit -m "feat: añade token_publico y la función obtener_partido_compartido para compartir la ficha de un partido sin cuenta"
```

---

### Task 2: `FichaTecnica.tsx` — desacoplar de `useEquipo()`, botón compartir/revocar, modo solo lectura

**Files:**
- Modify: `src/components/partido/FichaTecnica.tsx`
- Modify: `src/pages/PartidoDetailPage.tsx:174` (único cambio: la llamada a `<FichaTecnica>`)
- Modify: `src/pages/RivalDetailPage.tsx:26,362` (destructuring de `useEquipo()` + la llamada a `<FichaTecnica>`)

**Interfaces:**
- Consumes: `PartidoCompartidoPayload`, `PartidosRow` (Task 1, ya en `main`/worktree).
- Produces: `FichaTecnica` con nueva firma de props —
  `{ partido: PartidosRow; jugadores: JugadoresRow[]; eventos: EventosRow[]; nombreEquipo: string; onActualizado?: (partido: PartidosRow) => void; soloLectura?: boolean }`
  (antes: `{ partido, jugadores, eventos }`, sin `nombreEquipo`/`onActualizado`/`soloLectura`). Los tasks 3 no dependen de esto directamente (usan `FichaTecnica` con `soloLectura`), pero cualquier otro futuro caller debe pasar `nombreEquipo` obligatoriamente.

- [ ] **Step 1: Cambiar la firma de props y quitar `useEquipo()`**

En `src/components/partido/FichaTecnica.tsx`, reemplaza el bloque de imports y la firma de la función:

```tsx
import { useState } from "react";
import { Download } from "lucide-react";
import { AnilloDonut } from "@/components/partido/AnilloDonut";
import { BarrasJugador } from "@/components/partido/BarrasJugador";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { LineaMarcador } from "@/components/partido/LineaMarcador";
import { MarcadorExclusiones } from "@/components/partido/MarcadorExclusiones";
import { PanelJugadorPartido } from "@/components/partido/PanelJugadorPartido";
import { InsightsCard } from "@/components/dashboard/InsightsCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { descargarPdf } from "@/lib/pdf/descargarPdf";
import { FichaPartidoPdf } from "@/lib/pdf/FichaPartidoPdf";
import { cargarEscudoPdf } from "@/lib/pdf/escudoPdf";
import {
  desgloseResultados,
  distribucionPorZona,
  eficaciaConDetalle,
  perdidas,
  porcentajeParadas,
  robos,
} from "@/lib/partidoStats";
import { cortePorMediana, dividirPorCorte, generarInsights } from "@/lib/insights";
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

export function FichaTecnica({
  partido,
  jugadores,
  eventos,
  nombreEquipo,
  onActualizado,
  soloLectura = false,
}: {
  partido: PartidosRow;
  jugadores: JugadoresRow[];
  eventos: EventosRow[];
  nombreEquipo: string;
  onActualizado?: (partido: PartidosRow) => void;
  soloLectura?: boolean;
}) {
  const [jugadorPanel, setJugadorPanel] = useState<JugadoresRow | null>(null);
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function descargarFichaPdf() {
    setDescargandoPdf(true);
    try {
      const escudo = await cargarEscudoPdf().catch(() => null);
      await descargarPdf(
        `ficha-partido-vs-${partido.rival}-${partido.fecha}`,
        <FichaPartidoPdf partido={partido} eventos={eventos} nombreEquipo={nombreEquipo} escudo={escudo} />,
      );
    } catch (err) {
      alert("No se pudo generar el PDF: " + (err as Error).message);
    } finally {
      setDescargandoPdf(false);
    }
  }

  function urlCompartida(token: string): string {
    return `${window.location.origin}/compartido/${token}`;
  }

  async function copiarLink(token: string) {
    await navigator.clipboard.writeText(urlCompartida(token));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function compartir() {
    setCompartiendo(true);
    try {
      const token = crypto.randomUUID();
      const { error } = await supabase.from("partidos").update({ token_publico: token }).eq("id", partido.id);
      if (error) throw error;
      onActualizado?.({ ...partido, token_publico: token });
      await copiarLink(token);
    } catch (err) {
      alert("No se pudo compartir: " + (err as Error).message);
    } finally {
      setCompartiendo(false);
    }
  }

  async function dejarDeCompartir() {
    if (!confirm("¿Dejar de compartir esta ficha? El enlace actual dejará de funcionar.")) return;
    setCompartiendo(true);
    try {
      const { error } = await supabase.from("partidos").update({ token_publico: null }).eq("id", partido.id);
      if (error) throw error;
      onActualizado?.({ ...partido, token_publico: null });
    } catch (err) {
      alert("No se pudo dejar de compartir: " + (err as Error).message);
    } finally {
      setCompartiendo(false);
    }
  }
```

Nota: `crypto.randomUUID()` ya se usa en este mismo componente hoy de forma indirecta (vía otros componentes del proyecto, p.ej. `ContadoresEnVivo.tsx`) — es la API `Web Crypto` estándar del navegador, sin import.

- [ ] **Step 2: Sustituir el botón de descarga por la fila compartir + descargar**

Busca el bloque (justo dentro del `return`, primera línea del JSX):

```tsx
      <Button variant="secondary" size="sm" className="self-end" onClick={descargarFichaPdf} disabled={descargandoPdf}>
        <Download size={16} /> {descargandoPdf ? "Generando..." : "Descargar PDF"}
      </Button>
```

Reemplázalo por:

```tsx
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!soloLectura &&
          (partido.token_publico ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => copiarLink(partido.token_publico!)}>
                {copiado ? "Copiado" : "Copiar link"}
              </Button>
              <Button variant="secondary" size="sm" onClick={dejarDeCompartir} disabled={compartiendo}>
                Dejar de compartir
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={compartir} disabled={compartiendo}>
              {compartiendo ? "Compartiendo..." : "Compartir ficha"}
            </Button>
          ))}
        <Button variant="secondary" size="sm" onClick={descargarFichaPdf} disabled={descargandoPdf}>
          <Download size={16} /> {descargandoPdf ? "Generando..." : "Descargar PDF"}
        </Button>
      </div>
```

El botón "Descargar PDF" sigue visible tanto en modo normal como en `soloLectura` (los jugadores deben poder descargar la ficha desde el enlace público); solo el bloque compartir/revocar se oculta cuando `soloLectura` es `true`.

- [ ] **Step 3: Actualizar `PartidoDetailPage.tsx`**

En `src/pages/PartidoDetailPage.tsx:174`, reemplaza:

```tsx
        <FichaTecnica partido={partido} jugadores={jugadores} eventos={eventos} />
```

por:

```tsx
        <FichaTecnica
          partido={partido}
          jugadores={jugadores}
          eventos={eventos}
          nombreEquipo={equipo?.nombre ?? "Equipo"}
          onActualizado={setPartido}
        />
```

`equipo` y `setPartido` ya existen en este componente (`const { equipo, equipoId } = useEquipo();` en la línea 19, `const [partido, setPartido] = useState<PartidosRow | null>(null);` en la línea 22) — no hace falta ningún cambio adicional en este archivo.

- [ ] **Step 4: Actualizar `RivalDetailPage.tsx`**

En `src/pages/RivalDetailPage.tsx:26`, cambia:

```tsx
  const { equipoId } = useEquipo();
```

por:

```tsx
  const { equipo, equipoId } = useEquipo();
```

Y en la línea 362, reemplaza:

```tsx
          <FichaTecnica partido={partidoSeleccionado} jugadores={jugadores} eventos={eventosPartidoSeleccionado} />
```

por:

```tsx
          <FichaTecnica
            partido={partidoSeleccionado}
            jugadores={jugadores}
            eventos={eventosPartidoSeleccionado}
            nombreEquipo={equipo?.nombre ?? "Equipo"}
            onActualizado={(actualizado) =>
              setPartidos((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)))
            }
          />
```

`setPartidos` ya existe en este componente (`const [partidos, setPartidos] = useState<PartidosRow[]>([]);` en la línea 31).

- [ ] **Step 5: Verificar tipos, lint y build**

Run: `npx tsc -b --noEmit`
Expected: 0 errores.

Run: `npx eslint .`
Expected: 0 errores (los mismos 2 warnings preexistentes de `PdfComponents.tsx` son aceptables, no relacionados con esta tarea).

Run: `npm run build`
Expected: build correcto, sin advertencias nuevas más allá del aviso preexistente de chunk grande (`index-*.js` > 500kB, ya presente desde el revert de Task previo de esta sesión).

- [ ] **Step 6: Commit**

```bash
git add src/components/partido/FichaTecnica.tsx src/pages/PartidoDetailPage.tsx src/pages/RivalDetailPage.tsx
git commit -m "feat: añade compartir/revocar ficha técnica y desacopla FichaTecnica de useEquipo()"
```

---

### Task 3: Página pública `/compartido/:token`

**Files:**
- Create: `src/pages/SharedPartidoPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `FichaTecnica` con prop `soloLectura` (Task 2); `PanelJugadorPartido` (sin cambios, ya no depende de `useEquipo()`); `PartidoCompartidoPayload` (Task 1); RPC `obtener_partido_compartido`.
- Produces: ruta `/compartido/:token`, servida fuera de `AuthGate`.

- [ ] **Step 1: Crear `src/pages/SharedPartidoPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/field";
import { FichaTecnica } from "@/components/partido/FichaTecnica";
import { PanelJugadorPartido } from "@/components/partido/PanelJugadorPartido";
import { EscudoFondo } from "@/components/layout/EscudoFondo";
import type { JugadoresRow, PartidoCompartidoPayload } from "@/types/database";

/**
 * Página pública, sin sesión — enlace generado desde "Compartir ficha" en
 * FichaTecnica.tsx. Fuera de AuthGate y de EquipoLayout (ver App.tsx): sin
 * SideNav/BottomNav, sin ningún <Link>/navigate() hacia el resto de la app.
 */
export function SharedPartidoPage() {
  const { token } = useParams<{ token: string }>();
  const [datos, setDatos] = useState<PartidoCompartidoPayload>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "no-encontrado">("cargando");
  const [busqueda, setBusqueda] = useState("");
  const [jugadorPanel, setJugadorPanel] = useState<JugadoresRow | null>(null);

  useEffect(() => {
    if (!token) {
      setEstado("no-encontrado");
      return;
    }
    supabase
      .rpc("obtener_partido_compartido", { p_token: token })
      .then(({ data, error }) => {
        if (error || !data) {
          setEstado("no-encontrado");
          return;
        }
        setDatos(data as PartidoCompartidoPayload);
        setEstado("ok");
      });
  }, [token]);

  if (estado === "cargando") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-[var(--color-text-muted)]">Cargando...</p>
      </div>
    );
  }

  if (estado === "no-encontrado" || !datos) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <EscudoFondo className="-bottom-24 -right-24 h-[130vw] w-[130vw] max-h-[48rem] max-w-[48rem] rotate-[-8deg]" />
        <div className="card-surface relative z-10 max-w-sm p-6 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Este enlace ya no está disponible.</p>
        </div>
      </div>
    );
  }

  const { partido, equipo_nombre, eventos, jugadores } = datos;
  const convocadosFiltrados = jugadores.filter((j) => j.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div className="relative min-h-screen px-4 py-8">
      <EscudoFondo className="-bottom-24 -right-24 h-[130vw] w-[130vw] max-h-[48rem] max-w-[48rem] rotate-[-8deg]" />
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col gap-4">
        <div className="hero-band">
          <div className="hero-eyebrow">{equipo_nombre}</div>
          <h1 className="hero-title mt-0.5">vs {partido.rival}</h1>
        </div>

        <FichaTecnica
          partido={partido}
          jugadores={jugadores}
          eventos={eventos}
          nombreEquipo={equipo_nombre}
          soloLectura
        />

        <div>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
            Fichas individuales
          </div>
          <div className="relative mb-3">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <Input
              pill
              placeholder="Buscar jugador..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            {convocadosFiltrados.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => setJugadorPanel(j)}
                className="card-surface flex items-center gap-3 p-3 text-left transition-colors hover:border-[var(--color-accent)]"
              >
                <span className="stat-number text-sm text-[var(--color-text-muted)]">#{j.dorsal ?? "—"}</span>
                <span className="text-sm font-medium">{j.nombre}</span>
              </button>
            ))}
            {convocadosFiltrados.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
                Ningún jugador coincide con la búsqueda.
              </p>
            )}
          </div>
        </div>
      </div>

      {jugadorPanel && (
        <PanelJugadorPartido
          jugador={jugadorPanel}
          partido={partido}
          eventos={eventos}
          onCerrar={() => setJugadorPanel(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Reestructurar `src/App.tsx` para sacar la ruta pública de `AuthGate`**

Reemplaza el archivo completo:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthGate } from "@/components/auth/AuthGate";
import { PwaUpdateBanner } from "@/components/layout/PwaUpdateBanner";
import { EquipoLayout } from "@/components/layout/EquipoLayout";
import { SharedPartidoPage } from "@/pages/SharedPartidoPage";
import { TeamSelectPage } from "@/pages/TeamSelectPage";
import { UnirseEquipoPage } from "@/pages/UnirseEquipoPage";
import { InicioPage } from "@/pages/InicioPage";
import { CalendarioPage } from "@/pages/CalendarioPage";
import { EntrenamientoDetailPage } from "@/pages/EntrenamientoDetailPage";
import { SesionDetailPage } from "@/pages/SesionDetailPage";
import { EjerciciosPage } from "@/pages/EjerciciosPage";
import { EjercicioDetailPage } from "@/pages/EjercicioDetailPage";
import { ModeloJuegoPage } from "@/pages/ModeloJuegoPage";
import { EquipoPage } from "@/pages/EquipoPage";
import { JugadorDetailPage } from "@/pages/JugadorDetailPage";
import { PartidoPage } from "@/pages/PartidoPage";
import { PartidoDetailPage } from "@/pages/PartidoDetailPage";
import { RivalesPage } from "@/pages/RivalesPage";
import { RivalDetailPage } from "@/pages/RivalDetailPage";
import { ProgresoPage } from "@/pages/ProgresoPage";
import { AjustesPage } from "@/pages/AjustesPage";

/** Árbol de rutas que sí requieren sesión — sin cambios respecto al que
 * existía antes de introducir la ruta pública `/compartido/:token`. Vive en
 * su propio `<Routes>` (no anidado como hijos directos de una `<Route>`)
 * para poder envolverlo en `<AuthGate>` sin afectar a esa ruta pública. */
function AppAutenticada() {
  return (
    <Routes>
      <Route path="/" element={<TeamSelectPage />} />
      <Route path="/unirse/:codigo" element={<UnirseEquipoPage />} />
      <Route path="/equipos/:equipoId" element={<EquipoLayout />}>
        <Route index element={<Navigate to="inicio" replace />} />
        <Route path="inicio" element={<InicioPage />} />
        <Route path="calendario" element={<CalendarioPage />} />
        <Route path="calendario/:fecha" element={<EntrenamientoDetailPage />} />
        <Route path="sesion/:sesionId" element={<SesionDetailPage />} />
        <Route path="equipo" element={<EquipoPage />} />
        <Route path="jugador/:jugadorId" element={<JugadorDetailPage />} />
        <Route path="partido" element={<PartidoPage />} />
        <Route path="partido/:partidoId" element={<PartidoDetailPage />} />
        <Route path="rivales" element={<RivalesPage />} />
        <Route path="rivales/:rivalId" element={<RivalDetailPage />} />
        <Route path="modelo-juego" element={<ModeloJuegoPage />} />
        <Route path="ejercicios" element={<EjerciciosPage />} />
        <Route path="ejercicios/:ejercicioId" element={<EjercicioDetailPage />} />
        <Route path="progreso" element={<ProgresoPage />} />
        <Route path="ajustes" element={<AjustesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PwaUpdateBanner />
      <Routes>
        <Route path="/compartido/:token" element={<SharedPartidoPage />} />
        <Route
          path="/*"
          element={
            <AuthGate>
              <AppAutenticada />
            </AuthGate>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
```

Este es el único patrón seguro para sacar una ruta de `AuthGate` sin arriesgar el resto de la navegación: un `<Routes>` renderizado como `element` de una `<Route>` (en vez de como hijos directos anidados) actúa como un router independiente que vuelve a resolver la URL completa del navegador — así que todas las rutas absolutas de `AppAutenticada` (`/`, `/equipos/:equipoId`, etc.) seguirán resolviendo exactamente igual que hoy, sin ningún cambio de comportamiento.

- [ ] **Step 3: Verificar tipos, lint, tests y build**

Run: `npx tsc -b --noEmit`
Expected: 0 errores.

Run: `npx eslint .`
Expected: 0 errores (mismos warnings preexistentes tolerables).

Run: `npm test -- --run`
Expected: todos los tests existentes en verde (esta tarea no toca `insights.ts`/`partidoStats.ts`, no debería afectar a `insights.test.ts`).

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SharedPartidoPage.tsx src/App.tsx
git commit -m "feat: añade la página pública /compartido/:token para ver y descargar la ficha de un partido sin cuenta"
```

---

### Task 4: Verificación de seguridad contra la base de datos real

Esta tarea no modifica código — comprueba, contra el proyecto Supabase real (no hay entorno de staging en este proyecto), que la superficie pública introducida en las Tasks 1-3 es exactamente la decidida en la spec y no más. Usa la herramienta MCP `execute_sql`. Documenta cada resultado tal cual vuelve de la base de datos (no resumas ni redondees "parece que sí") en el informe de esta tarea.

**Files:** ninguno (verificación de solo lectura contra la base de datos, sin cambios de código).

**Interfaces:**
- Consumes: función `obtener_partido_compartido` y columna `partidos.token_publico` (Task 1), ya aplicadas a la base real.

- [ ] **Step 1: Confirmar que un token inexistente no filtra nada**

```sql
select obtener_partido_compartido('00000000-0000-0000-0000-000000000000'::uuid);
```

Expected: `null` exacto (no una fila vacía, no un array vacío, no un error) — confirma que la función no lanza una excepción no controlada ni devuelve una forma distinta cuando no encuentra el token, lo cual el cliente (`SharedPartidoPage.tsx`) depende de tratar de forma uniforme (`error || !data` → "no encontrado").

- [ ] **Step 2: Confirmar los `grant`s exactos de la función**

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_name = 'obtener_partido_compartido';
```

Expected: únicamente filas con `grantee` en (`anon`, `authenticated`) y `privilege_type = 'EXECUTE'` — ningún `public` genérico, ningún otro rol de la base (verifica también que no aparezca, por ejemplo, `service_role` con permiso implícito no documentado — si aparece, es normal, `service_role` tiene bypass de RLS/grants por diseño de Supabase y no es una fuga; lo relevante es que NO aparezca ningún rol de aplicación no previsto).

- [ ] **Step 3: Confirmar que ninguna tabla base ganó una política para `anon`**

```sql
select tablename, policyname, roles, qual
from pg_policies
where tablename in ('partidos', 'eventos', 'jugadores', 'asistencia');
```

Expected: ninguna fila tiene `anon` dentro de `roles`, y ningún `qual` (la condición de la política) menciona `'anon'` o `auth.role() = 'anon'`. Todas las políticas existentes deben seguir con la forma ya conocida en este proyecto (`private.equipo_del_entrenador(equipo_id)` sobre `authenticated`). Si el resultado difiere de "todas exigen equipo_del_entrenador para authenticated, cero para anon", la Task 1 introdujo una brecha y hay que pararse a corregirla antes de continuar — no es un hallazgo menor que se pueda aparcar.

- [ ] **Step 4: Prueba de extremo a extremo con un token real, sin dejar el partido compartido tras la prueba**

```sql
-- Elige cualquier partido existente para la prueba (ajusta el id real que
-- devuelva tu SELECT anterior a esta consulta — no hace falta un partido
-- concreto, cualquiera con al menos un jugador convocado en `asistencia`
-- sirve para confirmar la forma del JSON).
select id from partidos limit 1;

update partidos set token_publico = gen_random_uuid() where id = '<id-del-select-anterior>' returning token_publico;

select obtener_partido_compartido('<token-devuelto-arriba>'::uuid);
```

Expected en la última consulta: un objeto jsonb con exactamente las claves `partido`, `equipo_nombre`, `eventos`, `jugadores`; dentro de `partido`, los campos `problemas_detectados`, `acciones_siguiente_semana`, `notas_adicionales` y `token_publico` deben salir `null` aunque el partido real tenga contenido en esos campos (si el partido elegido para la prueba tiene notas reales y NO salen `null`, la función tiene un defecto — parar y corregir antes de seguir); dentro de cada elemento de `jugadores`, `año_nacimiento`/`altura_cm`/`peso_kg`/`nivel_actual`/`fortalezas`/`aspectos_a_mejorar`/`objetivo_individual`/`ficha_oficial_url`/`notas_adicionales` deben salir `null`.

Después de confirmar el resultado, limpia el token de prueba para no dejar un partido real compartido por accidente:

```sql
update partidos set token_publico = null where id = '<id-del-select-anterior>';
```

- [ ] **Step 5: Documentar el resultado**

Añade al final de esta sección del plan (o al ledger de la ejecución, si se usa subagent-driven-development) una nota con el resultado literal de cada uno de los 4 Steps anteriores — no una afirmación genérica de "todo correcto", sino el output real devuelto por cada consulta.

---

## Verificación manual pendiente (no automatizable desde este entorno)

Ninguna de las tareas anteriores abre un navegador. Antes de dar la funcionalidad por completamente probada, alguien debe:

1. Generar un link real desde "Compartir ficha" en un partido con jugadores convocados y datos de juego.
2. Abrir ese link en una pestaña/navegador sin sesión iniciada (o en modo incógnito) y confirmar: se ve la ficha técnica, no aparece ningún elemento de navegación hacia el resto de la app, el botón "Descargar PDF" genera el PDF del partido, buscar y pinchar un jugador abre su panel y permite descargar su informe individual.
3. Confirmar que "Dejar de compartir" invalida el link (recargar la misma URL debe mostrar "Este enlace ya no está disponible").
4. Confirmar que "Copiar link"/"Compartir ficha" realmente copian al portapapeles (algunos navegadores exigen HTTPS o un gesto de usuario directo para `navigator.clipboard.writeText` — probar en el dominio real de producción, no solo en `localhost`).
