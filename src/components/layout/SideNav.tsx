import { NavLink, useParams } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/navConfig";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import type { PreferenciaMenu } from "@/hooks/usePreferenciaMenu";
import { useActividadReciente } from "@/hooks/useActividadReciente";

export function SideNav({ nombreEquipo, modo }: { nombreEquipo?: string; modo: PreferenciaMenu }) {
  const { equipoId } = useParams();
  const activa = useActividadReciente();

  if (modo === "abajo") return null;

  return (
    <aside
      className={cn(
        "card-surface fixed left-2 top-4 bottom-4 z-30 flex-col items-center p-3 transition-all duration-500 ease-out md:left-4 md:w-64 md:items-stretch md:p-4",
        modo === "lateral" ? "flex w-16 md:flex" : "hidden w-64 md:flex",
        activa ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-3 opacity-0",
      )}
    >
      <span
        className="mb-5 hidden text-lg font-extrabold uppercase tracking-wide text-[var(--color-accent)] md:block"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Coras
      </span>

      <NavLink
        to="/"
        className="mb-6 flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        title="Cambiar de equipo"
      >
        <ArrowLeft size={16} />
        <span className="hidden md:inline">Cambiar de equipo</span>
      </NavLink>

      {nombreEquipo && (
        <div className="mb-4 hidden truncate text-lg font-semibold md:block">{nombreEquipo}</div>
      )}

      <nav className="flex flex-1 flex-col items-center gap-1 md:items-stretch">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.key}
            to={`/equipos/${equipoId}/${item.path}`}
            title={item.label}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-card-hover)] hover:text-[var(--color-text)]",
                isActive && "text-[var(--color-accent)] font-medium",
              )
            }
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
              <item.icon size={19} />
            </span>
            <span className="hidden md:inline">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => supabase.auth.signOut()}
        title="Cerrar sesión"
        className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-card-hover)] hover:text-[var(--color-accent)]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          <LogOut size={19} />
        </span>
        <span className="hidden md:inline">Cerrar sesión</span>
      </button>
    </aside>
  );
}
