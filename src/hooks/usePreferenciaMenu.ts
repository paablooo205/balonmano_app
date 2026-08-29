import { useEffect, useState } from "react";

export type PreferenciaMenu = "auto" | "abajo" | "lateral";

const CLAVE = "coras-preferencia-menu";
const EVENTO = "coras-preferencia-menu-cambio";

function leer(): PreferenciaMenu {
  try {
    const v = localStorage.getItem(CLAVE);
    if (v === "abajo" || v === "lateral") return v;
  } catch {
    // almacenamiento no disponible (privado/bloqueado): se queda en "auto"
  }
  return "auto";
}

/**
 * Preferencia de posición del menú de navegación (Ajustes → Apariencia).
 * Respaldada por localStorage; "auto" (sin clave guardada) reproduce el
 * comportamiento de siempre, puramente por breakpoint CSS. AjustesPage y
 * EquipoLayout están montados a la vez (Ajustes vive dentro del Outlet del
 * layout), así que las instancias se sincronizan vía un CustomEvent propio
 * — el evento nativo "storage" no se dispara en la misma pestaña que escribe.
 */
export function usePreferenciaMenu() {
  const [preferencia, setPreferenciaState] = useState<PreferenciaMenu>(leer);

  useEffect(() => {
    function onCambio() {
      setPreferenciaState(leer());
    }
    window.addEventListener(EVENTO, onCambio);
    return () => window.removeEventListener(EVENTO, onCambio);
  }, []);

  function setPreferencia(valor: PreferenciaMenu) {
    try {
      if (valor === "auto") localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, valor);
    } catch {
      // almacenamiento no disponible: el estado en memoria sigue funcionando para esta sesión
    }
    setPreferenciaState(valor);
    window.dispatchEvent(new Event(EVENTO));
  }

  return { preferencia, setPreferencia };
}
