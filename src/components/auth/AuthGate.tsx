import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { LoginPage } from "@/pages/LoginPage";
import { RegistroPage } from "@/pages/RegistroPage";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [vista, setVista] = useState<"login" | "registro">("login");
  const [entrenadorListo, setEntrenadorListo] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => setSession(newSession),
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  // Garantiza que toda sesión activa tiene su fila en `entrenadores` — la crea
  // si falta (recién registrado) usando el nombre guardado en user_metadata
  // durante el registro. Único punto donde se comprueba esto en toda la app.
  useEffect(() => {
    if (!session) {
      setEntrenadorListo(false);
      return;
    }
    let activo = true;
    (async () => {
      const { data: existente } = await supabase
        .from("entrenadores")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (!existente) {
        const nombre = (session.user.user_metadata?.nombre as string | undefined)?.trim() || "Entrenador/a";
        await supabase.from("entrenadores").insert({ nombre, auth_user_id: session.user.id });
      }
      if (activo) setEntrenadorListo(true);
    })();
    return () => {
      activo = false;
    };
  }, [session]);

  if (session === undefined) {
    return null; // evita parpadeo mientras se resuelve la sesión inicial
  }

  if (session === null) {
    return vista === "login" ? (
      <LoginPage onIrARegistro={() => setVista("registro")} />
    ) : (
      <RegistroPage onIrALogin={() => setVista("login")} />
    );
  }

  if (!entrenadorListo) {
    return null;
  }

  return <>{children}</>;
}
