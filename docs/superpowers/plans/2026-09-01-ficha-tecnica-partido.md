# Ficha técnica de partido — dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir los recuentos brutos de `FichaTecnica.tsx` por un dashboard de estadísticas derivadas (eficacia con desglose juego abierto/7m + mapa de calor, % de paradas de nuestra portería, cifras simples, tabla por jugador con nota /10 que enlaza a su ficha con este partido preseleccionado).

**Architecture:** Tres funciones nuevas en `partidoStats.ts` (eficacia con detalle honesto, distribución por zona, % de paradas) sobre las que se apoya un motor de valoración nuevo (`valoracion.ts`, compara a cada jugador contra sus compañeros comparables del mismo ámbito) y la reescritura de `FichaTecnica.tsx`, que ya usa `MapaCalorPorteria` (paso anterior de esta fase).

**Tech Stack:** React 19 + TypeScript + Tailwind. Sin test runner — verificación vía `tsc -b`, `eslint`, `npm run build`, `ui-estetica`, y el usuario revisando con datos reales.

**Spec:** `docs/superpowers/specs/2026-09-01-fichas-tecnicas-dashboard-design.md`

## Global Constraints

- 7 metros y juego abierto nunca se mezclan en el mismo porcentaje.
- Honestidad estadística: todo porcentaje de este dashboard se muestra siempre junto con el recuento real ("2 de 3 — 67%"), sin excepción por tamaño de muestra — es la forma más simple de cumplir "nunca ocultar el recuento" sin lógica condicional por umbral.
- La nota /10 nunca se muestra si el jugador jugó menos de 10 minutos en el ámbito, o si hay menos de 2 compañeros comparables (mismo rol: de campo contra de campo, porteros contra porteros) con datos en ese ámbito — se muestra "—".
- Robos/Pérdidas/Exclusiones+tarjetas se normalizan a ritmo por 30 minutos jugados antes de comparar entre jugadores; la eficacia de tiro y el % de paradas no se normalizan (ya son ratios).
- Mismo `MapaCalorPorteria` del paso anterior — no se reescribe, solo se consume.
- Sin librerías de gráficos. Sin cambios de paleta/tipografía (tinta+rojo, Barlow Condensed/Archivo).
- Todo en español.

---

## Task 1: `partidoStats.ts` — eficacia con detalle, distribución por zona, % de paradas

**Files:**
- Modify: `src/lib/partidoStats.ts`

**Interfaces:**
- Produces: `EficaciaDetalle` (type), `eficaciaConDetalle(eventos, opts?)`, `distribucionPorZona(eventos)`, `porcentajeParadas(eventos)`.

- [ ] **Step 1: Añadir las tres funciones y el tipo compartido**

Al final del archivo (o junto a `eficaciaLanzamiento`, que se queda igual — la usa otro código ya existente, no se toca):

