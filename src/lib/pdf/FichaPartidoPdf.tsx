import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  abreviaturaPuesto,
  distribucionPorZona,
  eficaciaConDetalle,
  eficaciaLanzamiento,
  eficaciaPorOrigenes,
  esPortero,
  golesContra,
  golesFavor,
  marcadorPartido,
  minutosJugados,
  parcialesPorTramos,
} from "@/lib/partidoStats";
import { cortePorMediana, dividirPorCorte, generarInsights } from "@/lib/insights";
import { formatearFechaLarga, PdfEscudoFondo } from "@/lib/pdf/PdfComponents";
import {
  fichaEstilos,
  PdfFichaCabecera,
  PdfFichaCabeceraLigera,
  PdfFichaCabeceraTablaJugadores,
  PdfFichaDestacados,
  PdfFichaFilaDonuts,
  PdfFichaFilaJugador,
  PdfFichaFilaTotal,
  PdfFichaMapaZonas,
  PdfFichaMarcador,
  PdfFichaNotas,
  PdfFichaParciales,
  PdfFichaPie,
  PdfFichaPortero,
  PdfFichaSeccion,
  PdfFichaSeccionMapas,
  type FilaJugadorPdf,
} from "@/lib/pdf/PdfFichaComponents";
import { pdfFichaColores } from "@/lib/pdf/pdfFichaTheme";
import { BOTONES_TARJETA } from "@/lib/partidoStats";
import type { EscudoPdf } from "@/lib/pdf/escudoPdf";
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

// Orígenes de lanzamiento que cuentan como "zona de 6 metros" (extremos +
// pivote) y "lanzamiento exterior" (laterales + central + 9m), a petición
// explícita del usuario — el contraataque se excluye de esta ficha porque su
// origen depende de un toque manual que el entrenador puede omitir bajo
// presión de tiempo, a diferencia del resultado/zona del tiro (obligatorios).
const ORIGENES_ZONA_6M = ["ext_izq", "ext_der", "pivote"] as const;
const ORIGENES_EXTERIOR = ["lat_izq", "lat_der", "central", "9m"] as const;

function golesPorParte(eventos: EventosRow[], equipoOrigen: "propio" | "rival", duracionParteMin: number) {
  let parte1 = 0;
  let parte2 = 0;
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.resultado !== "gol" || e.equipo_origen !== equipoOrigen || e.minuto === null) continue;
    if (e.minuto <= duracionParteMin) parte1++;
    else parte2++;
  }
  return { parte1, parte2 };
}

