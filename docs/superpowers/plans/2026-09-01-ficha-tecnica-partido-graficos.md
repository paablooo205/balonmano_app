# Ficha técnica de partido — rediseño con gráficos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `FichaTecnica.tsx` (partido) con gráficos variados y legibles (anillo de eficacia, barras apiladas por jugador, línea de marcador con diferencia, anillo de pérdidas/robos, marcador temporal de exclusiones), manteniendo `MapaCalorPorteria` y corrigiendo antes un bug de alineación entre los mapas de calor actuales. El clic en un jugador de las barras abre un panel local (no navega fuera de la pantalla).

**Architecture:** Cinco componentes de presentación nuevos y autocontenidos en `src/components/partido/` (`AnilloDonut`, `BarrasJugador`, `LineaMarcador`, `MarcadorExclusiones`, `PanelJugadorPartido`), un componente compartido extraído (`BloqueTiro`, hoy privado dentro de `FichaTecnica.tsx`), dos funciones de datos nuevas en `partidoStats.ts` y un helper de escala temporal nuevo (`src/lib/escalaTiempo.ts`). Ningún componente nuevo usa librería de gráficos — SVG/CSS a medida, mismo estilo que `CuadriculaPorteria`/`MapaCalorPorteria`/`TendenciaEficacia` ya existentes.

**Tech Stack:** React 19 + TypeScript + Tailwind. Sin test runner ni librería de gráficos — verificación vía `tsc -b`, `eslint`, `npm run build`, `ui-estetica`, y el usuario revisando con datos reales (especialmente la línea de marcador, que depende del orden temporal real de los eventos).

**Spec:** `docs/superpowers/specs/2026-09-01-ficha-tecnica-partido-graficos-design.md`

## Global Constraints

- 7 metros y juego abierto nunca se mezclan en el mismo porcentaje — se mantienen separados en tiro propio, portería y el anillo de eficacia.
- Todo porcentaje/recuento se muestra siempre honesto (recuento real visible, nunca solo un % suelto).
- Sin librerías de gráficos — todo SVG/CSS a medida.
- Tema oscuro (`bg-[#15151a]`, acento rojo) — excepción ya sancionada de "Partido en directo", se mantiene en todo lo nuevo de esta fase.
- `MapaCalorPorteria` no se modifica, solo se sigue consumiendo tal cual.
- Colores reutilizados de la paleta ya existente en esta zona (`var(--color-success)`=gol/robo, `#3d8ad6`=parado, `var(--color-accent)`=fuera/rival/exclusión-rival, `var(--color-warning)`=pérdida/exclusión-propia, `color-mix(in oklab, var(--color-accent) 55%, white)`=poste) — ningún color nuevo fuera de esta tabla.
- Todo en español.

---

## Task 1: Corregir la alineación de los mapas de calor (rápido, primero)

**Files:**
- Modify: `src/components/partido/FichaTecnica.tsx`

**Interfaces:** ninguna nueva — cambio de una clase CSS.

**Diagnóstico:** dentro de la función privada `BloqueTiro` (en este archivo), la rama "con datos" usa `text-sm` para la línea de detalle y la rama "sin datos" usa `text-xs` — distinta altura de línea, así que cuando un lado de la fila `grid-cols-2` tiene tiros y el otro no, sus `MapaCalorPorteria` arrancan a alturas distintas. El fix es igualar el tamaño de texto en ambas ramas.

- [ ] **Step 1: Cambiar `text-xs` por `text-sm` en la rama vacía de `BloqueTiro`**

Busca esto dentro de `function BloqueTiro(...)`:

```tsx
      ) : (
        <div className="mb-2 text-xs text-white/35">Sin tiros.</div>
      )}
```

Y cámbialo a:

```tsx
      ) : (
        <div className="mb-2 text-sm text-white/35">Sin tiros.</div>
      )}
```

No toques nada más de este archivo en esta task — el resto del rediseño llega en tasks posteriores.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/partido/FichaTecnica.tsx
git commit -m "fix: iguala el tamaño de texto en BloqueTiro para alinear los mapas de calor"
```

---

## Task 2: Funciones de datos para los gráficos nuevos

**Files:**
- Modify: `src/lib/partidoStats.ts`
- Create: `src/lib/escalaTiempo.ts`

**Interfaces:**
- Produces: `desgloseResultados(eventos): {gol,parado,fuera,poste}`, `serieMarcador(eventos): {ts,favor,contra}[]`, `crearEscalaTiempo(timestamps, ancho): (ts: string) => number`.

- [ ] **Step 1: Añadir las dos funciones a `partidoStats.ts`**

Al final del archivo:

```ts
/** Recuento de tiros por resultado — el llamante ya filtra a los eventos
 * que interesan (p.ej. solo juego abierto propio, o solo 7m), igual
 * contrato que `distribucionPorZona`. Base del anillo de eficacia. */
