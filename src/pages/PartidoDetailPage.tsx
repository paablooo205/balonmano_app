import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { ContadoresEnVivo } from "@/components/partido/ContadoresEnVivo";
import { FichaTecnica } from "@/components/partido/FichaTecnica";
import { PartidoModal } from "@/components/calendario/PartidoModal";
import { AsistenciaChecklist } from "@/components/equipo/AsistenciaChecklist";
import { PageHeader } from "@/components/layout/PageHeader";
import { aplicarPendientes, guardarCache, leerCache, obtenerCola, onQueueChange } from "@/lib/offline/queue";
import { cargarEventosEquipo } from "@/lib/eventos";
import { partidoFinalizado } from "@/lib/partidoStats";
import { Button } from "@/components/ui/button";
import type { AsistenciaRow, EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

type Vista = "info" | "live" | "ficha" | "convocatoria";

export function PartidoDetailPage() {
  const { equipo, equipoId } = useEquipo();
  const { partidoId } = useParams<{ partidoId: string }>();
  const navigate = useNavigate();
  const [partido, setPartido] = useState<PartidosRow | null>(null);
  const [jugadores, setJugadores] = useState<JugadoresRow[]>([]);
  const [eventos, setEventos] = useState<EventosRow[]>([]);
  const [asistenciaPartido, setAsistenciaPartido] = useState<AsistenciaRow[]>([]);
  const [asistenciaPartidoCargada, setAsistenciaPartidoCargada] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [searchParams] = useSearchParams();
  const vistaParam = searchParams.get("vista");
  const [vista, setVista] = useState<Vista>(
    vistaParam === "ficha" || vistaParam === "live" || vistaParam === "convocatoria" ? vistaParam : "info",
  );
  const [editando, setEditando] = useState(false);

  async function cargar() {
    if (!partidoId) return;
    setCargando(true);
    const { data } = await supabase.from("partidos").select("*").eq("id", partidoId).maybeSingle();

    // Base: el partido recién descargado si el fetch tuvo éxito, si no la
    // última copia conocida en caché (sin red, o alta reciente que solo vive
    // en la cola todavía). En AMBOS casos se fusiona encima la cola de
    // operaciones pendientes — igual que PartidoPage.tsx — para que un toque
    // en vivo hecho en un hueco sin cobertura no "desaparezca" un instante al
    // recuperar la red justo antes de que termine de sincronizarse.
    let base: PartidosRow[];
    if (data) {
      const cache = (await leerCache<PartidosRow>("partidos", equipoId)) ?? [];
      const actualizada = [...cache.filter((p) => p.id !== data.id), data];
      void guardarCache("partidos", equipoId, actualizada);
      base = [data];
    } else {
      const cache = (await leerCache<PartidosRow>("partidos", equipoId)) ?? [];
      base = cache.filter((p) => p.id === partidoId);
    }
    const cola = await obtenerCola();
    const fusionado = aplicarPendientes("partidos", base, cola);
    setPartido(fusionado.find((p) => p.id === partidoId) ?? null);
    setCargando(false);
  }

  async function cargarAsistenciaPartido() {
    if (!partidoId) return;
    const { data, error } = await supabase.from("asistencia").select("*").eq("partido_id", partidoId);
    // Un fallo de red no puede confundirse con "no hay convocatoria": se deja
    // `asistenciaPartidoCargada` en false y la vista en vivo se queda en
    // "Cargando..." en vez de bloquear pidiendo hacer una convocatoria que
    // quizá ya existe.
    if (error) return;
    setAsistenciaPartido(data ?? []);
    setAsistenciaPartidoCargada(true);
  }

  useEffect(() => {
    cargar();
    return onQueueChange(() => void cargar());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partidoId]);

  useEffect(() => {
    cargarAsistenciaPartido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partidoId]);

  useEffect(() => {
    supabase
      .from("jugadores")
      .select("*")
      .eq("equipo_id", equipoId)
      .order("dorsal", { nullsFirst: false })
      .then(({ data }) => setJugadores(data ?? []));
  }, [equipoId]);

  useEffect(() => {
    cargarEventosEquipo(equipoId).then((todos) => setEventos(todos.filter((e) => e.partido_id === partidoId)));
  }, [equipoId, partidoId]);

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }
  if (!partido) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Partido no encontrado.</div>;
  }

  const jugadoresConvocados = jugadores.filter((j) =>
    asistenciaPartido.some((a) => a.jugador_id === j.id && a.presente),
  );

  if (vista === "convocatoria") {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Convocatoria"
          eyebrow={`vs ${partido.rival}`}
          onBack={() => {
            setVista("info");
            cargarAsistenciaPartido();
          }}
          backLabel="Partido"
        />
        <AsistenciaChecklist equipoId={equipoId} partidoId={partido.id} />
      </div>
    );
  }

  if (vista === "live") {
    if (!asistenciaPartidoCargada) {
      return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
    }
    if (asistenciaPartido.length === 0) {
      return (
        <div className="flex flex-col gap-4">
          <PageHeader
            title="Partido en directo"
            eyebrow={`vs ${partido.rival}`}
            onBack={() => setVista("info")}
            backLabel="Partido"
            variant="accent"
          />
          <div className="card-surface flex flex-col gap-3 p-4 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">Haz la convocatoria antes de registrar estadísticas.</p>
            <Button onClick={() => setVista("convocatoria")}>Ir a convocatoria</Button>
          </div>
        </div>
      );
    }
    return (
      <ContadoresEnVivo
        partido={partido}
        equipoNombre={equipo?.nombre}
        jugadores={jugadoresConvocados}
        eventos={eventos}
        onActualizado={setPartido}
        onEventosActualizados={setEventos}
        onBack={() => setVista("info")}
      />
    );
  }

  const fechaLarga = new Date(partido.fecha + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
  });

  if (vista === "ficha") {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Ficha técnica"
          eyebrow={`vs ${partido.rival}`}
          onBack={() => setVista("info")}
          backLabel="Partido"
        />
        <FichaTecnica
          partido={partido}
          jugadores={jugadores}
          eventos={eventos}
          nombreEquipo={equipo?.nombre ?? "Equipo"}
          onActualizado={setPartido}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="hero-band" data-variant="accent">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(`/equipos/${equipoId}/partido`)}
            className="flex items-center gap-1.5 text-sm text-white/78 hover:text-white"
          >
            <ChevronLeft size={16} className="text-white" /> Partidos
          </button>
          <button
            onClick={() => setEditando(true)}
            className="flex items-center gap-1.5 text-sm text-white/85 hover:text-white"
          >
            <Pencil size={16} /> Editar
          </button>
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/78">
          {partido.competicion ?? "Amistoso"}
        </div>
        <div className="mt-3.5 flex items-center gap-3.5">
          <div className="flex-1 truncate text-[1.625rem] font-bold uppercase leading-[1.02] text-white" style={{ fontFamily: "var(--font-display)" }}>
            {equipo?.nombre ?? "Nosotros"}
          </div>
          <div className="shrink-0 text-[13px] font-semibold tracking-[0.1em] text-white/72">VS</div>
          <div className="flex-1 truncate text-right text-[1.625rem] font-bold uppercase leading-[1.02] text-[var(--color-ink)]" style={{ fontFamily: "var(--font-display)" }}>
            {partido.rival}
          </div>
        </div>
        <div className="mt-4 flex gap-5 border-t border-white/25 pt-4">
          <div>
            <div className="stat-number text-[22px] text-white">{fechaLarga}</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">Fecha</div>
          </div>
          {partido.hora && (
            <div>
              <div className="stat-number text-[22px] text-white">{partido.hora.slice(0, 5)}</div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">Hora</div>
            </div>
          )}
          <div>
            <div className="stat-number text-[22px] text-white">
              {partido.casa_fuera === "casa" ? "Casa" : partido.casa_fuera === "fuera" ? "Fuera" : "—"}
            </div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">Sede</div>
          </div>
          {partido.resultado && (
            <div>
              <div className="stat-number text-[22px] text-white">{partido.resultado}</div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">Resultado</div>
            </div>
          )}
        </div>
      </div>

      {(partido.sistema_propio || partido.sistema_rival) && (
        <div className="card-surface p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
            Sistemas
          </div>
          <div className="flex flex-col gap-1 text-sm">
            {partido.sistema_propio && (
              <div>
                <span className="text-[var(--color-text-muted)]">Propio: </span>
                {partido.sistema_propio}
              </div>
            )}
            {partido.sistema_rival && (
              <div>
                <span className="text-[var(--color-text-muted)]">Rival: </span>
                {partido.sistema_rival}
              </div>
            )}
          </div>
        </div>
      )}

      {partido.notas_adicionales && (
        <div className="rounded-[14px] bg-[var(--color-ink)] p-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Notas</div>
          <p className="whitespace-pre-line text-sm text-white/85">{partido.notas_adicionales}</p>
        </div>
      )}

      <Button size="lg" variant="secondary" className="w-full" onClick={() => setVista("convocatoria")}>
        Convocatoria
      </Button>
      <Button size="lg" variant="ink" className="w-full gap-2.5" onClick={() => setVista("live")}>
        <span
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: partidoFinalizado(partido.estadisticas.cronometro, partido.duracion_parte_min) ? "var(--color-text-faint)" : "var(--color-accent)" }}
        />
        {partidoFinalizado(partido.estadisticas.cronometro, partido.duracion_parte_min)
          ? "Partido finalizado"
          : eventos.length > 0 || (partido.estadisticas.eventos ?? []).length > 0
            ? "Continuar partido en directo"
            : "Iniciar partido en directo"}
      </Button>
      <button
        onClick={() => setVista("ficha")}
        className="text-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
      >
        Ver ficha técnica
      </button>

      <PartidoModal
        open={editando}
        onClose={() => setEditando(false)}
        equipoId={equipoId}
        microcicloId={partido.microciclo_id}
        fecha={partido.fecha}
        partido={partido}
        onSaved={() => {
          setEditando(false);
          cargar();
        }}
        onDeleted={() => navigate(`/equipos/${equipoId}/partido`)}
      />
    </div>
  );
}
