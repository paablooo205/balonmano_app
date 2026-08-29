import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

type Paso = {
  key: string;
  label: string;
  hecho: boolean;
  path: string;
};

function claveDescartado(equipoId: string): string {
  return `onboarding-descartado:${equipoId}`;
}

/**
 * Checklist de primeros pasos para un equipo recién creado: horario →
 * jugadores → temporada. No es un tour con overlays sobre la interfaz (frágil
 * de mantener, requiere una librería nueva) — es una tarjeta persistente con
 * lo que falta, reutilizando las mismas señales reales que ya usa el resto de
 * la app (nº de filas en cada tabla) en vez de un progreso inventado. Se
 * oculta sola en cuanto los 3 pasos están completos, o si el entrenador la
 * cierra (recordado por equipo en localStorage).
 */
export function OnboardingChecklist({ equipoId }: { equipoId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [pasos, setPasos] = useState<Paso[] | null>(null);
  const [descartado, setDescartado] = useState(false);

  useEffect(() => {
    try {
      setDescartado(localStorage.getItem(claveDescartado(equipoId)) === "1");
    } catch {
      setDescartado(false);
    }
  }, [equipoId]);

  useEffect(() => {
    if (descartado) return;
    (async () => {
      const [{ count: horario }, { count: jugadores }, { count: periodos }] = await Promise.all([
        supabase.from("horario_recurrente").select("id", { count: "exact", head: true }).eq("equipo_id", equipoId),
        supabase.from("jugadores").select("id", { count: "exact", head: true }).eq("equipo_id", equipoId),
        supabase.from("periodos").select("id", { count: "exact", head: true }).eq("equipo_id", equipoId),
      ]);
      setPasos([
        { key: "horario", label: "Configura tu horario semanal", hecho: (horario ?? 0) > 0, path: "ajustes" },
        { key: "jugadores", label: "Añade a tus jugadores/as", hecho: (jugadores ?? 0) > 0, path: "equipo" },
        { key: "temporada", label: "Configura la temporada", hecho: (periodos ?? 0) > 0, path: "ajustes" },
      ]);
    })();
    // Recalcula también al navegar, para reflejar un paso recién completado.
  }, [equipoId, descartado, location.pathname]);

  function descartar() {
    try {
      localStorage.setItem(claveDescartado(equipoId), "1");
    } catch {
      // almacenamiento no disponible: se queda visible esta sesión, sin romper nada
    }
    setDescartado(true);
  }

  if (descartado || !pasos) return null;
  const pendiente = pasos.find((p) => !p.hecho);
  if (!pendiente) return null;

  return (
    <div className="card-surface mb-4 flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Primeros pasos</h2>
        <button
          onClick={descartar}
          aria-label="Cerrar primeros pasos"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {pasos.map((paso) => (
          <div key={paso.key} className="flex items-center gap-2.5 text-sm">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                paso.hecho ? "bg-[var(--color-success)] text-white" : "border border-[var(--color-border)]",
              )}
            >
              {paso.hecho && <Check size={12} />}
            </span>
            <span className={cn(paso.hecho ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text)]")}>
              {paso.label}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate(`/equipos/${equipoId}/${pendiente.path}`)}
        className="self-start rounded-[15px] bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white"
      >
        Continuar
      </button>
    </div>
  );
}