export function desgloseResultados(eventos: EventosRow[]): { gol: number; parado: number; fuera: number; poste: number } {
  const conteo = { gol: 0, parado: 0, fuera: 0, poste: 0 };
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.resultado === null) continue;
    conteo[e.resultado]++;
  }
  return conteo;
}

/** Marcador acumulado en cada gol, en orden cronológico — base de la línea
 * de marcador. Sin goles, lista vacía (el llamante decide qué hacer con
 * menos de 2 puntos, igual que `TendenciaEficacia`). */
export function serieMarcador(eventos: EventosRow[]): { ts: string; favor: number; contra: number }[] {
  const goles = eventos
    .filter((e) => e.tipo === "tiro" && e.resultado === "gol")
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  let favor = 0;
  let contra = 0;
  return goles.map((e) => {
    if (e.equipo_origen === "propio") favor++;
    else contra++;
    return { ts: e.creado_en, favor, contra };
  });
}
```

- [ ] **Step 2: Crear `src/lib/escalaTiempo.ts`**

```ts
/**
 * Convierte una lista de timestamps ISO en una función que devuelve la
 * posición horizontal (0 a `ancho`) proporcional al tiempo transcurrido
 * desde el primer timestamp de la lista. Con 0 timestamps o con todos
 * iguales (rango cero — un único instante, o varios eventos en el mismo
 * milisegundo), siempre devuelve 0 — nunca división por cero, y no hay
 * "transcurrido" real que repartir en esos casos.
 *
 * Cada gráfico que la usa (`LineaMarcador`, `MarcadorExclusiones`) calcula
 * su propia escala a partir de sus propios puntos — no hay un eje temporal
 * compartido entre gráficos distintos de la pantalla, cada uno es su
 * propia ventana temporal local (ver spec, decisión explícita).
 */
