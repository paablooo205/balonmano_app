import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { MesociclosRow, MicrociclosRow } from "@/types/database";

/**
 * Tarjeta de un bloque de "Planifica la temporada": nombre y fechas
 * editables, objetivo del bloque, y la lista de sus semanas (microciclos)
 * también editables. Toda la persistencia vive en el padre (PlanificacionPage)
 * — este componente solo renderiza y dispara callbacks.
 */
export function BloqueCard({
  bloque,
  semanas,
  abierto,
  esPrimero,
  esUltimo,
  onToggle,
  onGuardarCampo,
  onGuardarFechas,
  onGuardarSemana,
  onBorrar,
  onMover,
}: {
  bloque: MesociclosRow;
  semanas: MicrociclosRow[];
  abierto: boolean;
  esPrimero: boolean;
  esUltimo: boolean;
  onToggle: () => void;
  onGuardarCampo: (campo: "nombre" | "objetivo", valor: string) => void;
  onGuardarFechas: (fechaInicio: string, fechaFin: string) => void;
  onGuardarSemana: (id: string, campo: "objetivo" | "rival" | "competicion", valor: string) => void;
  onBorrar: () => void;
  onMover: (direccion: "subir" | "bajar") => void;
}) {
  const [fechaInicioForm, setFechaInicioForm] = useState(bloque.fecha_inicio ?? "");
  const [fechaFinForm, setFechaFinForm] = useState(bloque.fecha_fin ?? "");

  const semanasOrdenadas = [...semanas].sort((a, b) => (a.fecha_inicio ?? "").localeCompare(b.fecha_inicio ?? ""));
  const fechasCambiadas = fechaInicioForm !== (bloque.fecha_inicio ?? "") || fechaFinForm !== (bloque.fecha_fin ?? "");

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <input
          className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[var(--color-text)] outline-none"
          defaultValue={bloque.nombre}
          onBlur={(e) => onGuardarCampo("nombre", e.target.value)}
        />
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Subir bloque"
            onClick={() => onMover("subir")}
            disabled={esPrimero}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
          >
            <ArrowUp size={16} />
          </button>
          <button
            type="button"
            aria-label="Bajar bloque"
            onClick={() => onMover("bajar")}
            disabled={esUltimo}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
          >
            <ArrowDown size={16} />
          </button>
          <button
            type="button"
            aria-label="Borrar bloque"
            onClick={onBorrar}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
          >
            <Trash2 size={16} />
          </button>
          <button type="button" onClick={onToggle} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      <div className="text-xs text-[var(--color-text-muted)]">
        {bloque.fecha_inicio && bloque.fecha_fin ? `${bloque.fecha_inicio} → ${bloque.fecha_fin}` : "Sin fechas"} ·{" "}
        {semanas.length} semana{semanas.length === 1 ? "" : "s"}
      </div>

      {abierto && (
        <div className="flex flex-col gap-4 border-t border-[var(--color-border)] pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de inicio">
              <Input type="date" value={fechaInicioForm} onChange={(e) => setFechaInicioForm(e.target.value)} />
            </Field>
            <Field label="Fecha de fin">
              <Input type="date" value={fechaFinForm} onChange={(e) => setFechaFinForm(e.target.value)} />
            </Field>
          </div>
          {fechasCambiadas && (
            <Button size="sm" onClick={() => onGuardarFechas(fechaInicioForm, fechaFinForm)} className="self-start">
              Guardar fechas
            </Button>
          )}

          <Field label="Objetivo del bloque">
            <Textarea
              className="min-h-16"
              placeholder="Objetivo de este bloque..."
              defaultValue={bloque.objetivo ?? ""}
              onBlur={(e) => onGuardarCampo("objetivo", e.target.value)}
            />
          </Field>

          {semanasOrdenadas.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
              <div className="text-xs font-medium text-[var(--color-text-muted)]">Semanas</div>
              {semanasOrdenadas.map((s) => (
                <div key={s.id} className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3">
                  <span className="text-xs text-[var(--color-text-muted)]">
                    Semana {s.semana} · {s.fecha_inicio} → {s.fecha_fin}
                  </span>
                  <Field label="Objetivo">
                    <Textarea
                      className="min-h-10 text-sm"
                      placeholder="Sin rellenar todavía..."
                      defaultValue={s.objetivo ?? ""}
                      onBlur={(e) => onGuardarSemana(s.id, "objetivo", e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Rival (opcional)">
                      <Input defaultValue={s.rival ?? ""} onBlur={(e) => onGuardarSemana(s.id, "rival", e.target.value)} />
                    </Field>
                    <Field label="Competición (opcional)">
                      <Input
                        defaultValue={s.competicion ?? ""}
                        onBlur={(e) => onGuardarSemana(s.id, "competicion", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
