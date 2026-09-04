import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clock, ExternalLink, Pencil, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { MiniaturaImagen } from "@/components/ejercicios/MiniaturaImagen";
import { EjercicioFormModal } from "@/components/ejercicios/EjercicioFormModal";
import type { EjerciciosRow } from "@/types/database";

export function EjercicioDetailPage() {
  const { equipoId } = useEquipo();
  const { ejercicioId } = useParams<{ ejercicioId: string }>();
  const navigate = useNavigate();
  const [ejercicio, setEjercicio] = useState<EjerciciosRow | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [imagenAbierta, setImagenAbierta] = useState<number | null>(null);

  async function cargar() {
    if (!ejercicioId) return;
    setCargando(true);
    const { data } = await supabase.from("ejercicios").select("*").eq("id", ejercicioId).maybeSingle();
    setEjercicio(data ?? null);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ejercicioId]);

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }
  if (!ejercicio) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Ejercicio no encontrado.</div>;
  }

  const esPropio = ejercicio.equipo_id === equipoId;
  const datosRapidos = [
    ejercicio.dificultad,
    (ejercicio.jugadores_min || ejercicio.jugadores_max) && `${ejercicio.jugadores_min ?? "?"}–${ejercicio.jugadores_max ?? "?"} jugadores`,
    ejercicio.duracion_min && `${ejercicio.duracion_min} min`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={ejercicio.nombre}
        eyebrow={ejercicio.categoria ?? "Ejercicio"}
        onBack={() => navigate(-1)}
        backLabel="Ejercicios"
        action={
          esPropio ? (
            <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>
              <Pencil size={16} /> Editar
            </Button>
          ) : undefined
        }
      />

      {!esPropio && (
        <div className="card-surface p-4 text-sm text-[var(--color-text-muted)]">
          Compartido por {ejercicio.creado_por_nombre ?? "otro equipo"}
          {ejercicio.equipo_origen_nombre ? ` · ${ejercicio.equipo_origen_nombre}` : ""}
        </div>
      )}

      {ejercicio.imagenes.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {ejercicio.imagenes.map((ruta, i) => (
            <MiniaturaImagen
              key={ruta}
              ruta={ruta}
              onClick={() => setImagenAbierta(i)}
              className="aspect-square w-full rounded-[14px]"
            />
          ))}
        </div>
      )}

      {datosRapidos.length > 0 && (
        <div className="card-surface flex flex-wrap gap-4 p-4 text-sm text-[var(--color-text-muted)]">
          {datosRapidos.map((d) => (
            <span key={d} className="flex items-center gap-1.5">
              {d.includes("jugadores") && <Users size={15} />}
              {d.includes("min") && <Clock size={15} />}
              {d}
            </span>
          ))}
        </div>
      )}

      {ejercicio.contenido.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ejercicio.contenido.map((tag) => (
            <span key={tag} className="rounded-full bg-[var(--color-card-hover)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">
              {tag}
            </span>
          ))}
        </div>
      )}

      {(ejercicio.espacio || ejercicio.material) && (
        <div className="card-surface grid grid-cols-2 gap-3 p-4">
          {ejercicio.espacio && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">Espacio</div>
              <div className="text-sm">{ejercicio.espacio}</div>
            </div>
          )}
          {ejercicio.material && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">Material</div>
              <div className="text-sm">{ejercicio.material}</div>
            </div>
          )}
        </div>
      )}

      {ejercicio.enlace && (
        <a
          href={ejercicio.enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="card-surface flex items-center justify-center gap-2 p-3.5 text-sm font-medium text-[var(--color-accent)]"
        >
          <ExternalLink size={16} /> Abrir enlace
        </a>
      )}

      {ejercicio.descripcion && (
        <div className="card-surface p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">Descripción</div>
          <p className="whitespace-pre-line text-sm leading-relaxed">{ejercicio.descripcion}</p>
        </div>
      )}

      {ejercicio.notas_adicionales && (
        <div className="card-surface p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">Notas adicionales</div>
          <p className="whitespace-pre-line text-sm leading-relaxed">{ejercicio.notas_adicionales}</p>
        </div>
      )}

      <EjercicioFormModal
        open={editando}
        onClose={() => setEditando(false)}
        equipoId={equipoId}
        ejercicio={ejercicio}
        onSaved={() => {
          setEditando(false);
          cargar();
        }}
        onDeleted={() => {
          setEditando(false);
          navigate(-1);
        }}
      />

      {imagenAbierta !== null && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/95"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-white/60">
              {imagenAbierta + 1} / {ejercicio.imagenes.length}
            </span>
            <button onClick={() => setImagenAbierta(null)} aria-label="Cerrar" className="text-white/80 hover:text-white">
              <X size={22} />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4 pb-4">
            <MiniaturaImagen ruta={ejercicio.imagenes[imagenAbierta]} className="max-h-full max-w-full rounded-[10px] object-contain" />
            {imagenAbierta > 0 && (
              <button
                onClick={() => setImagenAbierta((i) => (i !== null ? i - 1 : i))}
                aria-label="Imagen anterior"
                className="absolute left-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            {imagenAbierta < ejercicio.imagenes.length - 1 && (
              <button
                onClick={() => setImagenAbierta((i) => (i !== null ? i + 1 : i))}
                aria-label="Imagen siguiente"
                className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
