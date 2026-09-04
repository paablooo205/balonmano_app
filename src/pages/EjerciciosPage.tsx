import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Star, Search, Users, Clock, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import type { EjerciciosRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/layout/PageHeader";
import { EjercicioFormModal } from "@/components/ejercicios/EjercicioFormModal";

export function EjerciciosPage() {
  const { equipoId } = useEquipo();
  const navigate = useNavigate();
  const [ejercicios, setEjercicios] = useState<EjerciciosRow[]>([]);
  const [favoritoIds, setFavoritoIds] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [dificultad, setDificultad] = useState("");
  const [soloFavoritos, setSoloFavoritos] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);

  async function cargar() {
    setCargando(true);
    const [ej, fav] = await Promise.all([
      supabase
        .from("ejercicios")
        .select("*")
        .or(`equipo_id.eq.${equipoId},compartido.eq.true`)
        .order("nombre"),
      supabase.from("ejercicio_favoritos").select("ejercicio_id").eq("equipo_id", equipoId),
    ]);
    setEjercicios(ej.data ?? []);
    setFavoritoIds(new Set((fav.data ?? []).map((f) => f.ejercicio_id)));
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  const categorias = useMemo(
    () => Array.from(new Set(ejercicios.map((e) => e.categoria).filter(Boolean))) as string[],
    [ejercicios],
  );
  const dificultades = useMemo(
    () => Array.from(new Set(ejercicios.map((e) => e.dificultad).filter(Boolean))) as string[],
    [ejercicios],
  );

  const filtrados = ejercicios.filter((e) => {
    if (soloFavoritos && !favoritoIds.has(e.id)) return false;
    if (categoria && e.categoria !== categoria) return false;
    if (dificultad && e.dificultad !== dificultad) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const enTags = e.contenido.some((t) => t.toLowerCase().includes(q));
      if (!e.nombre.toLowerCase().includes(q) && !enTags) return false;
    }
    return true;
  });

  function abrirNuevo() {
    setModalAbierto(true);
  }
  function cerrarModal() {
    setModalAbierto(false);
  }
  function alGuardar() {
    setModalAbierto(false);
    cargar();
  }
  function alBorrar() {
    setModalAbierto(false);
    cargar();
  }

  async function toggleFavorito(e: EjerciciosRow) {
    if (favoritoIds.has(e.id)) {
      await supabase.from("ejercicio_favoritos").delete().eq("equipo_id", equipoId).eq("ejercicio_id", e.id);
    } else {
      await supabase.from("ejercicio_favoritos").insert({ equipo_id: equipoId, ejercicio_id: e.id });
    }
    cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Ejercicios"
        action={
          <Button size="sm" onClick={abrirNuevo}>
            <Plus size={18} /> Nuevo
          </Button>
        }
      />

      <div className="card-surface flex flex-col gap-3 p-4">
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
        <div className="grid grid-cols-2 gap-3">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={dificultad} onChange={(e) => setDificultad(e.target.value)}>
            <option value="">Toda dificultad</option>
            {dificultades.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
        <button
          onClick={() => setSoloFavoritos((v) => !v)}
          className={`flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-sm transition-colors ${
            soloFavoritos
              ? "border-[var(--color-accent)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] text-[var(--color-text-muted)]"
          }`}
        >
          <Star size={16} fill={soloFavoritos ? "currentColor" : "none"} />
          Solo favoritos
        </button>
      </div>

      {cargando && <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>}

      {!cargando && filtrados.length === 0 && (
        <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">
          {ejercicios.length === 0
            ? "Todavía no hay ejercicios. Crea el primero."
            : "Ningún ejercicio coincide con el filtro."}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {filtrados.map((e) => {
          const esAjeno = e.equipo_id !== equipoId;
          const esFavorito = favoritoIds.has(e.id);
          return (
            <button
              key={e.id}
              onClick={() => navigate(`/equipos/${equipoId}/ejercicios/${e.id}`)}
              className="card-surface flex flex-col gap-2 p-4 text-left transition-colors hover:border-[var(--color-accent)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{e.nombre}</div>
                  <div className="text-sm text-[var(--color-text-muted)]">
                    {[e.categoria, e.dificultad].filter(Boolean).join(" · ") || "Sin clasificar"}
                  </div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    toggleFavorito(e);
                  }}
                  className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                >
                  <Star size={20} fill={esFavorito ? "currentColor" : "none"} className={esFavorito ? "text-[var(--color-accent)]" : ""} />
                </span>
              </div>

              {esAjeno && (
                <span className="w-fit rounded-full bg-[var(--color-card-hover)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                  Por {e.creado_por_nombre ?? "otro equipo"}
                  {e.equipo_origen_nombre ? ` · ${e.equipo_origen_nombre}` : ""}
                </span>
              )}

              {e.contenido.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {e.contenido.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--color-card-hover)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-4 text-xs text-[var(--color-text-muted)]">
                {(e.jugadores_min || e.jugadores_max) && (
                  <span className="flex items-center gap-1">
                    <Users size={14} />
                    {e.jugadores_min ?? "?"}–{e.jugadores_max ?? "?"}
                  </span>
                )}
                {e.duracion_min && (
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    {e.duracion_min} min
                  </span>
                )}
                {e.enlace && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      window.open(e.enlace!, "_blank", "noopener,noreferrer");
                    }}
                    className="flex items-center gap-1 hover:text-[var(--color-accent)]"
                  >
                    <ExternalLink size={14} /> Enlace
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <EjercicioFormModal
        open={modalAbierto}
        onClose={cerrarModal}
        equipoId={equipoId}
        ejercicio={null}
        onSaved={alGuardar}
        onDeleted={alBorrar}
      />
    </div>
  );
}
