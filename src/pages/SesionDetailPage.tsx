import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { useCalendarData, mesocicloDeMicrociclo } from "@/hooks/useCalendarData";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { SesionModal } from "@/components/calendario/SesionModal";
import { BloqueModal } from "@/components/sesion/BloqueModal";
import { EjercicioFormModal } from "@/components/ejercicios/EjercicioFormModal";
import { AsistenciaChecklist } from "@/components/equipo/AsistenciaChecklist";
import { guardarBloques } from "@/lib/bloquesSesion";
import { urlFirmada, nombreArchivo } from "@/lib/storage";
import { DIAS_SEMANA, MESES } from "@/lib/calendar";
import { imagenDeTemporada } from "@/lib/temporadaVisual";
import type { DiaSemana, EjerciciosRow } from "@/types/database";

export function SesionDetailPage() {
  const { equipoId } = useEquipo();
  const { sesionId } = useParams<{ sesionId: string }>();
  const navigate = useNavigate();
  const { horario, microciclos, mesociclos, sesiones, cargando, recargar } = useCalendarData(equipoId);
  const [ejercicios, setEjercicios] = useState<EjerciciosRow[]>([]);
  const [editando, setEditando] = useState(false);
  const [vista, setVista] = useState<"detalle" | "asistencia">("detalle");
  const [bloqueModalAbierto, setBloqueModalAbierto] = useState(false);
  const [bloqueEditIndex, setBloqueEditIndex] = useState<number | null>(null);
  const [ejercicioAbierto, setEjercicioAbierto] = useState<EjerciciosRow | null>(null);

  async function cargarEjercicios() {
    const { data } = await supabase
      .from("ejercicios")
      .select("*")
      .or(`equipo_id.eq.${equipoId},compartido.eq.true`)
      .order("nombre");
    setEjercicios(data ?? []);
  }

  useEffect(() => {
    cargarEjercicios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  function abrirNuevoBloque() {
    setBloqueEditIndex(null);
    setBloqueModalAbierto(true);
  }

  async function quitarBloque(i: number) {
    if (!sesion) return;
    if (!confirm("¿Quitar este bloque de la sesión?")) return;
    try {
      await guardarBloques(sesion, sesion.bloques.filter((_, j) => j !== i));
      recargar();
    } catch (err) {
      alert("No se pudo quitar: " + (err as Error).message);
    }
  }

  const sesion = sesiones.find((s) => s.id === sesionId) ?? null;

  if (cargando && !sesion) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }
  if (!sesion) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Sesión no encontrada.</div>;
  }

  const microciclo = microciclos.find((m) => m.id === sesion.microciclo_id) ?? null;
  const mesociclo = mesocicloDeMicrociclo(mesociclos, microciclo);

  const fecha = new Date(sesion.fecha + "T00:00:00");
  const diaSemana = (sesion.dia_semana ?? (fecha.getDay() as DiaSemana)) as DiaSemana;
  const dateLong = `${DIAS_SEMANA[fecha.getDay()].toLowerCase()} ${fecha.getDate()} de ${MESES[fecha.getMonth()].toLowerCase()}`;
  const fondoTemporada = imagenDeTemporada(fecha);
  // El objetivo (semanal y de mesociclo) va como texto debajo, en su propia
  // tarjeta — el título se queda corto a propósito, solo el nombre del
  // mesociclo, para no repetir un párrafo largo en letra grande.
  const tituloSesion = mesociclo?.nombre || "Entrenamiento";
  const hora = horario.find((h) => h.dia_semana === diaSemana)?.hora_inicio.slice(0, 5) ?? null;

  if (vista === "asistencia") {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Lista de asistencia"
          eyebrow="Entrenamiento"
          subtitle={`${dateLong}${sesion.duracion_min ? ` · ${sesion.duracion_min} min` : ""}`}
          onBack={() => setVista("detalle")}
          backLabel="Sesión"
        />
        <AsistenciaChecklist equipoId={equipoId} sesionId={sesion.id} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl">
        <div
          className="bg-[var(--color-ink)] bg-cover bg-center px-5 pb-5 pt-5"
          style={
            fondoTemporada
              ? { backgroundImage: `linear-gradient(180deg, rgba(17,17,20,.6), rgba(17,17,20,.9)), url(${fondoTemporada})` }
              : undefined
          }
        >
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
            >
              <ChevronLeft size={16} className="text-[var(--color-accent)]" /> Calendario
            </button>
            <button
              onClick={() => setEditando(true)}
              className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
            >
              <Pencil size={16} /> Editar
            </button>
          </div>
          <div className="flex items-start justify-between gap-3.5">
            <div className="min-w-0">
              <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white/80">
                Entrenamiento
              </div>
              <div className="font-display mt-1.5 text-[1.75rem] font-bold uppercase leading-[1.05] tracking-[0.01em] text-white">
                {tituloSesion}
              </div>
              <div className="mt-1 text-[13px] text-white/70">{dateLong}</div>
            </div>
            <div className="shrink-0 text-right">
              {hora && <div className="stat-number text-[26px] text-white">{hora}</div>}
              {sesion.duracion_min && (
                <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white/65">
                  {sesion.duracion_min} min
                </div>
              )}
            </div>
          </div>
        </div>

        {microciclo?.objetivo && (
          <div className="bg-white px-[18px] pb-5 pt-[18px] shadow-[0_8px_20px_-14px_rgba(17,17,20,0.2)]">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
              Objetivo de la semana
            </div>
            <p className="text-base font-medium leading-snug text-[var(--color-text)]">{microciclo.objetivo}</p>
          </div>
        )}

        {mesociclo?.objetivo && (
          <div className="border-t border-[var(--color-border)] bg-white px-[18px] pb-5 pt-[18px] shadow-[0_8px_20px_-14px_rgba(17,17,20,0.2)]">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
              Objetivo del mesociclo
            </div>
            <p className="text-base font-medium leading-snug text-[var(--color-text)]">{mesociclo.objetivo}</p>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
          Tareas · {sesion.bloques.length}
        </div>

        {sesion.bloques.length === 0 ? (
          <button
            onClick={abrirNuevoBloque}
            className="flex w-full flex-col items-center justify-center gap-3 py-14"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-ink)] text-white">
              <Plus size={26} />
            </span>
            <span className="text-sm text-[var(--color-text-muted)]">Añadir ejercicios</span>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {sesion.bloques.map((b, i) => {
              const ejercicio = b.ejercicio_id ? ejercicios.find((e) => e.id === b.ejercicio_id) : null;
              // Distingue "el bloque nunca tuvo un ejercicio enlazado" (cae al
              // texto libre, comportamiento de siempre) de "tenía uno enlazado
              // pero ya no es accesible" (dejó de compartirse desde otro
              // equipo, o se borró) — nunca debe romper la carga de la sesión.
              const sinAcceso = Boolean(b.ejercicio_id) && !ejercicio;
              const nombre = ejercicio?.nombre || (sinAcceso ? "Ejercicio ya no disponible" : b.descripcion_libre || "Bloque sin descripción");
              const detalle = ejercicio
                ? [ejercicio.categoria, ejercicio.dificultad].filter(Boolean).join(" · ")
                : sinAcceso ? "" : b.objetivo || b.consignas || "";

              const contenido = (
                <>
                  <span className="stat-number flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--color-ink)] text-base text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{nombre}</div>
                    {detalle && <div className="truncate text-xs text-[var(--color-text-muted)]">{detalle}</div>}
                  </div>
                  <span className="stat-number shrink-0 text-[var(--color-accent)]">{b.tiempo_min}&apos;</span>
                </>
              );

              return (
                <div key={i} className="card-surface flex items-center gap-1 p-3">
                  {sinAcceso ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3">{contenido}</div>
                  ) : (
                    <button
                      onClick={() => {
                        if (ejercicio) setEjercicioAbierto(ejercicio);
                        else {
                          setBloqueEditIndex(i);
                          setBloqueModalAbierto(true);
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:text-[var(--color-accent)]"
                    >
                      {contenido}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => quitarBloque(i)}
                    aria-label="Quitar bloque"
                    className="shrink-0 p-1.5 text-[var(--color-text-muted)] hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {sesion.bloques.length > 0 && (
          <button
            onClick={abrirNuevoBloque}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <Plus size={18} /> Añadir ejercicio
          </button>
        )}
      </div>

      {sesion.notas_adicionales && (
        <div className="rounded-[14px] bg-[var(--color-ink)] p-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Notas del entrenador
          </div>
          <p className="whitespace-pre-line text-sm text-white/85">{sesion.notas_adicionales}</p>
        </div>
      )}

      {sesion.adjuntos.length > 0 && (
        <div>
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
            Adjuntos
          </div>
          <div className="flex flex-col gap-2">
            {sesion.adjuntos.map((ruta) => (
              <button
                key={ruta}
                onClick={async () => {
                  try {
                    window.open(await urlFirmada(ruta), "_blank", "noopener,noreferrer");
                  } catch {
                    alert("No se pudo abrir el archivo.");
                  }
                }}
                className="card-surface flex w-full items-center gap-3 p-3 text-left"
              >
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--color-border)] bg-[var(--color-bg)]">
                  <FileText size={16} className="text-[var(--color-accent)]" />
                </span>
                <span className="truncate text-sm font-medium">{nombreArchivo(ruta)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Button size="lg" className="w-full" onClick={() => setVista("asistencia")}>
        Pasar lista de asistencia
      </Button>

      <BloqueModal
        open={bloqueModalAbierto}
        onClose={() => setBloqueModalAbierto(false)}
        equipoId={equipoId}
        sesion={sesion}
        bloqueIndex={bloqueEditIndex}
        onSaved={() => {
          setBloqueModalAbierto(false);
          recargar();
        }}
      />

      <EjercicioFormModal
        open={ejercicioAbierto !== null}
        onClose={() => setEjercicioAbierto(null)}
        equipoId={equipoId}
        ejercicio={ejercicioAbierto}
        permitirBorrar={false}
        onSaved={() => {
          setEjercicioAbierto(null);
          cargarEjercicios();
        }}
        onDeleted={() => {
          setEjercicioAbierto(null);
          cargarEjercicios();
        }}
      />

      <SesionModal
        open={editando}
        onClose={() => setEditando(false)}
        equipoId={equipoId}
        microcicloId={sesion.microciclo_id}
        fecha={sesion.fecha}
        diaSemana={diaSemana}
        duracionSugerida={null}
        sesion={sesion}
        onSaved={() => {
          setEditando(false);
          recargar();
        }}
        onDeleted={() => {
          setEditando(false);
          navigate(-1);
        }}
      />
    </div>
  );
}
