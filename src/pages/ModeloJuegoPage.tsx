import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useEquipo } from "@/hooks/useEquipo";
import {
  useCalendarData,
  microcicloDeFecha,
  mesocicloDeMicrociclo,
  periodoDeMesociclo,
} from "@/hooks/useCalendarData";
import { PageHeader } from "@/components/layout/PageHeader";
import { toISODate } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { MesociclosRow, MicrociclosRow } from "@/types/database";

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatoFecha(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d, 10)} ${MESES_CORTO[parseInt(m, 10) - 1]}`;
}

function diasEntre(desdeISO: string, hastaISO: string): number {
  return Math.round(
    (new Date(hastaISO + "T00:00:00").getTime() - new Date(desdeISO + "T00:00:00").getTime()) / 86_400_000,
  );
}

type Rango = { inicio: string; fin: string; microciclos: MicrociclosRow[] };

/** Rango real de un mesociclo: min/max de fechas de sus propios microciclos (mesociclos no tienen fechas propias). */
function rangoDeMesociclo(mesocicloId: string, microciclos: MicrociclosRow[]): Rango | null {
  const propios = microciclos
    .filter((m) => m.mesociclo_id === mesocicloId && m.fecha_inicio && m.fecha_fin)
    .sort((a, b) => a.fecha_inicio!.localeCompare(b.fecha_inicio!));
  if (propios.length === 0) return null;
  const inicio = propios.reduce((min, m) => (m.fecha_inicio! < min ? m.fecha_inicio! : min), propios[0].fecha_inicio!);
  const fin = propios.reduce((max, m) => (m.fecha_fin! > max ? m.fecha_fin! : max), propios[0].fecha_fin!);
  return { inicio, fin, microciclos: propios };
}

type Estado = "cerrado" | "en_curso" | "planificado";

function estadoDeRango(hoyISO: string, rango: Rango): Estado {
  if (rango.fin < hoyISO) return "cerrado";
  if (rango.inicio > hoyISO) return "planificado";
  return "en_curso";
}

function progresoDeRango(hoyISO: string, rango: Rango, estado: Estado): number {
  if (estado === "cerrado") return 100;
  if (estado === "planificado") return 0;
  const total = diasEntre(rango.inicio, rango.fin);
  if (total <= 0) return 100;
  const transcurrido = diasEntre(rango.inicio, hoyISO);
  return Math.max(0, Math.min(100, Math.round((transcurrido / total) * 100)));
}

const BADGE_LABEL: Record<Estado, string> = {
  cerrado: "Cerrado",
  en_curso: "En curso",
  planificado: "Planificado",
};

export function ModeloJuegoPage() {
  const { equipo, equipoId } = useEquipo();
  const { periodos, mesociclos, microciclos, sesiones, cargando } = useCalendarData(equipoId);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const hoyISO = toISODate(new Date());

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }

  const mesociclosConRango = mesociclos
    .map((mesociclo) => ({ mesociclo, rango: rangoDeMesociclo(mesociclo.id, microciclos) }))
    .filter((x): x is { mesociclo: MesociclosRow; rango: Rango } => x.rango !== null)
    .sort((a, b) => a.rango.inicio.localeCompare(b.rango.inicio));

  const idEnCurso =
    mesociclosConRango.find((x) => estadoDeRango(hoyISO, x.rango) === "en_curso")?.mesociclo.id ?? null;

  function estaAbierto(id: string): boolean {
    if (abiertoId === "ninguno") return false;
    return (abiertoId ?? idEnCurso) === id;
  }
  function alternar(id: string) {
    setAbiertoId(estaAbierto(id) ? "ninguno" : id);
  }

  const microcicloHoy = microcicloDeFecha(microciclos, hoyISO);
  const mesocicloHoy = mesocicloDeMicrociclo(mesociclos, microcicloHoy);
  const periodoHoy = periodoDeMesociclo(periodos, mesocicloHoy);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Modelo de juego"
        title="Planificación"
        subtitle={`Temporada ${equipo?.temporada ?? ""} · ${mesociclos.length} mesociclos, ${microciclos.length} microciclos`}
      />

      {periodoHoy && mesocicloHoy && (
        <div className="-mt-2 text-sm text-[var(--color-text-muted)]">
          Ahora: {periodoHoy.nombre} · {mesocicloHoy.nombre}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {mesociclosConRango.map(({ mesociclo, rango }) => {
          const periodo = periodoDeMesociclo(periodos, mesociclo);
          const estado = estadoDeRango(hoyISO, rango);
          const progreso = progresoDeRango(hoyISO, rango, estado);
          const abierto = estaAbierto(mesociclo.id);
          const oscuro = estado === "en_curso";

          return (
            <div
              key={mesociclo.id}
              className={cn(
                "overflow-hidden rounded-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_10px_24px_-18px_rgba(0,0,0,0.35)]",
                oscuro ? "bg-[var(--color-ink)]" : "bg-white",
              )}
            >
              <button
                onClick={() => alternar(mesociclo.id)}
                className="w-full px-[17px] pb-[17px] pt-4 text-left"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-[6px] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em]",
                        oscuro
                          ? "bg-[var(--color-accent)]/16 text-[var(--color-accent)]"
                          : estado === "planificado"
                            ? "bg-[var(--color-card-hover)] text-[var(--color-ink)]"
                            : "bg-[var(--color-card-hover)] text-[var(--color-text-faint)]",
                      )}
                    >
                      {BADGE_LABEL[estado]}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-[0.1em]",
                        oscuro ? "text-white/55" : "text-[var(--color-text-muted)]",
                      )}
                    >
                      {mesociclo.nombre}
                    </span>
                  </div>
                  <ChevronDown
                    size={17}
                    className={cn(
                      "shrink-0 transition-transform",
                      abierto && "rotate-180",
                      oscuro ? "text-white/55" : "text-[var(--color-text-muted)]",
                    )}
                  />
                </div>

                <div
                  className={cn(
                    "mt-2.5 text-[19px] font-semibold leading-[1.15] tracking-[-0.01em]",
                    oscuro ? "text-white" : "text-[var(--color-ink)]",
                  )}
                >
                  {periodo?.nombre ?? mesociclo.nombre}
                </div>
                <div className={cn("mt-1 text-xs", oscuro ? "text-white/55" : "text-[var(--color-text-muted)]")}>
                  {formatoFecha(rango.inicio)} – {formatoFecha(rango.fin)} · {rango.microciclos.length} microciclos
                </div>

                <div className="mt-3 flex items-center gap-2.5">
                  <div
                    className={cn(
                      "h-[5px] flex-1 overflow-hidden rounded-full",
                      oscuro ? "bg-white/14" : "bg-[var(--color-card-hover)]",
                    )}
                  >
                    <div
                      className={cn("h-full rounded-full", oscuro ? "bg-[var(--color-accent)]" : "bg-[var(--color-ink)]")}
                      style={{ width: `${progreso}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "font-display shrink-0 text-xs font-semibold tracking-[0.04em]",
                      oscuro ? "text-white/55" : "text-[var(--color-text-muted)]",
                    )}
                  >
                    {progreso}%
                  </span>
                </div>
              </button>

              {abierto && (
                <div className="px-[17px] pb-[18px]">
                  {mesociclo.objetivo && (
                    <div>
                      <div
                        className={cn(
                          "mb-2 text-[9px] font-semibold uppercase tracking-[0.16em]",
                          oscuro ? "text-white/55" : "text-[var(--color-text-muted)]",
                        )}
                      >
                        Objetivo del mesociclo
                      </div>
                      <p className={cn("text-sm leading-relaxed", oscuro ? "text-white" : "text-[var(--color-text)]")}>
                        {mesociclo.objetivo}
                      </p>
                    </div>
                  )}

                  <div
                    className={cn(
                      "mb-2 text-[9px] font-semibold uppercase tracking-[0.16em]",
                      mesociclo.objetivo ? "mt-5" : "",
                      oscuro ? "text-white/55" : "text-[var(--color-text-muted)]",
                    )}
                  >
                    Microciclos
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {rango.microciclos.map((microciclo) => {
                      const sesionesSemana = sesiones.filter((s) => s.microciclo_id === microciclo.id);
                      const realizadas = sesionesSemana.filter((s) => s.estado === "realizada").length;
                      const esPasado = microciclo.fecha_fin! < hoyISO;
                      const esAhora = microciclo.fecha_inicio! <= hoyISO && hoyISO <= microciclo.fecha_fin!;
                      return (
                        <div
                          key={microciclo.id}
                          className={cn(
                            "flex items-start gap-[11px] rounded-xl px-[13px] py-3",
                            oscuro ? "bg-white/8" : "bg-[var(--color-card-hover)]",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full",
                              esAhora ? "bg-[var(--color-accent)]" : esPasado ? "bg-[#c4c4cc]" : "bg-black/15",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span
                                className={cn(
                                  "font-display text-[13px] font-bold tracking-[0.04em]",
                                  oscuro ? "text-white" : "text-[var(--color-text)]",
                                )}
                              >
                                M{microciclo.semana}
                              </span>
                              <span
                                className={cn(
                                  "text-[13px] font-semibold",
                                  oscuro ? "text-white" : "text-[var(--color-text)]",
                                )}
                              >
                                Semana {microciclo.semana}
                              </span>
                            </div>
                            {microciclo.objetivo && (
                              <p
                                className={cn(
                                  "mt-1 text-xs leading-snug",
                                  oscuro ? "text-white/75" : "text-[var(--color-text-muted)]",
                                )}
                              >
                                {microciclo.objetivo}
                              </p>
                            )}
                            {sesionesSemana.length > 0 && (
                              <div
                                className={cn(
                                  "mt-1.5 text-[11px]",
                                  oscuro ? "text-white/55" : "text-[var(--color-text-muted)]",
                                )}
                              >
                                {realizadas}/{sesionesSemana.length} sesiones
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {mesociclosConRango.length === 0 && (
          <div className="card-surface p-6 text-center text-sm text-[var(--color-text-muted)]">
            Este equipo todavía no tiene una temporada configurada — hazlo desde Ajustes.
          </div>
        )}
      </div>
    </div>
  );
}
