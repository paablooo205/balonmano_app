import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { JugadoresSection } from "@/components/equipo/JugadoresSection";

export function EquipoPage() {
  const { equipo, equipoId } = useEquipo();
  const [totalJugadores, setTotalJugadores] = useState<number | null>(null);
  const [asistenciaMedia, setAsistenciaMedia] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [{ count }, { data: asistencia }] = await Promise.all([
        supabase.from("jugadores").select("id", { count: "exact", head: true }).eq("equipo_id", equipoId),
        supabase.from("asistencia").select("presente").eq("equipo_id", equipoId),
      ]);
      setTotalJugadores(count ?? 0);
      setAsistenciaMedia(
        asistencia && asistencia.length > 0
          ? Math.round((asistencia.filter((a) => a.presente).length / asistencia.length) * 100)
          : null,
      );
    })();
  }, [equipoId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="hero-band">
        <div className="hero-eyebrow">Temporada {equipo?.temporada ?? "—"}</div>
        <h1 className="hero-title mt-1">Plantilla</h1>
        <div className="mt-1.5 text-[13px] text-white/55">
          {totalJugadores !== null ? `${totalJugadores} jugadores` : "…"}
          {asistenciaMedia !== null ? ` · asistencia media ${asistenciaMedia}%` : ""}
        </div>
      </div>
      <JugadoresSection equipoId={equipoId} />
    </div>
  );
}
