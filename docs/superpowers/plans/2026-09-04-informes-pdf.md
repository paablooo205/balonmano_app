# Informes PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tres documentos PDF descargables — ficha técnica de un partido, informe individual de un jugador en un partido, y ficha de temporada completa de un jugador — generados en el cliente a partir de los cálculos ya existentes en `partidoStats.ts`/`insights.ts`.

**Architecture:** `@react-pdf/renderer` renderiza componentes `<Document>` a un blob PDF en el navegador; un helper único dispara la descarga. Componentes de maquetación compartidos (cabecera, tabla de eficacia, tabla de zonas, lista de insights) viven en `src/lib/pdf/` y los reutilizan los 3 documentos. Cada documento recibe los mismos datos que ya calcula la pantalla equivalente — el componente de pantalla sigue siendo el único que decide qué calcular, el documento PDF solo maqueta.

**Tech Stack:** React 19 + TypeScript, `@react-pdf/renderer` (nuevo).

**Spec:** `docs/superpowers/specs/2026-09-04-informes-pdf-design.md`

## Global Constraints

- Todo texto de UI/PDF en español.
- Tipografía del PDF: Helvetica (base del motor, sin registrar fuentes propias) — negrita para títulos, regular para cuerpo. Decisión ya tomada en la spec, no cambiarla.
- Colores del PDF: valores hex literales `#111114` (tinta) y `#e11225` (acento), copiados de la paleta del proyecto — el motor de PDF no lee variables CSS.
- Tablas y cifras limpias en el PDF — nunca recrear los donuts/mapas de calor de la app como imágenes.
- Cada documento PDF reutiliza las funciones ya existentes de `src/lib/partidoStats.ts` y `src/lib/insights.ts` tal cual — no crear cálculos nuevos salvo los dos ya identificados en la spec (minutos jugados y exclusiones de un jugador en un partido, ambos con funciones ya existentes, solo con un filtro distinto).
- Solo descarga de archivo — nada de compartir/email integrado en la app.
- Convención de tests del repo: no hay tests de componentes ni de código que genera PDF. Ninguna tarea de este plan lleva test de vitest — verificación mediante `tsc`/`eslint`/`build` y, para el PDF en sí, generación real (`npm run build` + revisión manual del archivo resultante, descrita en cada tarea).

---

### Task 1: Instalar `@react-pdf/renderer` + infraestructura compartida

**Files:**
- Modify: `package.json` (vía `npm install`)
- Create: `src/lib/pdf/pdfTheme.ts`
- Create: `src/lib/pdf/PdfComponents.tsx`
- Create: `src/lib/pdf/descargarPdf.ts`

**Interfaces:**
- Produces: `pdfColores` (objeto de colores hex), `PdfCabecera`, `PdfSeccion`, `PdfTablaEficacia`, `PdfTablaZonas`, `PdfListaInsights`, `pdfEstilosBase` (componentes/estilos de `PdfComponents.tsx`), `descargarPdf(nombreArchivo: string, documento: ReactElement): Promise<void>` — usados por las Tasks 2, 3 y 4.

- [ ] **Step 1: Instalar la dependencia**

Run: `npm install @react-pdf/renderer@^4.9.0`
Expected: se añade a `package.json`/`package-lock.json` sin errores de peer dependency (soporta React 19 de forma nativa).

- [ ] **Step 2: Colores compartidos**

```ts
// src/lib/pdf/pdfTheme.ts
/** Mismos hex que --color-ink/--color-accent en src/index.css — el motor
 * de @react-pdf/renderer no lee variables CSS, así que se copian aquí una
 * única vez para que los 3 documentos usen exactamente los mismos valores. */
export const pdfColores = {
  ink: "#111114",
  accent: "#e11225",
  textMuted: "#6b6b70",
  textFaint: "#9a9a9f",
  border: "#e5e3e0",
  bg: "#f7f6f4",
};
```

- [ ] **Step 3: Componentes de maquetación compartidos**

