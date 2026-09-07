import type { ReactNode } from "react";
import { Circle, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { pdfFichaColores as C } from "@/lib/pdf/pdfFichaTheme";
import type { TramoParcial } from "@/lib/partidoStats";

/** Componentes visuales de la ficha técnica de partido (diseño aportado por
 * el usuario vía Claude Design). Tipografía: Helvetica/Helvetica-Bold
 * estándar, NO Barlow Condensed/IBM Plex Mono del diseño original —
 * @react-pdf/renderer 4.9.0 (vía su fork @react-pdf/fontkit) falla con
 * "Offset is outside the bounds of the DataView" al incrustar cualquier
 * fuente personalizada en este proyecto, tanto en el navegador como en Node,
 * con archivos .woff y .ttf de origen distinto — confirmado como un bug de
 * esa combinación de versiones, no de estos archivos (ver
 * github.com/diegomura/react-pdf/issues/3042 y #550). Colores y maquetación
 * sí siguen el diseño nuevo. */

export const fichaEstilos = StyleSheet.create({
  pagina: { padding: 0, fontFamily: "Helvetica", fontSize: 8, color: C.ink, backgroundColor: C.bg },
  cuerpo: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, display: "flex", flexDirection: "column", gap: 10 },
  tituloSeccion: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  filaTituloSeccion: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: 1.2,
    borderBottomColor: C.ink,
    paddingBottom: 3,
    marginBottom: 8,
  },
  leyenda: { fontFamily: "Helvetica", fontSize: 6.5, color: C.textMuted },
});

// ─── Cabecera (banda oscura, página 1) ─────────────────────────────────────

export function PdfFichaCabecera({ eyebrow, titulo, metaLines }: { eyebrow: string; titulo: string; metaLines: string[] }) {
  return (
    <View
      style={{
        backgroundColor: C.ink,
        color: C.bg,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 14,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
      }}
    >
      <View style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 2, color: C.accent }}>
          {eyebrow}
        </Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 26, color: "#ffffff", textTransform: "uppercase" }}>
          {titulo}
        </Text>
      </View>
      <View style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
        {metaLines.map((line, i) => (
          <Text key={i} style={{ fontFamily: "Helvetica", fontSize: 6.5, color: "#b9b6b4" }}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Cabecera más ligera para las páginas 2 y 3 — sin banda oscura, solo un
 * filete grueso debajo, igual que la maqueta ("Rendimiento individual"). */
export function PdfFichaCabeceraLigera({ titulo, eyebrow }: { titulo: string; eyebrow: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        borderBottomWidth: 1.6,
        borderBottomColor: C.ink,
        paddingBottom: 5,
        marginBottom: 10,
      }}
    >
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 15, textTransform: "uppercase" }}>{titulo}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.5, color: C.accent }}>
        {eyebrow}
      </Text>
    </View>
  );
}

// ─── Marcador ───────────────────────────────────────────────────────────────

export function PdfFichaMarcador({
  propio,
  rival,
}: {
  propio: { etiqueta: string; nombre: string; goles: number; subtitulo: string };
  rival: { etiqueta: string; nombre: string; goles: number; subtitulo: string };
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1.2,
        borderColor: C.ink,
        backgroundColor: C.card,
        padding: 12,
        gap: 10,
      }}
    >
      <View style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.5, color: C.accent }}>
          {propio.etiqueta}
        </Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, textTransform: "uppercase" }}>
          {propio.nombre}
        </Text>
        <Text style={{ fontFamily: "Helvetica", fontSize: 7, color: C.textMuted }}>{propio.subtitulo}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 32, color: C.ink }}>{propio.goles}</Text>
        <View style={{ width: 14, height: 2.2, backgroundColor: C.accent }} />
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 32, color: C.accent }}>{rival.goles}</Text>
      </View>
      <View style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.5, color: C.textMuted }}>
          {rival.etiqueta}
        </Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, textTransform: "uppercase", textAlign: "right" }}>
          {rival.nombre}
        </Text>
        <Text style={{ fontFamily: "Helvetica", fontSize: 7, color: C.textMuted, textAlign: "right" }}>{rival.subtitulo}</Text>
      </View>
    </View>
  );
}

// ─── Parciales por tramos de 5' ─────────────────────────────────────────────

