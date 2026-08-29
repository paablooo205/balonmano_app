import { useEffect, useState } from "react";
import { Outlet, useParams, Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import type { EquiposRow } from "@/types/database";
import { SideNav } from "./SideNav";
import { BottomNav } from "./BottomNav";
import { SyncStatusBadge } from "./SyncStatusBadge";
import { comprobarNotificaciones } from "@/lib/notifications";
import { usePreferenciaMenu } from "@/hooks/usePreferenciaMenu";
import { cn } from "@/lib/utils";

function cacheKey(equipoId: string) {
  return `equipo-cache:${equipoId}`;
}

function leerEquipoCacheado(equipoId: string): EquiposRow | null {
  try {
    const raw = localStorage.getItem(cacheKey(equipoId));
    return raw ? (JSON.parse(raw) as EquiposRow) : null;
  } catch {
    return null;
  }
}

function guardarEquipoCacheado(equipo: EquiposRow) {
  try {
    localStorage.setItem(cacheKey(equipo.id), JSON.stringify(equipo));
  } catch {
    // almacenamiento no disponible (privado/lleno): no es crítico, se reintentará
  }
}

export function EquipoLayout() {
  const { equipoId } = useParams();
  const { preferencia: modo } = usePreferenciaMenu();
  const [equipo, setEquipo] = useState<EquiposRow | null>(null);
  // "no-encontrado": el equipo no existe de verdad (consulta con éxito, sin filas).
  // Un fallo de red (offline) NUNCA debe expulsar al usuario a "/" — es justo el
  // caso de uso real de partido/entrenamiento sin cobertura en el pabellón.
  const [estado, setEstado] = useState<"cargando" | "ok" | "no-encontrado">("cargando");

  useEffect(() => {
    if (!equipoId) return;
    let activo = true;

    const cacheado = leerEquipoCacheado(equipoId);
    if (cacheado) {
      setEquipo(cacheado);
      setEstado("ok");
    } else {
      setEstado("cargando");
    }

    supabase
      .from("equipos")
      .select("*")
      .eq("id", equipoId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          // Fallo de red u otro error transitorio: si no tenemos ni caché ni
          // equipo ya cargado, no podemos mostrar nada útil, pero tampoco
          // desalojamos al usuario — nos quedamos en "cargando" en vez de
          // tratarlo como "no existe".
          if (!cacheado) setEstado("cargando");
          return;
        }
        if (!data) {
          // Consulta resuelta sin error y sin filas: el equipo no existe de verdad.
          setEstado("no-encontrado");
          return;
        }
        setEquipo(data);
        guardarEquipoCacheado(data);
        setEstado("ok");
        void comprobarNotificaciones(data.id, data.nombre);
      });
    return () => {
      activo = false;
    };
  }, [equipoId]);

  if (estado === "no-encontrado") {
    return <Navigate to="/" replace />;
  }

  if (estado === "cargando") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">
          {navigator.onLine ? "Cargando..." : "Sin conexión — esperando a poder cargar este equipo."}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-h-screen",
        modo === "auto" && "md:pl-[18rem]",
        modo === "lateral" && "pl-24 md:pl-[18rem]",
      )}
    >
      <SyncStatusBadge />
      <SideNav nombreEquipo={equipo?.nombre} modo={modo} />
      <main
        className={cn(
          "mx-auto max-w-4xl px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:pt-8",
          modo === "auto" && "pb-24 md:pb-8",
          modo === "abajo" && "pb-24",
          modo === "lateral" && "pb-8",
        )}
      >
        <Outlet context={{ equipo }} />
      </main>
      <BottomNav modo={modo} />
    </div>
  );
}
