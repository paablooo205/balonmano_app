import { useState } from "react";
import { Download } from "lucide-react";
import { AnilloDonut } from "@/components/partido/AnilloDonut";
import { BarrasJugador } from "@/components/partido/BarrasJugador";
import { BloqueTiro } from "@/components/partido/BloqueTiro";
import { LineaMarcador } from "@/components/partido/LineaMarcador";
import { MarcadorExclusiones } from "@/components/partido/MarcadorExclusiones";
import { PanelJugadorPartido } from "@/components/partido/PanelJugadorPartido";
import { InsightsCard } from "@/components/dashboard/InsightsCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { descargarPdf } from "@/lib/pdf/descargarPdf";
import { FichaPartidoPdf } from "@/lib/pdf/FichaPartidoPdf";
import { cargarEscudoPdf } from "@/lib/pdf/escudoPdf";
import {
  desgloseResultados,
  distribucionPorZona,
  eficaciaConDetalle,
  perdidas,
  porcentajeParadas,
  robos,
} from "@/lib/partidoStats";
import { cortePorMediana, dividirPorCorte, generarInsights } from "@/lib/insights";
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

export function FichaTecnica({
  partido,
  jugadores,
  eventos,
  nombreEquipo,
  onActualizado,
  soloLectura = false,
}: {
  partido: PartidosRow;
  jugadores: JugadoresRow[];
  eventos: EventosRow[];
  nombreEquipo: string;
  onActualizado?: (partido: PartidosRow) => void;
  soloLectura?: boolean;
}) {
  const [jugadorPanel, setJugadorPanel] = useState<JugadoresRow | null>(null);
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function descargarFichaPdf() {
    setDescargandoPdf(true);
    try {
      const escudo = await cargarEscudoPdf().catch(() => null);
      await descargarPdf(
        `ficha-partido-vs-${partido.rival}-${partido.fecha}`,
        <FichaPartidoPdf partido={partido} eventos={eventos} nombreEquipo={nombreEquipo} escudo={escudo} />,
      );
    } catch (err) {
      alert("No se pudo generar el PDF: " + (err as Error).message);
    } finally {
      setDescargandoPdf(false);
    }
  }

  function urlCompartida(token: string): string {
    // Dominio fijo, no window.location.origin: el link se comparte con
    // jugadores fuera de la app y no debe revelar el dominio/nombre real de
    // la app, sea cual sea el dominio desde el que el entrenador la use.
    return `https://ficha-compartida.vercel.app/compartido/${token}`;
  }

  async function copiarLink(token: string) {
    await navigator.clipboard.writeText(urlCompartida(token));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function compartir() {
    setCompartiendo(true);
    try {
      const token = crypto.randomUUID();
      const { error } = await supabase.from("partidos").update({ token_publico: token }).eq("id", partido.id);
      if (error) throw error;
      onActualizado?.({ ...partido, token_publico: token });
      await copiarLink(token);
    } catch (err) {
      alert("No se pudo compartir: " + (err as Error).message);
    } finally {
      setCompartiendo(false);
    }
  }

  async function dejarDeCompartir() {
    if (!confirm("¿Dejar de compartir esta ficha? El enlace actual dejará de funcionar.")) return;
    setCompartiendo(true);
    try {
      const { error } = await supabase.from("partidos").update({ token_publico: null }).eq("id", partido.id);
      if (error) throw error;
      onActualizado?.({ ...partido, token_publico: null });
    } catch (err) {
      alert("No se pudo dejar de compartir: " + (err as Error).message);
    } finally {
      setCompartiendo(false);
    }
  }

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

  const desgloseJuego = desgloseResultados(tirosJuego);
  const desglosePenalti = desgloseResultados(tirosPenalti);
  const pctJuego = tirosJuego.length > 0 ? Math.round((desgloseJuego.gol / tirosJuego.length) * 100) : null;
  const pctPenalti = tirosPenalti.length > 0 ? Math.round((desglosePenalti.gol / tirosPenalti.length) * 100) : null;

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!soloLectura &&
          (partido.token_publico ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => copiarLink(partido.token_publico!)}>
                {copiado ? "Copiado" : "Copiar link"}
              </Button>
              <Button variant="secondary" size="sm" onClick={dejarDeCompartir} disabled={compartiendo}>
                Dejar de compartir
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={compartir} disabled={compartiendo}>
              {compartiendo ? "Compartiendo..." : "Compartir ficha"}
            </Button>
          ))}
        <Button variant="secondary" size="sm" onClick={descargarFichaPdf} disabled={descargandoPdf}>
          <Download size={16} /> {descargandoPdf ? "Generando..." : "Descargar PDF"}
        </Button>
      </div>
      <InsightsCard insights={insights} />
      <LineaMarcador eventos={eventos} />

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
                  <span className="stat-number text-sm text-[var(--color-ink)]">{pctPenalti}%</span>
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
            detalle={eficaciaConDetalle(eventos, { soloPenalti: false })}
            zonas={zonasJuego}
            total={tirosJuego.length}
            aciertosPorZona={golesZonasJuego}
            etiquetaAcierto="goles"
          />
          <BloqueTiro
            titulo="7 metros"
            detalle={eficaciaConDetalle(eventos, { soloPenalti: true })}
            zonas={zonasPenalti}
            total={tirosPenalti.length}
            aciertosPorZona={golesZonasPenalti}
            etiquetaAcierto="goles"
          />
        </div>
      </div>

      <div className="card-surface p-4">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Nuestra portería</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BloqueTiro
            titulo="Juego abierto"
            detalle={porcentajeParadas(eventos, { soloPenalti: false })}
            zonas={zonasRivalJuego}
            total={tirosRivalJuego.length}
            aciertosPorZona={paradasZonasRivalJuego}
            etiquetaAcierto="paradas"
          />
          <BloqueTiro
            titulo="7 metros"
            detalle={porcentajeParadas(eventos, { soloPenalti: true })}
            zonas={zonasRivalPenalti}
            total={tirosRivalPenalti.length}
            aciertosPorZona={paradasZonasRivalPenalti}
            etiquetaAcierto="paradas"
          />
        </div>
      </div>

      {!soloLectura && <BarrasJugador jugadores={jugadores} eventos={eventos} onSeleccionar={setJugadorPanel} />}

      <div>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Pérdidas y robos</div>
        <div className="flex justify-center card-surface p-4">
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
        <div className="card-surface flex flex-col gap-3 p-4">
          {partido.problemas_detectados && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">Problemas detectados</div>
              <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text-muted)]">{partido.problemas_detectados}</p>
            </div>
          )}
          {partido.acciones_siguiente_semana && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">Acciones para la semana siguiente</div>
              <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text-muted)]">{partido.acciones_siguiente_semana}</p>
            </div>
          )}
          {partido.notas_adicionales && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">Notas adicionales</div>
              <p className="mt-1 whitespace-pre-line text-sm text-[var(--color-text-muted)]">{partido.notas_adicionales}</p>
            </div>
          )}
        </div>
      )}

      {jugadorPanel && (
        <PanelJugadorPartido jugador={jugadorPanel} partido={partido} eventos={eventos} onCerrar={() => setJugadorPanel(null)} />
      )}
    </div>
  );
}
