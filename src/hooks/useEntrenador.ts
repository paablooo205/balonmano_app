import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** Entrenador con la sesión activa (fila propia en `entrenadores`, vía RLS) — id y nombre. */
export function useEntrenador() {
  const [id, setId] = useState<string | null>(null);
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
        .select("id, nombre")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!activo) return;
      setId(data?.id ?? null);
      setNombre(data?.nombre ?? null);
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, []);

  return { id, nombre, cargando };
}
