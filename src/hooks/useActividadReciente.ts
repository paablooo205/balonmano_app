import { useEffect, useRef, useState } from "react";

const EVENTOS: (keyof WindowEventMap)[] = ["pointerdown", "pointermove", "touchstart", "scroll", "keydown", "wheel"];

/**
 * true si ha habido interacción (toque/movimiento/scroll/teclado) en los
 * últimos `msInactividad` ms; false pasado ese tiempo sin tocar la pantalla.
 * Pensado para atenuar la navegación flotante cuando el entrenador lleva un
 * rato sin interactuar (viendo un partido, por ejemplo) y traerla de vuelta
 * en cuanto vuelve a tocar/mover.
 */
export function useActividadReciente(msInactividad = 3000): boolean {
  const [activo, setActivo] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function marcarActivo() {
      setActivo(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setActivo(false), msInactividad);
    }
    marcarActivo();
    for (const ev of EVENTOS) window.addEventListener(ev, marcarActivo, { passive: true });
    return () => {
      for (const ev of EVENTOS) window.removeEventListener(ev, marcarActivo);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [msInactividad]);

  return activo;
}
