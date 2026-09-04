import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { EficaciaDetalle } from "@/lib/partidoStats";
import type { Insight } from "@/lib/insights";
import type { EscudoPdf } from "@/lib/pdf/escudoPdf";
import { pdfColores } from "@/lib/pdf/pdfTheme";

export function formatearFechaLarga(fecha: string): string {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

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

/** Escudo del club como marca de agua en la esquina inferior derecha de la
 * página — mismo tratamiento (grayscale + opacidad muy baja) que el fondo de
 * la app. `escudo` puede ser null si la conversión a PNG falló (no bloquea la
 * generación del resto del PDF). */
export function PdfEscudoFondo({ escudo }: { escudo: EscudoPdf | null }) {
  if (!escudo) return null;
  const alto = 260;
  const ancho = (escudo.width / escudo.height) * alto;
  return (
    <Image
      src={escudo.uri}
      style={{
        position: "absolute",
        bottom: -alto * 0.22,
        right: -ancho * 0.22,
        width: ancho,
        height: alto,
        opacity: 0.07,
      }}
    />
  );
}

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
