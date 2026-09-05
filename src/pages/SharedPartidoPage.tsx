import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/field";
import { FichaTecnica } from "@/components/partido/FichaTecnica";
import { PanelJugadorPartido } from "@/components/partido/PanelJugadorPartido";
import { EscudoFondo } from "@/components/layout/EscudoFondo";
import type { JugadoresRow, PartidoCompartidoPayload } from "@/types/database";

/**
 * Página pública, sin sesión — enlace generado desde "Compartir ficha" en
 * FichaTecnica.tsx. Fuera de AuthGate y de EquipoLayout (ver App.tsx): sin
 * SideNav/BottomNav, sin ningún <Link>/navigate() hacia el resto de la app.
 */
export function SharedPartidoPage() {
  const { token } = useParams<{ token: string }>();
  const [datos, setDatos] = useState<PartidoCompartidoPayload>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "no-encontrado">("cargando");
  const [busqueda, setBusqueda] = useState("");
  const [jugadorPanel, setJugadorPanel] = useState<JugadoresRow | null>(null);

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
  const convocadosFiltrados = jugadores.filter((j) => j.nombre.toLowerCase().includes(busqueda.toLowerCase()));

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

        <div>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
            Fichas individuales
          </div>
          <div className="relative mb-3">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <Input
              pill
              placeholder="Buscar jugador..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            {convocadosFiltrados.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => setJugadorPanel(j)}
                className="card-surface flex items-center gap-3 p-3 text-left transition-colors hover:border-[var(--color-accent)]"
              >
                <span className="stat-number text-sm text-[var(--color-text-muted)]">#{j.dorsal ?? "—"}</span>
                <span className="text-sm font-medium">{j.nombre}</span>
              </button>
            ))}
            {convocadosFiltrados.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">
                Ningún jugador coincide con la búsqueda.
              </p>
            )}
          </div>
        </div>
      </div>

      {jugadorPanel && (
        <PanelJugadorPartido
          jugador={jugadorPanel}
          partido={partido}
          eventos={eventos}
          onCerrar={() => setJugadorPanel(null)}
        />
      )}
    </div>
  );
}
