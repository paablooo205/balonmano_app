import { useEffect, useState } from "react";
import { ChevronLeft, LogIn, LogOut, Pause, Play, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import { borrarEvento, registrarEvento } from "@/lib/eventos";
import { CuadriculaPorteria } from "@/components/partido/CuadriculaPorteria";
import { OrigenChips } from "@/components/partido/OrigenChips";
import { PanelStats } from "@/components/partido/PanelStats";
import { useFullscreenHorizontal } from "@/hooks/useFullscreenHorizontal";
import { useMovilHorizontal } from "@/hooks/useMovilHorizontal";
import {
  ACCIONES_JSONB,
  BOTONES_TARJETA,
  BOTONES_TIRO_PROPIO,
  BOTONES_TIRO_RIVAL,
  cambiarParte,
  colorTiro,
  contarBotonTiro,
  crearEventoJsonb,
  esPortero,
  etiquetaTiro,
  ETIQUETAS_EVENTO_JSONB,
  ETIQUETAS_ORIGEN,
  exclusiones,
  formatoReloj,
  golesContra,
  golesFavor,
  iniciarOReanudar,
  marcadorHastaTabla,
  minutoActual,
  origenPorPuesto,
  pausar,
  perdidas,
  requiereZona,
  robos,
  segundosActuales,
  segundosPartido,
  type BotonTiro,
} from "@/lib/partidoStats";
import { cn } from "@/lib/utils";
import type {
  ColorTarjeta,
  EquipoOrigenEvento,
  EventosRow,
  JugadoresRow,
  OrigenLanzamiento,
  PartidosRow,
  ResultadoTiro,
  TipoEventoPartido,
} from "@/types/database";

/**
 * Marcador en vivo — reloj por partes, selector de jugador/a por chips
 * (obligatorio para registrar), panel de acción agrupado, cuadrícula de
 * portería siempre visible con mapa de calor, panel de estadísticas y
 * cronología. Ocupa toda la pantalla (overlay `fixed inset-0`, fuera del
 * `<main>` con nav/paddings) e intenta forzar horizontal + pantalla completa
 * del navegador vía `useFullscreenHorizontal` (mejor esfuerzo: no soportado
 * en iOS Safari). Diseñado principalmente para tablet/iPad (layout de grids
 * responsive, colapsa a una columna en móvil vertical); en móvil apaisado y
 * viewport corto (una mano) usa el layout `compacto` de dos columnas, sin
 * panel de estadísticas para no perder espacio vertical.
 *
 * Desde 0017/0018_eventos.sql, tiros/pérdidas/exclusiones/tarjetas escriben
 * en la tabla `eventos`; "7m provocado"/"7m cometido" y las sustituciones
 * (entra/sale pista) siguen en `partido.estadisticas` (jsonb), igual que el
 * cronómetro. La cronología y "deshacer" fusionan ambas fuentes por
 * `creado_en`.
 *
 * Flujo de registro (bidireccional a propósito, ver spec de esta fase):
 * seleccionar jugador (obligatorio, sin excepciones — incluida "Gol en
 * contra": se atribuye al portero seleccionado) → tocar una acción de tiro
 * arma esa acción y espera zona, o tocar una zona primero arma la zona y
 * espera acción — lo que llegue primero completa el registro. "Anular"
 * limpia lo pendiente sin registrar.
 */
export function ContadoresEnVivo({
  partido,
  equipoNombre,
  jugadores,
  eventos,
  onActualizado,
  onEventosActualizados,
  onBack,
}: {
  partido: PartidosRow;
  equipoNombre?: string;
  jugadores: JugadoresRow[];
  eventos: EventosRow[];
  onActualizado: (p: PartidosRow) => void;
  onEventosActualizados: (eventos: EventosRow[]) => void;
  onBack: () => void;
}) {
  useFullscreenHorizontal();
  const compacto = useMovilHorizontal();
  const [tick, setTick] = useState(0);
  const [jugadorSel, setJugadorSel] = useState<string | null>(null);
  const [sietePendiente, setSietePendiente] = useState(false);
  const [verTodasAcciones, setVerTodasAcciones] = useState(false);
  const [accionPendiente, setAccionPendiente] = useState<BotonTiro | null>(null);
  const [zonaPendiente, setZonaPendiente] = useState<number | null>(null);
  const [origenSel, setOrigenSel] = useState<OrigenLanzamiento | null>(null);
  const cronometro = partido.estadisticas.cronometro;
  const eventosJsonb = partido.estadisticas.eventos ?? [];
  const duracionParteMin = partido.duracion_parte_min;

  const jugadorActual = jugadores.find((j) => j.id === jugadorSel) ?? null;
  const esJugadorActualPortero = jugadorActual ? esPortero(jugadorActual.puesto) : false;

  // Cronología unificada: eventos de tabla (tiros/pérdidas/exclusiones/
  // tarjetas) + eventos jsonb (7m provocado/cometido, entra/sale pista),
  // todos con la misma forma para poder ordenarlos y "deshacer" el más
  // reciente sea cual sea su origen.
  type ToqueUnificado = {
    id: string;
    origen: "tabla" | "jsonb";
    label: string;
    color: string;
    jugadorId: string | null;
    esRival: boolean;
    minuto: number | null;
    creadoEn: string;
    afectaMarcador: boolean;
    detalle: string;
  };
  const toquesTabla: ToqueUnificado[] = eventos.map((e) => {
    if (e.tipo === "tiro") {
      return {
        id: e.id,
        origen: "tabla",
        label: etiquetaTiro(e),
        color: colorTiro(e),
        jugadorId: e.jugador_id,
        esRival: e.equipo_origen === "rival",
        minuto: e.minuto,
        creadoEn: e.creado_en,
        afectaMarcador: e.resultado === "gol",
        detalle: [e.zona ? `Z${e.zona}` : null, e.origen ? ETIQUETAS_ORIGEN[e.origen] : null].filter(Boolean).join(" · "),
      };
    }
    if (e.tipo === "tarjeta") {
      const b = BOTONES_TARJETA.find((x) => x.color === e.color_tarjeta);
      return {
        id: e.id,
        origen: "tabla",
        label: `Tarjeta ${b?.label.toLowerCase() ?? ""}`.trim(),
        color: b?.hex ?? "rgba(255,255,255,.35)",
        jugadorId: e.jugador_id,
        esRival: false,
        minuto: e.minuto,
        creadoEn: e.creado_en,
        afectaMarcador: false,
        detalle: "",
      };
    }
    const label = e.tipo === "perdida" ? (e.equipo_origen === "rival" ? "Balón ganado" : "Balón perdido") : "Exclusión 2'";
    const color = e.tipo === "perdida" ? (e.equipo_origen === "rival" ? "var(--color-success)" : "var(--color-warning)") : "var(--color-warning)";
    return {
      id: e.id,
      origen: "tabla",
      label,
      color,
      jugadorId: e.jugador_id,
      esRival: e.equipo_origen === "rival",
      minuto: e.minuto,
      creadoEn: e.creado_en,
      afectaMarcador: false,
      detalle: "",
    };
  });
  const toquesJsonb: ToqueUnificado[] = eventosJsonb.map((e) => ({
    id: e.id,
    origen: "jsonb",
    label: ETIQUETAS_EVENTO_JSONB[e.tipo],
    color:
      e.tipo === "siete_provocado"
        ? "var(--color-success)"
        : e.tipo === "siete_cometido"
          ? "var(--color-accent)"
          : "rgba(255,255,255,.35)",
    jugadorId: e.jugador_id,
    esRival: false,
    minuto: e.minuto,
    creadoEn: e.creado_en,
    afectaMarcador: false,
    detalle: "",
  }));
  const toquesDesc = [...toquesTabla, ...toquesJsonb].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  const golesEventosTabla = eventos.filter((e) => e.tipo === "tiro" && e.resultado === "gol");
  const golesDesc = [...golesEventosTabla].sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  const conteosPorZona: Record<number, number> = {};
  for (const e of eventos) {
    if (e.tipo !== "tiro" || e.zona === null) continue;
    if (jugadorSel && e.jugador_id !== jugadorSel) continue;
    conteosPorZona[e.zona] = (conteosPorZona[e.zona] ?? 0) + 1;
  }

  useEffect(() => {
    if (!cronometro?.corriendo) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [cronometro?.corriendo]);
  void tick;

  // Al llegar a la duración configurada de la parte: para el cronómetro
  // automáticamente y, si era la 1ª parte, la deja lista (en pausa, a 0:00)
  // para la 2ª — el entrenador sigue teniendo que darle a "reanudar" a mano.
  // Si era la 2ª parte, solo para (fin de partido, sin parte 3).
  useEffect(() => {
    if (!cronometro?.corriendo) return;
    if (segundosActuales(cronometro) < duracionParteMin * 60) return;
    const nuevo = cronometro.parte === 1 ? cambiarParte(cronometro) : pausar(cronometro);
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: nuevo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, cronometro?.corriendo]);

  async function persistirEstadisticas(estadisticas: PartidosRow["estadisticas"]) {
    const actualizado: PartidosRow = { ...partido, estadisticas, updated_at: new Date().toISOString() };
    onActualizado(actualizado);
    if (!navigator.onLine) {
      await encolarOperacion({ tabla: "partidos", tipo: "update", rowId: partido.id, payload: actualizado });
      return;
    }
    const { error, status } = await supabase.from("partidos").update({ estadisticas }).eq("id", partido.id);
    if (error && esErrorDeRed(status)) {
      await encolarOperacion({ tabla: "partidos", tipo: "update", rowId: partido.id, payload: actualizado });
    } else if (error) {
      console.error(`[partido] no se pudo actualizar las estadísticas del partido ${partido.id}:`, error);
    }
  }

  function alternarCronometro() {
    const nuevo = cronometro?.corriendo ? pausar(cronometro) : iniciarOReanudar(cronometro);
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: nuevo });
  }

  function siguienteParte() {
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: cambiarParte(cronometro) });
  }

  function seleccionarJugador(j: JugadoresRow) {
    setJugadorSel(j.id);
    setAccionPendiente(null);
    setZonaPendiente(null);
    setOrigenSel(origenPorPuesto(j.puesto));
  }

  function registrarTiro(equipoOrigen: EquipoOrigenEvento, resultado: ResultadoTiro, zona: number | null) {
    if (!jugadorSel) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: jugadorSel,
      equipo_origen: equipoOrigen,
      tipo: "tiro",
      resultado,
      zona,
      origen: sietePendiente ? "7m" : origenSel,
      es_penalti: sietePendiente,
      color_tarjeta: null,
      minuto: minutoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    setSietePendiente(false);
  }

  function esBotonArmado(boton: BotonTiro): boolean {
    return accionPendiente?.resultado === boton.resultado && accionPendiente?.equipoOrigen === boton.equipoOrigen;
  }

  function tocarBotonTiro(boton: BotonTiro) {
    if (!jugadorSel) return;
    if (!requiereZona(boton.resultado)) {
      registrarTiro(boton.equipoOrigen, boton.resultado, null);
      anular();
      return;
    }
    if (zonaPendiente !== null) {
      registrarTiro(boton.equipoOrigen, boton.resultado, zonaPendiente);
      setZonaPendiente(null);
      return;
    }
    setAccionPendiente(esBotonArmado(boton) ? null : boton);
  }

  function tocarZona(zona: number) {
    if (!jugadorSel) return;
    if (accionPendiente) {
      registrarTiro(accionPendiente.equipoOrigen, accionPendiente.resultado, zona);
      setAccionPendiente(null);
      return;
    }
    setZonaPendiente(zonaPendiente === zona ? null : zona);
  }

  function anular() {
    setAccionPendiente(null);
    setZonaPendiente(null);
  }

  function registrarPerdidaRobo(equipoOrigen: EquipoOrigenEvento) {
    if (!jugadorSel) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: jugadorSel,
      equipo_origen: equipoOrigen,
      tipo: "perdida",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: null,
      minuto: minutoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    anular();
  }

  function registrarExclusion() {
    if (!jugadorSel) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: jugadorSel,
      equipo_origen: "propio",
      tipo: "exclusion",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: null,
      minuto: minutoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    anular();
  }

  function registrarTarjeta(color: ColorTarjeta) {
    if (!jugadorSel) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: jugadorSel,
      equipo_origen: "propio",
      tipo: "tarjeta",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: color,
      minuto: minutoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    anular();
  }

  function registrarJsonb(tipo: TipoEventoPartido) {
    if (!jugadorSel) return;
    const evento = crearEventoJsonb(tipo, jugadorSel, minutoActual(cronometro, duracionParteMin));
    void persistirEstadisticas({ ...partido.estadisticas, eventos: [...eventosJsonb, evento] });
    anular();
  }

  function registrarSustitucion(tipo: "entra_pista" | "sale_pista") {
    if (!jugadorSel) {
      alert("Selecciona primero un jugador/a en la fila de arriba.");
      return;
    }
    const evento = crearEventoJsonb(tipo, jugadorSel, minutoActual(cronometro, duracionParteMin));
    void persistirEstadisticas({ ...partido.estadisticas, eventos: [...eventosJsonb, evento] });
  }

  function deshacer() {
    if (toquesDesc.length === 0) return;
    const ultimo = toquesDesc[0];
    if (ultimo.origen === "tabla") {
      onEventosActualizados(eventos.filter((e) => e.id !== ultimo.id));
      void borrarEvento(ultimo.id);
    } else {
      void persistirEstadisticas({ ...partido.estadisticas, eventos: eventosJsonb.filter((e) => e.id !== ultimo.id) });
    }
  }

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "z" || ev.key === "Z") deshacer();
      if (ev.code === "Space" && ev.target === document.body) {
        ev.preventDefault();
        alternarCronometro();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toquesDesc, cronometro]);

  const corriendo = !!cronometro?.corriendo;
  const estado = corriendo ? "En juego" : toquesDesc.length > 0 ? "Pausado" : "Sin empezar";

  let statusMain = "Selecciona un jugador";
  let statusHint = "Paso 1 de 2";
  if (jugadorActual) {
    statusMain = `#${jugadorActual.dorsal ?? "—"} ${jugadorActual.nombre}`;
    statusHint = "Elige la acción";
    if (accionPendiente) {
      statusMain += ` — ${accionPendiente.label}`;
      statusHint = "Toca la zona de la portería";
    } else if (zonaPendiente !== null) {
      statusMain += ` — zona ${zonaPendiente}`;
      statusHint = "Elige el resultado del tiro";
    }
  }

  const jugadorBlock = (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Jugador</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => registrarSustitucion("entra_pista")}
            className="flex h-9 items-center gap-1 rounded-[3px] bg-white/[.08] px-2.5 text-[11px] font-medium text-[#4ddc8a]"
          >
            <LogIn size={12} /> Entra
          </button>
          <button
            onClick={() => registrarSustitucion("sale_pista")}
            className="flex h-9 items-center gap-1 rounded-[3px] bg-white/[.08] px-2.5 text-[11px] font-medium text-white/60"
          >
            <LogOut size={12} /> Sale
          </button>
        </div>
      </div>
      {/* Fila horizontal con scroll en móvil/apaisado; en el layout tablet
          (`lg:`) se convierte en lista vertical dentro de la columna de
          180px — mismo markup, solo cambia flex-direction (ver ChipJugador).
          Sin padding horizontal propio: el inset lo da siempre el
          contenedor que lo envuelve en cada layout (mismo criterio que
          zonaBlock/accionesBlock, para que ambos queden alineados al mismo
          margen — ver usos más abajo).

          Bajo `lg:`, `max-h` + `overflow-y-auto` propios: sin esto, una
          plantilla larga hacía crecer la columna hasta empujar el scroll a
          toda la pantalla (zona/acciones desaparecían de la vista al bajar
          por la lista) — ahora solo se desplaza la lista, el resto del
          panel se queda fijo. */}
      <div className="flex gap-1.5 overflow-x-auto lg:max-h-[50vh] lg:flex-col lg:gap-1 lg:overflow-y-auto lg:pr-1">
        {jugadores.map((j) => (
          <ChipJugador
            key={j.id}
            nombre={j.nombre.split(" ")[0]}
            numero={j.dorsal != null ? String(j.dorsal) : "—"}
            activo={jugadorSel === j.id}
            onClick={() => seleccionarJugador(j)}
          />
        ))}
      </div>
    </div>
  );

  const zonaBlock = (
    <div className="flex flex-col gap-3">
      <CuadriculaPorteria
        tocable={!!jugadorSel}
        resaltado={!!accionPendiente || zonaPendiente !== null}
        compacto={compacto}
        onZona={tocarZona}
        conteosPorZona={conteosPorZona}
      />
      <OrigenChips valor={origenSel} onCambiar={setOrigenSel} />
    </div>
  );

  const accionesBlock = (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setSietePendiente((v) => !v)}
        className={cn(
          "flex h-11 items-center justify-center rounded text-[12px] font-semibold transition-colors",
          sietePendiente ? "bg-[var(--color-accent)] text-white" : "bg-white/[.08] text-white/60",
        )}
      >
        Penalti (7m)
      </button>

      <GrupoBotones titulo="Tiro" cols={4}>
        {BOTONES_TIRO_PROPIO.map((b) => (
          <BotonAccion
            key={`${b.equipoOrigen}-${b.resultado}`}
            label={b.label}
            color={b.color}
            count={contarBotonTiro(eventos, b)}
            armado={esBotonArmado(b)}
            disabled={!jugadorSel}
            onClick={() => tocarBotonTiro(b)}
          />
        ))}
      </GrupoBotones>

      <GrupoBotones titulo="Portero" cols={2} conBorde>
        {BOTONES_TIRO_RIVAL.map((b) => (
          <BotonAccion
            key={`${b.equipoOrigen}-${b.resultado}`}
            label={b.label}
            color={b.color}
            count={contarBotonTiro(eventos, b)}
            armado={esBotonArmado(b)}
            disabled={!jugadorSel || !esJugadorActualPortero}
            onClick={() => tocarBotonTiro(b)}
          />
        ))}
      </GrupoBotones>

      <GrupoBotones titulo="Pérdida / Robo" cols={2} conBorde>
        <BotonAccion label="Robo" color="var(--color-success)" count={robos(eventos)} disabled={!jugadorSel} onClick={() => registrarPerdidaRobo("rival")} />
        <BotonAccion label="Pérdida" color="var(--color-warning)" count={perdidas(eventos)} disabled={!jugadorSel} onClick={() => registrarPerdidaRobo("propio")} />
      </GrupoBotones>

      <GrupoBotones titulo="Sanción" cols={4} conBorde>
        <BotonAccion label="Exclusión 2'" color="var(--color-warning)" count={exclusiones(eventos)} disabled={!jugadorSel} onClick={registrarExclusion} />
        {BOTONES_TARJETA.map((b) => (
          <BotonAccion
            key={b.color}
            label={b.label}
            color={b.hex}
            count={eventos.filter((e) => e.tipo === "tarjeta" && e.color_tarjeta === b.color).length}
            disabled={!jugadorSel}
            onClick={() => registrarTarjeta(b.color)}
          />
        ))}
      </GrupoBotones>

      <GrupoBotones titulo="Otros" cols={2} conBorde>
        {ACCIONES_JSONB.map((a) => (
          <BotonAccion
            key={a.tipo}
            label={a.label}
            color={a.color}
            count={eventosJsonb.filter((e) => e.tipo === a.tipo).length}
            disabled={!jugadorSel}
            onClick={() => registrarJsonb(a.tipo)}
          />
        ))}
      </GrupoBotones>

      <div className="flex items-center gap-2 border-t border-white/[.06] pt-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white">{statusMain}</div>
          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/45">{statusHint}</div>
        </div>
        <button
          onClick={anular}
          className="flex h-8 shrink-0 items-center rounded bg-white/[.08] px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60"
        >
          Anular
        </button>
      </div>
    </div>
  );

  const toquesVisibles = verTodasAcciones ? toquesDesc : toquesDesc.slice(0, 5);

  const cronologiaBlock = (
    <div className="min-h-0">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Cronología</span>
        <span className="text-[10px] text-white/30">{toquesDesc.length} acciones</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {toquesDesc.length === 0 && (
          <div className="rounded-[3px] border border-dashed border-white/[.14] px-3.5 py-5 text-center text-xs text-white/35">
            Sin acciones registradas. Selecciona un jugador y pulsa una acción.
          </div>
        )}
        {toquesVisibles.map((t) => {
          const jugador = t.jugadorId ? jugadores.find((j) => j.id === t.jugadorId) : null;
          const quien = jugador ? `#${jugador.dorsal ?? "—"} ${jugador.nombre}` : t.esRival ? partido.rival : "Sin asignar";
          const indiceGol = golesDesc.findIndex((g) => g.id === t.id);
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-[3px] bg-white/[.05] px-3.5 py-2.5"
              style={{ borderLeft: `3px solid ${t.color}` }}
            >
              <span className="stat-number w-8 shrink-0 text-[15px] text-white">
                {t.minuto ?? minutoActual(cronometro, duracionParteMin) ?? "—"}&apos;
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-white">{t.label}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/42">{quien}</div>
              </div>
              {t.detalle && <span className="stat-number shrink-0 text-[10px] tracking-[0.04em] text-white/40">{t.detalle}</span>}
              {t.afectaMarcador && indiceGol >= 0 && (
                <span className="stat-number shrink-0 text-xs tracking-[0.04em] text-white/45">
                  {marcadorHastaTabla(golesDesc, indiceGol)}
                </span>
              )}
            </div>
          );
        })}
        {toquesDesc.length > 5 && (
          <button
            onClick={() => setVerTodasAcciones((v) => !v)}
            className="mt-1 flex h-9 items-center justify-center rounded bg-white/[.05] text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50"
          >
            {verTodasAcciones ? "Ver menos" : `Ver ${toquesDesc.length - 5} más`}
          </button>
        )}
      </div>
    </div>
  );

  const panelStatsTitulo = jugadorActual ? `#${jugadorActual.dorsal ?? "—"} ${jugadorActual.nombre}` : "Totales del equipo";

  if (compacto) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0f]"
        style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/[.09] bg-[var(--color-ink)] px-3 py-2">
          <button onClick={onBack} aria-label="Volver a Partido" className="shrink-0 text-white/55 hover:text-white/80">
            <ChevronLeft size={18} className="text-[var(--color-accent)]" />
          </button>
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: corriendo ? "#4ddc8a" : "#8a8a92" }}
          />

          <div className="flex flex-1 items-center justify-center gap-4">
            <div className="min-w-0 text-center">
              <div className="truncate text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--color-accent)]">
                {equipoNombre ?? "Nosotros"}
              </div>
              <div className="stat-number text-2xl leading-none text-white">{golesFavor(eventos)}</div>
            </div>
            <div className="text-center">
              <div className="stat-number text-lg leading-none text-white">{formatoReloj(segundosPartido(cronometro, duracionParteMin))}</div>
              <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-white/45">
                {cronometro?.parte === 2 ? "2ª parte" : "1ª parte"}
              </div>
            </div>
            <div className="min-w-0 text-center">
              <div className="truncate text-[8px] font-semibold uppercase tracking-[0.1em] text-white/50">{partido.rival}</div>
              <div className="stat-number text-2xl leading-none text-white/55">{golesContra(eventos)}</div>
            </div>
          </div>

          <button
            onClick={alternarCronometro}
            aria-label={corriendo ? "Pausar cronómetro" : "Iniciar cronómetro"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded"
            style={{ backgroundColor: corriendo ? "rgba(255,255,255,.12)" : "var(--color-accent)" }}
          >
            {corriendo ? <Pause size={15} className="text-white" /> : <Play size={15} className="text-white" />}
          </button>
          <button
            onClick={siguienteParte}
            className="flex h-9 shrink-0 items-center justify-center rounded bg-white/[.08] px-2.5 text-[11px] font-semibold text-white/75"
          >
            {cronometro?.parte === 2 ? "1ª" : "2ª"}
          </button>
          <button
            onClick={deshacer}
            aria-label="Deshacer último toque"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white/[.08] text-white/60"
          >
            <Undo2 size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[54%] shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-white/[.07] py-2.5">
            <div className="px-3">{jugadorBlock}</div>
            <div className="px-3">{zonaBlock}</div>
            <div className="px-3">{accionesBlock}</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2.5">{cronologiaBlock}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#0d0d0f]"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="border-b border-white/[.09] bg-[var(--color-ink)] px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-white/55 hover:text-white/80">
            <ChevronLeft size={16} className="text-[var(--color-accent)]" /> Partido
          </button>
          <div className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: corriendo ? "#4ddc8a" : "#8a8a92" }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">{estado}</span>
          </div>
        </div>

        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
              {equipoNombre ?? "Nosotros"}
            </div>
            <div className="stat-number text-[52px] leading-[0.86] text-white">{golesFavor(eventos)}</div>
          </div>
          <div className="shrink-0 px-1 text-center">
            <div className="stat-number text-3xl tracking-[0.04em] text-white">
              {formatoReloj(segundosPartido(cronometro, duracionParteMin))}
            </div>
            <div className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">
              {cronometro?.parte === 2 ? "2ª parte" : "1ª parte"}
            </div>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
              {partido.rival}
            </div>
            <div className="stat-number text-[52px] leading-[0.86] text-white/55">{golesContra(eventos)}</div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={alternarCronometro}
            className="flex h-[42px] flex-1 items-center justify-center rounded text-xs font-semibold text-white active:scale-[0.985]"
            style={{ backgroundColor: corriendo ? "rgba(255,255,255,.12)" : "var(--color-accent)" }}
          >
            {corriendo ? "Pausar cronómetro" : toquesDesc.length > 0 ? "Reanudar" : "Iniciar partido"}
          </button>
          <button
            onClick={siguienteParte}
            className="flex h-[42px] shrink-0 items-center justify-center rounded bg-white/[.08] px-4 text-xs font-semibold text-white/75"
          >
            {cronometro?.parte === 2 ? "1ª parte" : "2ª parte"}
          </button>
          <button
            onClick={deshacer}
            aria-label="Deshacer último toque"
            className="flex h-[42px] w-[52px] shrink-0 items-center justify-center rounded bg-white/[.08] text-white/60"
          >
            <Undo2 size={17} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {/* Bajo `lg:`, jugadorBlock ocupa la primera columna (se convierte en
            lista vertical, ver arriba) — por eso no lleva envoltorio propio
            con borde inferior aquí, ese borde solo tiene sentido en móvil
            donde va apilado encima de Zona/Acción. Sin padding horizontal
            propio: el `p-3` del contenedor de más abajo ya le da el mismo
            margen que a zonaBlock/accionesBlock (antes tenía un `px-4`
            propio que lo desalineaba respecto a ellos). */}
        <div className="border-b border-white/[.07] pb-3 lg:hidden">{jugadorBlock}</div>

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[180px_minmax(0,1fr)_280px] lg:items-start">
          <div className="hidden lg:block">{jugadorBlock}</div>
          {zonaBlock}
          {accionesBlock}
        </div>

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <PanelStats
            eventos={eventos}
            eventosJsonb={eventosJsonb}
            jugadorId={jugadorSel}
            titulo={panelStatsTitulo}
            esPortero={esJugadorActualPortero}
          />
          {cronologiaBlock}
        </div>
      </div>
    </div>
  );
}

