import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Settings2, Plus } from "lucide-react";
import { useEquipo } from "@/hooks/useEquipo";
import { useCalendarData, microcicloDeFecha, mesocicloDeMicrociclo } from "@/hooks/useCalendarData";
import { HorarioSetup } from "@/components/calendario/HorarioSetup";
import { SesionModal } from "@/components/calendario/SesionModal";
import { WeekView } from "@/components/calendario/WeekView";
import { YearView } from "@/components/calendario/YearView";
import { DayAgenda } from "@/components/calendario/DayAgenda";
import { crearSesionRapida } from "@/lib/sesiones";
import { DIAS_SEMANA, DIAS_SEMANA_CORTO, MESES, addDays, getMonthGrid, isSameDay, startOfWeek, toISODate } from "@/lib/calendar";
import type { DiaSemana, HorarioRecurrenteRow, MesociclosRow, MicrociclosRow, PartidosRow, SesionesRow } from "@/types/database";

type Vista = "año" | "mes" | "semana" | "día";
const VISTAS: Vista[] = ["año", "mes", "semana", "día"];

export function CalendarioPage() {
  const { equipo, equipoId } = useEquipo();
  const navigate = useNavigate();
  const { horario, periodos, mesociclos, microciclos, sesiones, partidos, cargando, recargar } =
    useCalendarData(equipoId);
  const [vista, setVista] = useState<Vista>("mes");
  const [cursor, setCursor] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState(new Date());
  const [editandoHorario, setEditandoHorario] = useState(false);

  function irADia(fecha: Date) {
    navigate(`/equipos/${equipoId}/calendario/${toISODate(fecha)}`);
  }

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }

  if (horario.length === 0 && !editandoHorario) {
    return <HorarioSetup equipoId={equipoId} existente={horario} onListo={recargar} />;
  }
  if (editandoHorario) {
    return (
      <HorarioSetup
        equipoId={equipoId}
        existente={horario}
        onListo={() => {
          setEditandoHorario(false);
          recargar();
        }}
        onCancelar={() => setEditandoHorario(false)}
      />
    );
  }

  function mover(delta: number) {
    setCursor((c) => {
      const copia = new Date(c);
      if (vista === "año") copia.setFullYear(copia.getFullYear() + delta);
      else if (vista === "mes") {
        copia.setMonth(copia.getMonth() + delta);
        setDiaSeleccionado(new Date(copia.getFullYear(), copia.getMonth(), 1));
      } else if (vista === "semana") return addDays(c, delta * 7);
      else return addDays(c, delta);
      return copia;
    });
  }

  const tituloRango =
    vista === "año"
      ? String(cursor.getFullYear())
      : vista === "semana"
        ? `Semana del ${startOfWeek(cursor).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`
        : cursor.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="tab-pill-group flex-1">
          {VISTAS.map((v) => (
            <button key={v} onClick={() => setVista(v)} data-active={vista === v} className="tab-pill capitalize">
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditandoHorario(true)}
          className="flex shrink-0 items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          <Settings2 size={16} /> Horario
        </button>
      </div>

      {vista === "mes" ? (
        <MesConDiaSeleccionado
          equipoNombre={equipo?.nombre}
          equipoId={equipoId}
          cursor={cursor}
          onMover={mover}
          diaSeleccionado={diaSeleccionado}
          onSeleccionarDia={setDiaSeleccionado}
          horario={horario}
          sesiones={sesiones}
          partidos={partidos}
          microciclos={microciclos}
          mesociclos={mesociclos}
          onChanged={recargar}
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button
              aria-label="Periodo anterior"
              onClick={() => mover(-1)}
              className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-medium capitalize">{tituloRango}</span>
            <button
              aria-label="Periodo siguiente"
              onClick={() => mover(1)}
              className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {vista === "año" && (
            <YearView
              year={cursor.getFullYear()}
              sesiones={sesiones}
              partidos={partidos}
              onSelectMonth={(m) => {
                setCursor(new Date(cursor.getFullYear(), m, 1));
                setVista("mes");
              }}
            />
          )}

          {vista === "semana" && (
            <WeekView
              anchor={cursor}
              horario={horario}
              microciclos={microciclos}
              sesiones={sesiones}
              partidos={partidos}
              onSelectDay={irADia}
            />
          )}

          {vista === "día" && (
            <div className="card-surface p-4">
              <DayAgenda
                fecha={cursor}
                equipoId={equipoId}
                horario={horario}
                periodos={periodos}
                mesociclos={mesociclos}
                microciclos={microciclos}
                sesiones={sesiones}
                partidos={partidos}
                onChanged={recargar}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Mes + día seleccionado en una sola pantalla continua — cabecera oscura del
 * mes, grid del mes en blanco pegado debajo, y lista de eventos del día
 * seleccionado más abajo. Calcado del prototipo de Claude Design
 * (Balonmano Club.dc.html, estado `isCal`).
 */
function MesConDiaSeleccionado({
  equipoNombre,
  equipoId,
  cursor,
  onMover,
  diaSeleccionado,
  onSeleccionarDia,
  horario,
  sesiones,
  partidos,
  microciclos,
  mesociclos,
  onChanged,
}: {
  equipoNombre?: string;
  equipoId: string;
  cursor: Date;
  onMover: (delta: number) => void;
  diaSeleccionado: Date;
  onSeleccionarDia: (d: Date) => void;
  horario: HorarioRecurrenteRow[];
  sesiones: SesionesRow[];
  partidos: PartidosRow[];
  microciclos: MicrociclosRow[];
  mesociclos: MesociclosRow[];
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const semanas = getMonthGrid(cursor.getFullYear(), cursor.getMonth());
  const [sesionEditando, setSesionEditando] = useState<SesionesRow | "nueva" | null>(null);
  const [creandoSesion, setCreandoSesion] = useState(false);

  function horaEntrenamiento(fecha: Date) {
    const slot = horario.find((h) => h.dia_semana === (fecha.getDay() as DiaSemana));
    return slot ? slot.hora_inicio.slice(0, 5) : null;
  }

  const iso = toISODate(diaSeleccionado);
  const diaSemana = diaSeleccionado.getDay() as DiaSemana;
  const sesionesDelDia = sesiones.filter((s) => s.fecha === iso);
  const partidosDelDia = partidos.filter((p) => p.fecha === iso);
  const slotHorario = horario.find((h) => h.dia_semana === diaSemana);
  const microciclo = microcicloDeFecha(microciclos, iso);
  const mesociclo = mesocicloDeMicrociclo(mesociclos, microciclo);
  const duracionSugerida = slotHorario
    ? diffMinutos(slotHorario.hora_inicio, slotHorario.hora_fin)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl">
        {/* Cabecera oscura del mes */}
        <div className="bg-[var(--color-ink)] px-5 pb-6 pt-5">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="hero-eyebrow">{equipoNombre ?? "Coras"}</div>
              <div className="hero-title">{MESES[cursor.getMonth()]}</div>
            </div>
            <div className="flex items-center gap-2 pb-[3px]">
              <button aria-label="Mes anterior" onClick={() => onMover(-1)} className="text-white/50 hover:text-white">
                <ChevronLeft size={16} />
              </button>
              <span
                className="text-[13px] font-semibold tracking-[0.14em] text-white/50"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {cursor.getFullYear()}
              </span>
              <button aria-label="Mes siguiente" onClick={() => onMover(1)} className="text-white/50 hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="mt-3.5 flex gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--color-accent)]" />
              <span className="text-[11px] font-medium text-white/62">Partido</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-white" />
              <span className="text-[11px] font-medium text-white/62">Entrenamiento</span>
            </div>
          </div>
        </div>

        {/* Grid del mes, en blanco, pegado a la cabecera */}
        <div className="border-b border-[rgba(0,0,0,.07)] bg-white px-3 pb-4 pt-3.5">
          <div className="mb-1.5 grid grid-cols-7 gap-0.5">
            {DIAS_SEMANA_CORTO.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a9aa2]">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {semanas.flat().map((d) => {
              const enMes = d.getMonth() === cursor.getMonth();
              if (!enMes) return <div key={toISODate(d)} />;
              const sel = isSameDay(d, diaSeleccionado);
              const iso2 = toISODate(d);
              const tieneSesion = sesiones.some((s) => s.fecha === iso2);
              const tienePartido = partidos.some((p) => p.fecha === iso2);
              const tieneHorario = horario.some((h) => h.dia_semana === (d.getDay() as DiaSemana));
              return (
                <button
                  key={iso2}
                  onClick={() => onSeleccionarDia(d)}
                  className="flex h-12 flex-col items-center justify-center gap-1 rounded-[11px]"
                  style={{ backgroundColor: sel ? "var(--color-ink)" : "transparent" }}
                >
                  <span
                    className="text-base font-semibold"
                    style={{
                      fontFamily: "var(--font-display)",
                      color: sel ? "#fff" : d.getDay() === 0 ? "#b4b4bc" : "#33333a",
                    }}
                  >
                    {d.getDate()}
                  </span>
                  <span className="flex h-1.5 items-center gap-0.5">
                    {tienePartido && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: sel ? "#fff" : "var(--color-accent)" }}
                      />
                    )}
                    {tieneSesion ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: sel ? "rgba(255,255,255,.55)" : "var(--color-ink)" }}
                      />
                    ) : (
                      tieneHorario &&
                      !sel && <span className="h-1.5 w-1.5 rounded-full border border-[var(--color-ink)]" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lista de eventos del día seleccionado */}
      <div className="flex flex-col gap-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8a92]">
          {DIAS_SEMANA[diaSeleccionado.getDay()].slice(0, 3)} {diaSeleccionado.getDate()} de{" "}
          {MESES[diaSeleccionado.getMonth()].toLowerCase()}
        </div>

        {partidosDelDia.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/equipos/${equipoId}/partido/${p.id}`)}
            className="card-surface flex items-stretch overflow-hidden p-0 text-left"
          >
            <div className="w-[5px] shrink-0 bg-[var(--color-accent)]" />
            <div className="flex-1 p-4">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                  Partido{p.competicion ? ` · ${p.competicion}` : ""}
                </span>
                {p.hora && <span className="stat-number text-xl">{p.hora.slice(0, 5)}</span>}
              </div>
              <div className="mt-1.5 text-[19px] font-semibold leading-tight">vs {p.rival}</div>
              <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                {p.casa_fuera === "casa" ? "En casa" : p.casa_fuera === "fuera" ? "Fuera" : "Sede por confirmar"}
                {p.resultado ? ` · ${p.resultado}` : ""}
              </div>
            </div>
          </button>
        ))}

        {sesionesDelDia.map((s) => {
          const hora = horaEntrenamiento(diaSeleccionado);
          const titulo = mesociclo?.objetivo || s.bloques.find((b) => b.objetivo)?.objetivo || mesociclo?.nombre || "Entrenamiento";
          return (
            <button
              key={s.id}
              onClick={() => navigate(`/equipos/${equipoId}/sesion/${s.id}`)}
              className="card-surface flex items-stretch overflow-hidden p-0 text-left"
            >
              <div className="w-[5px] shrink-0 bg-[var(--color-ink)]" />
              <div className="flex-1 p-4">
                <div className="flex items-center justify-between gap-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]">
                    Entrenamiento
                  </span>
                  {hora && <span className="stat-number text-xl">{hora}</span>}
                </div>
                <div className="mt-1.5 line-clamp-2 text-[19px] font-semibold leading-tight">{titulo}</div>
                <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                  {s.duracion_min ? `${s.duracion_min} min` : "Duración por definir"} · {s.bloques.length} bloque(s)
                </div>
              </div>
            </button>
          );
        })}

        {/* Día con horario recurrente configurado pero sin sesión creada todavía:
            el entreno "existe" igual — marcar como planificada es opcional para
            el entrenador — así que se muestra con los mismos detalles y, al
            tocarla, se crea la fila de forma transparente antes de navegar. */}
        {sesionesDelDia.length === 0 && slotHorario && (
          <button
            disabled={creandoSesion}
            onClick={async () => {
              setCreandoSesion(true);
              try {
                const nueva = await crearSesionRapida({
                  equipoId,
                  fecha: iso,
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
            className="card-surface flex items-stretch overflow-hidden p-0 text-left disabled:opacity-60"
          >
            <div className="w-[5px] shrink-0 bg-[var(--color-ink)]" />
            <div className="flex-1 p-4">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]">
                  Entrenamiento
                </span>
                <span className="stat-number text-xl">{slotHorario.hora_inicio.slice(0, 5)}</span>
              </div>
              <div className="mt-1.5 line-clamp-2 text-[19px] font-semibold leading-tight">
                {mesociclo?.objetivo || mesociclo?.nombre || "Entrenamiento"}
              </div>
              <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                {duracionSugerida ? `${duracionSugerida} min` : "Duración por definir"} · Horario habitual
              </div>
            </div>
          </button>
        )}

        {sesionesDelDia.length === 0 && !slotHorario && partidosDelDia.length === 0 && (
          <button
            onClick={() => setSesionEditando("nueva")}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-[13px] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <Plus size={16} />
            Día libre. Sin sesiones programadas.
          </button>
        )}
      </div>

      {sesionEditando !== null && (
        <SesionModal
          open
          onClose={() => setSesionEditando(null)}
          equipoId={equipoId}
          microcicloId={microciclo?.id ?? null}
          fecha={iso}
          diaSemana={diaSemana}
          duracionSugerida={duracionSugerida}
          sesion={sesionEditando === "nueva" ? null : sesionEditando}
          onSaved={() => {
            setSesionEditando(null);
            onChanged();
          }}
          onDeleted={() => {
            setSesionEditando(null);
            onChanged();
          }}
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