```tsx
// src/lib/pdf/PdfComponents.tsx
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { EficaciaDetalle } from "@/lib/partidoStats";
import type { Insight } from "@/lib/insights";
import { pdfColores } from "@/lib/pdf/pdfTheme";

export const pdfEstilosBase = StyleSheet.create({
  pagina: { paddingBottom: 32, fontFamily: "Helvetica", fontSize: 9, color: pdfColores.ink },
  cabecera: { backgroundColor: pdfColores.ink, padding: 24, marginBottom: 16 },
  cabeceraEyebrow: {
    color: pdfColores.accent,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  cabeceraTitulo: { color: "#ffffff", fontSize: 20, fontFamily: "Helvetica-Bold" },
  cabeceraSubtitulo: { color: "#ffffffcc", fontSize: 10, marginTop: 4 },
  cuerpo: { paddingHorizontal: 24 },
  seccionTitulo: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: pdfColores.textMuted,
    marginBottom: 6,
    marginTop: 14,
  },
  tabla: { borderWidth: 1, borderColor: pdfColores.border, borderRadius: 4 },
  filaTabla: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: pdfColores.border, padding: 6 },
  filaTablaUltima: { flexDirection: "row", padding: 6 },
  celdaCabecera: {
    flex: 1,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: pdfColores.textMuted,
  },
  celda: { flex: 1, fontSize: 9 },
  parrafo: { fontSize: 9, lineHeight: 1.5, marginBottom: 4 },
  parrafoNegrita: { fontSize: 9, lineHeight: 1.5, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  vineta: { fontSize: 9, lineHeight: 1.5, marginBottom: 3 },
  zonaCelda: { width: "33.33%", padding: 4, borderWidth: 0.5, borderColor: pdfColores.border },
  zonaEtiqueta: { fontSize: 7, color: pdfColores.textFaint, textTransform: "uppercase" },
  zonaValor: { fontSize: 9, marginTop: 1 },
});

export function PdfCabecera({ eyebrow, titulo, subtitulo }: { eyebrow: string; titulo: string; subtitulo?: string }) {
  return (
    <View style={pdfEstilosBase.cabecera}>
      <Text style={pdfEstilosBase.cabeceraEyebrow}>{eyebrow}</Text>
      <Text style={pdfEstilosBase.cabeceraTitulo}>{titulo}</Text>
      {subtitulo && <Text style={pdfEstilosBase.cabeceraSubtitulo}>{subtitulo}</Text>}
    </View>
  );
}

export function PdfSeccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View wrap={false}>
      <Text style={pdfEstilosBase.seccionTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

export function PdfTablaEficacia({ filas }: { filas: { etiqueta: string; detalle: EficaciaDetalle }[] }) {
  return (
    <View style={pdfEstilosBase.tabla}>
      <View style={pdfEstilosBase.filaTabla}>
        <Text style={pdfEstilosBase.celdaCabecera}>Tipo</Text>
        <Text style={pdfEstilosBase.celdaCabecera}>Intentos</Text>
        <Text style={pdfEstilosBase.celdaCabecera}>Aciertos</Text>
        <Text style={pdfEstilosBase.celdaCabecera}>%</Text>
      </View>
      {filas.map((f, i) => (
        <View key={f.etiqueta} style={i === filas.length - 1 ? pdfEstilosBase.filaTablaUltima : pdfEstilosBase.filaTabla}>
          <Text style={pdfEstilosBase.celda}>{f.etiqueta}</Text>
          <Text style={pdfEstilosBase.celda}>{f.detalle?.intentos ?? 0}</Text>
          <Text style={pdfEstilosBase.celda}>{f.detalle?.aciertos ?? 0}</Text>
          <Text style={pdfEstilosBase.celda}>{f.detalle ? `${f.detalle.pct}%` : "—"}</Text>
        </View>
      ))}
    </View>
  );
}

const ZONAS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function PdfTablaZonas({
  titulo,
  intentos,
  aciertos,
  etiquetaAcierto,
}: {
  titulo: string;
  intentos: Record<number, number>;
  aciertos: Record<number, number>;
  etiquetaAcierto: string;
}) {
  return (
    <View style={{ marginBottom: 8 }} wrap={false}>
      <Text style={pdfEstilosBase.parrafoNegrita}>{titulo}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {ZONAS.map((z) => (
          <View key={z} style={pdfEstilosBase.zonaCelda}>
            <Text style={pdfEstilosBase.zonaEtiqueta}>Zona {z}</Text>
            <Text style={pdfEstilosBase.zonaValor}>
              {aciertos[z] ?? 0} {etiquetaAcierto} / {intentos[z] ?? 0}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PdfListaInsights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <View>
      {insights.map((ins, i) => (
        <Text key={i} style={pdfEstilosBase.vineta}>
          • {ins.texto}
        </Text>
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Helper de descarga**

```ts
// src/lib/pdf/descargarPdf.ts
import { pdf } from "@react-pdf/renderer";
import type { ReactElement } from "react";

