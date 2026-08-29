import { CloudOff, RefreshCw } from "lucide-react";
import { useSyncStatus } from "@/lib/offline/useSyncStatus";

/**
 * Pastilla roja de acento (sin color nuevo) que avisa de cambios de sesión de
 * entrenamiento / partido que aún no se han sincronizado con Supabase, o de
 * que no hay conexión. Se muestra en toda la app de un equipo (badge global),
 * no solo en Calendario, y desaparece sola en cuanto todo queda sincronizado.
 */
export function SyncStatusBadge() {
  const { pendientes, online, sincronizando } = useSyncStatus();

  if (online && pendientes === 0) return null;

  const texto = !online
    ? pendientes > 0
      ? `Sin conexión · ${pendientes} sin sincronizar`
      : "Sin conexión"
    : `${pendientes} cambio${pendientes === 1 ? "" : "s"} sin sincronizar`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex items-center gap-1.5 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-dim)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] shadow-lg md:right-6 md:top-6"
    >
      {online ? (
        <RefreshCw size={14} className={sincronizando ? "animate-spin text-[var(--color-accent-hover)]" : "text-[var(--color-accent-hover)]"} />
      ) : (
        <CloudOff size={14} className="text-[var(--color-accent-hover)]" />
      )}
      <span>{texto}</span>
    </div>
  );
}
