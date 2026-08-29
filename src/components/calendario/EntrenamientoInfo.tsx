import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { contenidosDeMicrociclo, contenidosDePeriodo, tienePreparacionFisica } from "@/lib/microciclos";
import type { MesociclosRow, MicrociclosRow, PeriodosRow } from "@/types/database";

/**
 * Toda la info de planificación (periodo / mesociclo / microciclo) que le
 * corresponde a un día de entrenamiento, tal como viene del Excel de
 * temporada — se muestre o no todavía como sesión con bloques propios.
 */
export function EntrenamientoInfo({
  microciclo,
  mesociclo,
  periodo,
}: {
  microciclo: MicrociclosRow | null;
  mesociclo: MesociclosRow | null;
  periodo: PeriodosRow | null;
}) {
  const [desgloseAbierto, setDesgloseAbierto] = useState(false);
  const [periodoAbierto, setPeriodoAbierto] = useState(false);

  if (!microciclo) return null;

  const contenidos = contenidosDeMicrociclo(microciclo);
  const prepFisica = tienePreparacionFisica(microciclo);
  const contenidosPeriodo = periodo ? contenidosDePeriodo(periodo) : [];
  const contexto = [periodo?.nombre, microciclo.semana ? `Semana ${microciclo.semana}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      {contexto && (
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          {contexto}
        </div>
      )}

      {mesociclo && (
        <div>
          <div className="text-base font-semibold">{mesociclo.nombre}</div>
          {mesociclo.objetivo && (
            <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{mesociclo.objetivo}</p>
          )}
        </div>
      )}

      {(microciclo.competicion || microciclo.rival) && (
        <div className="text-sm text-[var(--color-text-muted)]">
          {microciclo.competicion}
          {microciclo.competicion && microciclo.rival ? " · " : ""}
          {microciclo.rival ? `vs ${microciclo.rival}` : ""}
        </div>
      )}

      {microciclo.objetivo && (
        <p className="text-sm text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text)]">Objetivo de la semana: </span>
          {microciclo.objetivo}
        </p>
      )}

      {(contenidos.length > 0 || prepFisica) && (
        <div className="flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3">
          <div className="text-xs font-medium text-[var(--color-text-muted)]">
            Contenidos de la semana
          </div>
          <div className="flex flex-col gap-1">
            {contenidos.map((cat) => (
              <div key={cat.key} className="text-sm">
                <span className="font-medium">{cat.label}: </span>
                <span className="text-[var(--color-text-muted)]">{cat.items.join(", ")}</span>
              </div>
            ))}
            {prepFisica && (
              <div className="text-sm">
                <span className="font-medium">Preparación física</span>
              </div>
            )}
          </div>
        </div>
      )}

      {mesociclo?.notas_adicionales && (
        <div className="border-t border-[var(--color-border)] pt-3">
          <button
            onClick={() => setDesgloseAbierto((v) => !v)}
            className="flex w-full items-center justify-between text-left text-sm font-medium text-[var(--color-accent)]"
          >
            Desglose técnico-táctico del mesociclo
            <ChevronDown
              size={16}
              className={`shrink-0 transition-transform ${desgloseAbierto ? "rotate-180" : ""}`}
            />
          </button>
          {desgloseAbierto && (
            <p className="mt-2 whitespace-pre-line text-sm text-[var(--color-text-muted)]">
              {mesociclo.notas_adicionales}
            </p>
          )}
        </div>
      )}

      {periodo && (periodo.objetivo_general || contenidosPeriodo.length > 0) && (
        <div className="border-t border-[var(--color-border)] pt-3">
          {periodo.objetivo_general && (
            <p className="mb-2 text-sm text-[var(--color-text-muted)]">
              <span className="font-medium text-[var(--color-text)]">Objetivo del periodo: </span>
              {periodo.objetivo_general}
            </p>
          )}

          {contenidosPeriodo.length > 0 && (
            <>
              <button
                onClick={() => setPeriodoAbierto((v) => !v)}
                className="flex w-full items-center justify-between text-left text-sm font-medium text-[var(--color-accent)]"
              >
                Contenido técnico-táctico del periodo
                <ChevronDown
                  size={16}
                  className={`shrink-0 transition-transform ${periodoAbierto ? "rotate-180" : ""}`}
                />
              </button>
              {periodoAbierto && (
                <div className="mt-2 flex flex-col gap-2">
                  {contenidosPeriodo.map((cat) => (
                    <div key={cat.key} className="text-sm">
                      <span className="font-medium">{cat.label}: </span>
                      <span className="whitespace-pre-line text-[var(--color-text-muted)]">{cat.texto}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