/** Genera el PDF en el cliente y dispara su descarga — sin backend, sin
 * window.open (evita bloqueos de pop-up). */
export async function descargarPdf(nombreArchivo: string, documento: ReactElement): Promise<void> {
  const blob = await pdf(documento).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".pdf") ? nombreArchivo : `${nombreArchivo}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/pdf/pdfTheme.ts src/lib/pdf/PdfComponents.tsx src/lib/pdf/descargarPdf.ts
git commit -m "feat: añade @react-pdf/renderer y componentes de maquetación compartidos para los informes PDF"
```

---

### Task 2: Documento 1 — Ficha técnica del partido

**Files:**
- Create: `src/lib/pdf/FichaPartidoPdf.tsx`
- Modify: `src/components/partido/FichaTecnica.tsx`

**Interfaces:**
- Consumes: `pdfColores`, `PdfCabecera`, `PdfSeccion`, `PdfTablaEficacia`, `PdfTablaZonas`, `PdfListaInsights`, `pdfEstilosBase`, `descargarPdf` (Task 1).
- Produces: componente `FichaPartidoPdf({ partido, eventos, nombreEquipo }): ReactElement` — usado solo dentro de `FichaTecnica.tsx` en esta tarea.

- [ ] **Step 1: Crear el documento**

```tsx
// src/lib/pdf/FichaPartidoPdf.tsx
import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  distribucionPorZona,
  eficaciaConDetalle,
  marcadorPartido,
  perdidas,
  porcentajeParadas,
  robos,
} from "@/lib/partidoStats";
import { cortePorMediana, dividirPorCorte, generarInsights } from "@/lib/insights";
import { PdfCabecera, PdfListaInsights, PdfSeccion, PdfTablaEficacia, PdfTablaZonas, pdfEstilosBase } from "@/lib/pdf/PdfComponents";
import type { EventosRow, PartidosRow } from "@/types/database";

export function FichaPartidoPdf({
  partido,
  eventos,
  nombreEquipo,
}: {
  partido: PartidosRow;
  eventos: EventosRow[];
  nombreEquipo: string;
}) {
  const tirosJuego = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti);
  const tirosPenalti = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);
  const golesZonasJuego = distribucionPorZona(tirosJuego.filter((e) => e.resultado === "gol"));
  const golesZonasPenalti = distribucionPorZona(tirosPenalti.filter((e) => e.resultado === "gol"));

  const tirosRivalJuego = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && !e.es_penalti);
  const tirosRivalPenalti = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && e.es_penalti);
  const zonasRivalJuego = distribucionPorZona(tirosRivalJuego);
  const zonasRivalPenalti = distribucionPorZona(tirosRivalPenalti);
  const paradasZonasRivalJuego = distribucionPorZona(tirosRivalJuego.filter((e) => e.resultado === "parado"));
  const paradasZonasRivalPenalti = distribucionPorZona(tirosRivalPenalti.filter((e) => e.resultado === "parado"));

  const corte = cortePorMediana(eventos);
  const insights = generarInsights({
    zonaPropioJuego: tirosJuego,
    zonaPropioPenalti: tirosPenalti,
    zonaRivalJuego: tirosRivalJuego,
    zonaRivalPenalti: tirosRivalPenalti,
    ejecucionPropioJuego: tirosJuego,
    contextoAusencia: "en el partido",
    tendencia: corte
      ? {
          propio: dividirPorCorte(tirosJuego, corte),
          rival: dividirPorCorte(tirosRivalJuego, corte),
          etiquetas: { a: "de la 1ª parte", b: "la 2ª parte" },
        }
      : undefined,
  });

  const exclusionesPropias = eventos.filter((e) => e.tipo === "exclusion" && e.equipo_origen === "propio").length;
  const exclusionesRival = eventos.filter((e) => e.tipo === "exclusion" && e.equipo_origen === "rival").length;

  const fechaLarga = new Date(partido.fecha + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Document>
      <Page size="A4" style={pdfEstilosBase.pagina}>
        <PdfCabecera
          eyebrow={nombreEquipo}
          titulo={`vs ${partido.rival}`}
          subtitulo={`${fechaLarga}${partido.competicion ? ` · ${partido.competicion}` : ""} · ${partido.casa_fuera === "casa" ? "Casa" : partido.casa_fuera === "fuera" ? "Fuera" : ""} · Resultado ${marcadorPartido(partido, eventos)}`}
        />
        <View style={pdfEstilosBase.cuerpo}>
          {insights.length > 0 && (
            <PdfSeccion titulo="Aspectos destacados">
              <PdfListaInsights insights={insights} />
            </PdfSeccion>
          )}

          <PdfSeccion titulo="Eficacia de tiro propio">
            <PdfTablaEficacia
              filas={[
                { etiqueta: "Juego abierto", detalle: eficaciaConDetalle(eventos, { soloPenalti: false }) },
                { etiqueta: "7 metros", detalle: eficaciaConDetalle(eventos, { soloPenalti: true }) },
              ]}
            />
          </PdfSeccion>

          <PdfSeccion titulo="Tiro propio por zona">
            <PdfTablaZonas titulo="Juego abierto" intentos={zonasJuego} aciertos={golesZonasJuego} etiquetaAcierto="goles" />
            <PdfTablaZonas titulo="7 metros" intentos={zonasPenalti} aciertos={golesZonasPenalti} etiquetaAcierto="goles" />
          </PdfSeccion>

          <PdfSeccion titulo="Nuestra portería">
            <PdfTablaEficacia
              filas={[
                { etiqueta: "Juego abierto", detalle: porcentajeParadas(eventos, { soloPenalti: false }) },
                { etiqueta: "7 metros", detalle: porcentajeParadas(eventos, { soloPenalti: true }) },
              ]}
            />
            <PdfTablaZonas titulo="Juego abierto" intentos={zonasRivalJuego} aciertos={paradasZonasRivalJuego} etiquetaAcierto="paradas" />
            <PdfTablaZonas titulo="7 metros" intentos={zonasRivalPenalti} aciertos={paradasZonasRivalPenalti} etiquetaAcierto="paradas" />
          </PdfSeccion>

          <PdfSeccion titulo="Pérdidas y robos">
            <Text style={pdfEstilosBase.parrafo}>
              {robos(eventos)} robos · {perdidas(eventos)} pérdidas
            </Text>
          </PdfSeccion>

          <PdfSeccion titulo="Exclusiones">
            <Text style={pdfEstilosBase.parrafo}>
              Propias: {exclusionesPropias} · Rival: {exclusionesRival}
            </Text>
          </PdfSeccion>

          {(partido.problemas_detectados || partido.acciones_siguiente_semana || partido.notas_adicionales) && (
            <PdfSeccion titulo="Notas del entrenador">
              {partido.problemas_detectados && (
                <Text style={pdfEstilosBase.parrafo}>Problemas detectados: {partido.problemas_detectados}</Text>
              )}
              {partido.acciones_siguiente_semana && (
                <Text style={pdfEstilosBase.parrafo}>
                  Acciones para la semana siguiente: {partido.acciones_siguiente_semana}
                </Text>
              )}
              {partido.notas_adicionales && <Text style={pdfEstilosBase.parrafo}>{partido.notas_adicionales}</Text>}
            </PdfSeccion>
          )}
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Añadir el botón de descarga en `FichaTecnica.tsx`**

Añade los imports (junto a los ya existentes):

```tsx
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEquipo } from "@/hooks/useEquipo";
import { FichaPartidoPdf } from "@/lib/pdf/FichaPartidoPdf";
import { descargarPdf } from "@/lib/pdf/descargarPdf";
```

Dentro del componente `FichaTecnica`, justo después de `const [jugadorPanel, setJugadorPanel] = useState<JugadoresRow | null>(null);`, añade:

```tsx
  const { equipo } = useEquipo();

  async function descargarFichaPdf() {
    await descargarPdf(
      `ficha-partido-vs-${partido.rival}-${partido.fecha}`,
      <FichaPartidoPdf partido={partido} eventos={eventos} nombreEquipo={equipo?.nombre ?? "Equipo"} />,
    );
  }
