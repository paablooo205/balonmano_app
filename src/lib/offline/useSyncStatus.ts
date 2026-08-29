import { useEffect, useState } from "react";
import { contarPendientes, flushQueue, inicializarSincronizacionOffline, onQueueChange } from "./queue";

/**
 * Hook para que la UI sepa si hay operaciones offline pendientes de
 * sincronizar, y si hay conexión. Arranca el flush automático (al montar y
 * al recuperar red) la primera vez que se usa en la app.
 */
export function useSyncStatus() {
  const [pendientes, setPendientes] = useState(0);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    inicializarSincronizacionOffline();

    let activo = true;
    const actualizar = () => {
      void contarPendientes().then((n) => {
        if (activo) setPendientes(n);
      });
    };
    actualizar();
    const offQueue = onQueueChange(actualizar);

    function alConectar() {
      setOnline(true);
      setSincronizando(true);
      void flushQueue().finally(() => {
        if (activo) setSincronizando(false);
      });
    }
    function alDesconectar() {
      setOnline(false);
    }

    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);

    return () => {
      activo = false;
      offQueue();
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
    };
  }, []);

  return { pendientes, online, sincronizando };
}