```ts
/** `null` si no hay intentos — nunca un `0%`/`NaN%` engañoso. El recuento
 * real (`aciertos`/`intentos`) viaja siempre junto al porcentaje: es la
 * honestidad estadística de esta fase, no una condición por umbral. */
export type EficaciaDetalle = { pct: number; aciertos: number; intentos: number } | null;

/** Eficacia de tiro propio, con detalle. `opts.soloPenalti` separa juego
 * abierto (`false`) de 7 metros (`true`) — nunca se mezclan. Sin `opts`,
 * combina ambos en una eficacia global (para la cifra protagonista). */
export function eficaciaConDetalle(eventos: EventosRow[], opts?: { soloPenalti: boolean }): EficaciaDetalle {
  const propios = eventos.filter(
    (e) => e.tipo === "tiro" && e.equipo_origen === "propio" && (opts === undefined || e.es_penalti === opts.soloPenalti),
  );
  const aciertos = propios.filter((e) => e.resultado === "gol").length;
  const intentos = propios.length;
  return intentos > 0 ? { pct: Math.round((aciertos / intentos) * 100), aciertos, intentos } : null;
}

/** Recuento de tiros por zona — el llamante ya filtra a los eventos que
 * interesan (p.ej. solo juego abierto, o solo 7m, o los del rival). */
export function distribucionPorZona(eventos: EventosRow[]): Record<number, number> {
  const mapa: Record<number, number> = {};
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.zona === null) continue;
    mapa[e.zona] = (mapa[e.zona] ?? 0) + 1;
  }
  return mapa;
}

/** % de paradas de nuestro portero. `eventos` ya viene filtrado por el
 * llamante a un jugador_id de portero concreto (o no, para el total del
 * equipo) — esta función solo separa los tiros del rival y calcula el ratio. */
export function porcentajeParadas(eventos: EventosRow[]): EficaciaDetalle {
  const rivales = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival");
  const aciertos = rivales.filter((e) => e.resultado === "parado").length;
  const intentos = rivales.length;
  return intentos > 0 ? { pct: Math.round((aciertos / intentos) * 100), aciertos, intentos } : null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en `partidoStats.ts`. Puede haber errores en `valoracion.ts`/`FichaTecnica.tsx` si ya existen de tasks anteriores incompletos — no es el caso al empezar este plan desde cero, así que debería quedar completamente limpio.

- [ ] **Step 3: Commit**

```bash
git add src/lib/partidoStats.ts
git commit -m "feat: eficacia con detalle, distribución por zona y porcentaje de paradas"
```

---

## Task 2: `valoracion.ts` — motor de la nota /10

**Files:**
- Create: `src/lib/valoracion.ts`

**Interfaces:**
- Consumes: `esPortero`, `minutosJugados`, `porcentajeParadas` de `@/lib/partidoStats` (Task 1 + ya existentes).
- Produces: `calcularNotas(jugadores, eventos, partidos): Map<UUID, number | null>`.

- [ ] **Step 1: Escribir el archivo**

```ts
import { esPortero, minutosJugados, porcentajeParadas } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow, PartidosRow, UUID } from "@/types/database";

/** Mínimos para que una nota se considere fiable — por debajo, se muestra
 * "—" en vez de un número que aparentaría más precisión de la que hay
 * (mismo principio de honestidad estadística que el resto del dashboard,
 * aplicado a la pieza más interpretativa de todas). */
const MIN_MINUTOS = 10;
const MIN_COMPANEROS = 2;

const PESO_EFICACIA = 0.4;
const PESOS_TASA: { clave: "robos" | "perdidas" | "sanciones"; peso: number; invertido: boolean }[] = [
  { clave: "robos", peso: 0.2, invertido: false },
  { clave: "perdidas", peso: 0.2, invertido: true },
  { clave: "sanciones", peso: 0.2, invertido: true },
];

type MetricasCampo = {
  eficacia: number | null;
  robos: number;
  perdidas: number;
  sanciones: number;
  minutos: number;
};

function minutosTotales(partidos: PartidosRow[], jugadorId: string): number {
  let total = 0;
  for (const p of partidos) total += minutosJugados(p.estadisticas.eventos ?? [], jugadorId);
  return total;
}

function metricasCampo(jugadorId: string, eventos: EventosRow[], partidos: PartidosRow[]): MetricasCampo {
  const propios = eventos.filter((e) => e.jugador_id === jugadorId);
  const minutos = minutosTotales(partidos, jugadorId);
  const factor30 = minutos > 0 ? 30 / minutos : 0;
  const tiros = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio");
  const goles = tiros.filter((e) => e.resultado === "gol").length;
  return {
    eficacia: tiros.length > 0 ? goles / tiros.length : null,
    robos: propios.filter((e) => e.tipo === "perdida" && e.equipo_origen === "rival").length * factor30,
    perdidas: propios.filter((e) => e.tipo === "perdida" && e.equipo_origen === "propio").length * factor30,
    sanciones: propios.filter((e) => e.tipo === "exclusion" || e.tipo === "tarjeta").length * factor30,
    minutos,
  };
}

/** Percentil de `valor` dentro de `todos` (0-1) — `todos` debe incluir el
 * propio `valor`. Los empates se reparten a partes iguales entre las
 * posiciones que ocupan, para no premiar/penalizar por orden de iteración. */
function percentil(valor: number, todos: number[]): number {
  if (todos.length <= 1) return 0.5;
  const menores = todos.filter((v) => v < valor).length;
  const igualesMenosUno = todos.filter((v) => v === valor).length - 1;
  return (menores + igualesMenosUno / 2) / (todos.length - 1);
}

