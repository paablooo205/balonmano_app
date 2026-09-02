import type { Insight } from "@/lib/insights";

/**
 * Tarjeta de solo lectura con las frases generadas por `generarInsights` —
 * si no hay ninguna que supere el umbral mínimo de muestra, no se
 * renderiza nada (mismo criterio que el bloque de "Problemas
 * detectados"/"Notas adicionales" en FichaTecnica.tsx: nunca un hueco
 * vacío avisando de que no hay datos).
 */
export function InsightsCard({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="card-surface p-4">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">
        Patrones detectados
      </div>
      <ul className="flex flex-col gap-2.5">
        {insights.map((insight, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]" />
            <span>{insight.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
