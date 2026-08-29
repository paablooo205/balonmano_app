import { useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { LogOut, MoreHorizontal, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/navConfig";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import type { PreferenciaMenu } from "@/hooks/usePreferenciaMenu";
import { useActividadReciente } from "@/hooks/useActividadReciente";

const PRINCIPALES = NAV_ITEMS.filter((item) => item.enBarraInferior);
const SECUNDARIOS = NAV_ITEMS.filter((item) => !item.enBarraInferior);

export function BottomNav({ modo }: { modo: PreferenciaMenu }) {
  const { equipoId } = useParams();
  const [masAbierto, setMasAbierto] = useState(false);
  const activa = useActividadReciente() || masAbierto;
  const haySeccionSecundariaActiva = SECUNDARIOS.some((item) =>
    location.pathname.includes(`/${item.path}`),
  );

  if (modo === "lateral") return null;

  return (
    <>
      {masAbierto && (
        <div
          className={cn("fixed inset-0 z-40 bg-black/70 backdrop-blur-sm", modo === "auto" && "md:hidden")}
          onClick={() => setMasAbierto(false)}
        >
          <div
            className="card-surface absolute bottom-0 left-0 right-0 z-50 rounded-b-none border-b-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                Más secciones
              </span>
              <button
                aria-label="Cerrar"
                onClick={() => setMasAbierto(false)}
                className="text-[var(--color-text-muted)]"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {SECUNDARIOS.map((item) => (
                <NavLink
                  key={item.key}
                  to={`/equipos/${equipoId}/${item.path}`}
                  onClick={() => setMasAbierto(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 py-4 text-sm",
                      isActive && "border-[var(--color-accent)] text-[var(--color-accent)]",
                    )
                  }
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                    <item.icon size={22} />
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-3 text-sm font-medium text-[var(--color-accent)]"
            >
              <LogOut size={18} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      <nav
        className={cn(
          "fixed inset-x-4 z-30 transition-all duration-500 ease-out",
          modo === "auto" && "md:hidden",
          activa ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-sm items-center justify-between gap-1 rounded-full bg-[var(--color-ink)] p-1.5 shadow-[0_16px_32px_-12px_rgba(0,0,0,0.5)]">
          {PRINCIPALES.map((item) => (
            <NavLink
              key={item.key}
              to={`/equipos/${equipoId}/${item.path}`}
              className={({ isActive }) =>
                cn(
                  "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full transition-colors duration-150",
                  isActive ? "bg-[var(--color-accent)] px-4" : "w-11 text-white/55 active:text-white",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} strokeWidth={isActive ? 2.3 : 2} className={cn("shrink-0", isActive && "text-white")} />
                  {isActive && (
                    <span className="whitespace-nowrap text-[13px] font-semibold text-white">{item.label}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMasAbierto(true)}
            className={cn(
              "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full transition-colors duration-150",
              haySeccionSecundariaActiva ? "bg-[var(--color-accent)] px-4" : "w-11 text-white/55 active:text-white",
            )}
          >
            <MoreHorizontal
              size={20}
              strokeWidth={haySeccionSecundariaActiva ? 2.3 : 2}
              className={cn("shrink-0", haySeccionSecundariaActiva && "text-white")}
            />
            {haySeccionSecundariaActiva && <span className="whitespace-nowrap text-[13px] font-semibold text-white">Más</span>}
          </button>
        </div>
      </nav>
    </>
  );
}
