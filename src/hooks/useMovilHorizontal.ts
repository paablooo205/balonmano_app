import { useEffect, useState } from "react";

const QUERY = "(orientation: landscape) and (max-height: 500px)";

/**
 * true cuando el viewport es de móvil en horizontal (pantalla ancha y baja).
 * El límite de altura distingue esto de un monitor de escritorio, que
 * también cumple "orientation: landscape" pero no necesita el layout
 * compacto de dos columnas.
 */
export function useMovilHorizontal(): boolean {
  const [activo, setActivo] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const actualizar = () => setActivo(mql.matches);
    actualizar();
    mql.addEventListener("change", actualizar);
    return () => mql.removeEventListener("change", actualizar);
  }, []);

  return activo;
}
