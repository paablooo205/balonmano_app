import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ChevronLeft, Pause, Play, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import { borrarEvento, registrarEvento } from "@/lib/eventos";
import { CuadriculaPorteria } from "@/components/partido/CuadriculaPorteria";
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
  partidoFinalizado,
  pausar,
  perdidas,
  requiereZona,
  robos,
  segundosActuales,
  segundosPartido,
  segundoActual,
  jugadoresEnPista,
  hayRegistroDePista,
  titularesDe,
  exclusionesActivas,
  tiempoDePista,
  tiemposMuertosRestantes,
  type ExclusionActiva,
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
/** Jugadores de campo titulares (más 1 portero = los 7 en pista). */
const TITULARES_CAMPO = 6;

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
  const [tiempoMuerto, setTiempoMuerto] = useState<{ equipo: EquipoOrigenEvento; finMs: number } | null>(null);
  const [jugadorSel, setJugadorSel] = useState<string | null>(null);
  const [sietePendiente, setSietePendiente] = useState(false);
  const [verTodasAcciones, setVerTodasAcciones] = useState(false);
  const [accionPendiente, setAccionPendiente] = useState<BotonTiro | null>(null);
  const [zonaPendiente, setZonaPendiente] = useState<number | null>(null);
  const [origenSel, setOrigenSel] = useState<OrigenLanzamiento | null>(null);
  // Pista/banquillo: un cambio = seleccionar jugador → "Cambiar" (su tarjeta
  // tiembla) → tocar a uno de la otra sección. Sustituye a los "Entra"/"Sale"
  // sueltos, que nadie llegaba a usar en un partido real.
  const [cambioArmado, setCambioArmado] = useState<string | null>(null);
  const [titularesSel, setTitularesSel] = useState<Set<string>>(new Set());
  const [omitirTitulares, setOmitirTitulares] = useState(false);
  const cronometro = partido.estadisticas.cronometro;
  const eventosJsonb = partido.estadisticas.eventos ?? [];
  const duracionParteMin = partido.duracion_parte_min;
  const finalizado = partidoFinalizado(cronometro, duracionParteMin);
  const enPista = jugadoresEnPista(eventosJsonb);
  const conRegistroPista = hayRegistroDePista(eventosJsonb);
  /** Sin ningún cambio registrado aún: la columna de jugadores propone
   * marcar los titulares (o saltárselo). */
  const eligiendoTitulares = !conRegistroPista && !omitirTitulares && !finalizado;

  // Propone como titulares los del último partido del equipo que los tenga
  // registrados (filtrados a los convocados de hoy). Sin red, simplemente no
  // propone nada.
  useEffect(() => {
    if (hayRegistroDePista(partido.estadisticas.eventos ?? [])) return;
    let cancelado = false;
    void supabase
      .from("partidos")
      .select("estadisticas")
      .eq("equipo_id", partido.equipo_id)
      .lt("fecha", partido.fecha)
      .order("fecha", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (cancelado || !data) return;
        const convocados = new Set(jugadores.map((j) => j.id));
        for (const p of data) {
          const titulares = titularesDe(p.estadisticas?.eventos ?? []).filter((id) => convocados.has(id));
          if (titulares.length > 0) {
            // Mismo límite que al marcarlos a mano: 1 portero + 6 de campo.
            const porId = new Map(jugadores.map((j) => [j.id, j]));
            const porteros = titulares.filter((id) => esPortero(porId.get(id)?.puesto ?? null)).slice(0, 1);
            const campo = titulares.filter((id) => !esPortero(porId.get(id)?.puesto ?? null)).slice(0, TITULARES_CAMPO);
            setTitularesSel(new Set([...porteros, ...campo]));
            return;
          }
        }
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partido.id]);

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
    segundo: number | null;
    creadoEn: string;
    afectaMarcador: boolean;
    detalle: string;
    /** Texto de la segunda línea ya resuelto (cambios/titulares); si no, se
     * deriva de `jugadorId`. */
    quien?: string;
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
        segundo: e.segundo ?? null,
        creadoEn: e.creado_en,
        afectaMarcador: e.resultado === "gol",
        detalle: [e.zona ? `Z${e.zona}` : null, e.origen ? ETIQUETAS_ORIGEN[e.origen] : null].filter(Boolean).join(" · "),
      };
    }
    if (e.tipo === "tiempo_muerto") {
      return {
        id: e.id,
        origen: "tabla",
        label: e.equipo_origen === "rival" ? "Tiempo muerto rival" : "Tiempo muerto",
        color: "rgba(255,255,255,.35)",
        jugadorId: null,
        esRival: e.equipo_origen === "rival",
        minuto: e.minuto,
        segundo: e.segundo ?? null,
        creadoEn: e.creado_en,
        afectaMarcador: false,
        detalle: "",
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
        segundo: e.segundo ?? null,
        creadoEn: e.creado_en,
        afectaMarcador: false,
        detalle: "",
      };
    }
    const label = e.tipo === "perdida" ? (e.equipo_origen === "rival" ? "Balón ganado" : "Balón perdido") : e.equipo_origen === "rival" ? "Exclusión 2' rival" : "Exclusión 2'";
    const color = e.tipo === "perdida" ? (e.equipo_origen === "rival" ? "var(--color-success)" : "var(--color-warning)") : "var(--color-warning)";
    return {
      id: e.id,
      origen: "tabla",
      label,
      color,
      jugadorId: e.jugador_id,
      esRival: e.equipo_origen === "rival",
      minuto: e.minuto,
      segundo: e.segundo ?? null,
      creadoEn: e.creado_en,
      afectaMarcador: false,
      detalle: "",
    };
  });
  const etiquetaJugador = (id: string | null) => {
    const j = id ? jugadores.find((x) => x.id === id) : null;
    return j ? `#${j.dorsal ?? "—"} ${j.nombre.split(" ")[0]}` : "?";
  };
  // Toques registrados con un solo gesto (cambio = sale + entra; titulares =
  // varias entradas) se pintan como una sola línea y se deshacen juntos.
  const toquesAgrupados: ToqueUnificado[] = [];
  const gruposVistos = new Set<string>();
  for (const e of eventosJsonb) {
    if (!e.grupo || gruposVistos.has(e.grupo)) continue;
    gruposVistos.add(e.grupo);
    const delGrupo = eventosJsonb.filter((x) => x.grupo === e.grupo);
    const entran = delGrupo.filter((x) => x.tipo === "entra_pista");
    const salen = delGrupo.filter((x) => x.tipo === "sale_pista");
    const esTitulares = salen.length === 0;
    toquesAgrupados.push({
      id: e.grupo,
      origen: "jsonb",
      label: esTitulares ? "Titulares" : "Cambio",
      color: "rgba(255,255,255,.35)",
      jugadorId: null,
      esRival: false,
      minuto: e.minuto,
      segundo: e.segundo ?? null,
      creadoEn: delGrupo.map((x) => x.creado_en).sort().at(-1)!,
      afectaMarcador: false,
      detalle: "",
      quien: esTitulares
        ? `${entran.length} en pista`
        : [...entran.map((x) => `↑ ${etiquetaJugador(x.jugador_id)}`), ...salen.map((x) => `↓ ${etiquetaJugador(x.jugador_id)}`)].join(" · "),
    });
  }
  const toquesJsonb: ToqueUnificado[] = eventosJsonb.filter((e) => !e.grupo).map((e) => ({
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
    segundo: e.segundo ?? null,
    creadoEn: e.creado_en,
    afectaMarcador: false,
    detalle: "",
  }));
  const toquesDesc = [...toquesTabla, ...toquesJsonb, ...toquesAgrupados].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
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

  // Cuenta atrás del tiempo muerto: refresca cada segundo y se cierra sola.
  useEffect(() => {
    if (!tiempoMuerto) return;
    const id = setInterval(() => {
      if (Date.now() >= tiempoMuerto.finMs) setTiempoMuerto(null);
      else setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [tiempoMuerto]);

  // Al llegar a la duración configurada de la parte: para el cronómetro
  // automáticamente y, si era la 1ª parte, la deja lista (en pausa, a 0:00)
  // para la 2ª — el entrenador sigue teniendo que darle a "reanudar" a mano.
  // Si era la 2ª parte, solo para (fin de partido, sin parte 3).
  useEffect(() => {
    if (!cronometro?.corriendo) return;
    if (segundosActuales(cronometro) < duracionParteMin * 60) return;
    const nuevo = cronometro.parte === 1 ? cambiarParte(cronometro) : pausar(cronometro, duracionParteMin);
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: nuevo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, cronometro?.corriendo]);

  // Cada escritura manda el jsonb `estadisticas` COMPLETO: si dos salían a
  // la vez (p.ej. "7m provocado" y "Entra" seguidos), podían llegar al
  // servidor en orden inverso y ganaba el estado viejo. Encadenarlas en
  // serie garantiza que la última tocada es la última escrita — también
  // entre online y cola offline (una que falla por red se encola antes de
  // que salga la siguiente).
  const cadenaEscrituras = useRef<Promise<void>>(Promise.resolve());

  function persistirEstadisticas(estadisticas: PartidosRow["estadisticas"]): Promise<void> {
    const actualizado: PartidosRow = { ...partido, estadisticas, updated_at: new Date().toISOString() };
    onActualizado(actualizado);
    // try/catch dentro del eslabón: si una escritura lanzara (p.ej. IndexedDB
    // bloqueado), la cadena quedaría rechazada y ninguna escritura posterior
    // llegaría a ejecutarse.
    cadenaEscrituras.current = cadenaEscrituras.current.then(async () => {
      try {
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
      } catch (err) {
        console.error(`[partido] fallo al guardar las estadísticas del partido ${partido.id}:`, err);
      }
    });
    return cadenaEscrituras.current;
  }

  function alternarCronometro() {
    if (finalizado) return;
    const nuevo = cronometro?.corriendo ? pausar(cronometro, duracionParteMin) : iniciarOReanudar(cronometro);
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: nuevo });
  }

  /** Solo de 1ª a 2ª (ver `cambiarParte`). Si la 1ª no ha llegado a su
   * final, pide confirmación: un toque accidental ponía el reloj a 0. */
  function siguienteParte() {
    if (finalizado || cronometro?.parte === 2) return;
    const faltanSegundos = duracionParteMin * 60 - segundosActuales(cronometro);
    if (faltanSegundos > 0 && !confirm(`Quedan ${formatoReloj(faltanSegundos)} de la 1ª parte. ¿Pasar ya a la 2ª parte?`)) return;
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: cambiarParte(cronometro) });
  }

  function seleccionarJugador(j: JugadoresRow) {
    setJugadorSel(j.id);
    setAccionPendiente(null);
    setZonaPendiente(null);
    setOrigenSel(origenPorPuesto(j.puesto));
  }

  function registrarTiro(equipoOrigen: EquipoOrigenEvento, resultado: ResultadoTiro, zona: number | null) {
    if (finalizado || !jugadorSel) return;
    // El chip de origen "7m" también marca penalti: antes se podía guardar
    // un tiro con origen 7m pero es_penalti=false, y contaba como juego
    // abierto en la eficacia.
    const esPenalti = sietePendiente;
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
      origen: esPenalti ? "7m" : origenSel,
      es_penalti: esPenalti,
      color_tarjeta: null,
      minuto: minutoActual(cronometro, duracionParteMin),
      segundo: segundoActual(cronometro, duracionParteMin),
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
    if (finalizado || !jugadorSel) return;
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
    if (finalizado || !jugadorSel) return;
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
    setCambioArmado(null);
  }

  function registrarPerdidaRobo(equipoOrigen: EquipoOrigenEvento) {
    if (finalizado) return;
    if (equipoOrigen === "propio" && !jugadorSel) return;
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
      segundo: segundoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    anular();
  }

  function registrarExclusion() {
    if (finalizado || !jugadorSel) return;
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
      segundo: segundoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    anular();
  }

  /** Exclusión del rival: sin jugador (botón "2' rival"). Abre la cuenta
   * atrás bajo los goles del rival y alimenta la superioridad numérica. */
  function registrarExclusionRival() {
    if (finalizado) return;
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: null,
      equipo_origen: "rival",
      tipo: "exclusion",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: null,
      minuto: minutoActual(cronometro, duracionParteMin),
      segundo: segundoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
  }

  /** Tiempo muerto (1 minuto): para el reloj, registra el evento y muestra la
   * cuenta atrás a pantalla completa (cerrable). Se deshace como cualquier
   * acción; deshacerlo no vuelve a poner el reloj en marcha. */
  function registrarTiempoMuerto(equipo: EquipoOrigenEvento) {
    const parte = (cronometro?.parte ?? 1) as 1 | 2;
    if (finalizado || tiemposMuertosRestantes(eventos, equipo, parte, duracionParteMin) === 0) return;
    if (cronometro?.corriendo) void persistirEstadisticas({ ...partido.estadisticas, cronometro: pausar(cronometro, duracionParteMin) });
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: null,
      equipo_origen: equipo,
      tipo: "tiempo_muerto",
      resultado: null,
      zona: null,
      origen: null,
      es_penalti: false,
      color_tarjeta: null,
      minuto: minutoActual(cronometro, duracionParteMin),
      segundo: segundoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    setTiempoMuerto({ equipo, finMs: Date.now() + 60_000 });
  }

  function registrarTarjeta(color: ColorTarjeta) {
    if (finalizado || !jugadorSel) return;
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
      segundo: segundoActual(cronometro, duracionParteMin),
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
    anular();
  }

  function registrarJsonb(tipo: TipoEventoPartido) {
    if (finalizado || !jugadorSel) return;
    const evento = crearEventoJsonb(tipo, jugadorSel, minutoActual(cronometro, duracionParteMin), segundoActual(cronometro, duracionParteMin));
    void persistirEstadisticas({ ...partido.estadisticas, eventos: [...eventosJsonb, evento] });
    anular();
  }

  /** Registra uno o varios movimientos de pista en el mismo instante; si son
   * varios (cambio, titulares), comparten `grupo`. */
  /** `segundo` propio: el movimiento ocurre en otro instante que "ahora" —
   * el sustituto de un excluido entra cuando acaba la exclusión. `cubre`: id
   * de la exclusión cuyo hueco ocupa ese sustituto. */
  function registrarPista(
    movimientos: { tipo: "entra_pista" | "sale_pista"; jugadorId: string; segundo?: number; cubre?: string }[],
  ) {
    if (finalizado || movimientos.length === 0) return;
    const grupo = movimientos.length > 1 ? crypto.randomUUID() : undefined;
    const minuto = minutoActual(cronometro, duracionParteMin);
    const segundo = segundoActual(cronometro, duracionParteMin);
    const nuevos = movimientos.map((m) => ({
      ...crearEventoJsonb(
        m.tipo,
        m.jugadorId,
        m.segundo !== undefined ? Math.floor(m.segundo / 60) + 1 : minuto,
        m.segundo !== undefined ? m.segundo : segundo,
      ),
      ...(grupo ? { grupo } : {}),
      ...(m.cubre ? { cubre_exclusion: m.cubre } : {}),
    }));
    void persistirEstadisticas({ ...partido.estadisticas, eventos: [...eventosJsonb, ...nuevos] });
  }

  /** Titulares: 1 portero + 6 de campo como máximo. Tocar otro portero
   * sustituye al marcado; con 6 de campo ya marcados, el 7º no entra (la
   * barra de estado avisa de que hay que quitar uno antes). */
  function alternarTitular(id: string) {
    const j = jugadores.find((x) => x.id === id);
    if (!j) return;
    setTitularesSel((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) {
        nuevo.delete(id);
        return nuevo;
      }
      if (esPortero(j.puesto)) {
        for (const otro of jugadores) if (esPortero(otro.puesto)) nuevo.delete(otro.id);
        nuevo.add(id);
        return nuevo;
      }
      const deCampo = jugadores.filter((x) => nuevo.has(x.id) && !esPortero(x.puesto)).length;
      if (deCampo >= TITULARES_CAMPO) return prev;
      nuevo.add(id);
      return nuevo;
    });
  }

  function confirmarTitulares() {
    registrarPista([...titularesSel].map((id) => ({ tipo: "entra_pista" as const, jugadorId: id })));
  }

  /** Botón "Cambiar": arma (o desarma) el cambio del jugador seleccionado —
   * su tarjeta tiembla hasta que se toca a alguien de la otra sección. */
  function alternarCambio() {
    if (!jugadorSel) return;
    setCambioArmado((actual) => (actual === jugadorSel ? null : jugadorSel));
  }

  function tocarJugador(j: JugadoresRow) {
    if (eligiendoTitulares) {
      alternarTitular(j.id);
      return;
    }
    if (cambioArmado) {
      // Tocar la tarjeta que tiembla: deshace el armado.
      if (j.id === cambioArmado) {
        setCambioArmado(null);
        return;
      }
      // Banquillo ↔ pista o banquillo ↔ excluidos: cambio hecho directamente.
      // Pista ↔ excluidos o misma sección: se desarma y se selecciona a ese.
      const seccionArmado = seccionDe(cambioArmado);
      const seccionTocado = seccionDe(j.id);
      if (seccionArmado !== seccionTocado && (seccionArmado === "banquillo" || seccionTocado === "banquillo")) {
        const delBanquillo = seccionArmado === "banquillo" ? cambioArmado : j.id;
        const otro = seccionArmado === "banquillo" ? j.id : cambioArmado;
        const hueco = huecoDe(otro);
        if (!hueco) {
          registrarPista([
            { tipo: "sale_pista", jugadorId: otro },
            { tipo: "entra_pista", jugadorId: delBanquillo },
          ]);
        } else {
          // El del banquillo ocupa el hueco de la exclusión y entra cuando
          // acabe. Si quien lo ocupaba ya era un sustituto (aún sin entrar),
          // su salida se fecha en el mismo instante que su entrada: 0'.
          const eraSustituto = otro !== hueco.jugadorId;
          registrarPista([
            { tipo: "sale_pista", jugadorId: otro, ...(eraSustituto ? { segundo: hueco.finSegundo } : {}) },
            { tipo: "entra_pista", jugadorId: delBanquillo, segundo: hueco.finSegundo, cubre: hueco.eventoId },
          ]);
        }
        setCambioArmado(null);
        return;
      }
      setCambioArmado(null);
    }
    seleccionarJugador(j);
  }

  /** Funciona también con el partido finalizado: si la última acción se
   * apuntó mal justo antes del final, no había forma de corregirla. */
  function deshacer() {
    if (toquesDesc.length === 0) return;
    const ultimo = toquesDesc[0];
    if (ultimo.origen === "tabla") {
      onEventosActualizados(eventos.filter((e) => e.id !== ultimo.id));
      void borrarEvento(ultimo.id);
    } else {
      // `ultimo.id` es el id del toque, o el `grupo` si fue un cambio/titulares.
      void persistirEstadisticas({
        ...partido.estadisticas,
        eventos: eventosJsonb.filter((e) => e.id !== ultimo.id && e.grupo !== ultimo.id),
      });
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
  const estado = finalizado ? "Finalizado" : corriendo ? "En juego" : toquesDesc.length > 0 ? "Pausado" : "Sin empezar";

  // Aviso cuando se apunta con el reloj parado: en partidos reales, la 2ª
  // parte se quedó en pausa tras el auto-stop del descanso y todo lo
  // registrado cayó en el minuto 31 (o sin minuto si no se inició). No se
  // arranca solo — las pausas (tiempo muerto) son legítimas —, solo se avisa.
  const minutoAhora = minutoActual(cronometro, duracionParteMin);

  // Exclusiones de 2' en curso, con la cuenta atrás en reloj de partido (se
  // para con el reloj, como el tiempo de la exclusión en pista). Se pinta en
  // el marcador, en la tarjeta del jugador y en su panel de estadísticas.
  const excluidos = exclusionesActivas(eventos, segundoActual(cronometro, duracionParteMin));
  const excluidosRival = exclusionesActivas(eventos, segundoActual(cronometro, duracionParteMin), "rival");
  const exclusionesRival = eventos.filter((e) => e.tipo === "exclusion" && e.equipo_origen === "rival").length;

  /** Segunda línea de tiempo de cada tarjeta (solo si se llevan cambios):
   * en pista, mm:ss desde su última entrada (avanza con el reloj); en el
   * banquillo, el total jugado en mm:ss (sin punto verde; "Sin jugar" si aún no ha salido). */
  /** Amonestaciones del jugador en este partido (para las tarjetitas de su tarjeta). */
  const sancionesDe = (jugadorId: string) => {
    const propias = eventos.filter((e) => e.jugador_id === jugadorId);
    return {
      amarillas: propias.filter((e) => e.tipo === "tarjeta" && e.color_tarjeta === "amarilla").length,
      azules: propias.filter((e) => e.tipo === "tarjeta" && e.color_tarjeta === "azul").length,
      rojas: propias.filter((e) => e.tipo === "tarjeta" && e.color_tarjeta === "roja").length,
      exclusiones: propias.filter((e) => e.tipo === "exclusion").length,
    };
  };

  const tiempoTarjeta = (jugadorId: string): { texto: string; enPista: boolean } | null => {
    if (!conRegistroPista || eligiendoTitulares) return null;
    const { totalSeg, tramoSeg } = tiempoDePista(eventosJsonb, jugadorId, segundoActual(cronometro, duracionParteMin));
    if (tramoSeg !== null) return { texto: formatoReloj(tramoSeg), enPista: true };
    return { texto: totalSeg > 0 ? formatoReloj(totalSeg) : "Sin jugar", enPista: false };
  };
  const exclusionDe = (jugadorId: string | null): ExclusionActiva | null =>
    jugadorId ? (excluidos.find((x) => x.jugadorId === jugadorId) ?? null) : null;

  // Hueco de cada exclusión en curso (sección "Excluidos"): lo ocupa el
  // excluido o, si se hizo un cambio con él, el último sustituto (su
  // `entra_pista` lleva `cubre_exclusion` y está fechado al final de la
  // exclusión, así que al acabar la cuenta pasa solo a "En pista").
  const huecosExclusion = excluidos.map((x) => {
    const sustituto = eventosJsonb.filter((e) => e.tipo === "entra_pista" && e.cubre_exclusion === x.eventoId && e.jugador_id).at(-1);
    return { ...x, ocupanteId: sustituto?.jugador_id ?? x.jugadorId };
  });
  const huecoDe = (jugadorId: string) => huecosExclusion.find((h) => h.ocupanteId === jugadorId) ?? null;
  const seccionDe = (jugadorId: string): "excluidos" | "pista" | "banquillo" =>
    huecoDe(jugadorId) ? "excluidos" : enPista.has(jugadorId) ? "pista" : "banquillo";

  const avisoReloj =
    finalizado || corriendo
      ? null
      : minutoAhora === null
        ? "Reloj sin iniciar — las acciones se guardan sin minuto"
        : `Reloj parado — todo se apunta en el minuto ${minutoAhora}`;
  /** Reloj en pausa con el partido ya empezado: los dígitos pasan a rojo. */
  const relojParado = !finalizado && !corriendo && minutoAhora !== null;

  // Titulares: hacen falta 1 portero + 6 de campo — o todos los que haya si
  // hay menos convocados de cada tipo.
  const titularesPortero = jugadores.filter((j) => titularesSel.has(j.id) && esPortero(j.puesto)).length;
  const titularesCampo = titularesSel.size - titularesPortero;
  const necesariosPortero = Math.min(1, jugadores.filter((j) => esPortero(j.puesto)).length);
  const necesariosCampo = Math.min(TITULARES_CAMPO, jugadores.filter((j) => !esPortero(j.puesto)).length);
  const titularesCompletos = titularesPortero === necesariosPortero && titularesCampo === necesariosCampo;

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
  if (eligiendoTitulares) {
    statusMain = "Elige los titulares";
    statusHint =
      titularesCampo >= necesariosCampo && titularesPortero < necesariosPortero
        ? `Falta el portero · campo ${titularesCampo}/${TITULARES_CAMPO}`
        : titularesCampo >= TITULARES_CAMPO
          ? `Portero ${titularesPortero}/1 · campo 6/6 — quita uno para cambiar`
          : `Portero ${titularesPortero}/1 · campo ${titularesCampo}/${TITULARES_CAMPO}`;
  } else if (cambioArmado) {
    const seccionArmada = seccionDe(cambioArmado);
    statusMain =
      seccionArmada === "banquillo" ? `Entra ${etiquetaJugador(cambioArmado)}` : `Sale ${etiquetaJugador(cambioArmado)}`;
    statusHint =
      seccionArmada === "excluidos"
        ? "Toca uno del banquillo: ocupará su hueco y entrará al acabar los 2'"
        : seccionArmada === "pista"
          ? "Toca quién entra (banquillo)"
          : "Toca quién sale (en pista o excluidos)";
  }

  const claseBotonColumna = cn(
    "flex h-11 min-w-11 flex-1 items-center justify-center gap-1.5 rounded-[6px] font-semibold disabled:pointer-events-none disabled:opacity-35",
    compacto ? "px-1 text-[11px]" : "px-2.5 text-xs",
  );

  /** Controles de la columna de jugadores según el modo: elegir titulares,
   * hacer un cambio, o (si se omitieron los titulares) volver a elegirlos. */
  const controlesPista = eligiendoTitulares ? (
    <div className="flex gap-1.5">
      <button
        onClick={confirmarTitulares}
        disabled={!titularesCompletos}
        className={cn(claseBotonColumna, "bg-[var(--color-accent)] text-white")}
      >
        Confirmar ({titularesSel.size}/{necesariosPortero + necesariosCampo})
      </button>
      <button onClick={() => setOmitirTitulares(true)} className={cn(claseBotonColumna, "flex-none bg-white/[.08] px-3 text-white/70")}>
        Omitir
      </button>
    </div>
  ) : conRegistroPista ? (
    // Aparece al seleccionar a alguien (sin jugador ocupa su hueco invisible,
    // para que la lista no salte al tocar). Armado: rojo, y la tarjeta tiembla.
    <button
      onClick={alternarCambio}
      disabled={finalizado || !jugadorSel}
      aria-pressed={cambioArmado !== null}
      className={cn(
        claseBotonColumna,
        "w-full flex-none",
        !jugadorSel && "invisible",
        cambioArmado ? "bg-[var(--color-accent)] text-white" : "bg-white/[.1] text-white",
      )}
    >
      <ArrowLeftRight size={14} /> Cambiar
    </button>
  ) : (
    <button onClick={() => setOmitirTitulares(false)} disabled={finalizado} className={cn(claseBotonColumna, "w-full bg-white/[.08] text-white/80")}>
      Marcar titulares
    </button>
  );

  function chip(j: JugadoresRow, banquillo: boolean) {
    const activo = eligiendoTitulares ? titularesSel.has(j.id) : jugadorSel === j.id;
    return (
      <ChipJugador
        key={j.id}
        nombre={j.nombre.split(" ")[0]}
        numero={j.dorsal != null ? String(j.dorsal) : "—"}
        activo={activo}
        portero={esPortero(j.puesto)}
        goles={golesFavor(eventos.filter((e) => e.jugador_id === j.id))}
        exclusionRestante={huecoDe(j.id)?.restante ?? null}
        tiempo={tiempoTarjeta(j.id)}
        sanciones={sancionesDe(j.id)}
        banquillo={banquillo}
        temblando={cambioArmado === j.id}
        compacto={compacto}
        onClick={() => tocarJugador(j)}
      />
    );
  }

  /** `vertical`: lista en columna con scroll propio (pantalla fija, solo se
   * desplaza la lista, nunca el resto del panel). Si no, fila horizontal
   * (móvil en vertical, el único layout que sí hace scroll de página).
   *
   * Con cambios registrados, la lista se parte en "En pista" y "Banquillo"
   * — siempre se ve quién está jugando. Con una exclusión en curso aparece
   * encima "Excluidos" (con su cuenta atrás): al acabar, quien ocupe ese
   * hueco pasa solo a "En pista". Un cambio banquillo ↔ excluido mete al del
   * banquillo en el hueco (el excluido ya no vuelve). */
  function bloqueJugadores(vertical: boolean) {
    const separar = conRegistroPista && !eligiendoTitulares;
    // Excluidos: quien ocupa el hueco de cada exclusión en curso (el excluido
    // o su sustituto), ordenados por la que antes acaba. No cuentan en pista.
    const excluidosLista = huecosExclusion
      .map((h) => jugadores.find((j) => j.id === h.ocupanteId))
      .filter((j): j is JugadoresRow => !!j);
    const enPistaLista = jugadores.filter((j) => seccionDe(j.id) === "pista");
    const banquillo = jugadores.filter((j) => seccionDe(j.id) === "banquillo");
    const rotulo = (texto: string, n: number) => (
      <div className={cn("shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-white/60", vertical ? "pt-1" : "self-center px-1")}>
        {texto} <span className="stat-number text-white/80">{n}</span>
      </div>
    );
    return (
      <div className={cn("flex min-h-0 flex-col gap-2", vertical && "h-full")}>
        <div className={cn("flex gap-2", vertical ? "flex-col" : "items-center justify-between")}>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
            {eligiendoTitulares ? "Titulares" : "Jugadores"}
          </span>
          {controlesPista}
        </div>
        <div
          className={cn(
            "flex gap-1.5",
            vertical ? "min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pr-0.5" : "overflow-x-auto pb-0.5",
          )}
        >
          {separar ? (
            <>
              {excluidosLista.length > 0 && rotulo("Excluidos", excluidosLista.length)}
              {excluidosLista.map((j) => chip(j, false))}
              {rotulo("En pista", enPistaLista.length)}
              {enPistaLista.map((j) => chip(j, false))}
              {rotulo("Banquillo", banquillo.length)}
              {banquillo.map((j) => chip(j, true))}
            </>
          ) : (
            jugadores.map((j) => chip(j, false))
          )}
        </div>
      </div>
    );
  }

  /** `ajustarAlto`: la portería ocupa todo el alto disponible de su
   * columna (pantalla fija). Sin selector de origen del lanzamiento: se
   * guarda solo el que corresponde al puesto del jugador (`origenSel`, puesto
   * al seleccionarlo) o "7m" con el interruptor de penalti — decisión del
   * usuario: no compensaba un toque más por tiro. */
  function bloqueZona(ajustarAlto: boolean) {
    return (
      <div className={cn(ajustarAlto && "h-full")}>
        <CuadriculaPorteria
          tocable={!!jugadorSel && !finalizado}
          resaltado={!!accionPendiente || zonaPendiente !== null}
          compacto={compacto}
          ajustarAlto={ajustarAlto}
          onZona={tocarZona}
          conteosPorZona={conteosPorZona}
          zonaArmada={zonaPendiente}
        />
      </div>
    );
  }

  // Solo se muestra el grupo de tiro que corresponde al jugador elegido: un
  // portero apunta los tiros del rival (Parada / Gol en contra), cualquier
  // otro los nuestros. Antes se veían los dos con uno siempre apagado, y
  // "Parado" (tiro nuestro) se confundía con "Parada" — había paradas
  // guardadas como tiros nuestros fallados. Mismo sitio, mismos botones.
  const grupoTiro = esJugadorActualPortero ? (
    <GrupoBotones titulo="Portero · tiro del rival" cols={3}>
      {BOTONES_TIRO_RIVAL.map((b) => (
        <BotonAccion
          key={`${b.equipoOrigen}-${b.resultado}`}
          label={b.label}
          color={b.color}
          count={contarBotonTiro(eventos, b)}
          armado={esBotonArmado(b)}
          disabled={finalizado}
          onClick={() => tocarBotonTiro(b)}
        />
      ))}
    </GrupoBotones>
  ) : (
    <GrupoBotones titulo="Tiro" cols={4}>
      {BOTONES_TIRO_PROPIO.map((b) => (
        <BotonAccion
          key={`${b.equipoOrigen}-${b.resultado}`}
          label={b.label}
          color={b.color}
          count={contarBotonTiro(eventos, b)}
          armado={esBotonArmado(b)}
          disabled={!jugadorSel || finalizado}
          onClick={() => tocarBotonTiro(b)}
        />
      ))}
    </GrupoBotones>
  );

  const botonPenalti = (
    <button
      onClick={() => setSietePendiente((v) => !v)}
      disabled={finalizado}
      aria-pressed={sietePendiente}
      className={cn(
        "flex h-11 items-center justify-center rounded-[6px] border text-[12px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-35",
        sietePendiente
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
          : "border-white/[.1] bg-white/[.05] text-white/70",
      )}
    >
      Penalti (7m)
    </button>
  );

  const botonesTiro = esJugadorActualPortero
    ? BOTONES_TIRO_RIVAL.map((b) => (
        <BotonAccion
          key={`${b.equipoOrigen}-${b.resultado}`}
          label={b.label}
          color={b.color}
          count={contarBotonTiro(eventos, b)}
          armado={esBotonArmado(b)}
          disabled={finalizado}
          onClick={() => tocarBotonTiro(b)}
        />
      ))
    : BOTONES_TIRO_PROPIO.map((b) => (
        <BotonAccion
          key={`${b.equipoOrigen}-${b.resultado}`}
          label={b.label}
          color={b.color}
          count={contarBotonTiro(eventos, b)}
          armado={esBotonArmado(b)}
          disabled={!jugadorSel || finalizado}
          onClick={() => tocarBotonTiro(b)}
        />
      ));
  const rellenoTiroCompacto = esJugadorActualPortero ? <span aria-hidden="true" /> : null;

  // Móvil apaisado: no caben los títulos de grupo sin hacer scroll, así que
  // los mismos botones van en una rejilla de 4×4 con el mismo orden de
  // lectura (tiro → penalti/robo/pérdida/2' → tarjetas → otros).
  const accionesCompacto = (
    <div className="grid grid-cols-4 gap-1.5">
      {botonesTiro}
      {rellenoTiroCompacto}
      <button
        onClick={() => setSietePendiente((v) => !v)}
        disabled={finalizado}
        aria-pressed={sietePendiente}
        className={cn(
          "flex h-11 items-center justify-center rounded-[6px] border px-1 text-center text-[11px] font-semibold leading-tight transition-colors disabled:pointer-events-none disabled:opacity-35",
          sietePendiente ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white" : "border-white/[.1] bg-white/[.05] text-white/80",
        )}
      >
        Penalti 7m
      </button>
      <BotonAccion label="Robo" color="var(--color-success)" count={robos(eventos)} disabled={finalizado} onClick={() => registrarPerdidaRobo("rival")} />
      <BotonAccion label="Pérdida" color="var(--color-warning)" count={perdidas(eventos)} disabled={!jugadorSel || finalizado} onClick={() => registrarPerdidaRobo("propio")} />
      <BotonAccion label="2'" color="var(--color-warning)" count={exclusiones(eventos)} disabled={!jugadorSel || finalizado} onClick={registrarExclusion} />
      {BOTONES_TARJETA.map((b) => (
        <BotonAccion
          key={b.color}
          label={b.label}
          color={b.hex}
          count={eventos.filter((e) => e.tipo === "tarjeta" && e.color_tarjeta === b.color).length}
          disabled={!jugadorSel || finalizado}
          onClick={() => registrarTarjeta(b.color)}
        />
      ))}
      <BotonAccion label="2' rival" color="var(--color-warning)" count={exclusionesRival} disabled={finalizado} onClick={registrarExclusionRival} />
      {ACCIONES_JSONB.map((a) => (
        <BotonAccion
          key={a.tipo}
          label={a.label}
          color={a.color}
          count={eventosJsonb.filter((e) => e.tipo === a.tipo).length}
          disabled={!jugadorSel || finalizado}
          className="col-span-2"
          onClick={() => registrarJsonb(a.tipo)}
        />
      ))}
    </div>
  );

  const accionesBlock = (
    <div className={cn("flex flex-col", compacto ? "gap-2" : "gap-2.5")}>
      {botonPenalti}
      {grupoTiro}
      <GrupoBotones titulo="Pérdida / Robo" cols={2}>
        <BotonAccion label="Robo" color="var(--color-success)" count={robos(eventos)} disabled={finalizado} onClick={() => registrarPerdidaRobo("rival")} />
        <BotonAccion label="Pérdida" color="var(--color-warning)" count={perdidas(eventos)} disabled={!jugadorSel || finalizado} onClick={() => registrarPerdidaRobo("propio")} />
      </GrupoBotones>
      <GrupoBotones titulo="Sanción" cols={4}>
        <BotonAccion label="2'" color="var(--color-warning)" count={exclusiones(eventos)} disabled={!jugadorSel || finalizado} onClick={registrarExclusion} />
        {BOTONES_TARJETA.map((b) => (
          <BotonAccion
            key={b.color}
            label={b.label}
            color={b.hex}
            count={eventos.filter((e) => e.tipo === "tarjeta" && e.color_tarjeta === b.color).length}
            disabled={!jugadorSel || finalizado}
            onClick={() => registrarTarjeta(b.color)}
          />
        ))}
      </GrupoBotones>
      <GrupoBotones titulo="Rival" cols={4}>
        <BotonAccion label="2' rival" color="var(--color-warning)" count={exclusionesRival} disabled={finalizado} onClick={registrarExclusionRival} />
      </GrupoBotones>
      <GrupoBotones titulo="Otros" cols={2}>
        {ACCIONES_JSONB.map((a) => (
          <BotonAccion
            key={a.tipo}
            label={a.label}
            color={a.color}
            count={eventosJsonb.filter((e) => e.tipo === a.tipo).length}
            disabled={!jugadorSel || finalizado}
            onClick={() => registrarJsonb(a.tipo)}
          />
        ))}
      </GrupoBotones>
    </div>
  );

  // Barra fija bajo el marcador: qué hay seleccionado, el paso siguiente y
  // "Anular". El aviso de reloj parado va aquí, a ancho completo y en rojo —
  // solo aviso: el botón para reanudar es el del marcador (en rojo mientras
  // está parado), no se duplica. No arranca solo: un tiempo muerto es una
  // pausa legítima. En móvil apaisado, aviso y estado comparten una sola
  // fila para no robar alto.
  const botonAnular = (
    <button
      onClick={anular}
      disabled={!accionPendiente && zonaPendiente === null && !cambioArmado}
      className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-[6px] bg-white/[.1] px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80 disabled:opacity-35"
    >
      Anular
    </button>
  );
  const barraEstado = compacto ? (
    <div className={cn("flex items-center gap-2 px-3 py-1", avisoReloj ? "bg-[var(--color-accent)]" : "border-b border-white/[.09] bg-[#0d0d0f]")}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-white">{statusMain}</div>
        <div className={cn("truncate text-[11px] font-semibold uppercase tracking-[0.04em]", avisoReloj ? "text-white" : "text-white/60")}>
          {avisoReloj ?? statusHint}
        </div>
      </div>
      {botonAnular}
    </div>
  ) : (
    <div className="border-b border-white/[.09] bg-[#0d0d0f]">
      {avisoReloj && (
        <div role="status" className="bg-[var(--color-accent)] px-4 py-2.5 text-center text-[14px] font-bold uppercase tracking-[0.04em] text-white">
          {avisoReloj}
        </div>
      )}
      {/* En `lg:` el estado vive en la franja del marcador (ver `cabecera`)
          para no gastar alto de la pantalla fija. */}
      <div className="flex items-center gap-2 px-4 py-1.5 lg:hidden">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-white">{statusMain}</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/60">{statusHint}</div>
        </div>
        {botonAnular}
      </div>
    </div>
  );

  // Cronología como línea de tiempo: minuto a la izquierda, punto de color
  // sobre una línea vertical, y los goles destacados con el marcador de ese
  // momento. `limite`: en pantalla fija se pintan todas y la lista hace
  // scroll propio; en el layout con scroll de página, las 5 últimas + "Ver más".
  function bloqueCronologia(conScrollPropio: boolean) {
    const visibles = conScrollPropio || verTodasAcciones ? toquesDesc : toquesDesc.slice(0, 5);
    return (
      <div className={cn("flex min-h-0 flex-col", conScrollPropio && "h-full")}>
        <div className="mb-2 flex shrink-0 items-baseline justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">Cronología</span>
          <span className="stat-number text-[13px] text-white/60">{toquesDesc.length}</span>
        </div>
        {toquesDesc.length === 0 ? (
          <div className="rounded-[6px] border border-dashed border-white/[.14] px-3 py-4 text-center text-xs text-white/60">
            Sin acciones todavía.
          </div>
        ) : (
          <ol className={cn("relative", conScrollPropio && "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1")}>
            {visibles.map((t, i) => {
              const jugador = t.jugadorId ? jugadores.find((j) => j.id === t.jugadorId) : null;
              const quien = t.quien ?? (jugador ? `#${jugador.dorsal ?? "—"} ${jugador.nombre.split(" ")[0]}` : t.esRival ? partido.rival : "Sin asignar");
              const indiceGol = golesDesc.findIndex((g) => g.id === t.id);
              const esGol = t.afectaMarcador && indiceGol >= 0;
              const ultimo = i === visibles.length - 1;
              return (
                <li key={t.id} className="relative flex gap-2.5 pb-2.5">
                  {/* mm:ss cuando la acción tiene segundo exacto; las
                      anteriores a ese campo siguen mostrando el minuto. */}
                  <span className="stat-number w-10 shrink-0 pt-px text-right text-[14px] leading-tight text-white/70">
                    {t.segundo !== null ? formatoReloj(t.segundo) : t.minuto !== null ? `${t.minuto}'` : "—"}
                  </span>
                  <span className="relative flex w-3 shrink-0 justify-center">
                    {!ultimo && <span className="absolute top-3 -bottom-2.5 w-px bg-white/[.12]" />}
                    <span
                      className={cn("relative mt-1 rounded-full", esGol ? "h-3 w-3" : "h-2 w-2 mt-1.5")}
                      style={{ backgroundColor: t.color }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-white", esGol ? "text-[14px] font-bold" : "text-[13px] font-medium")}>{t.label}</span>
                      {esGol && !compacto && (
                        <span className="stat-number shrink-0 rounded-[4px] bg-white/[.1] px-1.5 text-[13px] leading-snug text-white">
                          {marcadorHastaTabla(golesDesc, indiceGol)}
                        </span>
                      )}
                    </div>
                    {/* Columna estrecha (móvil apaisado): el marcador del gol
                        pasa a esta línea y se omite el detalle de zona. */}
                    <div className="truncate text-[11px] text-white/60">
                      {compacto && esGol && <span className="stat-number text-white">{marcadorHastaTabla(golesDesc, indiceGol)} · </span>}
                      {quien}
                      {!compacto && t.detalle && <span className="text-white/45"> · {t.detalle}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {!conScrollPropio && toquesDesc.length > 5 && (
          <button
            onClick={() => setVerTodasAcciones((v) => !v)}
            className="mt-1 flex h-11 items-center justify-center rounded-[6px] bg-white/[.05] text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70"
          >
            {verTodasAcciones ? "Ver menos" : `Ver ${toquesDesc.length - 5} más`}
          </button>
        )}
      </div>
    );
  }

  const panelStatsTitulo = jugadorActual ? `#${jugadorActual.dorsal ?? "—"} ${jugadorActual.nombre}` : "Totales del equipo";
  const panelStats = (
    <PanelStats
      eventos={eventos}
      eventosJsonb={eventosJsonb}
      jugadorId={jugadorSel}
      duracionTotalMin={duracionParteMin * 2}
      minutoActual={minutoAhora}
      titulo={panelStatsTitulo}
      esPortero={esJugadorActualPortero}
      exclusion={exclusionDe(jugadorSel)}
    />
  );

  const textoBotonReloj = finalizado
    ? "Partido finalizado"
    : corriendo
      ? "Pausar"
      : toquesDesc.length > 0
        ? "Reanudar"
        : "Iniciar partido";

  /** Marcador + reloj + controles en una sola franja (pantalla fija: cada
   * píxel de alto cuenta). Mismos controles que antes, en el mismo orden. */
  const cabecera = (
    <div className={cn("flex shrink-0 items-center border-b border-white/[.09] bg-[var(--color-ink)]", compacto ? "gap-2 px-3 py-1.5" : "gap-3 px-4 py-2")}>
      <button onClick={onBack} aria-label="Volver a Partido" className="flex h-11 w-9 shrink-0 items-center justify-center text-white/60 hover:text-white/80">
        <ChevronLeft size={20} className="text-[var(--color-accent)]" />
      </button>

      {!compacto && (
        <div className="hidden w-[300px] min-w-0 shrink items-center gap-3 lg:flex">
          <div className="min-w-0 flex-1 border-l-[3px] border-[var(--color-accent)] pl-3">
            <div className="truncate text-[15px] font-semibold text-white">{statusMain}</div>
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-white/60">{statusHint}</div>
          </div>
          {botonAnular}
        </div>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3 md:gap-5">
        <div className="min-w-0 text-right">
          <div className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">{equipoNombre ?? "Nosotros"}</div>
          <div className={cn("stat-number leading-none text-white", compacto ? "text-[34px]" : "text-[56px]")}>{golesFavor(eventos)}</div>
          {/* Cuenta atrás de las exclusiones en curso, justo bajo nuestros goles. */}
          {excluidos.length > 0 && (
            <div className="mt-1 flex flex-wrap justify-end gap-1">
              {excluidos.map((x) => {
                const j = jugadores.find((jj) => jj.id === x.jugadorId);
                return (
                  <span
                    key={x.eventoId}
                    className="stat-number whitespace-nowrap rounded-[4px] bg-[var(--color-accent)] px-1.5 text-[13px] leading-snug text-white"
                    title={`Vuelve a las ${formatoReloj(x.finSegundo)}`}
                  >
                    #{j?.dorsal ?? "—"} · {formatoReloj(x.restante)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="shrink-0 text-center">
          <div
            className={cn(
              "stat-number leading-none tracking-[0.04em]",
              compacto ? "text-2xl" : "text-[38px]",
              relojParado ? "text-[var(--color-accent)]" : "text-white",
            )}
          >
            {formatoReloj(segundosPartido(cronometro, duracionParteMin))}
          </div>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: corriendo ? "#4ddc8a" : "#8a8a92" }} />
            {cronometro?.parte === 2 ? "2ª parte" : "1ª parte"}
            {!compacto && <span className="text-white/45">· {estado}</span>}
          </div>
        </div>
        <div className="min-w-0 text-left">
          <div className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">{partido.rival}</div>
          <div className={cn("stat-number leading-none text-white/60", compacto ? "text-[34px]" : "text-[56px]")}>{golesContra(eventos)}</div>
          {/* Cuenta atrás de las exclusiones del rival, bajo sus goles. */}
          {excluidosRival.length > 0 && (
            <div className="mt-1 flex flex-wrap justify-start gap-1">
              {excluidosRival.map((x) => (
                <span
                  key={x.eventoId}
                  className="stat-number whitespace-nowrap rounded-[4px] bg-[var(--color-warning)] px-1.5 text-[13px] leading-snug text-white"
                  title={`Vuelve a las ${formatoReloj(x.finSegundo)}`}
                >
                  2' · {formatoReloj(x.restante)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={alternarCronometro}
          disabled={finalizado}
          aria-label={corriendo ? "Pausar cronómetro" : "Iniciar cronómetro"}
          className={cn(
            "flex h-11 items-center justify-center gap-1.5 rounded-[6px] text-xs font-semibold text-white disabled:pointer-events-none disabled:opacity-50",
            compacto ? "w-11" : "min-w-[120px] px-4",
          )}
          style={{ backgroundColor: corriendo || finalizado ? "rgba(255,255,255,.12)" : "var(--color-accent)" }}
        >
          {corriendo ? <Pause size={15} /> : <Play size={15} />}
          {!compacto && textoBotonReloj}
        </button>
        {(["propio", "rival"] as const).map((eq) => {
          const quedan = tiemposMuertosRestantes(eventos, eq, (cronometro?.parte ?? 1) as 1 | 2, duracionParteMin);
          return (
            <button
              key={eq}
              onClick={() => registrarTiempoMuerto(eq)}
              disabled={finalizado || quedan === 0}
              aria-label={`${eq === "propio" ? "Tiempo muerto nuestro" : "Tiempo muerto del rival"} (quedan ${quedan})`}
              className="flex h-11 min-w-11 items-center justify-center gap-0.5 rounded-[6px] bg-white/[.08] px-2 text-xs font-semibold text-white/80 disabled:pointer-events-none disabled:opacity-35"
            >
              {eq === "propio" ? "TM" : compacto ? "TM R" : "TM rival"}
              <sup className="stat-number text-[10px] leading-none text-white/60">{quedan}</sup>
            </button>
          );
        })}
        {cronometro?.parte !== 2 && (
          <button
            onClick={siguienteParte}
            disabled={finalizado}
            aria-label="Pasar a la 2ª parte"
            className="flex h-11 min-w-11 items-center justify-center rounded-[6px] bg-white/[.08] px-3 text-xs font-semibold text-white/80 disabled:pointer-events-none disabled:opacity-35"
          >
            {compacto ? "2ª" : "2ª parte"}
          </button>
        )}
        <button
          onClick={deshacer}
          disabled={toquesDesc.length === 0}
          aria-label="Deshacer último toque"
          className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-white/[.08] text-white/70 disabled:pointer-events-none disabled:opacity-35"
        >
          <Undo2 size={17} />
        </button>
      </div>
    </div>
  );

  // ── Móvil apaisado: pantalla fija a 4 columnas, sin scroll de página. Solo
  // la lista de jugadores y la cronología se desplazan dentro de su columna.
  // Sin panel de estadísticas (no cabe; está en la ficha técnica).
  if (compacto) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0f]"
        style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
      >
        {cabecera}
      {tiempoMuerto && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-[#0d0d0f]/95">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">Tiempo muerto</div>
          <div className="text-lg font-semibold text-white">{tiempoMuerto.equipo === "rival" ? partido.rival : (equipoNombre ?? "Nuestro equipo")}</div>
          <div className="stat-number text-[120px] leading-none text-white">{formatoReloj(Math.max(0, Math.ceil((tiempoMuerto.finMs - Date.now()) / 1000)))}</div>
          <button onClick={() => setTiempoMuerto(null)} className="h-11 rounded-[15px] bg-white/[.12] px-8 text-sm font-semibold text-white">
            Cerrar
          </button>
        </div>
      )}
        <div className="shrink-0">{barraEstado}</div>
        <div className="grid min-h-0 flex-1 grid-cols-[112px_minmax(0,1fr)_minmax(0,250px)_132px] grid-rows-[minmax(0,1fr)] gap-2.5 p-2">
          <div className="min-h-0">{bloqueJugadores(true)}</div>
          <div className="min-h-0">{bloqueZona(true)}</div>
          <div className="min-h-0">{accionesCompacto}</div>
          <div className="min-h-0 border-l border-white/[.07] pl-2.5">{bloqueCronologia(true)}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#0d0d0f] lg:overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {cabecera}
      {tiempoMuerto && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-[#0d0d0f]/95">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">Tiempo muerto</div>
          <div className="text-lg font-semibold text-white">{tiempoMuerto.equipo === "rival" ? partido.rival : (equipoNombre ?? "Nuestro equipo")}</div>
          <div className="stat-number text-[120px] leading-none text-white">{formatoReloj(Math.max(0, Math.ceil((tiempoMuerto.finMs - Date.now()) / 1000)))}</div>
          <button onClick={() => setTiempoMuerto(null)} className="h-11 rounded-[15px] bg-white/[.12] px-8 text-sm font-semibold text-white">
            Cerrar
          </button>
        </div>
      )}
      {/* Sticky: en el layout con scroll (móvil en vertical) la barra de
          estado/aviso se queda arriba; en pantalla fija ya no se mueve nada. */}
      <div className="sticky top-0 z-10 shrink-0">{barraEstado}</div>

      {/* Tablet/ordenador (`lg:`): pantalla fija a 3 columnas — jugadores |
          portería + origen + estadísticas | botones + cronología. Nada
          obliga a hacer scroll para registrar: solo la lista de jugadores y
          la cronología se desplazan dentro de su columna si son largas.
          Por debajo de `lg` (móvil en vertical) no cabe todo: se apila y la
          página hace scroll, como antes. */}
      <div className="flex flex-col gap-4 p-3 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[210px_minmax(0,1fr)_minmax(300px,330px)] lg:grid-rows-[minmax(0,1fr)] lg:gap-4 lg:p-4">
        <div className="lg:hidden">{bloqueJugadores(false)}</div>
        <div className="hidden min-h-0 lg:block">{bloqueJugadores(true)}</div>

        {/* Columna central: portería (se ajusta al alto que quede) y, debajo,
            las estadísticas del jugador seleccionado en una franja. */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="lg:min-h-0 lg:flex-1">
            <div className="lg:hidden">{bloqueZona(false)}</div>
            <div className="hidden h-full lg:block">{bloqueZona(true)}</div>
          </div>
          <div className="shrink-0">{panelStats}</div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="shrink-0">{accionesBlock}</div>
          <div className="border-t border-white/[.07] pt-3 lg:min-h-0 lg:flex-1">
            <div className="lg:hidden">{bloqueCronologia(false)}</div>
            <div className="hidden h-full lg:block">{bloqueCronologia(true)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GrupoBotones({
  titulo,
  cols,
  children,
}: {
  titulo: string;
  cols: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  const colsClass = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">{titulo}</div>
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
  className,
  onClick,
}: {
  label: string;
  color: string;
  count: number;
  armado?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        className,
        "flex h-11 flex-col items-center justify-center gap-0.5 rounded-[6px] border px-1 text-center transition-colors active:scale-[0.96] disabled:opacity-35 disabled:pointer-events-none",
        armado ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20" : "border-white/[.1] bg-white/[.05]",
      )}
    >
      <span className="text-[11px] font-medium leading-[1.1] text-white/90">{label}</span>
      <span className="stat-number text-[15px] leading-none" style={{ color }}>
        {count}
      </span>
    </button>
  );
}

/**
 * Tarjeta de jugador tipo "dorsal de camiseta": el número manda (es lo que
 * se busca con la vista en pleno partido), el nombre debajo y una segunda
 * línea con su dato vivo — goles en el partido, o "Portero" para que el
 * portero se encuentre al instante (sus botones son otros). Seleccionado:
 * tarjeta blanca con el dorsal en rojo, imposible de confundir.
 *
 * overflow-hidden + truncate: bajo `lg:` la columna es fija (180px) y la
 * tarjeta pasa a w-full — un nombre largo se trunca en vez de salirse.
 */
function ChipJugador({
  nombre,
  numero,
  activo,
  portero,
  goles,
  exclusionRestante,
  banquillo = false,
  temblando = false,
  tiempo = null,
  sanciones = { amarillas: 0, azules: 0, rojas: 0, exclusiones: 0 },
  compacto,
  onClick,
}: {
  nombre: string;
  numero: string;
  activo: boolean;
  portero: boolean;
  goles: number;
  /** Segundos que le quedan de exclusión (null si no está excluido): manda
   * sobre el resto de la segunda línea, también en móvil apaisado. */
  exclusionRestante: number | null;
  /** En el banquillo (hay cambios registrados y no está en pista): tarjeta
   * atenuada para que de un vistazo se vea quién juega. */
  banquillo?: boolean;
  /** Cambio armado para este jugador: la tarjeta tiembla hasta que se toca a
   * alguien de la otra sección (o se vuelve a tocar para desarmar). */
  temblando?: boolean;
  /** Tiempo de pista (solo con cambios registrados): en pista, lo que lleva
   * desde que entró (mm:ss, en vivo); en el banquillo, lo jugado en total. */
  tiempo?: { texto: string; enPista: boolean } | null;
  /** Amonestaciones del partido: tarjetitas en la esquina superior derecha. */
  sanciones?: { amarillas: number; azules: number; rojas: number; exclusiones: number };
  /** Móvil apaisado: fila de 44px, solo dorsal + nombre (salvo exclusión). */
  compacto?: boolean;
  onClick: () => void;
}) {
  const excluido = exclusionRestante !== null;
  const textoGoles = goles > 0 ? `${goles} gol${goles === 1 ? "" : "es"}` : null;
  // Con tiempo de pista, la segunda línea es "tiempo · goles" (o "· PO"); en
  // móvil apaisado solo el tiempo, no cabe más.
  const detalle = excluido
    ? `2' · ${formatoReloj(exclusionRestante)}`
    : tiempo
      ? compacto
        ? ""
        : portero
          ? "PO"
          : (textoGoles ?? "")
      : portero
        ? "Portero"
        : (textoGoles ?? "");

  // Tarjetitas de amonestación, en orden: amarilla, azul, roja y una "2" por
  // cada exclusión (en balonmano la 3ª exclusión ya es descalificación).
  const iconosSancion: { fondo: string; borde?: string; texto?: string }[] = [
    ...Array.from({ length: sanciones.amarillas }, () => ({ fondo: "#f0c419" })),
    ...Array.from({ length: sanciones.azules }, () => ({ fondo: "#3d8ad6" })),
    ...Array.from({ length: sanciones.rojas }, () => ({ fondo: "var(--color-accent)" })),
    ...Array.from({ length: Math.min(sanciones.exclusiones, 3) }, () => ({ fondo: "#0d0d0f", borde: "rgba(255,255,255,.85)", texto: "2" })),
  ];
  const resumenSanciones = [
    sanciones.amarillas > 0 && (sanciones.amarillas === 1 ? "tarjeta amarilla" : `${sanciones.amarillas} amarillas`),
    sanciones.azules > 0 && (sanciones.azules === 1 ? "tarjeta azul" : `${sanciones.azules} azules`),
    sanciones.rojas > 0 && "tarjeta roja",
    sanciones.exclusiones > 0 && `${sanciones.exclusiones} exclusión${sanciones.exclusiones === 1 ? "" : "es"} de 2'`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "relative flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-[6px] border text-left transition-colors active:scale-[0.97] lg:w-full",
        compacto ? "h-11 w-full gap-1.5 py-1 pl-1 pr-2" : "h-14 gap-2.5 py-1.5 pl-1.5 pr-3.5 lg:h-12",
        activo ? "border-white bg-white" : banquillo ? "border-dashed border-white/[.14] bg-transparent opacity-70" : "border-white/[.1] bg-white/[.05]",
        temblando && "animate-temblor ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[#0d0d0f] motion-reduce:animate-none",
      )}
    >
      <span
        className={cn(
          "stat-number flex h-full shrink-0 items-center justify-center rounded-[4px] px-1 leading-none",
          compacto ? "min-w-8 text-lg" : "min-w-10 text-[22px] lg:min-w-9 lg:text-xl",
          activo
            ? "bg-[var(--color-accent)] text-white"
            : portero
              ? "border border-dashed border-white/40 text-white"
              : "bg-white/[.1] text-white",
        )}
      >
        {numero}
      </span>
      {iconosSancion.length > 0 && (
        <span
          className="pointer-events-none absolute right-2 top-1.5 flex items-start"
          aria-label={resumenSanciones}
          title={resumenSanciones}
        >
          {iconosSancion.map((s, i) => (
            <TarjetitaSancion key={i} indice={i} {...s} />
          ))}
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        {/* Solo el nombre deja hueco a las tarjetitas de la esquina; la segunda línea (tiempo, exclusión) usa el ancho completo. */}
        <span className={cn("truncate text-[13px] font-semibold", activo ? "text-[var(--color-ink)]" : "text-white/90")} style={{ paddingRight: iconosSancion.length > 0 ? 16 + (iconosSancion.length - 1) * 6 : 0 }}>
          {nombre}
        </span>
        {(!compacto || excluido || tiempo) && (
          <span className="flex min-w-0 items-center gap-1.5">
            {/* Tiempo de pista: punto verde + mm:ss en pista; minutos jugados en el banquillo. */}
            {tiempo && !excluido && (
              <span
                className={cn(
                  "stat-number flex shrink-0 items-center gap-1 text-[13px] leading-none",
                  activo ? "text-[var(--color-ink)]" : tiempo.enPista ? "text-white" : "text-white/70",
                )}
              >
                {tiempo.enPista && <span className="h-1.5 w-1.5 rounded-full bg-[#4ddc8a]" />}
                {tiempo.texto}
              </span>
            )}
            {detalle.trim() !== "" && (
              <span
                className={cn(
                  "truncate text-[11px] font-semibold uppercase tracking-[0.06em]",
                  excluido
                    ? "stat-number w-fit rounded-[3px] bg-[var(--color-accent)] px-1 text-[12px] tracking-normal text-white"
                    : activo
                      ? "text-[var(--color-ink)]/60"
                      : portero
                        ? "text-white/60"
                        : "text-[var(--color-accent)]",
                )}
              >
                {tiempo && !excluido ? `· ${detalle}` : detalle}
              </span>
            )}
            {detalle.trim() === "" && !tiempo && <span className="text-[11px]">&nbsp;</span>}
          </span>
        )}
      </span>
    </button>
  );
}

/** Inclinaciones de cada tarjetita, en orden: distintas entre sí para que el
 * montón se vea "dejado" a mano, como un abanico suelto, no alineado. */
const GIROS_TARJETITA = [-7, 5, 11, -2, 8, -5];

/**
 * Tarjetita de amonestación para la esquina de la tarjeta de jugador: forma
 * de tarjeta de árbitro (vertical, esquinas apenas redondeadas) con sombra
 * suave. Varias se solapan ~4px, cada una con su giro — discreto, no un badge.
 */
function TarjetitaSancion({ fondo, borde, texto, indice }: { fondo: string; borde?: string; texto?: string; indice: number }) {
  return (
    <span
      className="stat-number flex h-[14px] w-[10px] items-center justify-center rounded-[2px] text-[9px] leading-none text-white shadow-[0_1px_2px_rgba(0,0,0,.5)]"
      style={{
        backgroundColor: fondo,
        border: borde ? `1px solid ${borde}` : undefined,
        transform: `rotate(${GIROS_TARJETITA[indice % GIROS_TARJETITA.length]}deg)`,
        marginLeft: indice > 0 ? -4 : 0,
        zIndex: indice,
      }}
    >
      {texto}
    </span>
  );
}