function notaCampo(jugadorId: string, comparables: JugadoresRow[], metricas: Map<UUID, MetricasCampo>): number | null {
  const propia = metricas.get(jugadorId)!;
  if (propia.minutos < MIN_MINUTOS || comparables.length < MIN_COMPANEROS) return null;

  let pesoTotal = 0;
  let scoreTotal = 0;

  if (propia.eficacia !== null) {
    const valores = comparables.map((c) => metricas.get(c.id)!.eficacia).filter((v): v is number => v !== null);
    if (valores.length >= MIN_COMPANEROS) {
      scoreTotal += PESO_EFICACIA * percentil(propia.eficacia, valores);
      pesoTotal += PESO_EFICACIA;
    }
  }

  for (const { clave, peso, invertido } of PESOS_TASA) {
    const valores = comparables.map((c) => metricas.get(c.id)![clave]);
    const pct = percentil(propia[clave], valores);
    scoreTotal += peso * (invertido ? 1 - pct : pct);
    pesoTotal += peso;
  }

  return pesoTotal > 0 ? Math.round((scoreTotal / pesoTotal) * 100) / 10 : null;
}

/**
 * Nota /10 por jugador, comparando a cada uno contra sus compañeros
 * comparables (de campo contra de campo, porteros contra porteros) en el
 * mismo ámbito — un partido, o varios (`eventos`/`partidos` ya vienen
 * filtrados al ámbito por el llamante; `partidos` debe ser exactamente el
 * conjunto de partidos del que salen `eventos`, para que los minutos
 * jugados salgan del mismo ámbito que las estadísticas).
 *
 * `null` en el mapa: nota no fiable (menos de 10 minutos jugados en el
 * ámbito, o menos de 2 compañeros comparables con datos) — se muestra "—".
 */
