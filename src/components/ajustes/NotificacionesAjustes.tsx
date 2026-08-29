import { useState } from "react";
import { Bell, BellOff, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pedirPermiso, permisoActual, soportaNotificaciones } from "@/lib/notifications";

export function NotificacionesAjustes() {
  const [permiso, setPermiso] = useState(permisoActual());
  const [pidiendo, setPidiendo] = useState(false);

  async function activar() {
    setPidiendo(true);
    const resultado = await pedirPermiso();
    setPermiso(resultado);
    setPidiendo(false);
  }

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Notificaciones</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        Avisos de partido próximo, cambio de mesociclo y recordatorio de planificación cada domingo.
        Solo se comprueban mientras tienes la app abierta — no hay push real de servidor.
      </p>

      <div className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] p-3 text-xs text-[var(--color-text-muted)]">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
        <span>
          En iPhone/iPad solo funcionan si añades esta app a la pantalla de inicio (Compartir → &quot;Añadir a
          pantalla de inicio&quot;) con iOS 16.4 o superior, y aun así de forma menos fiable que en Android u
          ordenador.
        </span>
      </div>

      {!soportaNotificaciones() ? (
        <p className="text-sm text-[var(--color-text-muted)]">Este navegador no admite notificaciones.</p>
      ) : permiso === "granted" ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-accent)]">
          <Bell size={16} /> Activadas
        </div>
      ) : permiso === "denied" ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <BellOff size={16} /> Bloqueadas — actívalas desde los ajustes del navegador.
        </div>
      ) : (
        <Button size="sm" onClick={activar} disabled={pidiendo} className="self-start">
          {pidiendo ? "Pidiendo permiso..." : "Activar notificaciones"}
        </Button>
      )}
    </div>
  );
}
