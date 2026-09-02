# Ficha técnica de jugador — estadística de temporada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la sección "Rendimiento" de `JugadorDetailPage.tsx` por un dashboard con foco en la estadística de temporada completa (anillo de eficacia, mapa de calor acumulado, línea de evolución partido a partido, sección de portero), con selector "Toda la temporada" / partido concreto — reutilizando al máximo los componentes ya construidos en la fase de gráficos de partido.

**Architecture:** Un componente nuevo genuinamente nuevo (`LineaEvolucionEficacia`, mismo espíritu que `LineaMarcador`), un componente extraído por refactor (`DesgloseJugadorPartido`, sacado de `PanelJugadorPartido` para que ambas vistas — modal de partido y ficha de jugador — compartan el mismo desglose sin duplicarlo), una constante exportada (`MIN_TIROS_RECIBIDOS` desde `valoracion.ts`), un soporte de query param en `PartidoDetailPage.tsx`, y la reescritura de `JugadorDetailPage.tsx` que ensambla todo con `AnilloDonut`/`BloqueTiro` ya existentes.

**Tech Stack:** React 19 + TypeScript + Tailwind. Sin test runner ni librería de gráficos — verificación vía `tsc -b`, `eslint`, `npm run build`, `ui-estetica`, y el usuario revisando con datos reales (un jugador con varios partidos, y un/a portero/a).

**Spec:** `docs/superpowers/specs/2026-09-02-ficha-tecnica-jugador-temporada-design.md`

## Global Constraints

