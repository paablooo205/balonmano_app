import { useEffect, useState } from "react";
import { ChevronLeft, LogIn, LogOut, Pause, Play, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import { borrarEvento, registrarEvento } from "@/lib/eventos";
import { useFullscreenHorizontal } from "@/hooks/useFullscreenHorizontal";
import { useMovilHorizontal } from "@/hooks/useMovilHorizontal";
import {
  ACCIONES_JSONB,
  ACCIONES_TABLA,
  cambiarParte,
  contarTabla,
  crearEventoJsonb,
  ETIQUETAS_EVENTO_JSONB,
  formatoReloj,
  golesContra,
  golesFavor,
  iniciarOReanudar,
  marcadorHastaTabla,
  minutoActual,
  pausar,
  segundosPartido,
} from "@/lib/partidoStats";
import { cn } from "@/lib/utils";
import type { EventosRow, JugadoresRow, PartidosRow, TipoEventoPartido } from "@/types/database";

/**
 * Marcador en vivo — calcado del estado "isLive" del prototipo de Claude
 * Design: reloj por partes, selector de jugador/a por chips, rejilla de
 * acciones y cronología. Ocupa toda la pantalla (overlay `fixed inset-0`,
 * fuera del `<main>` con nav/paddings) e intenta forzar horizontal +
 * pantalla completa del navegador vía `useFullscreenHorizontal` (mejor
 * esfuerzo: no soportado en iOS Safari). En horizontal en móvil (viewport
 * bajo) cambia a un layout compacto en dos columnas.
 *
 * Desde 0017_eventos.sql, los 9 contadores (goles, tiros, paradas,
 * pérdidas, exclusiones) escriben en la tabla `eventos`; "7m
 * provocado"/"7m cometido" y las sustituciones (entra/sale pista) siguen en
 * `partido.estadisticas` (jsonb), igual que el cronómetro. La cronología y
 * "deshacer" fusionan ambas fuentes por `creado_en`.
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
  const cronometro = partido.estadisticas.cronometro;
  const eventosJsonb = partido.estadisticas.eventos ?? [];

  // Cronología unificada: eventos de tabla (goles/tiros/paradas/pérdidas/
  // exclusiones) + eventos jsonb (7m provocado/cometido, entra/sale pista),
  // todos con la misma forma para poder ordenarlos y "deshacer" el más
  // reciente sea cual sea su origen.
  type ToqueUnificado = {
    id: string;
    origen: "tabla" | "jsonb";
    label: string;
    color: string;
    jugadorId: string | null;
    minuto: number | null;
    creadoEn: string;
    afectaMarcador: boolean;
  };
  const toquesTabla: ToqueUnificado[] = eventos.map((e) => {
    const accion = ACCIONES_TABLA.find(
      (a) => a.tipo === e.tipo && a.equipoOrigen === e.equipo_origen && a.resultado === e.resultado && a.esPenalti === e.es_penalti,
    );
    return {
      id: e.id,
      origen: "tabla",
      label: accion?.label ?? e.tipo,
      color: accion?.color ?? "rgba(255,255,255,.35)",
      jugadorId: e.jugador_id,
      minuto: null,
      creadoEn: e.creado_en,
      afectaMarcador: accion?.afectaMarcador ?? false,
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
    minuto: e.minuto,
    creadoEn: e.creado_en,
    afectaMarcador: false,
  }));
  const toquesDesc = [...toquesTabla, ...toquesJsonb].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  const golesEventosTabla = eventos.filter((e) => e.tipo === "tiro" && e.resultado === "gol");
  const golesDesc = [...golesEventosTabla].sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  useEffect(() => {
    if (!cronometro?.corriendo) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [cronometro?.corriendo]);
  void tick;

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
    }
  }

  function alternarCronometro() {
    const nuevo = cronometro?.corriendo ? pausar(cronometro) : iniciarOReanudar(cronometro);
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: nuevo });
  }

  function siguienteParte() {
    void persistirEstadisticas({ ...partido.estadisticas, cronometro: cambiarParte(cronometro) });
  }

  function registrarTabla(accion: (typeof ACCIONES_TABLA)[number]) {
    const nuevo: EventosRow = {
      id: crypto.randomUUID(),
      equipo_id: partido.equipo_id,
      partido_id: partido.id,
      sesion_id: null,
      jugador_id: accion.equipoOrigen === "rival" ? null : jugadorSel,
      equipo_origen: accion.equipoOrigen,
      tipo: accion.tipo,
      resultado: accion.resultado,
      zona: null,
      es_penalti: accion.esPenalti,
      creado_en: new Date().toISOString(),
    };
    onEventosActualizados([...eventos, nuevo]);
    void registrarEvento(nuevo);
  }

  function registrarJsonb(tipo: TipoEventoPartido) {
    const evento = crearEventoJsonb(tipo, jugadorSel, minutoActual(cronometro));
    void persistirEstadisticas({ ...partido.estadisticas, eventos: [...eventosJsonb, evento] });
  }

  function registrarSustitucion(tipo: "entra_pista" | "sale_pista") {
    if (!jugadorSel) {
      alert("Selecciona primero un jugador/a en la fila de arriba.");
      return;
    }
    const evento = crearEventoJsonb(tipo, jugadorSel, minutoActual(cronometro));
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

  const corriendo = !!cronometro?.corriendo;
  const estado = corriendo ? "En juego" : toquesDesc.length > 0 ? "Pausado" : "Sin empezar";

  const jugadorBlock = (
    <div>
      <div className="mb-2.5 flex items-center justify-between px-4">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Jugador</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => registrarSustitucion("entra_pista")}
            className="flex h-7 items-center gap-1 rounded-full bg-white/[.08] px-2.5 text-[11px] font-medium text-[#4ddc8a]"
          >
            <LogIn size={12} /> Entra
          </button>
          <button
            onClick={() => registrarSustitucion("sale_pista")}
            className="flex h-7 items-center gap-1 rounded-full bg-white/[.08] px-2.5 text-[11px] font-medium text-white/60"
          >
            <LogOut size={12} /> Sale
          </button>
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto px-4">
        <ChipJugador nombre="Sin asignar" numero="—" activo={jugadorSel === null} onClick={() => setJugadorSel(null)} />
        {jugadores.map((j) => (
          <ChipJugador
            key={j.id}
            nombre={j.nombre.split(" ")[0]}
            numero={j.dorsal != null ? String(j.dorsal) : "—"}
            activo={jugadorSel === j.id}
            onClick={() => setJugadorSel(j.id)}
          />
        ))}
      </div>
    </div>
  );

  const accionesBlock = (
    <div className={cn("grid gap-1.5", compacto ? "grid-cols-4" : "grid-cols-3")}>
      {ACCIONES_TABLA.map((a, i) => (
        <button
          key={i}
          onClick={() => registrarTabla(a)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl border border-white/[.09] bg-white/[.05] px-1.5 text-center active:scale-[0.96]",
            compacto ? "h-[46px]" : "h-[60px]",
          )}
        >
          <span className={cn("leading-[1.15] text-white/85", compacto ? "text-[9px]" : "text-[11px]")}>{a.label}</span>
          <span className="stat-number text-sm" style={{ color: a.color }}>
            {contarTabla(eventos, a)}
          </span>
        </button>
      ))}
      {ACCIONES_JSONB.map((a) => (
        <button
          key={a.tipo}
          onClick={() => registrarJsonb(a.tipo)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 rounded-xl border border-white/[.09] bg-white/[.05] px-1.5 text-center active:scale-[0.96]",
            compacto ? "h-[46px]" : "h-[60px]",
          )}
        >
          <span className={cn("leading-[1.15] text-white/85", compacto ? "text-[9px]" : "text-[11px]")}>{a.label}</span>
          <span className="stat-number text-sm" style={{ color: a.color }}>
            {eventosJsonb.filter((e) => e.tipo === a.tipo).length}
          </span>
        </button>
      ))}
    </div>
  );

  const cronologiaBlock = (
    <div className="min-h-0">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Cronología</span>
        <span className="text-[10px] text-white/30">{toquesDesc.length} acciones</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {toquesDesc.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/[.14] px-3.5 py-5 text-center text-xs text-white/35">
            Sin acciones registradas. Arranca el cronómetro y pulsa una acción.
          </div>
        )}
        {toquesDesc.map((t) => {
          const jugador = t.jugadorId ? jugadores.find((j) => j.id === t.jugadorId) : null;
          const quien = jugador
            ? `#${jugador.dorsal ?? "—"} ${jugador.nombre}`
            : t.jugadorId === null && t.afectaMarcador
              ? partido.rival
              : "Sin asignar";
          const indiceGol = golesDesc.findIndex((g) => g.id === t.id);
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-[11px] bg-white/[.05] px-3.5 py-2.5"
              style={{ borderLeft: `3px solid ${t.color}` }}
            >
              <span className="stat-number w-8 shrink-0 text-[15px] text-white">
                {t.minuto ?? minutoActual(cronometro) ?? "—"}&apos;
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-white">{t.label}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/42">{quien}</div>
              </div>
              {t.afectaMarcador && indiceGol >= 0 && (
                <span className="stat-number shrink-0 text-xs tracking-[0.04em] text-white/45">
                  {marcadorHastaTabla(golesDesc, indiceGol)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

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
              <div className="stat-number text-lg leading-none text-white">{formatoReloj(segundosPartido(cronometro))}</div>
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: corriendo ? "rgba(255,255,255,.12)" : "var(--color-accent)" }}
          >
            {corriendo ? <Pause size={15} className="text-white" /> : <Play size={15} className="text-white" />}
          </button>
          <button
            onClick={siguienteParte}
            className="flex h-9 shrink-0 items-center justify-center rounded-lg bg-white/[.08] px-2.5 text-[11px] font-semibold text-white/75"
          >
            {cronometro?.parte === 2 ? "1ª" : "2ª"}
          </button>
          <button
            onClick={deshacer}
            aria-label="Deshacer último toque"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[.08] text-white/60"
          >
            <Undo2 size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[44%] shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-white/[.07] py-2.5">
            {jugadorBlock}
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
      <div className="border-b border-white/[.09] bg-[var(--color-ink)] px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/55 hover:text-white/80">
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

        <div className="mt-3.5 flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
              {equipoNombre ?? "Nosotros"}
            </div>
            <div className="stat-number text-[52px] leading-[0.86] text-white">{golesFavor(eventos)}</div>
          </div>
          <div className="shrink-0 px-1 text-center">
            <div className="stat-number text-3xl tracking-[0.04em] text-white">
              {formatoReloj(segundosPartido(cronometro))}
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

        <div className="mt-4 flex gap-2">
          <button
            onClick={alternarCronometro}
            className="flex h-[42px] flex-1 items-center justify-center rounded-xl text-sm font-semibold text-white active:scale-[0.985]"
            style={{ backgroundColor: corriendo ? "rgba(255,255,255,.12)" : "var(--color-accent)" }}
          >
            {corriendo ? "Pausar cronómetro" : toquesDesc.length > 0 ? "Reanudar" : "Iniciar partido"}
          </button>
          <button
            onClick={siguienteParte}
            className="flex h-[42px] shrink-0 items-center justify-center rounded-xl bg-white/[.08] px-4 text-sm font-semibold text-white/75"
          >
            {cronometro?.parte === 2 ? "1ª parte" : "2ª parte"}
          </button>
          <button
            onClick={deshacer}
            aria-label="Deshacer último toque"
            className="flex h-[42px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-white/[.08] text-white/60"
          >
            <Undo2 size={17} />
          </button>
        </div>
      </div>

      <div className="border-b border-white/[.07] py-3">{jugadorBlock}</div>

      <div className="px-4 pb-2 pt-3.5">{cronologiaBlock}</div>

      <div className="border-t border-white/[.08] bg-[#141417] p-3.5 pb-6">{accionesBlock}</div>
    </div>
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
        "flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5",
        activo ? "bg-[var(--color-accent)]" : "bg-white/[.08]",
      )}
    >
      <span className="stat-number text-sm" style={{ color: activo ? "#fff" : "rgba(255,255,255,.6)" }}>
        {numero}
      </span>
      <span className="text-xs font-medium" style={{ color: activo ? "#fff" : "rgba(255,255,255,.6)" }}>
        {nombre}
      </span>
    </button>
  );
}
