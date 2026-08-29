import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { Field, Textarea } from "@/components/ui/field";
import { AsistenteConfiguracionTemporada } from "@/components/ajustes/AsistenteConfiguracionTemporada";
import { cn } from "@/lib/utils";
import type { MesociclosRow, MicrociclosRow, PeriodosRow } from "@/types/database";

/** Nº de mesociclo a partir de su nombre ("Mesociclo 3" -> 3), para ordenarlos bien. */
function numeroDeMesociclo(nombre: string): number {
  return parseInt(nombre.match(/\d+/)?.[0] ?? "0", 10);
}

export function PlanificacionAjustes() {
  const { equipoId } = useEquipo();
  const [periodos, setPeriodos] = useState<PeriodosRow[]>([]);
  const [mesociclos, setMesociclos] = useState<MesociclosRow[]>([]);
  const [microciclos, setMicrociclos] = useState<MicrociclosRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [periodoAbiertoId, setPeriodoAbiertoId] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    const [{ data: per }, { data: meso }, { data: micro }] = await Promise.all([
      supabase.from("periodos").select("*").eq("equipo_id", equipoId).order("fecha_inicio"),
      supabase.from("mesociclos").select("*").eq("equipo_id", equipoId),
      supabase.from("microciclos").select("*").eq("equipo_id", equipoId).order("fecha_inicio"),
    ]);
    setPeriodos(per ?? []);
    setMesociclos((meso ?? []).sort((a, b) => numeroDeMesociclo(a.nombre) - numeroDeMesociclo(b.nombre)));
    setMicrociclos(micro ?? []);
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

  async function guardarMicrociclo(id: string, objetivo: string) {
    const valor = objetivo.trim() || null;
    const { error } = await supabase.from("microciclos").update({ objetivo: valor }).eq("id", id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setMicrociclos((ms) => ms.map((m) => (m.id === id ? { ...m, objetivo: valor } : m)));
  }

  async function guardarMesociclo(id: string, campo: "objetivo" | "notas_adicionales", valorRaw: string) {
    const valor = valorRaw.trim() || null;
    const cambios: Partial<MesociclosRow> = campo === "objetivo" ? { objetivo: valor } : { notas_adicionales: valor };
    const { error } = await supabase.from("mesociclos").update(cambios).eq("id", id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setMesociclos((ms) => ms.map((m) => (m.id === id ? { ...m, ...cambios } : m)));
  }

  if (cargando) return null;

  if (periodos.length === 0) {
    return <AsistenteConfiguracionTemporada equipoId={equipoId} onCompletado={cargar} />;
  }

  return (
    <div className="card-surface flex flex-col gap-1 p-4">
      <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">Objetivos y mesociclos</h2>

      {periodos.map((periodo) => {
        const abierto = periodoAbiertoId === periodo.id;
        const mesociclosDelPeriodo = mesociclos.filter((m) => m.periodo_id === periodo.id);
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

                {mesociclosDelPeriodo.map((m) => {
                  const microciclosDelMesociclo = microciclos.filter((mc) => mc.mesociclo_id === m.id);
                  return (
                    <div key={m.id} className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-3">
                      <div className="text-sm font-medium">{m.nombre}</div>
                      <Field label="Objetivo">
                        <Textarea
                          className="min-h-16"
                          placeholder="Objetivo de este mesociclo..."
                          defaultValue={m.objetivo ?? ""}
                          onBlur={(e) => guardarMesociclo(m.id, "objetivo", e.target.value)}
                        />
                      </Field>
                      <Field label="Notas adicionales">
                        <Textarea
                          className="min-h-16"
                          defaultValue={m.notas_adicionales ?? ""}
                          onBlur={(e) => guardarMesociclo(m.id, "notas_adicionales", e.target.value)}
                        />
                      </Field>

                      {microciclosDelMesociclo.length > 0 && (
                        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
                          <div className="text-xs font-medium text-[var(--color-text-muted)]">
                            Objetivo semanal
                          </div>
                          {microciclosDelMesociclo.map((mc) => (
                            <div key={mc.id} className="flex flex-col gap-1">
                              <span className="text-xs text-[var(--color-text-muted)]">
                                Semana {mc.semana} · {mc.fecha_inicio}
                              </span>
                              <Textarea
                                className="min-h-10 text-sm"
                                placeholder="Sin rellenar todavía..."
                                defaultValue={mc.objetivo ?? ""}
                                onBlur={(e) => guardarMicrociclo(mc.id, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
