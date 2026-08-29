import { MESES, getMonthGrid, toISODate } from "@/lib/calendar";
import type { PartidosRow, SesionesRow } from "@/types/database";
import { cn } from "@/lib/utils";

export function YearView({
  year,
  sesiones,
  partidos,
  onSelectMonth,
}: {
  year: number;
  sesiones: SesionesRow[];
  partidos: PartidosRow[];
  onSelectMonth: (month: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {MESES.map((nombre, month) => {
        const dias = getMonthGrid(year, month)
          .flat()
          .filter((d) => d.getMonth() === month);
        const isoSet = new Set(dias.map(toISODate));
        const nSesiones = sesiones.filter((s) => isoSet.has(s.fecha)).length;
        const nPartidos = partidos.filter((p) => isoSet.has(p.fecha)).length;

        return (
          <button
            key={month}
            onClick={() => onSelectMonth(month)}
            className={cn(
              "card-surface flex flex-col items-start gap-1 p-4 text-left transition-colors hover:border-[var(--color-accent)]",
            )}
          >
            <span className="font-semibold">{nombre}</span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {nSesiones} sesiones · {nPartidos} partidos
            </span>
          </button>
        );
      })}
    </div>
  );
}
