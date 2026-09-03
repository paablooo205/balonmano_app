import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/field";
import { supabase } from "@/lib/supabaseClient";
import type { EjerciciosRow } from "@/types/database";

export function EjercicioPickerModal({
  open,
  onClose,
  equipoId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  onPick: (ejercicio: EjerciciosRow) => void;
}) {
  const [ejercicios, setEjercicios] = useState<EjerciciosRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!open) return;
    setCargando(true);
    supabase
      .from("ejercicios")
      .select("*")
      .or(`equipo_id.eq.${equipoId},compartido.eq.true`)
      .order("nombre")
      .then(({ data }) => {
        setEjercicios(data ?? []);
        setCargando(false);
      });
  }, [open, equipoId]);

  const filtrados = ejercicios.filter((e) => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    const enTags = e.contenido.some((t) => t.toLowerCase().includes(q));
    return e.nombre.toLowerCase().includes(q) || enTags;
  });

  return (
    <Modal open={open} onClose={onClose} title="Elegir ejercicio de la biblioteca">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            pill
            placeholder="Buscar por nombre o tag..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-10"
          />
        </div>

        {cargando && <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">Cargando...</div>}

        {!cargando && filtrados.length === 0 && (
          <div className="py-6 text-center text-sm text-[var(--color-text-muted)]">
            {ejercicios.length === 0
              ? "Todavía no hay ejercicios en la biblioteca."
              : "Ningún ejercicio coincide con la búsqueda."}
          </div>
        )}

        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {filtrados.map((e) => {
            const esAjeno = e.equipo_id !== equipoId;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onPick(e)}
                className="card-surface flex flex-col gap-1 p-3 text-left transition-colors hover:border-[var(--color-accent)]"
              >
                <div className="font-semibold">{e.nombre}</div>
                <div className="text-sm text-[var(--color-text-muted)]">
                  {[e.categoria, e.dificultad].filter(Boolean).join(" · ") || "Sin clasificar"}
                </div>
                {esAjeno && (
                  <span className="w-fit rounded-full bg-[var(--color-card-hover)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                    Por {e.creado_por_nombre ?? "otro equipo"}
                    {e.equipo_origen_nombre ? ` · ${e.equipo_origen_nombre}` : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