function GrupoBotones({
  titulo,
  cols,
  conBorde,
  children,
}: {
  titulo: string;
  cols: 2 | 4;
  /** Separador sutil arriba del grupo — ayuda a que varios grupos seguidos se
   * lean como categorías distintas y no como una sola masa de botones. Se
   * omite en el primero (ya lo separa el interruptor "Penalti" de encima). */
  conBorde?: boolean;
  children: React.ReactNode;
}) {
  const colsClass = cols === 2 ? "grid-cols-2" : "grid-cols-4";
  return (
    <div className={cn(conBorde && "border-t border-white/[.06] pt-3")}>
      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">{titulo}</div>
      <div className={cn("grid gap-1.5", colsClass)}>{children}</div>
    </div>
  );
}

function BotonAccion({
  label,
  color,
  count,
  armado,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  count: number;
  armado?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-11 flex-col items-center justify-center gap-1 rounded border px-1.5 text-center transition-colors active:scale-[0.96] disabled:opacity-35 disabled:pointer-events-none",
        armado ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15" : "border-white/[.09] bg-white/[.05]",
      )}
    >
      <span className="text-[10px] leading-[1.15] text-white/85">{label}</span>
      <span className="stat-number text-sm" style={{ color }}>
        {count}
      </span>
    </button>
  );
}

function ChipJugador({
  nombre,
  numero,
  activo,
  onClick,
}: {
  nombre: string;
  numero: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        // h-11 (44px): es el control que más veces se toca en toda la
        // pantalla (jugador obligatorio antes de cualquier registro) —
        // mismo objetivo táctil mínimo que los botones de acción.
        // overflow-hidden: bajo `lg:` la columna es fija (180px) y el botón
        // pasa a w-full — sin esto un nombre largo con whitespace-nowrap se
        // saldría visualmente del botón/columna en vez de truncarse.
        "flex h-11 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[3px] px-3.5 lg:w-full lg:justify-start",
        activo ? "bg-[var(--color-accent)]" : "bg-white/[.08]",
      )}
    >
      <span className="stat-number shrink-0 text-sm" style={{ color: activo ? "#fff" : "rgba(255,255,255,.6)" }}>
        {numero}
      </span>
      <span className="truncate text-xs font-medium" style={{ color: activo ? "#fff" : "rgba(255,255,255,.6)" }}>
        {nombre}
      </span>
    </button>
  );
}