export function calcularNotas(jugadores: JugadoresRow[], eventos: EventosRow[], partidos: PartidosRow[]): Map<UUID, number | null> {
  const notas = new Map<UUID, number | null>();
  const campo = jugadores.filter((j) => !esPortero(j.puesto));
  const porteros = jugadores.filter((j) => esPortero(j.puesto));

  const metricasCampoTodas = new Map(campo.map((j) => [j.id, metricasCampo(j.id, eventos, partidos)] as const));
  const comparablesCampo = campo.filter((j) => metricasCampoTodas.get(j.id)!.minutos >= MIN_MINUTOS);
  for (const j of campo) {
    notas.set(j.id, notaCampo(j.id, comparablesCampo, metricasCampoTodas));
  }

  const metricasPorteroTodas = new Map(
    porteros.map((j) => {
      const propios = eventos.filter((e) => e.jugador_id === j.id);
      return [j.id, { detalle: porcentajeParadas(propios), minutos: minutosTotales(partidos, j.id) }] as const;
    }),
  );
  const comparablesPorteros = porteros.filter((j) => {
    const m = metricasPorteroTodas.get(j.id)!;
    return m.minutos >= MIN_MINUTOS && m.detalle !== null;
  });
  for (const j of porteros) {
    const m = metricasPorteroTodas.get(j.id)!;
    if (m.minutos < MIN_MINUTOS || m.detalle === null || comparablesPorteros.length < MIN_COMPANEROS) {
      notas.set(j.id, null);
      continue;
    }
    const valores = comparablesPorteros.map((c) => metricasPorteroTodas.get(c.id)!.detalle!.pct);
    notas.set(j.id, Math.round(percentil(m.detalle.pct, valores) * 100) / 10);
  }

  return notas;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en `valoracion.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/valoracion.ts
git commit -m "feat: motor de valoración — nota /10 por percentil contra compañeros comparables"
```

---

## Task 3: `FichaTecnica.tsx` — reescritura completa

**Files:**
- Modify: `src/components/partido/FichaTecnica.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `MapaCalorPorteria{conteosPorZona,total?}` (ya existe); `eficaciaConDetalle`, `distribucionPorZona`, `porcentajeParadas`, `EficaciaDetalle` (Task 1); `calcularNotas` (Task 2); `perdidas`, `robos`, `exclusiones`, `tarjetas` (ya existen, sin cambios).
- Produces: mismo contrato de props que antes (`partido`, `jugadores`, `eventos`) — `PartidoDetailPage.tsx` no necesita tocarse.

**Decisiones de esta task (no están en la spec palabra por palabra, documentadas aquí para que quien la revise las vea):**
- La tabla "por jugador" solo lista a quien tiene al menos un evento en este partido (tiro/pérdida/exclusión/tarjeta con su `jugador_id`) — no toda la plantilla. Es la aproximación más simple a "convocados" sin añadir una carga de `asistencia` nueva a esta pantalla.
- Se añade una cifra de "Tarjetas" junto a Pérdidas/Robos/Exclusiones (la spec solo nombra las 3, pero ya se mostraba antes y quitarla sería una regresión).
- El detalle "(X de Y)" se muestra siempre junto a cada porcentaje, no solo por debajo de un umbral — cumple la honestidad estadística sin necesitar una rama condicional por tamaño de muestra.

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { useNavigate } from "react-router-dom";
import { useEquipo } from "@/hooks/useEquipo";
import { MapaCalorPorteria } from "@/components/partido/MapaCalorPorteria";
import {
  distribucionPorZona,
  eficaciaConDetalle,
  exclusiones,
  perdidas,
  porcentajeParadas,
  robos,
  tarjetas,
  type EficaciaDetalle,
} from "@/lib/partidoStats";
import { calcularNotas } from "@/lib/valoracion";
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
  const navigate = useNavigate();
  const { equipoId } = useEquipo();

  const eficaciaGlobal = eficaciaConDetalle(eventos);
  const eficaciaJuego = eficaciaConDetalle(eventos, { soloPenalti: false });
  const eficaciaPenalti = eficaciaConDetalle(eventos, { soloPenalti: true });
  const tirosJuego = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti);
  const tirosPenalti = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);

  const tirosRival = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival");
  const paradas = porcentajeParadas(eventos);
  const zonasRival = distribucionPorZona(tirosRival);

  const notas = calcularNotas(jugadores, eventos, [partido]);
  const jugadoresConDatos = new Set(eventos.filter((e) => e.jugador_id).map((e) => e.jugador_id));
  const filasJugadores = jugadores
    .filter((j) => jugadoresConDatos.has(j.id))
    .map((j) => {
      const propios = eventos.filter((e) => e.jugador_id === j.id);
      const golesJ = propios.filter((e) => e.tipo === "tiro" && e.resultado === "gol").length;
      const tirosJ = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio").length;
      return { jugador: j, goles: golesJ, tiros: tirosJ, eficacia: eficaciaConDetalle(propios), nota: notas.get(j.id) ?? null };
    })
    .sort((a, b) => b.goles - a.goles);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Tiro propio</div>
        <CifraProtagonista detalle={eficaciaGlobal} etiqueta="de eficacia global" vacio="Sin tiros registrados todavía." />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BloqueTiro titulo="Juego abierto" detalle={eficaciaJuego} zonas={zonasJuego} total={tirosJuego.length} />
          <BloqueTiro titulo="7 metros" detalle={eficaciaPenalti} zonas={zonasPenalti} total={tirosPenalti.length} />
        </div>
      </div>

      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Nuestra portería</div>
        <CifraProtagonista detalle={paradas} etiqueta="de paradas" vacio="El rival no ha tirado todavía." />
        <div className="mt-3">
          <MapaCalorPorteria conteosPorZona={zonasRival} total={tirosRival.length} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <CifraSimple label="Pérdidas" valor={perdidas(eventos)} />
        <CifraSimple label="Robos" valor={robos(eventos)} />
        <CifraSimple label="Exclusiones" valor={exclusiones(eventos)} />
        <CifraSimple label="Tarjetas" valor={tarjetas(eventos)} />
      </div>

      {filasJugadores.length > 0 && (
        <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Por jugador</div>
          <div className="flex flex-col gap-1">
            {filasJugadores.map((f) => (
              <button
                key={f.jugador.id}
                onClick={() => navigate(`/equipos/${equipoId}/jugador/${f.jugador.id}?partido=${partido.id}`)}
                className="flex items-center gap-3 rounded-[3px] bg-white/[.04] px-3 py-2 text-left"
              >
                <span className="stat-number w-6 shrink-0 text-sm text-white/60">{f.jugador.dorsal ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-white">{f.jugador.nombre}</span>
                <span className="stat-number w-6 shrink-0 text-right text-sm text-white">{f.goles}</span>
                <span className="w-14 shrink-0 text-right text-[10px] text-white/40">{f.tiros} tiros</span>
                <span className="w-12 shrink-0 text-right text-[10px] text-white/40">
                  {f.eficacia ? `${f.eficacia.pct}%` : "—"}
                </span>
                <span className="stat-number w-8 shrink-0 text-right text-sm" style={{ color: "var(--color-accent)" }}>
                  {f.nota !== null ? f.nota.toFixed(1) : "—"}
                </span>
              </button>
            ))}
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

function CifraProtagonista({ detalle, etiqueta, vacio }: { detalle: EficaciaDetalle; etiqueta: string; vacio: string }) {
  if (!detalle) return <div className="text-sm text-white/40">{vacio}</div>;
  return (
    <div>
      <div className="stat-number text-4xl leading-none text-white">{detalle.pct}%</div>
      <div className="mt-1 text-xs text-white/50">
        {etiqueta} ({detalle.aciertos} de {detalle.intentos})
      </div>
    </div>
  );
}

function BloqueTiro({
  titulo,
  detalle,
  zonas,
  total,
}: {
  titulo: string;
  detalle: EficaciaDetalle;
  zonas: Record<number, number>;
  total: number;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">{titulo}</div>
      {detalle ? (
        <div className="mb-2 text-sm text-white/70">
          <span className="stat-number text-lg text-white">{detalle.pct}%</span> ({detalle.aciertos} de {detalle.intentos})
        </div>
      ) : (
        <div className="mb-2 text-xs text-white/35">Sin tiros.</div>
      )}
      <MapaCalorPorteria conteosPorZona={zonas} total={total} />
    </div>
  );
}

function CifraSimple({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-[3px] border border-white/[.07] bg-white/[.04] px-2 py-2 text-center">
      <div className="stat-number text-xl text-white">{valor}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.06em] text-white/40">{label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en todo el proyecto.

- [ ] **Step 3: Commit**

```bash
git add src/components/partido/FichaTecnica.tsx
git commit -m "refactor: Ficha técnica de partido — dashboard con estadísticas derivadas, mapas de calor y nota /10"
```

---

## Task 4: Verificación final, `ui-estetica`, prueba manual

**Files:** ninguno nuevo — comandos + revisión de agente.

- [ ] **Step 1: Typecheck + lint + build completos**

Run: `npx tsc -b --noEmit && npm run lint && npm run build`
Expected: los tres limpios.

- [ ] **Step 2: Revisión de `ui-estetica`**

Dispatch al agente `ui-estetica` para revisar `FichaTecnica.tsx` frente a CLAUDE.md y frente a la densidad ya aplicada al resto de "Partido en directo" (radios `rounded`/`rounded-[3px]`, tipografía apretada) — específicamente que la cifra protagonista de cada bloque destaque de verdad frente al detalle, que la tabla por jugador sea legible en móvil estrecho, y que no se haya colado ningún color fuera de paleta. Aplicar los hallazgos reales que encuentre.

- [ ] **Step 3: Prueba manual del usuario**

No hay credenciales de login disponibles — pedir al usuario que abra un partido con tiros/pérdidas/exclusiones ya registrados y confirme: la eficacia global y los dos desgloses (juego abierto/7m) muestran números que tienen sentido con lo registrado en "Partido en directo"; los mapas de calor de cada bloque reflejan las zonas realmente tocadas; "Nuestra portería" refleja los tiros del rival; la tabla por jugador enlaza correctamente a `/jugador/:id?partido=:partidoId`; y sobre todo — el objetivo explícito de esta fase — que las cifras se lean y entiendan en unos segundos, no que haga falta interpretarlas.

- [ ] **Step 4: Commit final si `ui-estetica` aplicó cambios**

```bash
git add -A
git commit -m "fix: ajustes de ui-estetica sobre la ficha técnica de partido"
```
