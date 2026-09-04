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
import { PdfCabecera, PdfListaInsights, PdfSeccion, PdfTablaEficacia, PdfTablaZonas, formatearFechaLarga, pdfEstilosBase } from "@/lib/pdf/PdfComponents";
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

  const fechaLarga = formatearFechaLarga(partido.fecha);

  return (
    <Document>
      <Page size="A4" style={pdfEstilosBase.pagina}>
        <PdfCabecera
          eyebrow={nombreEquipo}
          titulo={`vs ${partido.rival}`}
          subtitulo={[
            fechaLarga,
            partido.competicion,
            partido.casa_fuera === "casa" ? "Casa" : partido.casa_fuera === "fuera" ? "Fuera" : null,
            `Resultado ${marcadorPartido(partido, eventos)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
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
