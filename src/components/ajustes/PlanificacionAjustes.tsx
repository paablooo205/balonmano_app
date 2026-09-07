import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { Field, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PeriodosRow } from "@/types/database";

/**
 * Edición de los campos que solo existen a nivel de periodo (fase de Excel):
 * objetivo general y notas. La edición de sus mesociclos y semanas vive
 * ahora entera en "Planifica la temporada" (ambos caminos comparten las
 * mismas filas de `mesociclos`/`microciclos`, sin distinción una vez que un
 * mesociclo tiene sus fechas rellenadas) — este componente ya no la
 * duplica, solo enlaza a ella.
 */
export function PlanificacionAjustes() {
  const { equipoId } = useEquipo();
  const [periodos, setPeriodos] = useState<PeriodosRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [periodoAbiertoId, setPeriodoAbiertoId] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const { data: per } = await supabase.from("periodos").select("*").eq("equipo_id", equipoId).order("fecha_inicio");
    setPeriodos(per ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  async function guardarPeriodo(id: string, campo: "objetivo_general" | "notas_adicionales", valorRaw: string) {
    const valor = valorRaw.trim() || null;
    const cambios: Partial<PeriodosRow> =
      campo === "objetivo_general" ? { objetivo_general: valor } : { notas_adicionales: valor };
    const { error } = await supabase.from("periodos").update(cambios).eq("id", id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setPeriodos((ps) => ps.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  if (cargando) return null;

  if (periodos.length === 0) {
    return (
      <div className="card-surface flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Planificación de temporada</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Este equipo todavía no tiene fases configuradas desde Excel. Para dar de alta y editar bloques y semanas
          directamente desde la app, usa la sección "Planifica la temporada" en el menú "Más".
        </p>
        <Link to={`/equipos/${equipoId}/planificacion`}>
          <Button variant="secondary" size="sm">
            Ir a Planifica la temporada
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="card-surface flex flex-col gap-1 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Fases (Excel)</h2>
        <Link to={`/equipos/${equipoId}/planificacion`} className="text-xs font-medium text-[var(--color-accent)] hover:underline">
          Editar bloques y semanas
        </Link>
      </div>

      {periodos.map((periodo) => {
        const abierto = periodoAbiertoId === periodo.id;
        return (
          <div key={periodo.id} className="border-t border-[var(--color-border)] py-3 first:border-t-0 first:pt-0">
            <button
              onClick={() => setPeriodoAbiertoId(abierto ? null : periodo.id)}
              className="flex w-full items-center justify-between text-left text-sm font-medium"
            >
              {periodo.nombre}
              <ChevronDown size={16} className={cn("shrink-0 transition-transform", abierto && "rotate-180")} />
            </button>

            {abierto && (
              <div className="mt-3 flex flex-col gap-4">
                <Field label="Objetivo general">
                  <Textarea
                    className="min-h-14"
                    placeholder="Objetivo de esta fase..."
                    defaultValue={periodo.objetivo_general ?? ""}
                    onBlur={(e) => guardarPeriodo(periodo.id, "objetivo_general", e.target.value)}
                  />
                </Field>
                <Field label="Notas del periodo">
                  <Textarea
                    className="min-h-16"
                    defaultValue={periodo.notas_adicionales ?? ""}
                    onBlur={(e) => guardarPeriodo(periodo.id, "notas_adicionales", e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
