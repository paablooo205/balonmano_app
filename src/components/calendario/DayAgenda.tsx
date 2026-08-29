import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Dumbbell, Trophy, Circle, CheckCircle2, XCircle, ChevronRight, ClipboardCheck, ChevronDown } from "lucide-react";
import { SesionModal } from "./SesionModal";
import { PartidoModal } from "./PartidoModal";
import { EntrenamientoInfo } from "./EntrenamientoInfo";
import { AsistenciaChecklist } from "@/components/equipo/AsistenciaChecklist";
import { Badge } from "@/components/ui/badge";
import { toISODate } from "@/lib/calendar";
import { crearSesionRapida } from "@/lib/sesiones";
import { microcicloDeFecha, mesocicloDeMicrociclo, periodoDeMesociclo } from "@/hooks/useCalendarData";
import type {
  DiaSemana,
  HorarioRecurrenteRow,
  MesociclosRow,
  MicrociclosRow,
  PartidosRow,
  PeriodosRow,
  SesionesRow,
} from "@/types/database";

const ESTADO_ICON = {
  planificada: Circle,
  realizada: CheckCircle2,
  cancelada: XCircle,
};

export function DayAgenda({
  fecha,
  equipoId,
  horario,
  periodos,
  mesociclos,
  microciclos,
  sesiones,
  partidos,
  onChanged,
  permitirAltaPartido = true,
}: {
  fecha: Date;
  equipoId: string;
  horario: HorarioRecurrenteRow[];
  periodos: PeriodosRow[];
  mesociclos: MesociclosRow[];
  microciclos: MicrociclosRow[];
  sesiones: SesionesRow[];
  partidos: PartidosRow[];
  onChanged: () => void;
  /** Dar de alta un partido nuevo solo debe poder hacerse desde Calendario; uno ya existente se ve siempre. */
  permitirAltaPartido?: boolean;
}) {
  const navigate = useNavigate();
  const fechaISO = toISODate(fecha);
  const diaSemana = fecha.getDay() as DiaSemana;
  const microciclo = microcicloDeFecha(microciclos, fechaISO);
  const mesociclo = mesocicloDeMicrociclo(mesociclos, microciclo);
  const periodo = periodoDeMesociclo(periodos, mesociclo);

  const sesionesDelDia = sesiones.filter((s) => s.fecha === fechaISO);
  const partidosDelDia = partidos.filter((p) => p.fecha === fechaISO);
  const slotHorario = horario.find((h) => h.dia_semana === diaSemana);
  const duracionSugerida = slotHorario ? diffMinutos(slotHorario.hora_inicio, slotHorario.hora_fin) : null;

  const [sesionEditando, setSesionEditando] = useState<SesionesRow | "nueva" | null>(null);
  const [partidoEditando, setPartidoEditando] = useState<PartidosRow | "nuevo" | null>(null);
  const [asistenciaAbiertaId, setAsistenciaAbiertaId] = useState<string | null>(null);
  const [creandoSesion, setCreandoSesion] = useState(false);

  function cerrarSubmodales() {
    setSesionEditando(null);
    setPartidoEditando(null);
  }
  function alGuardarSubmodal() {
    cerrarSubmodales();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <EntrenamientoInfo microciclo={microciclo} mesociclo={mesociclo} periodo={periodo} />

      <div>
        <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)]">
          <Dumbbell size={16} /> Entrenamiento
        </span>

        {sesionesDelDia.map((s) => {
          const Icon = ESTADO_ICON[s.estado];
          return (
            <button
              key={s.id}
              onClick={() => navigate(`/equipos/${equipoId}/sesion/${s.id}`)}
              className="card-surface mb-2 flex w-full items-stretch overflow-hidden p-0 text-left"
            >
              <div className="w-[5px] shrink-0 bg-[var(--color-ink)]" />
              <div className="flex flex-1 items-center gap-3 p-3">
                <Icon size={18} className="shrink-0 text-[var(--color-ink)]" />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium">
                    {microciclo?.objetivo ||
                      mesociclo?.objetivo ||
                      s.bloques.find((b) => b.objetivo)?.objetivo ||
                      mesociclo?.nombre || <span className="capitalize">{s.estado}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {s.duracion_min && <Badge>{s.duracion_min} min</Badge>}
                    <Badge>{s.bloques.length} bloque(s)</Badge>
                  </div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-[var(--color-text-muted)]" />
              </div>
            </button>
          );
        })}

        {/* Día con horario recurrente pero sin sesión creada todavía: el entreno
            "existe" igual — marcar como planificada es opcional — así que se
            muestra con los mismos detalles; al tocarlo se crea la fila sola. */}
        {sesionesDelDia.length === 0 && slotHorario && (
          <button
            disabled={creandoSesion}
            onClick={async () => {
              setCreandoSesion(true);
              try {
                const nueva = await crearSesionRapida({
                  equipoId,
                  fecha: fechaISO,
                  diaSemana,
                  microcicloId: microciclo?.id ?? null,
                  duracionMin: duracionSugerida,
                });
                navigate(`/equipos/${equipoId}/sesion/${nueva.id}`);
              } catch (err) {
                alert("No se pudo abrir el entrenamiento: " + (err as Error).message);
              } finally {
                setCreandoSesion(false);
              }
            }}
            className="card-surface mb-2 flex w-full items-stretch overflow-hidden p-0 text-left disabled:opacity-60"
          >
            <div className="w-[5px] shrink-0 bg-[var(--color-ink)]" />
            <div className="flex flex-1 items-center gap-3 p-3">
              <Circle size={18} className="shrink-0 text-[var(--color-ink)]" />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-medium">
                  {microciclo?.objetivo || mesociclo?.objetivo || mesociclo?.nombre || "Entrenamiento"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge>{slotHorario.hora_inicio.slice(0, 5)}</Badge>
                  {duracionSugerida && <Badge>{duracionSugerida} min</Badge>}
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-[var(--color-text-muted)]" />
            </div>
          </button>
        )}

        {sesionesDelDia.length === 0 && !slotHorario && (
          <button
            onClick={() => setSesionEditando("nueva")}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] p-3 text-left text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <Plus size={16} />
            Añadir sesión (día sin horario fijo)
          </button>
        )}
      </div>

      {(partidosDelDia.length > 0 || permitirAltaPartido) && (
        <div>
          <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)]">
            <Trophy size={16} /> Partido
          </span>
          {partidosDelDia.map((p) => (
            <div key={p.id} className="mb-2 flex flex-col gap-2">
              <button
                onClick={() => navigate(`/equipos/${equipoId}/partido/${p.id}`)}
                className="card-surface flex w-full items-stretch overflow-hidden p-0 text-left"
              >
                <div className="w-[5px] shrink-0 bg-[var(--color-accent)]" />
                <div className="flex flex-1 items-center justify-between gap-3 p-3">
                  <div>
                    <div className="text-sm font-medium">vs {p.rival}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge>{p.competicion ?? "Amistoso"}</Badge>
                      {p.casa_fuera && <Badge>{p.casa_fuera}</Badge>}
                    </div>
                  </div>
                  {p.resultado && <span className="stat-number text-lg">{p.resultado}</span>}
                </div>
              </button>

              <div className="rounded-lg border border-[var(--color-border)] p-3">
                <button
                  onClick={() => setAsistenciaAbiertaId((id) => (id === p.id ? null : p.id))}
                  className="flex w-full items-center justify-between text-left text-sm font-medium text-[var(--color-text-muted)]"
                >
                  <span className="flex items-center gap-1.5">
                    <ClipboardCheck size={16} /> Asistencia
                  </span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform ${asistenciaAbiertaId === p.id ? "rotate-180" : ""}`}
                  />
                </button>
                {asistenciaAbiertaId === p.id && (
                  <div className="mt-3">
                    <AsistenciaChecklist equipoId={equipoId} partidoId={p.id} />
                  </div>
                )}
              </div>
            </div>
          ))}
          {permitirAltaPartido && (
            <button
              onClick={() => setPartidoEditando("nuevo")}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] p-3 text-left text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              <Plus size={16} /> Añadir partido
            </button>
          )}
        </div>
      )}

      {sesionEditando !== null && (
        <SesionModal
          open
          onClose={cerrarSubmodales}
          equipoId={equipoId}
          microcicloId={microciclo?.id ?? null}
          fecha={fechaISO}
          diaSemana={diaSemana}
          duracionSugerida={duracionSugerida}
          sesion={sesionEditando === "nueva" ? null : sesionEditando}
          onSaved={alGuardarSubmodal}
          onDeleted={alGuardarSubmodal}
        />
      )}

      {partidoEditando !== null && (
        <PartidoModal
          open
          onClose={cerrarSubmodales}
          equipoId={equipoId}
          microcicloId={microciclo?.id ?? null}
          fecha={fechaISO}
          partido={partidoEditando === "nuevo" ? null : partidoEditando}
          onSaved={alGuardarSubmodal}
          onDeleted={alGuardarSubmodal}
        />
      )}
    </div>
  );
}

function diffMinutos(inicio: string, fin: string): number {
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}