export function PdfFichaParciales({ tramos, nombreEquipo }: { tramos: TramoParcial[]; nombreEquipo: string }) {
  const maxAlto = 15;
  const max = Math.max(...tramos.flatMap((t) => [t.propio, t.rival]), 1);
  return (
    <View>
      <View style={fichaEstilos.filaTituloSeccion}>
        <Text style={fichaEstilos.tituloSeccion}>Parciales por tramos de 5 minutos</Text>
        <Text style={fichaEstilos.leyenda}>
          <Text style={{ color: C.accent }}>■</Text> {nombreEquipo.toUpperCase()} &nbsp;&nbsp; <Text style={{ color: C.ink }}>■</Text> RIVAL
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 3, alignItems: "flex-end" }}>
        {tramos.map((t) => (
          <View key={t.rango} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 1, height: maxAlto }}>
              <View style={{ width: 5, height: Math.max((t.propio / max) * maxAlto, 1), backgroundColor: C.accent }} />
              <View style={{ width: 5, height: Math.max((t.rival / max) * maxAlto, 1), backgroundColor: C.ink }} />
            </View>
            <Text style={{ fontSize: 5.5, color: C.textMuted }}>{t.rango}</Text>
            <Text style={{ fontSize: 6.5, fontWeight: 600 }}>
              {t.propio}-{t.rival}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Donut de eficacia ──────────────────────────────────────────────────────

export function PdfFichaDonut({ pct, color, titulo, subtitulo }: { pct: number; color: string; titulo: string; subtitulo: string }) {
  const size = 62;
  const strokeWidth = 8;
  const radio = (size - strokeWidth) / 2;
  const circunferencia = 2 * Math.PI * radio;
  return (
    <View style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={size / 2} cy={size / 2} r={radio} stroke={C.borderLight} strokeWidth={strokeWidth} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radio}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="butt"
            strokeDasharray={`${(Math.max(0, Math.min(100, pct)) / 100) * circunferencia} ${circunferencia}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={{ position: "absolute", top: 0, left: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13 }}>{pct}%</Text>
        </View>
      </View>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 7.5, fontWeight: 600, textAlign: "center" }}>{titulo}</Text>
        <Text style={{ fontFamily: "Helvetica", fontSize: 6.5, color: C.textMuted, marginTop: 1 }}>{subtitulo}</Text>
      </View>
    </View>
  );
}

export function PdfFichaFilaDonuts({ donuts }: { donuts: { pct: number; color: string; titulo: string; subtitulo: string }[] }) {
  return (
    <View>
      <View style={fichaEstilos.filaTituloSeccion}>
        <Text style={fichaEstilos.tituloSeccion}>Eficacia de lanzamiento</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {donuts.map((d, i) => (
          <PdfFichaDonut key={i} {...d} />
        ))}
      </View>
    </View>
  );
}

// ─── Mapa de zonas (rejilla oscura) ─────────────────────────────────────────

const ZONAS_ORDEN = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Rojo más oscuro cuanto más bajo el %, más vivo cuanto más alto — mismo
 * espíritu que los tonos distintos por celda de la maqueta, sin necesitar 9
 * valores fijados a mano. */
function colorCeldaZona(pct: number | null): string {
  if (pct === null) return C.ink;
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const claro = { r: 0xc8, g: 0x10, b: 0x2e };
  const oscuro = { r: 0x3a, g: 0x0a, b: 0x12 };
  const r = Math.round(oscuro.r + (claro.r - oscuro.r) * t);
  const g = Math.round(oscuro.g + (claro.g - oscuro.g) * t);
  const b = Math.round(oscuro.b + (claro.b - oscuro.b) * t);
  return `rgb(${r},${g},${b})`;
}

export function PdfFichaMapaZonas({
  titulo,
  subtitulo,
  intentos,
  aciertos,
}: {
  titulo: string;
  subtitulo: string;
  intentos: Record<number, number>;
  aciertos: Record<number, number>;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 7.5, fontWeight: 600, marginBottom: 4 }}>
        {titulo} <Text style={{ color: C.textMuted, fontWeight: 400 }}>{subtitulo}</Text>
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", backgroundColor: C.ink, padding: 1, gap: 1 }}>
        {ZONAS_ORDEN.map((z) => {
          const int = intentos[z] ?? 0;
          const aci = aciertos[z] ?? 0;
          const pct = int > 0 ? Math.round((aci / int) * 100) : null;
          return (
            <View
              key={z}
              style={{
                width: "33%",
                paddingVertical: 6,
                alignItems: "center",
                backgroundColor: colorCeldaZona(pct),
              }}
            >
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color: "#ffffff" }}>
                {aci}/{int}
              </Text>
              <Text style={{ fontFamily: "Helvetica", fontSize: 5.5, color: "#ffffffcc" }}>{pct !== null ? `${pct}%` : "—"}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function PdfFichaSeccionMapas({ children }: { children: ReactNode }) {
  return (
    <View>
      <View style={fichaEstilos.filaTituloSeccion}>
        <Text style={fichaEstilos.tituloSeccion}>Mapa de lanzamiento por zonas de portería</Text>
        <Text style={fichaEstilos.leyenda}>GOLES / LANZAMIENTOS</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>{children}</View>
    </View>
  );
}

// ─── Tabla de jugadores (rendimiento individual) ───────────────────────────

export function PdfFichaCabeceraTablaJugadores() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingBottom: 4,
        borderBottomWidth: 0.7,
        borderBottomColor: C.border,
      }}
    >
      <Text style={{ width: 14, fontSize: 6, color: C.textMuted, letterSpacing: 0.5 }}>Nº</Text>
      <Text style={{ flex: 1, fontSize: 6, color: C.textMuted, letterSpacing: 0.5 }}>JUGADOR</Text>
      <Text style={{ width: 18, fontSize: 6, color: C.textMuted, letterSpacing: 0.5 }}>POS</Text>
      <Text style={{ width: 70, fontSize: 6, color: C.textMuted, letterSpacing: 0.5 }}>VOLUMEN DE TIRO</Text>
      <Text style={{ width: 26, fontSize: 6, color: C.textMuted, letterSpacing: 0.5, textAlign: "right" }}>G / T</Text>
      <Text style={{ width: 22, fontSize: 6, color: C.textMuted, letterSpacing: 0.5, textAlign: "right" }}>EFIC.</Text>
      <Text style={{ width: 18, fontSize: 6, color: C.textMuted, letterSpacing: 0.5, textAlign: "right" }}>PER</Text>
      <Text style={{ width: 18, fontSize: 6, color: C.textMuted, letterSpacing: 0.5, textAlign: "right" }}>ROB</Text>
      <Text style={{ width: 16, fontSize: 6, color: C.textMuted, letterSpacing: 0.5, textAlign: "right" }}>2'</Text>
      <Text style={{ width: 22, fontSize: 6, color: C.textMuted, letterSpacing: 0.5, textAlign: "right" }}>MIN</Text>
    </View>
  );
}

export type FilaJugadorPdf = {
  dorsal: number | null;
  nombre: string;
  pos: string;
  goles: number;
  fallos: number;
  eficaciaPct: number | null;
  perdidas: number;
  robos: number;
  exclusiones: number;
  minutos: number;
};

export function PdfFichaFilaJugador({ fila, maxTiros }: { fila: FilaJugadorPdf; maxTiros: number }) {
  const anchoBarra = 44;
  const totalTiros = fila.goles + fila.fallos;
  const anchoGoles = maxTiros > 0 ? (fila.goles / maxTiros) * anchoBarra : 0;
  const anchoFallos = maxTiros > 0 ? (fila.fallos / maxTiros) * anchoBarra : 0;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: 3,
        borderBottomWidth: 0.5,
        borderBottomColor: C.borderLight,
      }}
    >
      <Text style={{ width: 14, fontFamily: "Helvetica-Bold", fontSize: 10 }}>{fila.dorsal ?? "—"}</Text>
      <Text style={{ flex: 1, fontSize: 7.5, fontWeight: 600 }}>{fila.nombre}</Text>
      <Text style={{ width: 18, fontFamily: "Helvetica", fontSize: 6.5, color: C.textMuted }}>{fila.pos}</Text>
      <View style={{ width: 70, flexDirection: "row", height: 6 }}>
        <View style={{ width: anchoGoles, backgroundColor: C.accent }} />
        <View style={{ width: anchoFallos, backgroundColor: C.ink }} />
      </View>
      <Text style={{ width: 26, fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "right" }}>
        {fila.goles} / {totalTiros}
      </Text>
      <Text style={{ width: 22, fontFamily: "Helvetica", fontSize: 7, textAlign: "right" }}>
        {fila.eficaciaPct !== null ? `${fila.eficaciaPct}%` : "—"}
      </Text>
      <Text style={{ width: 18, fontFamily: "Helvetica", fontSize: 7, textAlign: "right" }}>{fila.perdidas}</Text>
      <Text style={{ width: 18, fontFamily: "Helvetica", fontSize: 7, textAlign: "right" }}>{fila.robos}</Text>
      <Text style={{ width: 16, fontFamily: "Helvetica", fontSize: 7, textAlign: "right" }}>{fila.exclusiones}</Text>
      <Text style={{ width: 22, fontFamily: "Helvetica", fontSize: 7, textAlign: "right" }}>{fila.minutos}'</Text>
    </View>
  );
}

export function PdfFichaFilaTotal({ fila }: { fila: Omit<FilaJugadorPdf, "dorsal" | "nombre" | "pos"> }) {
  const totalTiros = fila.goles + fila.fallos;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 5, borderTopWidth: 1.2, borderTopColor: C.ink }}>
      <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 11, textTransform: "uppercase" }}>
        Total equipo
      </Text>
      <View style={{ width: 70 }} />
      <Text style={{ width: 26, fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "right" }}>
        {fila.goles} / {totalTiros}
      </Text>
      <Text style={{ width: 22, fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "right" }}>
        {fila.eficaciaPct !== null ? `${fila.eficaciaPct}%` : "—"}
      </Text>
      <Text style={{ width: 18, fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "right" }}>{fila.perdidas}</Text>
      <Text style={{ width: 18, fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "right" }}>{fila.robos}</Text>
      <Text style={{ width: 16, fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "right" }}>{fila.exclusiones}</Text>
      <Text style={{ width: 22, fontFamily: "Helvetica-Bold", fontSize: 7, textAlign: "right" }}>{fila.minutos}'</Text>
    </View>
  );
}

// ─── Porteros ───────────────────────────────────────────────────────────────

export function PdfFichaPortero({
  dorsal,
  nombre,
  pct,
  paradas,
  lanzamientos,
  minutos,
  sieteMetido,
  sieteTotal,
}: {
  dorsal: number | null;
  nombre: string;
  pct: number | null;
  paradas: number;
  lanzamientos: number;
  minutos: number;
  sieteMetido: number;
  sieteTotal: number;
}) {
  return (
    <View style={{ borderWidth: 0.7, borderColor: C.border, backgroundColor: C.card, padding: 8, display: "flex", flexDirection: "column", gap: 5 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Text style={{ fontSize: 8, fontWeight: 600 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>{dorsal ?? "—"} </Text>
          {nombre}
        </Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 14, color: C.accent }}>
          {pct !== null ? `${pct}%` : "—"}
        </Text>
      </View>
      <View style={{ flexDirection: "row", height: 3.2 }}>
        <View style={{ width: `${pct ?? 0}%`, backgroundColor: C.accent }} />
        <View style={{ flex: 1, backgroundColor: C.borderLight }} />
      </View>
      <Text style={{ fontFamily: "Helvetica", fontSize: 6.5, color: C.textMuted, lineHeight: 1.5 }}>
        {paradas} paradas / {lanzamientos} lanz. · {minutos}' jugados{"\n"}
        7 m: {sieteMetido} de {sieteTotal}
      </Text>
    </View>
  );
}

// ─── Destacados ─────────────────────────────────────────────────────────────

export function PdfFichaDestacados({ grupos }: { grupos: { titulo: string; filas: { etiqueta: string; valor: string }[] }[] }) {
  return (
    <View style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {grupos.map((g) => (
        <View key={g.titulo}>
          <Text style={{ fontFamily: "Helvetica", fontSize: 6, letterSpacing: 1, color: C.textMuted, marginBottom: 3 }}>
            {g.titulo}
          </Text>
          {g.filas.map((f, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingBottom: 2.5,
                marginBottom: 2.5,
                borderBottomWidth: i === g.filas.length - 1 ? 0 : 0.4,
                borderBottomColor: C.borderLight,
              }}
            >
              <Text style={{ fontSize: 7.5 }}>{f.etiqueta}</Text>
              <Text style={{ fontFamily: "Helvetica", fontSize: 7.5, fontWeight: 600 }}>{f.valor}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Notas numeradas ────────────────────────────────────────────────────────

export function PdfFichaNotas({ notas }: { notas: string[] }) {
  const mitad = Math.ceil(notas.length / 2);
  const columnas = [notas.slice(0, mitad), notas.slice(mitad)];
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {columnas.map((col, ci) => (
        <View key={ci} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          {col.map((texto, i) => {
            const numero = ci * mitad + i + 1;
            return (
              <Text key={i} style={{ fontSize: 7.5, lineHeight: 1.45, color: "#2a2a2c" }}>
                <Text style={{ color: C.accent, fontWeight: 700 }}>{String(numero).padStart(2, "0")}  </Text>
                {texto}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function PdfFichaSeccion({ titulo, leyenda, children }: { titulo: string; leyenda?: string; children: ReactNode }) {
  return (
    <View>
      <View style={fichaEstilos.filaTituloSeccion}>
        <Text style={fichaEstilos.tituloSeccion}>{titulo}</Text>
        {leyenda && <Text style={fichaEstilos.leyenda}>{leyenda}</Text>}
      </View>
      {children}
    </View>
  );
}

// ─── Pie de página ──────────────────────────────────────────────────────────

export function PdfFichaPie({ izquierda, centro }: { izquierda: string; centro: string }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 14,
        left: 20,
        right: 20,
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 0.6,
        borderTopColor: C.border,
        paddingTop: 5,
      }}
    >
      <Text style={{ fontFamily: "Helvetica", fontSize: 6, color: C.textFaint, letterSpacing: 1 }}>{izquierda}</Text>
      <Text style={{ fontFamily: "Helvetica", fontSize: 6, color: C.textFaint, letterSpacing: 1 }}>{centro}</Text>
      <Text
        style={{ fontFamily: "Helvetica", fontSize: 6, color: C.textFaint, letterSpacing: 1 }}
        render={({ pageNumber, totalPages }) => `PÁGINA ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}