```

En el JSX, justo antes de `<InsightsCard insights={insights} />` (la primera línea del `return`), añade:

```tsx
      <Button variant="secondary" size="sm" className="self-end" onClick={descargarFichaPdf}>
        <Download size={16} /> Descargar PDF
      </Button>
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build correcto — este es el primer punto real donde se comprueba que `@react-pdf/renderer` se empaqueta sin errores con Vite.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdf/FichaPartidoPdf.tsx src/components/partido/FichaTecnica.tsx
git commit -m "feat: añade el PDF de ficha técnica del partido, descargable desde FichaTecnica"
```

---

### Task 3: Documento 2 — Informe individual del jugador en el partido

**Files:**
- Create: `src/lib/pdf/InformeJugadorPartidoPdf.tsx`
- Modify: `src/components/partido/PanelJugadorPartido.tsx`
- Modify: `src/components/partido/FichaTecnica.tsx`

**Interfaces:**
- Consumes: componentes de Task 1; `esPortero`, `distribucionPorZona`, `eficaciaConDetalle`, `porcentajeParadas`, `perdidas`, `robos`, `exclusiones`, `minutosJugados`, `marcadorPartido` (`partidoStats.ts`, ya existentes).
- Produces: componente `InformeJugadorPartidoPdf({ jugador, partido, eventos }): ReactElement` — usado solo dentro de `PanelJugadorPartido.tsx`.
- `PanelJugadorPartido` gana un prop nuevo obligatorio `partido: PartidosRow` — su único llamador (`FichaTecnica.tsx`) debe actualizarse a pasarlo en la misma tarea.

- [ ] **Step 1: Crear el documento**

```tsx
// src/lib/pdf/InformeJugadorPartidoPdf.tsx
import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  distribucionPorZona,
  eficaciaConDetalle,
  esPortero,
  exclusiones,
  marcadorPartido,
  minutosJugados,
  perdidas,
  porcentajeParadas,
  robos,
} from "@/lib/partidoStats";
import { PdfCabecera, PdfSeccion, PdfTablaEficacia, PdfTablaZonas, pdfEstilosBase } from "@/lib/pdf/PdfComponents";
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

