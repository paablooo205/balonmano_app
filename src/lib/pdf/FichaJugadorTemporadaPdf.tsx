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
  const totalAciertos = (detalleJuego?.aciertos ?? 0) + (detallePenalti?.aciertos ?? 0);

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
              {partidosJugados} partidos jugados · {portero ? totalAciertos : goles} {etiquetaAcierto} ·{" "}
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
                  <View key={`${t.label}-${i}`} style={i === tendenciaEficacia.length - 1 ? pdfEstilosBase.filaTablaUltima : pdfEstilosBase.filaTabla}>
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
