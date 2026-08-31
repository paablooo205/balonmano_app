import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { PartidoModal } from "@/components/calendario/PartidoModal";
import { resultadoPartido, marcadorPartido, RESULTADO_BADGE } from "@/lib/partidoStats";
import { aplicarPendientes, guardarCache, leerCache, obtenerCola, onQueueChange } from "@/lib/offline/queue";
import { agruparPorPartido, cargarEventosEquipo } from "@/lib/eventos";
import type { EventosRow, PartidosRow } from "@/types/database";

export function PartidoPage() {
  const { equipoId } = useEquipo();
  const navigate = useNavigate();
  const [partidos, setPartidos] = useState<PartidosRow[]>([]);
  const [eventosPorPartido, setEventosPorPartido] = useState<Map<string, EventosRow[]>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [verMas, setVerMas] = useState(false);
  const [busquedaRival, setBusquedaRival] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  async function cargar() {
    const { data } = await supabase
      .from("partidos")
      .select("*")
      .eq("equipo_id", equipoId)
      .order("fecha", { ascending: false });

    // Igual que en el calendario: si el fetch falla por estar offline, se cae
    // a la última copia conocida en vez de mostrar la lista vacía, y se
    // fusionan encima los partidos/tocas aún pendientes de sincronizar.
    const base = data ?? (await leerCache<PartidosRow>("partidos", equipoId)) ?? [];
    if (data) void guardarCache("partidos", equipoId, data);
    const cola = await obtenerCola();
    setPartidos(aplicarPendientes("partidos", base, cola).sort((a, b) => b.fecha.localeCompare(a.fecha)));
    setEventosPorPartido(agruparPorPartido(await cargarEventosEquipo(equipoId)));
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    return onQueueChange(() => void cargar());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  const ultimos3 = partidos.slice(0, 3);
  const historial = useMemo(() => {
    const resto = partidos.slice(3);
    return resto.filter((p) => {
      if (busquedaRival && !p.rival.toLowerCase().includes(busquedaRival.toLowerCase())) return false;
      if (desde && p.fecha < desde) return false;
      if (hasta && p.fecha > hasta) return false;
      return true;
    });
  }, [partidos, busquedaRival, desde, hasta]);

  function PartidoItem({ p }: { p: PartidosRow }) {
    const eventosP = eventosPorPartido.get(p.id) ?? [];
    const resultado = resultadoPartido(p, eventosP);
    const badge = resultado ? RESULTADO_BADGE[resultado] : null;
    return (
      <button
        onClick={() => navigate(`/equipos/${equipoId}/partido/${p.id}`)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
          style={{ backgroundColor: badge?.bg ?? "var(--color-text-faint)" }}
        >
          {badge?.letra ?? "—"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{p.rival}</div>
          <div className="mt-1 truncate text-xs text-[var(--color-text-faint)]">
            {p.casa_fuera === "casa" ? "Casa" : p.casa_fuera === "fuera" ? "Fuera" : "Sede sin confirmar"}
            {p.competicion ? ` · ${p.competicion}` : ""} ·{" "}
            {new Date(p.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
          </div>
        </div>
        <span className="stat-number shrink-0 text-lg tracking-[0.02em]">{marcadorPartido(p, eventosP)}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Partido"
        action={
          <Button size="sm" onClick={() => setNuevoAbierto(true)}>
            <Plus size={18} /> Nuevo
          </Button>
        }
      />

      {cargando && <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>}

      {!cargando && partidos.length === 0 && (
        <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">
          Todavía no hay partidos. Da de alta el primero con &quot;Nuevo&quot;.
        </div>
      )}

      {ultimos3.length > 0 && (
        <div>
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
            Últimos partidos
          </div>
          <div className="card-surface divide-y divide-[var(--color-border)] overflow-hidden p-0">
            {ultimos3.map((p) => (
              <PartidoItem key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {partidos.length > 3 && !verMas && (
        <button
          onClick={() => setVerMas(true)}
          className="text-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          Ver más partidos
        </button>
      )}

      {verMas && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <Input
                pill
                placeholder="Filtrar por rival..."
                value={busquedaRival}
                onChange={(e) => setBusquedaRival(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Input type="date" pill value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
              <Input type="date" pill value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
            </div>
          </div>

          {historial.length === 0 ? (
            <div className="card-surface p-6 text-center text-sm text-[var(--color-text-muted)]">
              Ningún partido coincide con el filtro.
            </div>
          ) : (
            <div className="card-surface divide-y divide-[var(--color-border)] overflow-hidden p-0">
              {historial.map((p) => (
                <PartidoItem key={p.id} p={p} />
              ))}
            </div>
          )}
        </div>
      )}

      <PartidoModal
        open={nuevoAbierto}
        onClose={() => setNuevoAbierto(false)}
        equipoId={equipoId}
        partido={null}
        onSaved={() => {
          setNuevoAbierto(false);
          cargar();
        }}
        onDeleted={() => setNuevoAbierto(false)}
      />
    </div>
  );
}
