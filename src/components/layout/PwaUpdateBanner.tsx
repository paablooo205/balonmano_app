import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

const INTERVALO_COMPROBACION_MS = 45 * 60 * 1000;

/**
 * Aviso de actualización de la PWA. `registerType: "prompt"` (vite.config.ts)
 * significa que una versión nueva del service worker se queda "esperando" en
 * vez de tomar el control sola — activarla sin avisar podría recargar la
 * página a mitad de un registro en directo de partido/entrenamiento. El
 * usuario decide cuándo, con el botón "Actualizar ahora".
 *
 * z-index por encima de ContadoresEnVivo (`fixed inset-0 z-50`) a propósito:
 * el aviso debe seguir viéndose durante el registro en directo. Se ancla
 * arriba del todo para no tapar nunca la rejilla de botones de tiro/zona,
 * que vive más abajo en esa pantalla — sí puede solapar momentáneamente su
 * cabecera de marcador/cronómetro mientras el aviso está visible.
 */
export function PwaUpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update();
      }, INTERVALO_COMPROBACION_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 bg-[var(--color-ink)] px-4 py-2.5 text-white shadow-lg"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.625rem)" }}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <RefreshCw size={16} className="shrink-0 text-[var(--color-accent)]" />
        <span className="truncate">Hay una nueva versión disponible</span>
      </span>
      <Button size="sm" onClick={() => updateServiceWorker(true)} className="shrink-0">
        Actualizar ahora
      </Button>
    </div>
  );
}
