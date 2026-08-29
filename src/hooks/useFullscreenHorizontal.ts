import { useEffect } from "react";

// lib.dom no incluye "lock"/"unlock" de la Screen Orientation API todavía.
type ScreenOrientationConLock = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

/**
 * Al montar, intenta poner la pantalla completa y bloquear la orientación en
 * horizontal — mejor esfuerzo: Android/Chrome lo soporta, pero iOS Safari no
 * expone ninguna API para forzar ni una cosa ni la otra (ahí el entrenador
 * tiene que girar el móvil a mano; el layout compacto de `ContadoresEnVivo`
 * ya responde solo al girar gracias a `useMovilHorizontal`). Deshace ambas
 * cosas al desmontar.
 */
export function useFullscreenHorizontal() {
  useEffect(() => {
    const root = document.documentElement;
    void root.requestFullscreen?.().catch(() => {});
    const orientation = screen.orientation as ScreenOrientationConLock | undefined;
    void orientation?.lock?.("landscape").catch(() => {});

    return () => {
      try {
        orientation?.unlock?.();
      } catch {
        // no soportado: nada que deshacer
      }
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
}
