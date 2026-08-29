import { DIAS_SEMANA, getWeekDates, isSameDay, toISODate } from "@/lib/calendar";
import { microcicloDeFecha } from "@/hooks/useCalendarData";
import type { DiaSemana, HorarioRecurrenteRow, MicrociclosRow, PartidosRow, SesionesRow } from "@/types/database";
import { cn } from "@/lib/utils";
import { Dumbbell, Trophy } from "lucide-react";

export function WeekView({
  anchor,
  horario,
  microciclos,
  sesiones,
  partidos,
  onSelectDay,
}: {
  anchor: Date;
  horario: HorarioRecurrenteRow[];
  microciclos: MicrociclosRow[];
  sesiones: SesionesRow[];
  partidos: PartidosRow[];
  onSelectDay: (d: Date) => void;
}) {
  const dias = getWeekDates(anchor);
  const today = new Date();

  return (
    <div className="flex flex-col gap-2">
      {dias.map((d) => {
        const iso = toISODate(d);
        const esHoy = isSameDay(d, today);
        const sesionesDia = sesiones.filter((s) => s.fecha === iso);
        const partidosDia = partidos.filter((p) => p.fecha === iso);
        const micro = microcicloDeFecha(microciclos, iso);
        const slotHorario = horario.find((h) => h.dia_semana === (d.getDay() as DiaSemana));

        return (
          <button
            key={iso}
            onClick={() => onSelectDay(d)}
            className={cn(
              "card-surface flex items-center gap-3 p-3 text-left transition-colors hover:border-[var(--color-accent)]",
              esHoy && "border-[var(--color-accent)]",
            )}
          >
            <div className="flex w-14 shrink-0 flex-col items-center">
              <span className="text-xs text-[var(--color-text-muted)]">{DIAS_SEMANA[d.getDay()].slice(0, 3)}</span>
              <span className="text-lg font-semibold">{d.getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              {sesionesDia.map((s) => (
                <div key={s.id} className="flex items-center gap-1.5 text-sm">
                  <Dumbbell size={14} className="shrink-0 text-[var(--color-accent)]" />
                  <span className="truncate capitalize">{s.estado}</span>
                </div>
              ))}
              {partidosDia.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5 text-sm">
                  <Trophy size={14} className="shrink-0 text-[var(--color-accent)]" />
                  <span className="truncate">vs {p.rival}</span>
                </div>
              ))}
              {sesionesDia.length === 0 && partidosDia.length === 0 && slotHorario && (
                <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
                  <Dumbbell size={14} className="shrink-0" />
                  <span className="truncate">
                    Entrenamiento · {slotHorario.hora_inicio.slice(0, 5)}–{slotHorario.hora_fin.slice(0, 5)}
                  </span>
                </div>
              )}
              {sesionesDia.length === 0 && partidosDia.length === 0 && !slotHorario && (
                <span className="text-sm text-[var(--color-text-muted)]">
                  {micro ? `Semana ${micro.semana}` : "Sin planificar"}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
