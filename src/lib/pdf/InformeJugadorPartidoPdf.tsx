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
