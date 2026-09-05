import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { FichaTecnica } from "@/components/partido/FichaTecnica";
import { EscudoFondo } from "@/components/layout/EscudoFondo";
import type { PartidoCompartidoPayload } from "@/types/database";

/**
 * Página pública, sin sesión — enlace generado desde "Compartir ficha" en
 * FichaTecnica.tsx. Fuera de AuthGate y de EquipoLayout (ver App.tsx): sin
 * SideNav/BottomNav, sin ningún <Link>/navigate() hacia el resto de la app.
 * La selección de jugador para ver/descargar su ficha individual vive en la
 * propia FichaTecnica (sección "Por jugador"), no aquí — no duplicar esa
 * lista en esta página.
 */
export function SharedPartidoPage() {
  const { token } = useParams<{ token: string }>();
  const [datos, setDatos] = useState<PartidoCompartidoPayload>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "no-encontrado">("cargando");

  useEffect(() => {
    if (!token) {
      setEstado("no-encontrado");
      return;
    }
    supabase
      .rpc("obtener_partido_compartido", { p_token: token })
      .then(({ data, error }) => {
        if (error || !data) {
          setEstado("no-encontrado");
          return;
        }
        setDatos(data as PartidoCompartidoPayload);
        setEstado("ok");
      });
  }, [token]);

  if (estado === "cargando") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-[var(--color-text-muted)]">Cargando...</p>
      </div>
    );
  }

  if (estado === "no-encontrado" || !datos) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <EscudoFondo className="-bottom-24 -right-24 h-[130vw] w-[130vw] max-h-[48rem] max-w-[48rem] rotate-[-8deg]" />
        <div className="card-surface relative z-10 max-w-sm p-6 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Este enlace ya no está disponible.</p>
        </div>
      </div>
    );
  }

  const { partido, equipo_nombre, eventos, jugadores } = datos;

  return (
    <div className="relative min-h-screen px-4 py-8">
      <EscudoFondo className="-bottom-24 -right-24 h-[130vw] w-[130vw] max-h-[48rem] max-w-[48rem] rotate-[-8deg]" />
      <div className="relative z-10 mx-auto flex max-w-2xl flex-col gap-4">
        <div className="hero-band">
          <div className="hero-eyebrow">{equipo_nombre}</div>
          <h1 className="hero-title mt-0.5">vs {partido.rival}</h1>
        </div>

        <FichaTecnica
          partido={partido}
          jugadores={jugadores}
          eventos={eventos}
          nombreEquipo={equipo_nombre}
          soloLectura
        />
      </div>
    </div>
  );
}
