import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEquipo } from "@/hooks/useEquipo";
import { PageHeader } from "@/components/layout/PageHeader";
import { cargarRivalesEquipo } from "@/lib/rivales";
import { agruparPorPartido, cargarEventosEquipo } from "@/lib/eventos";
import { RESULTADO_BADGE, resultadoPartido } from "@/lib/partidoStats";
import { supabase } from "@/lib/supabaseClient";
import type { EventosRow, PartidosRow, RivalesRow } from "@/types/database";

export function RivalesPage() {
  const { equipoId } = useEquipo();
  const navigate = useNavigate();
  const [rivales, setRivales] = useState<RivalesRow[]>([]);
  const [partidos, setPartidos] = useState<PartidosRow[]>([]);
  const [eventos, setEventos] = useState<EventosRow[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const [listaRivales, { data: listaPartidos }, listaEventos] = await Promise.all([
        cargarRivalesEquipo(equipoId),
        supabase.from("partidos").select("*").eq("equipo_id", equipoId),
        cargarEventosEquipo(equipoId),
      ]);
      setRivales(listaRivales);
      setPartidos(listaPartidos ?? []);
      setEventos(listaEventos);
      setCargando(false);
    })();
  }, [equipoId]);

  const eventosPorPartido = agruparPorPartido(eventos);

  function partidosDe(rivalId: string): PartidosRow[] {
    return partidos.filter((p) => p.rival_id === rivalId);
  }

  function ultimoResultado(rivalId: string): "victoria" | "derrota" | "empate" | null {
    const propios = partidosDe(rivalId).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultimo = propios[0];
    if (!ultimo) return null;
    return resultadoPartido(ultimo, eventosPorPartido.get(ultimo.id) ?? []);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Rivales" />

      {cargando && <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>}

      {!cargando && rivales.length === 0 && (
        <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">
          Todavía no hay rivales registrados. Se crean al dar de alta un partido.
        </div>
      )}

      {rivales.length > 0 && (
        <div className="card-surface divide-y divide-[var(--color-border)] overflow-hidden p-0">
          {rivales.map((r) => {
            const partidosRival = partidosDe(r.id);
            const resultado = ultimoResultado(r.id);
            const badge = resultado ? RESULTADO_BADGE[resultado] : null;
            return (
              <button
                key={r.id}
                onClick={() => navigate(`/equipos/${equipoId}/rivales/${r.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: badge?.bg ?? "var(--color-text-faint)" }}
                >
                  {badge?.letra ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.nombre}</div>
                  <div className="mt-1 truncate text-xs text-[var(--color-text-faint)]">
                    {partidosRival.length} {partidosRival.length === 1 ? "partido" : "partidos"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
