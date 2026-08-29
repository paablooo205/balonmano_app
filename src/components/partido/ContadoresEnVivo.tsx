import { useEffect, useState } from "react";
import { ChevronLeft, LogIn, LogOut, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import {
  ACCIONES,
  ETIQUETAS_EVENTO,
  cambiarParte,
  crearEvento,
  formatoReloj,
  iniciarOReanudar,
  marcadorHasta,
  minutoActual,
  pausar,
  segundosPartido,
} from "@/lib/partidoStats";
import { cn } from "@/lib/utils";
import type { EventoPartido, JugadoresRow, PartidosRow } from "@/types/database";

/**
 * Marcador en vivo — calcado del estado "isLive" del prototipo de Claude
 * Design: reloj por partes, selector de jugador/a por chips, 9 acciones y
 * cronología. Pantalla oscura de pantalla completa (dentro de una tarjeta
 * contenida, igual que el resto de "hero" de la app).
 */
export function ContadoresEnVivo({
  partido,
  equipoNombre,
  jugadores,
  onActualizado,
  onBack,
}: {
  partido: PartidosRow;
  equipoNombre?: string;
  jugadores: JugadoresRow[];
  onActualizado: (p: PartidosRow) => void;
  onBack: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [jugadorSel, setJugadorSel] = useState<string | null>(null);
  const cronometro = partido.estadisticas.cronometro;
  const eventos = partido.estadisticas.eventos ?? [];
  const eventosDesc = [...eventos].sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  useEffect(() => {
    if (!cronometro?.corriendo) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [cronometro?.corriendo]);
  void tick;

  async function persistir(estadisticas: PartidosRow["estadisticas"]) {
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
    void persistir({ ...partido.estadisticas, cronometro: nuevo });
  }

  function siguienteParte() {
    void persistir({ ...partido.estadisticas, cronometro: cambiarParte(cronometro) });
  }

  function registrar(tipo: (typeof ACCIONES)[number]["tipo"]) {
    const evento = crearEvento(tipo, tipo === "gol_contra" ? null : jugadorSel, minutoActual(cronometro));
    void persistir({ ...partido.estadisticas, eventos: [...eventos, evento] });
  }

  function registrarSustitucion(tipo: "entra_pista" | "sale_pista") {
    if (!jugadorSel) {
      alert("Selecciona primero un jugador/a en la fila de arriba.");
      return;
    }
    const evento = crearEvento(tipo, jugadorSel, minutoActual(cronometro));
    void persistir({ ...partido.estadisticas, eventos: [...eventos, evento] });
  }

  function deshacer() {
    if (eventosDesc.length === 0) return;
    void persistir({ ...partido.estadisticas, eventos: eventos.filter((e) => e.id !== eventosDesc[0].id) });
  }

  const golesFavor = eventos.filter((e) => e.tipo === "gol_favor" || e.tipo === "siete_metido").length;
  const golesContra = eventos.filter((e) => e.tipo === "gol_contra").length;
  const corriendo = !!cronometro?.corriendo;
  const estado = corriendo ? "En juego" : eventos.length > 0 ? "Pausado" : "Sin empezar";

  return (
    <div className="overflow-hidden rounded-2xl bg-[#0d0d0f]">
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
            <div className="stat-number text-[52px] leading-[0.86] text-white">{golesFavor}</div>
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
            <div className="stat-number text-[52px] leading-[0.86] text-white/55">{golesContra}</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={alternarCronometro}
            className="flex h-[42px] flex-1 items-center justify-center rounded-xl text-sm font-semibold text-white active:scale-[0.985]"
            style={{ backgroundColor: corriendo ? "rgba(255,255,255,.12)" : "var(--color-accent)" }}
          >
            {corriendo ? "Pausar cronómetro" : eventos.length > 0 ? "Reanudar" : "Iniciar partido"}
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

      <div className="border-b border-white/[.07] py-3">
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

      <div className="min-h-0 px-4 pb-2 pt-3.5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Cronología</span>
          <span className="text-[10px] text-white/30">{eventos.length} acciones</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {eventosDesc.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/[.14] px-3.5 py-5 text-center text-xs text-white/35">
              Sin acciones registradas. Arranca el cronómetro y pulsa una acción.
            </div>
          )}
          {eventosDesc.map((e, i) => (
            <EventoRow key={e.id} evento={e} rival={partido.rival} jugadores={jugadores} marcador={marcadorHasta(eventosDesc, i)} />
          ))}
        </div>
      </div>

      <div className="border-t border-white/[.08] bg-[#141417] p-3.5 pb-6">
        <div className="grid grid-cols-3 gap-1.5">
          {ACCIONES.map((a) => (
            <button
              key={a.tipo}
              onClick={() => registrar(a.tipo)}
              className="flex h-[60px] flex-col items-center justify-center gap-1 rounded-xl border border-white/[.09] bg-white/[.05] px-1.5 text-center active:scale-[0.96]"
            >
              <span className="text-[11px] leading-[1.15] text-white/85">{a.label}</span>
              <span className="stat-number text-sm" style={{ color: a.color }}>
                {eventos.filter((e) => e.tipo === a.tipo).length}
              </span>
            </button>
          ))}
        </div>
      </div>
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

function EventoRow({
  evento,
  rival,
  jugadores,
  marcador,
}: {
  evento: EventoPartido;
  rival: string;
  jugadores: JugadoresRow[];
  marcador: string;
}) {
  const accion = ACCIONES.find((a) => a.tipo === evento.tipo);
  const label = accion?.label ?? ETIQUETAS_EVENTO[evento.tipo];
  const color = accion?.color ?? "rgba(255,255,255,.35)";
  const jugador = evento.jugador_id ? jugadores.find((j) => j.id === evento.jugador_id) : null;
  const quien = jugador
    ? `#${jugador.dorsal ?? "—"} ${jugador.nombre}`
    : accion?.equipo === "rival"
      ? rival
      : "Sin asignar";
  return (
    <div
      className="flex items-center gap-3 rounded-[11px] bg-white/[.05] px-3.5 py-2.5"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <span className="stat-number w-8 shrink-0 text-[15px] text-white">{evento.minuto ?? "—"}&apos;</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-white">{label}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/42">{quien}</div>
      </div>
      {accion?.afectaMarcador && (
        <span className="stat-number shrink-0 text-xs tracking-[0.04em] text-white/45">{marcador}</span>
      )}
    </div>
  );
}
