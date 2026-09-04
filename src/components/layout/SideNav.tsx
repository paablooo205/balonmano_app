import { useEffect } from "react";
import { NavLink, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/navConfig";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import type { PreferenciaMenu } from "@/hooks/usePreferenciaMenu";
import { useEjerciciosNuevos } from "@/hooks/useEjerciciosNuevos";

export function SideNav({
  nombreEquipo,
  modo,
  activa,
}: {
  nombreEquipo?: string;
  modo: PreferenciaMenu;
  activa: boolean;
}) {
  const { equipoId } = useParams();
  const location = useLocation();
  const { hayNuevos: hayEjerciciosNuevos, marcarVistos: marcarEjerciciosVistos } = useEjerciciosNuevos(equipoId ?? "");

  // Al entrar en Ejercicios se considera visto — la burbuja roja desaparece
  // sin que el usuario tenga que hacer nada más.
  useEffect(() => {
    if (location.pathname.includes("/ejercicios")) marcarEjerciciosVistos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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

      <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto md:items-stretch">
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
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
              <item.icon size={19} />
              {item.key === "ejercicios" && hayEjerciciosNuevos && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-card)]" />
              )}
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