- 7 metros y juego abierto nunca se mezclan en el mismo porcentaje.
- Todo porcentaje/recuento se muestra siempre honesto (recuento real junto al %, sin excepción por tamaño de muestra).
- Sin librerías de gráficos — SVG a medida, mismo estilo que `LineaMarcador`.
- Tema claro estándar (`card-surface`) — esta página no es "Partido en directo". `MapaCalorPorteria` (vía `BloqueTiro`) es la única excepción, sigue siendo su propio widget oscuro autocontenido.
- El anillo de paradas del portero reutiliza exactamente los mismos 4 segmentos/colores que el anillo de eficacia (gol=success, parado=#3d8ad6, fuera=accent, poste=color-mix en srgb) — ningún color nuevo.
- `MIN_TIROS_RECIBIDOS` se reutiliza desde `valoracion.ts`, no se reimplementa el umbral.
- Todo en español.

---

## Task 1: `LineaEvolucionEficacia.tsx` — línea de evolución de eficacia por partido

**Files:**
- Create: `src/components/jugador/LineaEvolucionEficacia.tsx`

**Interfaces:**
- Produces: `LineaEvolucionEficacia({ puntos: { label: string; pct: number | null }[] })`. Se autogestiona: con menos de 2 puntos con `pct` no nulo, no renderiza nada.

- [ ] **Step 1: Crear el componente**

```tsx
/**
 * Línea de tendencia de eficacia de tiro partido a partido — mismo espíritu
 * y matemática que `LineaMarcador` (SVG a medida, sin librería, coordenadas
 * con margen desde el principio para que ningún punto quede recortado
 * contra el borde del viewBox), pero una sola línea y eje X en partidos
 * jugados en vez de en tiempo dentro de un partido. Con menos de 2 partidos
 * con tiros registrados no hay tendencia que trazar — no renderiza nada.
 */
export function LineaEvolucionEficacia({ puntos }: { puntos: { label: string; pct: number | null }[] }) {
  const validos = puntos.filter((p): p is { label: string; pct: number } => p.pct !== null);
  if (validos.length < 2) return null;

  const w = 300;
  const h = 60;
  const padX = 4;
  const padY = 4;
  const paso = (w - 2 * padX) / (validos.length - 1);
  const coords = validos.map((p, i) => ({
    x: padX + i * paso,
    y: padY + (1 - p.pct / 100) * (h - 2 * padY),
  }));
  const puntosPolyline = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
        Evolución de eficacia
      </div>
      <div className="card-surface p-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
          <polyline
            points={puntosPolyline}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r="3" fill="var(--color-accent)" />
          ))}
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/jugador/LineaEvolucionEficacia.tsx
git commit -m "feat: línea de evolución de eficacia de tiro partido a partido"
```

---

## Task 2: Extraer `DesgloseJugadorPartido.tsx` de `PanelJugadorPartido.tsx`

**Files:**
- Create: `src/components/partido/DesgloseJugadorPartido.tsx`
- Modify: `src/components/partido/PanelJugadorPartido.tsx`

**Interfaces:**
- Produces: `DesgloseJugadorPartido({ jugador: JugadoresRow; eventos: EventosRow[] })` — sin chrome de pantalla (ni overlay ni modal), solo el contenido: pérdidas/robos + 2×`BloqueTiro`, portero-aware (idéntico al contenido que ya tenía `PanelJugadorPartido`, byte a byte, solo movido de sitio).
- `PanelJugadorPartido` pasa a ser un envoltorio fino: mismo overlay/backdrop/cabecera con nombre+cerrar que ya tenía, pero delega el contenido a `DesgloseJugadorPartido`.

**Decisión:** es un refactor de extracción, no un cambio de comportamiento — `PanelJugadorPartido` debe verse y comportarse exactamente igual que antes desde fuera.

- [ ] **Step 1: Crear `DesgloseJugadorPartido.tsx`**

```tsx
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { distribucionPorZona, eficaciaConDetalle, esPortero, perdidas, porcentajeParadas, robos } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Mini-desglose de un jugador en un ámbito de eventos ya acotado (un
 * partido, o toda la temporada de ese jugador): eficacia y zonas de tiro
 * (juego abierto/7m separados), más pérdidas/robos. Si el jugador es
 * portero, los dos bloques muestran paradas sobre los tiros del rival que
 * le llegaron, no sus tiros propios (casi inexistentes) — mismo criterio
 * que `FichaTecnica.tsx`. Sin chrome de pantalla propio — lo envuelven
 * `PanelJugadorPartido` (modal) y la ficha técnica de jugador (embebido en
 * la página), para no mantener dos copias del mismo desglose.
 */
export function DesgloseJugadorPartido({ jugador, eventos }: { jugador: JugadoresRow; eventos: EventosRow[] }) {
  const propios = eventos.filter((e) => e.jugador_id === jugador.id);
  const portero = esPortero(jugador.puesto);
  const equipoOrigenRelevante = portero ? "rival" : "propio";
  const resultadoAcierto = portero ? "parado" : "gol";

  const tirosJuego = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === equipoOrigenRelevante && !e.es_penalti);
  const tirosPenalti = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === equipoOrigenRelevante && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);
  const aciertosZonasJuego = distribucionPorZona(tirosJuego.filter((e) => e.resultado === resultadoAcierto));
  const aciertosZonasPenalti = distribucionPorZona(tirosPenalti.filter((e) => e.resultado === resultadoAcierto));

  const detalleJuego = portero
    ? porcentajeParadas(propios, { soloPenalti: false })
    : eficaciaConDetalle(propios, { soloPenalti: false });
  const detallePenalti = portero
    ? porcentajeParadas(propios, { soloPenalti: true })
    : eficaciaConDetalle(propios, { soloPenalti: true });

  const etiquetaAcierto = portero ? "paradas" : "goles";

  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-[var(--color-text-muted)]">
        <span>
          <span className="stat-number text-[var(--color-ink)]">{perdidas(propios)}</span> pérdidas
        </span>
        <span>
          <span className="stat-number text-[var(--color-ink)]">{robos(propios)}</span> robos
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BloqueTiro
          titulo="Juego abierto"
          detalle={detalleJuego}
          zonas={zonasJuego}
          total={tirosJuego.length}
          aciertosPorZona={aciertosZonasJuego}
          etiquetaAcierto={etiquetaAcierto}
        />
        <BloqueTiro
          titulo="7 metros"
          detalle={detallePenalti}
          zonas={zonasPenalti}
          total={tirosPenalti.length}
          aciertosPorZona={aciertosZonasPenalti}
          etiquetaAcierto={etiquetaAcierto}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reescribir `PanelJugadorPartido.tsx` como envoltorio fino**

```tsx
import { X } from "lucide-react";
import { DesgloseJugadorPartido } from "@/components/partido/DesgloseJugadorPartido";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Overlay modal local (no navega de pantalla) que envuelve
 * `DesgloseJugadorPartido` con la cabecera (dorsal/nombre/cerrar) y el
 * chrome de modal — mismo contenido exacto que la vista de "partido
 * concreto" de la ficha técnica de jugador, que embebe el mismo
 * `DesgloseJugadorPartido` sin este chrome. Overlay propio en tema claro
 * (mismo `card-surface` que el resto de esta ficha) — no el `Modal`
 * compartido del proyecto, para no acoplar esta pantalla a su contrato de
 * `title`/`footer`.
 */
export function PanelJugadorPartido({
  jugador,
  eventos,
  onCerrar,
}: {
  jugador: JugadoresRow;
  eventos: EventosRow[];
  onCerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-4" onClick={onCerrar}>
      <div
        className="card-surface flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-b-none p-4 md:max-w-md md:rounded-b-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div>
            <span className="stat-number text-sm text-[var(--color-text-muted)]">#{jugador.dorsal ?? "—"} </span>
            <span className="text-sm font-medium text-[var(--color-text)]">{jugador.nombre}</span>
          </div>
          <button aria-label="Cerrar" onClick={onCerrar} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={20} />
          </button>
        </div>
        <DesgloseJugadorPartido jugador={jugador} eventos={eventos} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en todo el proyecto — en particular, `FichaTecnica.tsx` (que usa `PanelJugadorPartido` sin cambios en su contrato de props) no debe romperse.

- [ ] **Step 4: Commit**

```bash
git add src/components/partido/DesgloseJugadorPartido.tsx src/components/partido/PanelJugadorPartido.tsx
git commit -m "refactor: extrae DesgloseJugadorPartido de PanelJugadorPartido para reutilizarlo sin el modal"
```

---

## Task 3: Exportar `MIN_TIROS_RECIBIDOS` y soporte de `?vista=` en `PartidoDetailPage.tsx`

**Files:**
- Modify: `src/lib/valoracion.ts`
- Modify: `src/pages/PartidoDetailPage.tsx`

**Interfaces:**
- Produces: `MIN_TIROS_RECIBIDOS` (ahora exportado, valor sin cambios: `5`).
- `PartidoDetailPage` ahora acepta `?vista=ficha` o `?vista=live` en la URL para abrir directamente esa vista (validado contra las 3 vistas reales; cualquier otro valor cae a `"info"`).

- [ ] **Step 1: Exportar la constante en `valoracion.ts`**

Busca esta línea (dentro de los comentarios sobre el mínimo de tiros recibidos):

```ts
const MIN_TIROS_RECIBIDOS = 5;
```

Y cámbiala a:

```ts
export const MIN_TIROS_RECIBIDOS = 5;
```

No toques nada más de este archivo.

- [ ] **Step 2: Soporte de `?vista=` en `PartidoDetailPage.tsx`**

Cambia el import de `useNavigate, useParams`:

```tsx
import { useNavigate, useParams } from "react-router-dom";
```

a:

```tsx
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
```

Dentro de `PartidoDetailPage()`, sustituye:

```tsx
  const [vista, setVista] = useState<Vista>("info");
```

por:

```tsx
  const [searchParams] = useSearchParams();
  const vistaParam = searchParams.get("vista");
  const [vista, setVista] = useState<Vista>(vistaParam === "ficha" || vistaParam === "live" ? vistaParam : "info");
```

No toques nada más de este archivo en esta task.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/valoracion.ts src/pages/PartidoDetailPage.tsx
git commit -m "feat: exporta MIN_TIROS_RECIBIDOS y soporta ?vista= para enlazar directo a la ficha técnica de partido"
```

---

## Task 4: `JugadorDetailPage.tsx` — reescritura completa

**Files:**
- Modify: `src/pages/JugadorDetailPage.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `AnilloDonut` (ya existente), `BloqueTiro` (ya existente), `DesgloseJugadorPartido` (Task 2), `LineaEvolucionEficacia` (Task 1), `MIN_TIROS_RECIBIDOS` de `@/lib/valoracion` (Task 3), `desgloseResultados`/`distribucionPorZona`/`eficaciaConDetalle`/`esPortero`/`porcentajeParadas` de `@/lib/partidoStats` (ya existentes), `Select` de `@/components/ui/field` (ya existente).
- Produces: mismo contrato de ruta (`/equipos/:equipoId/jugador/:jugadorId`), lee además `?partido=<id>` para preseleccionar ámbito (mismo enlace que ya construye `FichaTecnica.tsx`/`DesgloseJugadorPartido` indirectamente).

**Decisiones de esta task:**
- Cabecera, 4 KPIs (Goles/Partidos/Asistencias/Exclusiones) y asistencia a entrenamientos: sin cambios.
- Se elimina la sección "Rendimiento" (barras) y sus cálculos (`eficaciaLanzamiento`, `minutosJugados`, `bars`, `balonesPerdidos`, `minutosTotales`, `partidosConMinutos`, `eficaciaLanzamientoPct`, `perdidasPorPartido`, `minutosPorPartido`) — sustituidos por el dashboard de temporada.
- El selector solo lista partidos donde el jugador tiene al menos un evento — mismo criterio ya usado en `BarrasJugador`/`FichaTecnica.tsx`.
- `ambitoValido` cae a `"temporada"` si `?partido=` no corresponde a ningún partido jugado por este jugador.

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { AnilloDonut } from "@/components/partido/AnilloDonut";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { DesgloseJugadorPartido } from "@/components/partido/DesgloseJugadorPartido";
import { LineaEvolucionEficacia } from "@/components/jugador/LineaEvolucionEficacia";
import { JugadorFormModal } from "@/components/equipo/JugadorFormModal";
import { Select } from "@/components/ui/field";
import { desgloseResultados, distribucionPorZona, eficaciaConDetalle, esPortero, porcentajeParadas } from "@/lib/partidoStats";
import { MIN_TIROS_RECIBIDOS } from "@/lib/valoracion";
import { cargarEventosEquipo } from "@/lib/eventos";
import type { AsistenciaRow, EventosRow, JugadoresRow, PartidosRow, SesionesRow } from "@/types/database";

export function JugadorDetailPage() {
  const { equipoId } = useEquipo();
  const { jugadorId } = useParams<{ jugadorId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [jugador, setJugador] = useState<JugadoresRow | null>(null);
  const [partidos, setPartidos] = useState<PartidosRow[]>([]);
  const [asistencia, setAsistencia] = useState<AsistenciaRow[]>([]);
  const [sesiones, setSesiones] = useState<SesionesRow[]>([]);
  const [eventos, setEventos] = useState<EventosRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [ambito, setAmbito] = useState<string>(searchParams.get("partido") ?? "temporada");

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

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId, jugadorId]);

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }
  if (!jugador) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Jugador/a no encontrado.</div>;
  }

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

  const ambitoValido =
    ambito === "temporada" || partidosJugadosOrdenados.some((p) => p.id === ambito) ? ambito : "temporada";

  const portero = esPortero(jugador.puesto);

  // Asistencia a entrenamientos (solo sesiones, no partidos), ordenada por fecha del evento.
  const fechaDeSesion = new Map<string, string>();
  for (const s of sesiones) fechaDeSesion.set(s.id, s.fecha);
  const registrosEntreno = asistencia
    .filter((a) => a.sesion_id)
    .map((a) => ({ ...a, fecha: fechaDeSesion.get(a.sesion_id!) ?? "" }))
    .filter((a) => a.fecha)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const presentes = registrosEntreno.filter((a) => a.presente).length;
  const asistenciaPct = registrosEntreno.length > 0 ? Math.round((presentes / registrosEntreno.length) * 100) : null;
  const ultimas10 = registrosEntreno.slice(0, 10);

  function colorRegistro(a: AsistenciaRow): string {
    if (a.presente) return "var(--color-success)";
    if (a.motivo_ausencia === "justificado") return "var(--color-warning)";
    if (a.motivo_ausencia === "lesion") return "var(--color-text-faint)";
    return "var(--color-accent)";
  }

  const edad = jugador.año_nacimiento ? `${new Date().getFullYear() - jugador.año_nacimiento} años` : null;

  const stats = [
    { k: "Goles", v: String(goles) },
    { k: "Partidos", v: String(partidosJugados) },
    { k: "Asistencias", v: String(presentes) },
    { k: "Exclusiones", v: String(exclusiones) },
  ];

  // --- Temporada completa: eficacia de tiro propio, acumulada ---
  const tirosJuego = eventosDelJugador.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti);
  const tirosPenalti = eventosDelJugador.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);
  const golesZonasJuego = distribucionPorZona(tirosJuego.filter((e) => e.resultado === "gol"));
  const golesZonasPenalti = distribucionPorZona(tirosPenalti.filter((e) => e.resultado === "gol"));
  const desgloseJuego = desgloseResultados(tirosJuego);
  const desglosePenalti = desgloseResultados(tirosPenalti);
  const pctJuego = tirosJuego.length > 0 ? Math.round((desgloseJuego.gol / tirosJuego.length) * 100) : null;
  const pctPenalti = tirosPenalti.length > 0 ? Math.round((desglosePenalti.gol / tirosPenalti.length) * 100) : null;

  // --- Temporada completa: paradas del portero, acumuladas ---
  const tirosRivalJuego = eventosDelJugador.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && !e.es_penalti);
  const tirosRivalPenalti = eventosDelJugador.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && e.es_penalti);
  const zonasRivalJuego = distribucionPorZona(tirosRivalJuego);
  const zonasRivalPenalti = distribucionPorZona(tirosRivalPenalti);
  const paradasZonasRivalJuego = distribucionPorZona(tirosRivalJuego.filter((e) => e.resultado === "parado"));
  const paradasZonasRivalPenalti = distribucionPorZona(tirosRivalPenalti.filter((e) => e.resultado === "parado"));
  const desgloseRivalJuego = desgloseResultados(tirosRivalJuego);
  const desgloseRivalPenalti = desgloseResultados(tirosRivalPenalti);
  const detalleParadasJuego = portero ? porcentajeParadas(eventosDelJugador, { soloPenalti: false }) : null;
  const detalleParadasPenalti = portero ? porcentajeParadas(eventosDelJugador, { soloPenalti: true }) : null;
  const intentosRivalTotal = tirosRivalJuego.length + tirosRivalPenalti.length;
  const muestraPequenaPortero = portero && intentosRivalTotal > 0 && intentosRivalTotal < MIN_TIROS_RECIBIDOS;

  // --- Línea de evolución de eficacia, partido a partido ---
  const tendenciaEficacia = partidosJugadosOrdenados.map((p) => {
    const eventosDeEsePartido = eventosDelJugador.filter((e) => e.partido_id === p.id);
    const detalle = eficaciaConDetalle(eventosDeEsePartido);
    return { label: p.fecha, pct: detalle?.pct ?? null };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[var(--color-ink)] px-5 pb-6 pt-5" style={{ borderRadius: "1.25rem" }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(`/equipos/${equipoId}/equipo`)}
            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <ChevronLeft size={16} className="text-[var(--color-accent)]" /> Plantilla
          </button>
          <button
            onClick={() => setEditando(true)}
            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <Pencil size={16} /> Editar
          </button>
        </div>
        <div className="flex items-end gap-4">
          <div className="stat-number shrink-0 text-[4.25rem] leading-[0.85] text-[var(--color-accent)]">
            {jugador.dorsal ?? "—"}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="hero-title truncate text-[1.6rem]">{jugador.nombre}</div>
            <div className="mt-1.5 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">
              {[jugador.puesto, edad].filter(Boolean).join(" · ") || "Sin datos"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((s) => (
          <div key={s.k} className="card-surface p-4">
            <div className="stat-number text-[28px]">{s.v}</div>
            <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
              {s.k}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Asistencia a entrenamientos
        </div>
        <div className="card-surface p-4">
          {asistenciaPct !== null ? (
            <>
              <div className="mb-3.5 flex items-end justify-between">
                <div className="stat-number text-[2.375rem] leading-none text-[var(--color-accent)]">{asistenciaPct}%</div>
                <div className="text-right text-xs text-[var(--color-text-muted)]">
                  {presentes} de {registrosEntreno.length} sesiones
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div
                  className="h-2 rounded-full bg-[var(--color-accent)]"
                  style={{ width: `${asistenciaPct}%` }}
                />
              </div>
              <div className="mt-4 flex gap-1">
                {ultimas10.map((a) => (
                  <div key={a.id} className="h-[30px] flex-1 rounded-md" style={{ backgroundColor: colorRegistro(a) }} />
                ))}
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
                Últimas {ultimas10.length} sesiones
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">Todavía no hay registros de asistencia.</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Ficha técnica
        </div>
        {partidosJugadosOrdenados.length > 0 && (
          <Select className="mb-3" value={ambitoValido} onChange={(e) => setAmbito(e.target.value)}>
            <option value="temporada">Toda la temporada</option>
            {partidosJugadosOrdenados.map((p) => (
              <option key={p.id} value={p.id}>
                {new Date(p.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} vs {p.rival}
              </option>
            ))}
          </Select>
        )}

        {ambitoValido === "temporada" ? (
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Eficacia de tiro</div>
              <div className="flex items-center justify-center gap-6 card-surface p-4">
                <AnilloDonut
                  tamano={96}
                  segmentos={[
                    { label: "Gol", valor: desgloseJuego.gol, color: "var(--color-success)" },
                    { label: "Parado", valor: desgloseJuego.parado, color: "#3d8ad6" },
                    { label: "Fuera", valor: desgloseJuego.fuera, color: "var(--color-accent)" },
                    { label: "Poste", valor: desgloseJuego.poste, color: "color-mix(in srgb, var(--color-accent) 55%, white)" },
                  ]}
                  centro={
                    pctJuego === null ? (
                      <span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">Juego abierto</span>
                    ) : (
                      <div className="flex flex-col items-center leading-none">
                        <span className="stat-number text-lg text-[var(--color-ink)]">{pctJuego}%</span>
                        <span className="mt-0.5 px-1 text-center text-[7px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">Juego abierto</span>
                      </div>
                    )
                  }
                />
                <AnilloDonut
                  tamano={96}
                  segmentos={[
                    { label: "Gol", valor: desglosePenalti.gol, color: "var(--color-success)" },
                    { label: "Parado", valor: desglosePenalti.parado, color: "#3d8ad6" },
                    { label: "Fuera", valor: desglosePenalti.fuera, color: "var(--color-accent)" },
                    { label: "Poste", valor: desglosePenalti.poste, color: "color-mix(in srgb, var(--color-accent) 55%, white)" },
                  ]}
                  centro={
                    pctPenalti === null ? (
                      <span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">7 metros</span>
                    ) : (
                      <div className="flex flex-col items-center leading-none">
                        <span className="stat-number text-lg text-[var(--color-ink)]">{pctPenalti}%</span>
                        <span className="mt-0.5 px-1 text-center text-[7px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">7 metros</span>
                      </div>
                    )
                  }
                />
              </div>
            </div>

            <div className="card-surface p-4">
              <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Tiro propio</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <BloqueTiro
                  titulo="Juego abierto"
                  detalle={eficaciaConDetalle(eventosDelJugador, { soloPenalti: false })}
                  zonas={zonasJuego}
                  total={tirosJuego.length}
                  aciertosPorZona={golesZonasJuego}
                  etiquetaAcierto="goles"
                />
                <BloqueTiro
                  titulo="7 metros"
                  detalle={eficaciaConDetalle(eventosDelJugador, { soloPenalti: true })}
                  zonas={zonasPenalti}
                  total={tirosPenalti.length}
                  aciertosPorZona={golesZonasPenalti}
                  etiquetaAcierto="goles"
                />
              </div>
            </div>

            <LineaEvolucionEficacia puntos={tendenciaEficacia} />

            {portero && (
              <>
                <div>
                  <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Portería</div>
                  <div className="flex items-center justify-center gap-6 card-surface p-4">
                    <AnilloDonut
                      tamano={96}
                      segmentos={[
                        { label: "Parado", valor: desgloseRivalJuego.parado, color: "#3d8ad6" },
                        { label: "Gol", valor: desgloseRivalJuego.gol, color: "var(--color-success)" },
                        { label: "Fuera", valor: desgloseRivalJuego.fuera, color: "var(--color-accent)" },
                        { label: "Poste", valor: desgloseRivalJuego.poste, color: "color-mix(in srgb, var(--color-accent) 55%, white)" },
                      ]}
                      centro={
                        detalleParadasJuego === null ? (
                          <span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">Juego abierto</span>
                        ) : (
                          <div className="flex flex-col items-center leading-none">
                            <span className="stat-number text-lg text-[var(--color-ink)]">{detalleParadasJuego.pct}%</span>
                            <span className="mt-0.5 px-1 text-center text-[7px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">Juego abierto</span>
                          </div>
                        )
                      }
                    />
                    <AnilloDonut
                      tamano={96}
                      segmentos={[
                        { label: "Parado", valor: desgloseRivalPenalti.parado, color: "#3d8ad6" },
                        { label: "Gol", valor: desgloseRivalPenalti.gol, color: "var(--color-success)" },
                        { label: "Fuera", valor: desgloseRivalPenalti.fuera, color: "var(--color-accent)" },
                        { label: "Poste", valor: desgloseRivalPenalti.poste, color: "color-mix(in srgb, var(--color-accent) 55%, white)" },
                      ]}
                      centro={
                        detalleParadasPenalti === null ? (
                          <span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">7 metros</span>
                        ) : (
                          <div className="flex flex-col items-center leading-none">
                            <span className="stat-number text-lg text-[var(--color-ink)]">{detalleParadasPenalti.pct}%</span>
                            <span className="mt-0.5 px-1 text-center text-[7px] uppercase leading-tight tracking-[0.06em] text-[var(--color-text-faint)]">7 metros</span>
                          </div>
                        )
                      }
                    />
                  </div>
                  {muestraPequenaPortero && (
                    <p className="mt-2 text-[10px] text-[var(--color-text-faint)]">
                      Menos de {MIN_TIROS_RECIBIDOS} tiros recibidos en la temporada — interpreta el % con cautela.
                    </p>
                  )}
                </div>

                <div className="card-surface p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <BloqueTiro
                      titulo="Juego abierto"
                      detalle={detalleParadasJuego}
                      zonas={zonasRivalJuego}
                      total={tirosRivalJuego.length}
                      aciertosPorZona={paradasZonasRivalJuego}
                      etiquetaAcierto="paradas"
                    />
                    <BloqueTiro
                      titulo="7 metros"
                      detalle={detalleParadasPenalti}
                      zonas={zonasRivalPenalti}
                      total={tirosRivalPenalti.length}
                      aciertosPorZona={paradasZonasRivalPenalti}
                      etiquetaAcierto="paradas"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <DesgloseJugadorPartido jugador={jugador} eventos={eventos.filter((e) => e.partido_id === ambitoValido)} />
            <button
              onClick={() => navigate(`/equipos/${equipoId}/partido/${ambitoValido}?vista=ficha`)}
              className="text-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              Ver ficha técnica completa del partido →
            </button>
          </div>
        )}
      </div>

      <JugadorFormModal
        open={editando}
        onClose={() => setEditando(false)}
        equipoId={equipoId}
        jugador={jugador}
        onSaved={() => {
          setEditando(false);
          cargar();
        }}
        onDeleted={() => navigate(`/equipos/${equipoId}/equipo`)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en todo el proyecto. Presta atención a que no queden referencias colgantes a `eficaciaLanzamiento`, `minutosJugados`, `bars`, `balonesPerdidos`, `minutosTotales`, `partidosConMinutos`, `eficaciaLanzamientoPct`, `perdidasPorPartido`, `minutosPorPartido`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/JugadorDetailPage.tsx
git commit -m "refactor: Ficha técnica de jugador — foco en estadística de temporada con selector de ámbito"
```

---

## Task 5: Verificación final, `ui-estetica`, prueba manual

**Files:** ninguno nuevo — comandos + revisión de agente.

- [ ] **Step 1: Typecheck + lint + build completos**

Run: `npx tsc -b --noEmit && npm run lint && npm run build`
Expected: los tres limpios.

- [ ] **Step 2: Revisión de `ui-estetica`**

Dispatch al agente `ui-estetica` para revisar `LineaEvolucionEficacia.tsx`, `DesgloseJugadorPartido.tsx`, `PanelJugadorPartido.tsx` (tras el refactor) y `JugadorDetailPage.tsx` frente a CLAUDE.md: tema claro estándar (esta página no es "Partido en directo"), consistencia con `FichaTecnica.tsx` en el patrón anillo+mapa de calor, que la línea de evolución se lea de un vistazo, y que el selector se integre bien con el resto de la página. Aplicar los hallazgos reales que encuentre.

- [ ] **Step 3: Prueba manual del usuario**

Pedir al usuario que abra la ficha de un jugador con tiros en al menos 2 partidos (para ver la línea de evolución con más de un punto) y de un/a portero/a, y confirme: el anillo y el mapa de calor de "Toda la temporada" tienen sentido acumulado; la línea de evolución sube/baja de forma coherente con los partidos reales; la sección de portero aparece solo para porteros, con el aviso de muestra pequeña si corresponde; el selector cambia correctamente a la vista de partido concreto (mismo contenido que el panel de la ficha de partido); y el enlace "Ver ficha técnica completa del partido" abre esa ficha directamente.

- [ ] **Step 4: Commit final si `ui-estetica` aplicó cambios**

```bash
git add -A
git commit -m "fix: ajustes de ui-estetica sobre la ficha técnica de jugador (temporada)"
```
