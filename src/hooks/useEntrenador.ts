import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Nombre del entrenador con la sesión activa (fila propia en `entrenadores`, vía RLS). */
export function useEntrenador() {
  const [nombre, setNombre] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (activo) setCargando(false);
        return;
      }
      const { data } = await supabase
        .from("entrenadores")
        .select("nombre")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!activo) return;
      setNombre(data?.nombre ?? null);
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, []);

  return { nombre, cargando };
}