export function crearEscalaTiempo(timestamps: string[], ancho: number): (ts: string) => number {
  if (timestamps.length === 0) return () => 0;
  const valores = timestamps.map((t) => new Date(t).getTime());
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min;
  if (rango === 0) return () => 0;
  return (ts: string) => ((new Date(ts).getTime() - min) / rango) * ancho;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/partidoStats.ts src/lib/escalaTiempo.ts
git commit -m "feat: desglose de resultados, serie de marcador y escala temporal para los gráficos nuevos"
```

---

## Task 3: `AnilloDonut.tsx` — anillo genérico reutilizable

**Files:**
- Create: `src/components/partido/AnilloDonut.tsx`

**Interfaces:**
- Produces: `AnilloDonut({ segmentos: {label,valor,color}[]; tamano?: number; centro?: React.ReactNode })`. Reutilizado por el anillo de eficacia (2 instancias, juego abierto y 7m) y el anillo de pérdidas/robos (1 instancia).

**Detalle importante:** un donut con un único segmento no-vacío que representa el 100% del total es un caso especial de SVG — un arco `A` con ángulo inicio=fin=0/360 no dibuja nada (el punto de inicio y fin del arco coinciden). Hay que detectarlo y dibujar un `<circle>` completo en su lugar en vez de un `<path>` de arco.

- [ ] **Step 1: Crear el componente**

```tsx
function coordenadaArco(cx: number, cy: number, r: number, angulo: number) {
  const rad = ((angulo - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function trazarArco(cx: number, cy: number, r: number, anguloInicio: number, anguloFin: number): string {
  const inicio = coordenadaArco(cx, cy, r, anguloFin);
  const fin = coordenadaArco(cx, cy, r, anguloInicio);
  const largoArco = anguloFin - anguloInicio <= 180 ? 0 : 1;
  return `M ${inicio.x} ${inicio.y} A ${r} ${r} 0 ${largoArco} 0 ${fin.x} ${fin.y}`;
}

/**
 * Anillo (donut) genérico de N segmentos con leyenda honesta debajo (color +
 * etiqueta + recuento real de cada segmento, nunca solo el arco sin cifra).
 * Sin datos (`total === 0`): anillo gris neutro + "Sin datos" en el centro,
 * nunca un anillo relleno falso. Un único segmento con el 100% del total:
 * círculo completo (un arco de 360° con el mismo punto de inicio y fin no
 * dibuja nada en SVG — caso especial).
 */
export function AnilloDonut({
  segmentos,
  tamano = 96,
  centro,
}: {
  segmentos: { label: string; valor: number; color: string }[];
  tamano?: number;
  centro?: React.ReactNode;
}) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const segmentosConValor = segmentos.filter((s) => s.valor > 0);
  const r = tamano / 2 - 8;
  const cx = tamano / 2;
  const cy = tamano / 2;

  let anguloActual = 0;
  const arcos = segmentosConValor.map((s) => {
    const anguloInicio = anguloActual;
    const anguloFin = anguloActual + (s.valor / total) * 360;
    anguloActual = anguloFin;
    return { ...s, path: trazarArco(cx, cy, r, anguloInicio, anguloFin) };
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: tamano, height: tamano }}>
        <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`}>
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="10" />
          ) : segmentosConValor.length === 1 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={segmentosConValor[0].color} strokeWidth="10" />
          ) : (
            arcos.map((a, i) => <path key={i} d={a.path} fill="none" stroke={a.color} strokeWidth="10" strokeLinecap="butt" />)
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center">
          {centro ?? (total === 0 && <span className="text-[9px] text-white/30">Sin datos</span>)}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-1">
        {segmentos.map((s) => (
          <span key={s.label} className="flex items-center gap-1 text-[9px] text-white/45">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            {s.label} ({s.valor})
          </span>
        ))}
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
git add src/components/partido/AnilloDonut.tsx
git commit -m "feat: componente de anillo genérico reutilizable con leyenda honesta"
```

---

## Task 4: `BarrasJugador.tsx` — barras apiladas por jugador

**Files:**
- Create: `src/components/partido/BarrasJugador.tsx`

**Interfaces:**
- Consumes: `desgloseResultados` de `@/lib/partidoStats` (Task 2).
- Produces: `BarrasJugador({ jugadores: JugadoresRow[]; eventos: EventosRow[]; onSeleccionar: (jugador: JugadoresRow) => void })`. `onSeleccionar` se dispara al tocar la fila de un jugador — quien lo use decide qué hacer (en `FichaTecnica.tsx`, abrirá el panel local de la Task 7).

**Decisión:** las barras se dividen en gol/fuera/parado únicamente (poste queda fuera, decisión explícita del usuario) — la anchura de cada segmento es proporcional a `gol+fuera+parado` de ese jugador, no al total de tiros incluyendo postes.

- [ ] **Step 1: Crear el componente**

```tsx
import { desgloseResultados } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Sustituye a la antigua tabla "Por jugador": una barra horizontal por
 * jugador, dividida en gol/fuera/parado (poste queda fuera de la barra,
 * decisión explícita — un jugador con solo postes se ve con la barra
 * vacía salvo su contorno). Ordenadas de más a menos goles. Tocar una fila
 * dispara `onSeleccionar` — este componente no decide qué pasa después.
 */
export function BarrasJugador({
  jugadores,
  eventos,
  onSeleccionar,
}: {
  jugadores: JugadoresRow[];
  eventos: EventosRow[];
  onSeleccionar: (jugador: JugadoresRow) => void;
}) {
  const jugadoresConDatos = new Set(eventos.filter((e) => e.jugador_id).map((e) => e.jugador_id));
  const filas = jugadores
    .filter((j) => jugadoresConDatos.has(j.id))
    .map((j) => {
      const propios = eventos.filter((e) => e.jugador_id === j.id && e.tipo === "tiro" && e.equipo_origen === "propio");
      const { gol, parado, fuera } = desgloseResultados(propios);
      return { jugador: j, gol, parado, fuera, total: gol + parado + fuera };
    })
    .sort((a, b) => b.gol - a.gol);

  if (filas.length === 0) return null;

  return (
    <div>
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Por jugador</div>
      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <div className="flex flex-col gap-2">
          {filas.map((f) => (
            <button
              key={f.jugador.id}
              onClick={() => onSeleccionar(f.jugador)}
              className="flex items-center gap-2 text-left"
            >
              <span className="stat-number w-5 shrink-0 text-sm text-white/60">{f.jugador.dorsal ?? "—"}</span>
              <span className="w-20 shrink-0 truncate text-xs text-white">{f.jugador.nombre}</span>
              <div className="flex h-4 flex-1 overflow-hidden rounded-[3px] bg-white/[.05]">
                {f.total > 0 && (
                  <>
                    <div style={{ width: `${(f.gol / f.total) * 100}%`, background: "var(--color-success)" }} />
                    <div style={{ width: `${(f.fuera / f.total) * 100}%`, background: "var(--color-accent)" }} />
                    <div style={{ width: `${(f.parado / f.total) * 100}%`, background: "#3d8ad6" }} />
                  </>
                )}
              </div>
              <span className="stat-number w-4 shrink-0 text-right text-xs text-white">{f.gol}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-3 text-[9px] text-white/40">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
            Gol
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
            Fuera
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#3d8ad6" }} />
            Parado
          </span>
        </div>
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
git add src/components/partido/BarrasJugador.tsx
git commit -m "feat: barras apiladas por jugador, sustituye a la tabla de jugadores"
```

---

## Task 5: `LineaMarcador.tsx` — línea de marcador y diferencia (mayor riesgo temporal)

**Files:**
- Create: `src/components/partido/LineaMarcador.tsx`

**Interfaces:**
- Consumes: `serieMarcador` de `@/lib/partidoStats` (Task 2), `crearEscalaTiempo` de `@/lib/escalaTiempo` (Task 2).
- Produces: `LineaMarcador({ eventos: EventosRow[] })`. Con menos de 2 goles en el partido, no renderiza nada — mismo criterio de honestidad que `TendenciaEficacia` (una línea con 1 solo punto no es una línea).

**Nota de riesgo (la que preocupa al usuario):** el eje X de ambos gráficos (marcador real y diferencia) se calcula UNA sola vez con `crearEscalaTiempo(serie.map(p => p.ts), w)` y se reutiliza para las tres polylines — así que si el orden cronológico de `serieMarcador` es correcto (ya ordenado por `creado_en` dentro de esa función), los dos gráficos apilados quedan automáticamente alineados entre sí, no hay dos cálculos de escala independientes que puedan divergir.

- [ ] **Step 1: Crear el componente**

```tsx
import { crearEscalaTiempo } from "@/lib/escalaTiempo";
import { serieMarcador } from "@/lib/partidoStats";
import type { EventosRow } from "@/types/database";

/**
 * Dos gráficos apilados que comparten el mismo eje X (misma escala temporal,
 * calculada una sola vez a partir de los mismos puntos): arriba el marcador
 * real (nuestra línea en acento, la del rival en blanco atenuado), abajo la
 * diferencia de goles (una sola línea, por encima/debajo de la línea de
 * cero). Con menos de 2 goles en el partido no hay línea que trazar — mismo
 * criterio que `TendenciaEficacia`.
 */
export function LineaMarcador({ eventos }: { eventos: EventosRow[] }) {
  const serie = serieMarcador(eventos);
  if (serie.length < 2) return null;

  const w = 300;
  const hMarcador = 60;
  const hDiff = 36;
  const escalaX = crearEscalaTiempo(
    serie.map((p) => p.ts),
    w,
  );

  const maxGoles = Math.max(...serie.map((p) => Math.max(p.favor, p.contra)), 1);
  const yMarcador = (v: number) => hMarcador - (v / maxGoles) * hMarcador;

  const maxDiffAbs = Math.max(...serie.map((p) => Math.abs(p.favor - p.contra)), 1);
  const yDiff = (v: number) => hDiff / 2 - (v / maxDiffAbs) * (hDiff / 2);

  const puntosFavor = serie.map((p) => `${escalaX(p.ts)},${yMarcador(p.favor)}`).join(" ");
  const puntosContra = serie.map((p) => `${escalaX(p.ts)},${yMarcador(p.contra)}`).join(" ");
  const puntosDiff = serie.map((p) => `${escalaX(p.ts)},${yDiff(p.favor - p.contra)}`).join(" ");

  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Marcador</div>
      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <svg viewBox={`0 0 ${w} ${hMarcador}`} className="h-16 w-full" preserveAspectRatio="none">
          <polyline points={puntosFavor} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={puntosContra} fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="mb-2 mt-1 flex gap-3 text-[9px] text-white/40">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
            Nosotros
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            Rival
          </span>
        </div>
        <div className="border-t border-white/[.07] pt-2">
          <div className="mb-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-white/30">Diferencia</div>
          <svg viewBox={`0 0 ${w} ${hDiff}`} className="h-9 w-full" preserveAspectRatio="none">
            <line x1="0" y1={hDiff / 2} x2={w} y2={hDiff / 2} stroke="white" strokeOpacity="0.15" strokeWidth="1" />
            <polyline points={puntosDiff} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 3: Verificación manual de la escala temporal con datos sintéticos**

Antes de comitear, comprueba a mano que `crearEscalaTiempo` ordena bien con timestamps reales. Crea un archivo temporal `tmp-verify-escala.ts` en la raíz del worktree:

```ts
import { crearEscalaTiempo } from "./src/lib/escalaTiempo";
import { serieMarcador } from "./src/lib/partidoStats";
import type { EventosRow } from "./src/types/database";

const base = (offset: number, favor: boolean): EventosRow => ({
  id: String(offset),
  equipo_id: "",
  partido_id: "p1",
  sesion_id: null,
  jugador_id: null,
  equipo_origen: favor ? "propio" : "rival",
  tipo: "tiro",
  resultado: "gol",
  zona: null,
  origen: null,
  es_penalti: false,
  color_tarjeta: null,
  creado_en: new Date(2026, 0, 1, 10, 0, offset).toISOString(),
});

const eventos = [base(0, true), base(30, false), base(60, true), base(90, true)];
const serie = serieMarcador(eventos);
console.log("serie:", serie);
const escala = crearEscalaTiempo(serie.map((p) => p.ts), 300);
console.log("posiciones x:", serie.map((p) => escala(p.ts)));
console.log("esperado: 0, 100, 200, 300 (4 puntos repartidos a 30s exactos)");
```

Ejecuta `npx tsx tmp-verify-escala.ts` y confirma que las posiciones x son crecientes y coinciden con el orden real (0, 100, 200, 300 para 4 eventos equiespaciados). Borra `tmp-verify-escala.ts` después — no se commitea.

- [ ] **Step 4: Commit**

```bash
git add src/components/partido/LineaMarcador.tsx
git commit -m "feat: línea de marcador real y diferencia con eje temporal compartido"
```

---

## Task 6: `MarcadorExclusiones.tsx` — línea de tiempo de exclusiones

**Files:**
- Create: `src/components/partido/MarcadorExclusiones.tsx`

**Interfaces:**
- Consumes: `crearEscalaTiempo` de `@/lib/escalaTiempo` (Task 2).
- Produces: `MarcadorExclusiones({ eventos: EventosRow[] })`. Sin ninguna exclusión, no renderiza nada.

**Decisión (documentada en la spec):** soporta ambos colores (propia/rival), pero el registro en vivo actual solo permite exclusiones propias — el color "rival" no aparecerá hasta que se amplíe esa pantalla, fuera de alcance aquí.

- [ ] **Step 1: Crear el componente**

```tsx
import { crearEscalaTiempo } from "@/lib/escalaTiempo";
import type { EventosRow } from "@/types/database";

/**
 * Línea de tiempo simple: un punto por cada exclusión, posicionado según
 * cuándo ocurrió (propia en ámbar, rival en rojo) — sin eje Y, solo
 * posición horizontal. El registro en vivo actual solo permite exclusiones
 * propias; el color rival está soportado pero no aparecerá en la práctica
 * hasta que se amplíe esa pantalla (fuera de alcance de esta fase).
 */
export function MarcadorExclusiones({ eventos }: { eventos: EventosRow[] }) {
  const exclusiones = eventos.filter((e) => e.tipo === "exclusion").sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  if (exclusiones.length === 0) return null;

  const w = 300;
  const escalaX = crearEscalaTiempo(
    exclusiones.map((e) => e.creado_en),
    w,
  );
  const propias = exclusiones.filter((e) => e.equipo_origen === "propio").length;
  const rivales = exclusiones.filter((e) => e.equipo_origen === "rival").length;

  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Exclusiones</div>
      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <svg viewBox={`0 0 ${w} 20`} className="h-5 w-full" preserveAspectRatio="none">
          <line x1="0" y1="10" x2={w} y2="10" stroke="white" strokeOpacity="0.15" strokeWidth="1" />
          {exclusiones.map((e) => (
            <circle key={e.id} cx={escalaX(e.creado_en)} cy="10" r="4" fill={e.equipo_origen === "propio" ? "var(--color-warning)" : "var(--color-accent)"} />
          ))}
        </svg>
        <div className="mt-2 flex gap-3 text-[9px] text-white/40">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-warning)" }} />
            Propias ({propias})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
            Rival ({rivales})
          </span>
        </div>
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
git add src/components/partido/MarcadorExclusiones.tsx
git commit -m "feat: marcador temporal de exclusiones"
```

---

## Task 7: `BloqueTiro.tsx` (compartido) y `PanelJugadorPartido.tsx`

**Files:**
- Create: `src/components/partido/BloqueTiro.tsx`
- Create: `src/components/partido/PanelJugadorPartido.tsx`

**Interfaces:**
- Produces: `BloqueTiro({ titulo, detalle: EficaciaDetalle, zonas: Record<number,number>, total: number })` — extraído del `FichaTecnica.tsx` actual (con el fix de alineación de la Task 1 ya incorporado de fábrica), para que lo compartan `FichaTecnica.tsx` y este panel nuevo.
- Produces: `PanelJugadorPartido({ jugador: JugadoresRow; eventos: EventosRow[]; onCerrar: () => void })`. `eventos` debe venir ya acotado al partido (el llamante filtra), este componente filtra internamente por `jugador_id`.

**Decisión:** overlay propio en oscuro, no el `Modal` de `@/components/ui/modal` (ese es tema claro `card-surface`, mezclarlo aquí rompería la pantalla oscura de partido).

- [ ] **Step 1: Crear `BloqueTiro.tsx`**

```tsx
import { MapaCalorPorteria } from "@/components/partido/MapaCalorPorteria";
import type { EficaciaDetalle } from "@/lib/partidoStats";

/** Título + %/recuento honesto + mapa de calor — compartido por
 * `FichaTecnica.tsx` (tiro propio / nuestra portería) y
 * `PanelJugadorPartido.tsx` (mismo desglose a nivel de un jugador). Mismo
 * tema oscuro en ambos sitios, no hay variante clara de este bloque. */
export function BloqueTiro({
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
        <div className="mb-2 text-sm text-white/35">Sin tiros.</div>
      )}
      <MapaCalorPorteria conteosPorZona={zonas} total={total} />
    </div>
  );
}
```

- [ ] **Step 2: Crear `PanelJugadorPartido.tsx`**

```tsx
import { X } from "lucide-react";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { distribucionPorZona, eficaciaConDetalle } from "@/lib/partidoStats";
import type { EventosRow, JugadoresRow } from "@/types/database";

/**
 * Panel local (no navega de pantalla) con el mini-desglose de un jugador
 * en este partido: eficacia y zonas de tiro, juego abierto/7m separados
 * igual que el resto del dashboard. Overlay propio en oscuro — el `Modal`
 * compartido del proyecto es tema claro, no encaja aquí.
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
  const propios = eventos.filter((e) => e.jugador_id === jugador.id);
  const eficaciaJuego = eficaciaConDetalle(propios, { soloPenalti: false });
  const eficaciaPenalti = eficaciaConDetalle(propios, { soloPenalti: true });
  const tirosJuego = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti);
  const tirosPenalti = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-4" onClick={onCerrar}>
      <div
        className="flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-2xl border border-white/[.09] bg-[#15151a] p-4 md:max-w-md md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="stat-number text-sm text-white/60">#{jugador.dorsal ?? "—"} </span>
            <span className="text-sm font-medium text-white">{jugador.nombre}</span>
          </div>
          <button aria-label="Cerrar" onClick={onCerrar} className="text-white/50 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BloqueTiro titulo="Juego abierto" detalle={eficaciaJuego} zonas={zonasJuego} total={tirosJuego.length} />
          <BloqueTiro titulo="7 metros" detalle={eficaciaPenalti} zonas={zonasPenalti} total={tirosPenalti.length} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en estos dos archivos. Es esperable que `FichaTecnica.tsx` siga teniendo su propia copia privada de `BloqueTiro` todavía (se elimina en la Task 8) — no debe dar error de duplicado porque son ámbitos de módulo distintos, solo típicamente un aviso de nombre repetido si tu editor lo señala, pero `tsc` no debe fallar por esto.

- [ ] **Step 4: Commit**

```bash
git add src/components/partido/BloqueTiro.tsx src/components/partido/PanelJugadorPartido.tsx
git commit -m "feat: BloqueTiro compartido y panel local de estadísticas de jugador en el partido"
```

---

## Task 8: `FichaTecnica.tsx` — reescritura completa (ensamblado final + cambio de comportamiento del clic)

**Files:**
- Modify: `src/components/partido/FichaTecnica.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `AnilloDonut` (Task 3), `BarrasJugador` (Task 4), `LineaMarcador` (Task 5), `MarcadorExclusiones` (Task 6), `BloqueTiro`+`PanelJugadorPartido` (Task 7), `desgloseResultados`/`distribucionPorZona`/`eficaciaConDetalle`/`perdidas`/`porcentajeParadas`/`robos` de `@/lib/partidoStats` (ya existentes + Task 2).
- Produces: mismo contrato de props que antes (`partido`, `jugadores`, `eventos`) — `PartidoDetailPage.tsx` no necesita tocarse.

**Decisiones de esta task:**
- Se elimina `CifraProtagonista` y la cifra grande de eficacia global — ese papel lo cubre ahora el anillo de eficacia. El mapa de calor conserva su línea `%(X de Y)` propia dentro de `BloqueTiro` (información complementaria, no redundante: el anillo reparte por resultado, el mapa de calor por zona).
- Se elimina la rejilla de 4 cifras simples (Pérdidas/Robos/Exclusiones/Tarjetas) — pérdidas/robos pasan al anillo, exclusiones al marcador temporal, tarjetas se retira de esta pantalla (decisión documentada en la spec).
- Se elimina `calcularNotas`/la nota /10 de esta pantalla (no encaja en las barras ni se pidió en el panel).
- El clic en una barra de jugador abre `PanelJugadorPartido` (estado local `useState`), ya no navega — se eliminan los imports `useNavigate`/`useEquipo`, ya no se usan.
- El bloque final de notas/problemas/acciones se mantiene sin cambios.

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { useState } from "react";
import { AnilloDonut } from "@/components/partido/AnilloDonut";
import { BarrasJugador } from "@/components/partido/BarrasJugador";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { LineaMarcador } from "@/components/partido/LineaMarcador";
import { MarcadorExclusiones } from "@/components/partido/MarcadorExclusiones";
import { PanelJugadorPartido } from "@/components/partido/PanelJugadorPartido";
import {
  desgloseResultados,
  distribucionPorZona,
  eficaciaConDetalle,
  perdidas,
  porcentajeParadas,
  robos,
} from "@/lib/partidoStats";
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
  const [jugadorPanel, setJugadorPanel] = useState<JugadoresRow | null>(null);

  const tirosJuego = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti);
  const tirosPenalti = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);

  const tirosRivalJuego = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && !e.es_penalti);
  const tirosRivalPenalti = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && e.es_penalti);
  const zonasRivalJuego = distribucionPorZona(tirosRivalJuego);
  const zonasRivalPenalti = distribucionPorZona(tirosRivalPenalti);

  const desgloseJuego = desgloseResultados(tirosJuego);
  const desglosePenalti = desgloseResultados(tirosPenalti);

  return (
    <div className="flex flex-col gap-4">
      <LineaMarcador eventos={eventos} />

      <div>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Eficacia de tiro</div>
        <div className="flex items-center justify-center gap-6 rounded border border-white/[.09] bg-[#15151a] p-4">
          <AnilloDonut
            tamano={104}
            segmentos={[
              { label: "Gol", valor: desgloseJuego.gol, color: "var(--color-success)" },
              { label: "Parado", valor: desgloseJuego.parado, color: "#3d8ad6" },
              { label: "Fuera", valor: desgloseJuego.fuera, color: "var(--color-accent)" },
              { label: "Poste", valor: desgloseJuego.poste, color: "color-mix(in oklab, var(--color-accent) 55%, white)" },
            ]}
            centro={<span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-white/40">Juego abierto</span>}
          />
          <AnilloDonut
            tamano={72}
            segmentos={[
              { label: "Gol", valor: desglosePenalti.gol, color: "var(--color-success)" },
              { label: "Parado", valor: desglosePenalti.parado, color: "#3d8ad6" },
              { label: "Fuera", valor: desglosePenalti.fuera, color: "var(--color-accent)" },
              { label: "Poste", valor: desglosePenalti.poste, color: "color-mix(in oklab, var(--color-accent) 55%, white)" },
            ]}
            centro={<span className="px-1 text-center text-[8px] uppercase leading-tight tracking-[0.06em] text-white/40">7 metros</span>}
          />
        </div>
      </div>

      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Tiro propio</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BloqueTiro titulo="Juego abierto" detalle={eficaciaConDetalle(eventos, { soloPenalti: false })} zonas={zonasJuego} total={tirosJuego.length} />
          <BloqueTiro titulo="7 metros" detalle={eficaciaConDetalle(eventos, { soloPenalti: true })} zonas={zonasPenalti} total={tirosPenalti.length} />
        </div>
      </div>

      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Nuestra portería</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BloqueTiro titulo="Juego abierto" detalle={porcentajeParadas(eventos, { soloPenalti: false })} zonas={zonasRivalJuego} total={tirosRivalJuego.length} />
          <BloqueTiro titulo="7 metros" detalle={porcentajeParadas(eventos, { soloPenalti: true })} zonas={zonasRivalPenalti} total={tirosRivalPenalti.length} />
        </div>
      </div>

      <BarrasJugador jugadores={jugadores} eventos={eventos} onSeleccionar={setJugadorPanel} />

      <div>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Pérdidas y robos</div>
        <div className="flex justify-center rounded border border-white/[.09] bg-[#15151a] p-4">
          <AnilloDonut
            tamano={96}
            segmentos={[
              { label: "Robos", valor: robos(eventos), color: "var(--color-success)" },
              { label: "Pérdidas", valor: perdidas(eventos), color: "var(--color-warning)" },
            ]}
          />
        </div>
      </div>

      <MarcadorExclusiones eventos={eventos} />

      {(partido.problemas_detectados || partido.acciones_siguiente_semana || partido.notas_adicionales) && (
        <div className="flex flex-col gap-3 rounded border border-white/[.09] bg-[#15151a] p-4">
          {partido.problemas_detectados && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">Problemas detectados</div>
              <p className="mt-1 whitespace-pre-line text-sm text-white/80">{partido.problemas_detectados}</p>
            </div>
          )}
          {partido.acciones_siguiente_semana && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">Acciones para la semana siguiente</div>
              <p className="mt-1 whitespace-pre-line text-sm text-white/80">{partido.acciones_siguiente_semana}</p>
            </div>
          )}
          {partido.notas_adicionales && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">Notas adicionales</div>
              <p className="mt-1 whitespace-pre-line text-sm text-white/80">{partido.notas_adicionales}</p>
            </div>
          )}
        </div>
      )}

      {jugadorPanel && <PanelJugadorPartido jugador={jugadorPanel} eventos={eventos} onCerrar={() => setJugadorPanel(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: sin errores en todo el proyecto. Presta atención a que no queden referencias colgantes a `useNavigate`, `useEquipo`, `calcularNotas`, `exclusiones`, `tarjetas`, `MapaCalorPorteria` (este último ya no se importa directamente aquí — lo usa `BloqueTiro` internamente) — el compilador los marcaría como no usados o no definidos si sobra o falta alguno.

- [ ] **Step 3: Commit**

```bash
git add src/components/partido/FichaTecnica.tsx
git commit -m "refactor: Ficha técnica de partido — rediseño con anillos, barras, línea de marcador y panel local de jugador"
```

---

## Task 9: Verificación final, `ui-estetica`, prueba manual

**Files:** ninguno nuevo — comandos + revisión de agente.

- [ ] **Step 1: Typecheck + lint + build completos**

Run: `npx tsc -b --noEmit && npm run lint && npm run build`
Expected: los tres limpios.

- [ ] **Step 2: Revisión de `ui-estetica`**

Dispatch al agente `ui-estetica` para revisar los 7 archivos de esta fase (`AnilloDonut.tsx`, `BarrasJugador.tsx`, `LineaMarcador.tsx`, `MarcadorExclusiones.tsx`, `BloqueTiro.tsx`, `PanelJugadorPartido.tsx`, `FichaTecnica.tsx`) frente a CLAUDE.md: tema oscuro consistente (excepción ya sancionada de "Partido en directo"), aire entre secciones (no una pared de gráficos pegados — `gap-4` ya en el contenedor raíz), que los anillos y la línea de marcador se lean de un vistazo sin necesitar interpretación, y que no se haya colado ningún color fuera de la tabla de la spec. Aplicar los hallazgos reales que encuentre.

- [ ] **Step 3: Prueba manual del usuario**

Pedir al usuario que abra un partido con datos reales (tiros, pérdidas, exclusiones, varios goles de ambos equipos) y confirme, en particular:
- La línea de marcador refleja el resultado real y su forma tiene sentido con el orden en que se metieron los goles — es la parte más nueva, la que más puede fallar si el orden temporal no es exacto.
- Los anillos de eficacia (juego abierto y 7m) sí sean coherentes con los mapas de calor de abajo.
- Las barras por jugador estén ordenadas de más a menos goles y toquen bien al pulsar (abre el panel local sin cambiar de pantalla).
- El marcador de exclusiones aparezca solo si hubo exclusiones, con las propias en ámbar.
- Los dos mapas de calor de cada bloque (juego abierto / 7m) arranquen ahora a la misma altura.

- [ ] **Step 4: Commit final si `ui-estetica` aplicó cambios**

```bash
git add -A
git commit -m "fix: ajustes de ui-estetica sobre el rediseño de la ficha técnica de partido"
```