export function FichaPartidoPdf({
  partido,
  eventos,
  jugadores,
  nombreEquipo,
  escudo,
}: {
  partido: PartidosRow;
  eventos: EventosRow[];
  jugadores: JugadoresRow[];
  nombreEquipo: string;
  escudo: EscudoPdf | null;
}) {
  const duracionParteMin = partido.duracion_parte_min;
  const fechaLarga = formatearFechaLarga(partido.fecha);

  const tirosPropios = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio");
  const tirosRivales = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival");

  const zonasPropias = distribucionPorZona(tirosPropios);
  const golesZonasPropias = distribucionPorZona(tirosPropios.filter((e) => e.resultado === "gol"));
  const zonasRivales = distribucionPorZona(tirosRivales);
  const paradasZonasRivales = distribucionPorZona(tirosRivales.filter((e) => e.resultado === "parado"));

  const partePropio = golesPorParte(eventos, "propio", duracionParteMin);
  const parteRival = golesPorParte(eventos, "rival", duracionParteMin);

  const tramos = parcialesPorTramos(eventos, duracionParteMin);

  const donuts = [
    { titulo: "Eficacia global", clave: eficaciaConDetalle(eventos) },
    { titulo: "Zona de 6 metros", clave: eficaciaPorOrigenes(eventos, [...ORIGENES_ZONA_6M]) },
    { titulo: "Lanzamiento exterior", clave: eficaciaPorOrigenes(eventos, [...ORIGENES_EXTERIOR]) },
  ].map((d) => ({
    pct: d.clave?.pct ?? 0,
    color: pdfFichaColores.accent,
    titulo: d.titulo,
    subtitulo: d.clave ? `${d.clave.aciertos} / ${d.clave.intentos} lanz.` : "Sin lanzamientos",
  }));

  // ── Rendimiento individual ──────────────────────────────────────────────
  const eventosJsonb = partido.estadisticas.eventos ?? [];
  const duracionTotalMin = duracionParteMin * 2;

  const jugadoresDeCampo = jugadores
    .filter((j) => !esPortero(j.puesto))
    .map((j): FilaJugadorPdf => {
      const golesJugador = eventos.filter(
        (e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.jugador_id === j.id && e.resultado === "gol",
      ).length;
      const fallosJugador = eventos.filter(
        (e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.jugador_id === j.id && e.resultado !== "gol",
      ).length;
      return {
        dorsal: j.dorsal,
        nombre: j.nombre,
        pos: abreviaturaPuesto(j.puesto),
        goles: golesJugador,
        fallos: fallosJugador,
        eficaciaPct: eficaciaLanzamiento(eventos, j.id),
        perdidas: eventos.filter((e) => e.tipo === "perdida" && e.equipo_origen === "propio" && e.jugador_id === j.id).length,
        robos: eventos.filter((e) => e.tipo === "perdida" && e.equipo_origen === "rival" && e.jugador_id === j.id).length,
        exclusiones: eventos.filter((e) => e.tipo === "exclusion" && e.equipo_origen === "propio" && e.jugador_id === j.id).length,
        minutos: minutosJugados(eventosJsonb, j.id, duracionTotalMin),
      };
    })
    .sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999));

  const maxTiros = Math.max(...jugadoresDeCampo.map((f) => f.goles + f.fallos), 1);

  const totalEquipo = jugadoresDeCampo.reduce(
    (acc, f) => ({
      goles: acc.goles + f.goles,
      fallos: acc.fallos + f.fallos,
      perdidas: acc.perdidas + f.perdidas,
      robos: acc.robos + f.robos,
      exclusiones: acc.exclusiones + f.exclusiones,
      minutos: acc.minutos + f.minutos,
    }),
    { goles: 0, fallos: 0, perdidas: 0, robos: 0, exclusiones: 0, minutos: 0 },
  );
  const totalIntentos = totalEquipo.goles + totalEquipo.fallos;
  const totalEquipoFila = {
    ...totalEquipo,
    eficaciaPct: totalIntentos > 0 ? Math.round((totalEquipo.goles / totalIntentos) * 100) : null,
  };

  // ── Porteros ─────────────────────────────────────────────────────────────
  const porteros = jugadores
    .filter((j) => esPortero(j.puesto))
    .map((j) => {
      const afrontados = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival" && e.jugador_id === j.id);
      const paradas = afrontados.filter((e) => e.resultado === "parado").length;
      const penaltis = afrontados.filter((e) => e.es_penalti);
      return {
        id: j.id,
        dorsal: j.dorsal,
        nombre: j.nombre,
        paradas,
        lanzamientos: afrontados.length,
        pct: afrontados.length > 0 ? Math.round((paradas / afrontados.length) * 100) : null,
        minutos: minutosJugados(eventosJsonb, j.id, duracionTotalMin),
        sieteMetido: penaltis.filter((e) => e.resultado === "gol").length,
        sieteTotal: penaltis.length,
      };
    })
    .sort((a, b) => b.minutos - a.minutos);

  // ── Destacados ───────────────────────────────────────────────────────────
  const masMinutos = [...jugadoresDeCampo, ...porteros.map((p) => ({ ...p, dorsal: p.dorsal, nombre: p.nombre }))]
    .sort((a, b) => b.minutos - a.minutos)
    .slice(0, 3)
    .map((f) => ({ etiqueta: `${f.dorsal ?? "—"} · ${f.nombre}`, valor: `${f.minutos}'` }));
  const masGoleadores = jugadoresDeCampo
    .filter((f) => f.goles > 0)
    .sort((a, b) => b.goles - a.goles)
    .slice(0, 3)
    .map((f) => ({ etiqueta: `${f.dorsal ?? "—"} · ${f.nombre}`, valor: `${f.goles} gol${f.goles === 1 ? "" : "es"}` }));

  // ── Contenido ya existente (se conserva, con el estilo nuevo) ───────────
  const tirosJuegoPropio = tirosPropios.filter((e) => !e.es_penalti);
  const tirosPenaltiPropio = tirosPropios.filter((e) => e.es_penalti);
  const tirosJuegoRival = tirosRivales.filter((e) => !e.es_penalti);
  const tirosPenaltiRival = tirosRivales.filter((e) => e.es_penalti);
  const corte = cortePorMediana(eventos);
  const insights = generarInsights({
    zonaPropioJuego: tirosJuegoPropio,
    zonaPropioPenalti: tirosPenaltiPropio,
    zonaRivalJuego: tirosJuegoRival,
    zonaRivalPenalti: tirosPenaltiRival,
    ejecucionPropioJuego: tirosJuegoPropio,
    contextoAusencia: "en el partido",
    tendencia: corte
      ? {
          propio: dividirPorCorte(tirosJuegoPropio, corte),
          rival: dividirPorCorte(tirosJuegoRival, corte),
          etiquetas: { a: "de la 1ª parte", b: "la 2ª parte" },
        }
      : undefined,
  });

  const tarjetasFilas = BOTONES_TARJETA.map((b) => ({
    etiqueta: b.label,
    propias: eventos.filter((e) => e.tipo === "tarjeta" && e.color_tarjeta === b.color && e.equipo_origen === "propio").length,
    rivales: eventos.filter((e) => e.tipo === "tarjeta" && e.color_tarjeta === b.color && e.equipo_origen === "rival").length,
  }));
  const exclusionesPropias = eventos.filter((e) => e.tipo === "exclusion" && e.equipo_origen === "propio").length;
  const exclusionesRival = eventos.filter((e) => e.tipo === "exclusion" && e.equipo_origen === "rival").length;

  const notas = [
    partido.problemas_detectados,
    partido.acciones_siguiente_semana,
    partido.notas_adicionales,
    ...insights.map((i) => i.texto),
  ].filter((n): n is string => Boolean(n && n.trim()));

  const metaLines = [
    partido.competicion?.toUpperCase(),
    fechaLarga.toUpperCase() + (partido.hora ? ` · ${partido.hora.slice(0, 5)}` : ""),
    partido.casa_fuera === "casa" ? "EN CASA" : partido.casa_fuera === "fuera" ? "FUERA" : null,
  ].filter((l): l is string => Boolean(l));

  const piePartido = `${nombreEquipo.toUpperCase()} ${marcadorPartido(partido, eventos)} ${partido.rival.toUpperCase()}`;

  return (
    <Document title={`Ficha técnica · ${nombreEquipo} — ${partido.rival}`}>
      {/* Página 1 — marcador, parciales, eficacia y zonas */}
      <Page size="A4" style={fichaEstilos.pagina}>
        <PdfEscudoFondo escudo={escudo} />
        <PdfFichaCabecera eyebrow="Balonmano · Informe de partido" titulo="Ficha técnica" metaLines={metaLines} />
        <View style={fichaEstilos.cuerpo}>
          <PdfFichaMarcador
            propio={{
              etiqueta: partido.casa_fuera === "fuera" ? "Visitante" : "Local",
              nombre: nombreEquipo,
              goles: golesFavor(eventos),
              subtitulo: `${partePropio.parte1} · ${partePropio.parte2} por partes  |  ${tirosPropios.length} lanzamientos`,
            }}
            rival={{
              etiqueta: partido.casa_fuera === "fuera" ? "Local" : "Visitante",
              nombre: partido.rival,
              goles: golesContra(eventos),
              subtitulo: `${parteRival.parte1} · ${parteRival.parte2} por partes  |  ${tirosRivales.length} lanzamientos`,
            }}
          />

          <PdfFichaParciales tramos={tramos} nombreEquipo={nombreEquipo} />

          <PdfFichaFilaDonuts donuts={donuts} />

          <PdfFichaSeccionMapas>
            <PdfFichaMapaZonas
              titulo="Ataque propio"
              subtitulo={`— ${golesFavor(eventos)} de ${tirosPropios.length}`}
              intentos={zonasPropias}
              aciertos={golesZonasPropias}
            />
            <PdfFichaMapaZonas
              titulo="Lanzamientos recibidos"
              subtitulo={`— ${golesContra(eventos)} de ${tirosRivales.length}`}
              intentos={zonasRivales}
              aciertos={paradasZonasRivales}
            />
          </PdfFichaSeccionMapas>
        </View>
        <PdfFichaPie izquierda={nombreEquipo.toUpperCase()} centro={piePartido} />
      </Page>

      {/* Página 2 — rendimiento individual */}
      <Page size="A4" style={fichaEstilos.pagina}>
        <PdfEscudoFondo escudo={escudo} />
        <View style={[fichaEstilos.cuerpo, { paddingTop: 18 }]}>
          <PdfFichaCabeceraLigera titulo="Rendimiento individual" eyebrow={`${nombreEquipo.toUpperCase()} · ${fechaLarga.toUpperCase()}`} />

          <PdfFichaSeccion titulo="Jugadores de campo" leyenda="■ GOLES   ■ LANZAMIENTOS FALLADOS">
            <PdfFichaCabeceraTablaJugadores />
            {jugadoresDeCampo.map((f, i) => (
              <PdfFichaFilaJugador key={i} fila={f} maxTiros={maxTiros} />
            ))}
            <PdfFichaFilaTotal fila={totalEquipoFila} />
          </PdfFichaSeccion>

          <View style={{ flexDirection: "row", gap: 14, marginTop: 4 }}>
            <View style={{ flex: 1 }}>
              <PdfFichaSeccion titulo="Porteros">
                <View style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {porteros.length === 0 && <Text style={{ fontSize: 7.5, color: pdfFichaColores.textMuted }}>Sin portero registrado.</Text>}
                  {porteros.map((p) => (
                    <PdfFichaPortero key={p.id} {...p} />
                  ))}
                </View>
              </PdfFichaSeccion>
            </View>
            <View style={{ flex: 1 }}>
              <PdfFichaSeccion titulo="Destacados">
                <PdfFichaDestacados
                  grupos={[
                    { titulo: "MÁS MINUTOS", filas: masMinutos },
                    { titulo: "MÁXIMOS GOLEADORES", filas: masGoleadores },
                  ]}
                />
              </PdfFichaSeccion>
            </View>
          </View>
        </View>
        <PdfFichaPie izquierda={nombreEquipo.toUpperCase()} centro={piePartido} />
      </Page>

      {/* Página 3 — sanciones y notas del entrenador (contenido ya existente, con el estilo nuevo) */}
      <Page size="A4" style={fichaEstilos.pagina}>
        <PdfEscudoFondo escudo={escudo} />
        <View style={[fichaEstilos.cuerpo, { paddingTop: 18 }]}>
          <PdfFichaCabeceraLigera titulo="Sanciones y notas" eyebrow={`${nombreEquipo.toUpperCase()} · ${fechaLarga.toUpperCase()}`} />

          <PdfFichaSeccion titulo="Sanciones">
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
              <View style={{ flex: 1, borderWidth: 0.7, borderColor: pdfFichaColores.border, padding: 8 }}>
                <Text style={{ fontSize: 6.5, color: pdfFichaColores.textMuted, marginBottom: 3 }}>EXCLUSIONES (2')</Text>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>
                  {exclusionesPropias} <Text style={{ color: pdfFichaColores.textMuted, fontSize: 7 }}>propias</Text> ·{" "}
                  {exclusionesRival} <Text style={{ color: pdfFichaColores.textMuted, fontSize: 7 }}>rival</Text>
                </Text>
              </View>
              {tarjetasFilas.map((t) => (
                <View key={t.etiqueta} style={{ flex: 1, borderWidth: 0.7, borderColor: pdfFichaColores.border, padding: 8 }}>
                  <Text style={{ fontSize: 6.5, color: pdfFichaColores.textMuted, marginBottom: 3 }}>{t.etiqueta.toUpperCase()}</Text>
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>
                    {t.propias} <Text style={{ color: pdfFichaColores.textMuted, fontSize: 7 }}>propias</Text> · {t.rivales}{" "}
                    <Text style={{ color: pdfFichaColores.textMuted, fontSize: 7 }}>rival</Text>
                  </Text>
                </View>
              ))}
            </View>
          </PdfFichaSeccion>

          {notas.length > 0 && (
            <PdfFichaSeccion titulo="Notas del entrenador">
              <PdfFichaNotas notas={notas} />
            </PdfFichaSeccion>
          )}
        </View>
        <PdfFichaPie izquierda={nombreEquipo.toUpperCase()} centro={piePartido} />
      </Page>
    </Document>
  );
}