export function InformeJugadorPartidoPdf({
  jugador,
  partido,
  eventos,
}: {
  jugador: JugadoresRow;
  partido: PartidosRow;
  eventos: EventosRow[];
}) {
  const propios = eventos.filter((e) => e.jugador_id === jugador.id);
  const portero = esPortero(jugador.puesto);
  const equipoOrigenRelevante = portero ? "rival" : "propio";
  const resultadoAcierto = portero ? "parado" : "gol";
  const etiquetaAcierto = portero ? "paradas" : "goles";

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

  const minutos = minutosJugados(partido.estadisticas.eventos ?? [], jugador.id);

  const fechaLarga = new Date(partido.fecha + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Document>
      <Page size="A4" style={pdfEstilosBase.pagina}>
        <PdfCabecera
          eyebrow={`#${jugador.dorsal ?? "—"} ${jugador.nombre}`}
          titulo={`vs ${partido.rival}`}
          subtitulo={`${fechaLarga} · Resultado ${marcadorPartido(partido, eventos)}`}
        />
        <View style={pdfEstilosBase.cuerpo}>
          <PdfSeccion titulo="Minutos jugados">
            <Text style={pdfEstilosBase.parrafo}>{minutos} minutos</Text>
          </PdfSeccion>

          <PdfSeccion titulo={portero ? "Paradas" : "Goles"}>
            <PdfTablaEficacia
              filas={[
                { etiqueta: "Juego abierto", detalle: detalleJuego },
                { etiqueta: "7 metros", detalle: detallePenalti },
              ]}
            />
            <PdfTablaZonas titulo="Juego abierto" intentos={zonasJuego} aciertos={aciertosZonasJuego} etiquetaAcierto={etiquetaAcierto} />
            <PdfTablaZonas titulo="7 metros" intentos={zonasPenalti} aciertos={aciertosZonasPenalti} etiquetaAcierto={etiquetaAcierto} />
          </PdfSeccion>

          <PdfSeccion titulo="Pérdidas y robos">
            <Text style={pdfEstilosBase.parrafo}>
              {robos(propios)} robos · {perdidas(propios)} pérdidas
            </Text>
          </PdfSeccion>

          <PdfSeccion titulo="Exclusiones">
            <Text style={pdfEstilosBase.parrafo}>{exclusiones(propios)}</Text>
          </PdfSeccion>
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: `PanelJugadorPartido.tsx` gana el prop `partido` y el botón de descarga**

Reemplaza (líneas 1-23 del archivo actual):

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
```

por:

```tsx
import { Download, X } from "lucide-react";
import { DesgloseJugadorPartido } from "@/components/partido/DesgloseJugadorPartido";
import { InformeJugadorPartidoPdf } from "@/lib/pdf/InformeJugadorPartidoPdf";
import { descargarPdf } from "@/lib/pdf/descargarPdf";
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

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
  partido,
  eventos,
  onCerrar,
}: {
  jugador: JugadoresRow;
  partido: PartidosRow;
  eventos: EventosRow[];
  onCerrar: () => void;
}) {
  async function descargarInformePdf() {
    await descargarPdf(
      `informe-${jugador.nombre}-vs-${partido.rival}-${partido.fecha}`,
      <InformeJugadorPartidoPdf jugador={jugador} partido={partido} eventos={eventos} />,
    );
  }
```

Reemplaza (la cabecera del panel, líneas ~30-38 del archivo actual):

```tsx
        <div className="mb-1 flex items-center justify-between">
          <div>
            <span className="stat-number text-sm text-[var(--color-text-muted)]">#{jugador.dorsal ?? "—"} </span>
            <span className="text-sm font-medium text-[var(--color-text)]">{jugador.nombre}</span>
          </div>
          <button aria-label="Cerrar" onClick={onCerrar} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={20} />
          </button>
        </div>
```

por:

```tsx
        <div className="mb-1 flex items-center justify-between">
          <div>
            <span className="stat-number text-sm text-[var(--color-text-muted)]">#{jugador.dorsal ?? "—"} </span>
            <span className="text-sm font-medium text-[var(--color-text)]">{jugador.nombre}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              aria-label="Descargar PDF"
              onClick={descargarInformePdf}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
            >
              <Download size={18} />
            </button>
            <button aria-label="Cerrar" onClick={onCerrar} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              <X size={20} />
            </button>
          </div>
        </div>
```

- [ ] **Step 3: `FichaTecnica.tsx` pasa `partido` al panel**

Reemplaza (línea 200 del archivo actual):

```tsx
      {jugadorPanel && <PanelJugadorPartido jugador={jugadorPanel} eventos={eventos} onCerrar={() => setJugadorPanel(null)} />}
```

por:

```tsx
      {jugadorPanel && (
        <PanelJugadorPartido jugador={jugadorPanel} partido={partido} eventos={eventos} onCerrar={() => setJugadorPanel(null)} />
      )}
```

- [ ] **Step 4: Verificar tipos, lint y build**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/InformeJugadorPartidoPdf.tsx src/components/partido/PanelJugadorPartido.tsx src/components/partido/FichaTecnica.tsx
git commit -m "feat: añade el PDF de informe individual del jugador en el partido"
```

---

### Task 4: Documento 3 — Ficha de jugador, temporada completa

**Files:**
- Create: `src/lib/pdf/FichaJugadorTemporadaPdf.tsx`
- Modify: `src/pages/JugadorDetailPage.tsx`

**Interfaces:**
- Consumes: componentes de Task 1; funciones ya existentes de `partidoStats.ts`/`insights.ts` (idénticas a las que ya usa `JugadorDetailPage.tsx` para su vista de temporada).
- Produces: componente `FichaJugadorTemporadaPdf({...}): ReactElement` — usado solo dentro de `JugadorDetailPage.tsx`.

- [ ] **Step 1: Crear el documento**

El documento recibe exactamente los mismos datos ya calculados por `JugadorDetailPage.tsx` para su vista de "Toda la temporada" (no recalcula nada — todo esto ya existe como variables locales en ese componente, ver `src/pages/JugadorDetailPage.tsx` líneas 72-203):

```tsx
// src/lib/pdf/FichaJugadorTemporadaPdf.tsx
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { EficaciaDetalle } from "@/lib/partidoStats";
import type { Insight } from "@/lib/insights";
import { PdfCabecera, PdfListaInsights, PdfSeccion, PdfTablaEficacia, PdfTablaZonas, pdfEstilosBase } from "@/lib/pdf/PdfComponents";
import type { JugadoresRow } from "@/types/database";

export function FichaJugadorTemporadaPdf({
  jugador,
  nombreEquipo,
  temporada,
  portero,
  partidosJugados,
  goles,
  exclusionesTotal,
  asistenciaPct,
  presentes,
  totalSesiones,
  llegadasTarde,
  detalleJuego,
  detallePenalti,
  zonasJuego,
  golesZonasJuego,
  zonasPenalti,
  golesZonasPenalti,
  etiquetaAcierto,
  tendenciaEficacia,
  insights,
}: {
  jugador: JugadoresRow;
  nombreEquipo: string;
  temporada: string;
  portero: boolean;
  partidosJugados: number;
  goles: number;
  exclusionesTotal: number;
  asistenciaPct: number | null;
  presentes: number;
  totalSesiones: number;
  llegadasTarde: number;
  detalleJuego: EficaciaDetalle;
  detallePenalti: EficaciaDetalle;
  zonasJuego: Record<number, number>;
  golesZonasJuego: Record<number, number>;
  zonasPenalti: Record<number, number>;
  golesZonasPenalti: Record<number, number>;
  etiquetaAcierto: string;
  tendenciaEficacia: { label: string; pct: number | null }[];
  insights: Insight[];
}) {
  const edad = jugador.año_nacimiento ? `${new Date().getFullYear() - jugador.año_nacimiento} años` : null;
  const altura = jugador.altura_cm ? `${jugador.altura_cm} cm` : null;
  const peso = jugador.peso_kg ? `${jugador.peso_kg} kg` : null;

  return (
    <Document>
      <Page size="A4" style={pdfEstilosBase.pagina}>
        <PdfCabecera
          eyebrow={`${nombreEquipo} · Temporada ${temporada}`}
          titulo={`#${jugador.dorsal ?? "—"} ${jugador.nombre}`}
          subtitulo={[jugador.puesto, edad, altura, peso].filter(Boolean).join(" · ") || undefined}
        />
        <View style={pdfEstilosBase.cuerpo}>
          <PdfSeccion titulo="Asistencia a entrenamientos">
            <Text style={pdfEstilosBase.parrafo}>
              {asistenciaPct !== null ? `${asistenciaPct}% (${presentes} de ${totalSesiones} sesiones)` : "Sin registros de asistencia."}
              {llegadasTarde > 0 ? ` · Llegó tarde a ${llegadasTarde} sesiones` : ""}
            </Text>
          </PdfSeccion>

          <PdfSeccion titulo="Estadísticas de partido (temporada)">
            <Text style={pdfEstilosBase.parrafo}>
              {partidosJugados} partidos jugados · {goles} {portero ? "goles encajados evitados" : "goles"} ·{" "}
              {exclusionesTotal} exclusiones
            </Text>
          </PdfSeccion>

          <PdfSeccion titulo={portero ? "Eficacia de paradas" : "Eficacia de tiro"}>
            <PdfTablaEficacia
              filas={[
                { etiqueta: "Juego abierto", detalle: detalleJuego },
                { etiqueta: "7 metros", detalle: detallePenalti },
              ]}
            />
            <PdfTablaZonas titulo="Juego abierto" intentos={zonasJuego} aciertos={golesZonasJuego} etiquetaAcierto={etiquetaAcierto} />
            <PdfTablaZonas titulo="7 metros" intentos={zonasPenalti} aciertos={golesZonasPenalti} etiquetaAcierto={etiquetaAcierto} />
          </PdfSeccion>

          {tendenciaEficacia.length > 0 && (
            <PdfSeccion titulo={portero ? "Evolución de paradas" : "Evolución de eficacia"}>
              <View style={pdfEstilosBase.tabla}>
                <View style={pdfEstilosBase.filaTabla}>
                  <Text style={pdfEstilosBase.celdaCabecera}>Partido</Text>
                  <Text style={pdfEstilosBase.celdaCabecera}>%</Text>
                </View>
                {tendenciaEficacia.map((t, i) => (
                  <View key={t.label} style={i === tendenciaEficacia.length - 1 ? pdfEstilosBase.filaTablaUltima : pdfEstilosBase.filaTabla}>
                    <Text style={pdfEstilosBase.celda}>
                      {new Date(t.label + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                    </Text>
                    <Text style={pdfEstilosBase.celda}>{t.pct !== null ? `${t.pct}%` : "—"}</Text>
                  </View>
                ))}
              </View>
            </PdfSeccion>
          )}

          {insights.length > 0 && (
            <PdfSeccion titulo="Aspectos destacados">
              <PdfListaInsights insights={insights} />
            </PdfSeccion>
          )}

          {jugador.notas_adicionales && (
            <PdfSeccion titulo="Notas adicionales">
              <Text style={pdfEstilosBase.parrafo}>{jugador.notas_adicionales}</Text>
            </PdfSeccion>
          )}
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Botón de descarga en `JugadorDetailPage.tsx`**

Añade los imports (junto a los ya existentes):

```tsx
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FichaJugadorTemporadaPdf } from "@/lib/pdf/FichaJugadorTemporadaPdf";
import { descargarPdf } from "@/lib/pdf/descargarPdf";
```

Cambia la desestructuración de `useEquipo()` (línea 29 del archivo actual) para obtener también el equipo:

```tsx
  const { equipo, equipoId } = useEquipo();
```

Justo antes del `return` del componente (después de calcular `insights`, alrededor de la línea 204), añade:

```tsx
  async function descargarFichaTemporadaPdf() {
    const etiquetaAcierto = portero ? "paradas" : "goles";
    await descargarPdf(
      `ficha-temporada-${jugador.nombre}`,
      <FichaJugadorTemporadaPdf
        jugador={jugador}
        nombreEquipo={equipo?.nombre ?? "Equipo"}
        temporada={equipo?.temporada ?? ""}
        portero={portero}
        partidosJugados={partidosJugados}
        goles={goles}
        exclusionesTotal={exclusiones}
        asistenciaPct={asistenciaPct}
        presentes={presentes}
        totalSesiones={registrosEntreno.length}
        llegadasTarde={llegadasTarde}
        detalleJuego={portero ? detalleParadasJuego : eficaciaConDetalle(eventosDelJugador, { soloPenalti: false })}
        detallePenalti={portero ? detalleParadasPenalti : eficaciaConDetalle(eventosDelJugador, { soloPenalti: true })}
        zonasJuego={portero ? zonasRivalJuego : zonasJuego}
        golesZonasJuego={portero ? paradasZonasRivalJuego : golesZonasJuego}
        zonasPenalti={portero ? zonasRivalPenalti : zonasPenalti}
        golesZonasPenalti={portero ? paradasZonasRivalPenalti : golesZonasPenalti}
        etiquetaAcierto={etiquetaAcierto}
        tendenciaEficacia={tendenciaEficacia}
        insights={insights}
      />,
    );
  }
```

En el JSX de la cabecera (`hero-band`), en la fila de botones junto a "Editar" (líneas 208-221 del archivo actual):

```tsx
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
```

por:

```tsx
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(`/equipos/${equipoId}/equipo`)}
            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <ChevronLeft size={16} className="text-[var(--color-accent)]" /> Plantilla
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={descargarFichaTemporadaPdf}
              className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
            >
              <Download size={16} /> PDF
            </button>
            <button
              onClick={() => setEditando(true)}
              className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
            >
              <Pencil size={16} /> Editar
            </button>
          </div>
        </div>
```

- [ ] **Step 3: Verificar tipos, lint y build**

Run: `npx tsc -b --noEmit`
Expected: sin errores.

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 4: Prueba manual**

Run: `npm run dev` y comprobar:
1. Descargar el PDF de ficha técnica de un partido ya jugado, abrirlo y confirmar que se ve el marcador, insights, tablas de eficacia por zona, y notas del entrenador si las tiene.
2. Desde ese mismo partido, pinchar un jugador convocado (barra en "Por jugador") y descargar su informe individual — confirmar minutos jugados, goles/paradas por zona, pérdidas/robos, exclusiones.
3. Desde la ficha de un jugador (sección Equipo), descargar su PDF de temporada — confirmar asistencia, estadísticas acumuladas, tabla de evolución partido a partido, e insights.
4. Repetir el punto 1-2 con un portero convocado, para confirmar que el informe muestra paradas en vez de goles.

Expected: los 3 PDF se generan sin errores en consola y se ven legibles/bien maquetados al abrirlos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/FichaJugadorTemporadaPdf.tsx src/pages/JugadorDetailPage.tsx
git commit -m "feat: añade el PDF de ficha de jugador de toda la temporada"
```

---

## Verificación final antes de fusionar

Además de la revisión de rama completa (whole-branch review) del flujo subagent-driven-development:

1. Repetir la prueba manual de la Task 4 (Step 4) para los 3 documentos, incluido el caso portero.
2. Confirmar que los 3 botones de descarga aparecen exactamente donde se acordó: ficha técnica del partido (arriba de todo), panel de jugador dentro del partido (junto al botón de cerrar), ficha de jugador de temporada (cabecera, junto a "Editar").
3. Confirmar que `npm run build` sigue generando el Service Worker de la PWA sin errores — `@react-pdf/renderer` es una dependencia nueva y relativamente grande, vale la pena confirmar que no rompe el precache de Workbox ni dispara el aviso de tamaño máximo de archivo a cachear.
