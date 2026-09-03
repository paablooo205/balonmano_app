import { useEffect, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { AsistenciaRow, JugadoresRow, MotivoAusencia } from "@/types/database";

const MOTIVOS: { value: MotivoAusencia; label: string; color: string }[] = [
  { value: "justificado", label: "Justificado", color: "var(--color-warning)" },
  { value: "injustificado", label: "Injustificado", color: "var(--color-accent)" },
  { value: "lesion", label: "Lesión", color: "var(--color-text-muted)" },
];

/** Solo tiene sentido en partidos — "no convocado" no es un motivo de falta
 * a un entrenamiento, es una decisión del entrenador tomada antes de jugar. */
const MOTIVO_NO_CONVOCADO: { value: MotivoAusencia; label: string; color: string } = {
  value: "no_convocado",
  label: "No convocado",
  color: "var(--color-ink)",
};

/**
 * Checklist de asistencia para un entrenamiento o partido concreto (columna +
 * id de destino). Se usa tanto desde la pantalla de detalle de sesión
 * ("Pasar lista de asistencia") como desde la tarjeta de partido del
 * calendario, para que el registro sea siempre el mismo por debajo.
 */
export function AsistenciaChecklist({
  equipoId,
  sesionId,
  partidoId,
}: {
  equipoId: string;
  sesionId?: string | null;
  partidoId?: string | null;
}) {
  const columna: "sesion_id" | "partido_id" = sesionId ? "sesion_id" : "partido_id";
  const targetId = sesionId ?? partidoId ?? null;

  const [jugadores, setJugadores] = useState<JugadoresRow[]>([]);
  const [asistencias, setAsistencias] = useState<AsistenciaRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const [faltasPorJugador, setFaltasPorJugador] = useState<
    Record<string, { faltas: number; total: number }>
  >({});

  useEffect(() => {
    if (!targetId) return;
    let activo = true;
    setCargando(true);
    (async () => {
      const [j, a] = await Promise.all([
        supabase.from("jugadores").select("*").eq("equipo_id", equipoId).order("nombre"),
        supabase.from("asistencia").select("*").eq(columna, targetId),
      ]);
      if (!activo) return;
      setJugadores(j.data ?? []);
      setAsistencias(a.data ?? []);
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, [equipoId, columna, targetId]);

  // Faltas por jugador/a en toda la temporada (contexto, aunque se esté
  // pasando lista de un único entrenamiento).
  useEffect(() => {
    supabase
      .from("asistencia")
      .select("jugador_id, presente")
      .eq("equipo_id", equipoId)
      .not("sesion_id", "is", null)
      .then(({ data }) => {
        const resumen: Record<string, { faltas: number; total: number }> = {};
        for (const row of data ?? []) {
          const r = (resumen[row.jugador_id] ??= { faltas: 0, total: 0 });
          r.total += 1;
          if (!row.presente) r.faltas += 1;
        }
        setFaltasPorJugador(resumen);
      });
  }, [equipoId, asistencias]);

  async function marcar(jugadorId: string, presente: boolean, motivo_ausencia: MotivoAusencia | null = null) {
    if (!targetId) return;
    const existente = asistencias.find((a) => a.jugador_id === jugadorId);
    // "Llegó tarde" es un eje independiente del de ausencia, pero solo tiene
    // sentido si el jugador está presente — al marcar ausente se resetea,
    // igual que exige la restricción asistencia_llego_tarde_solo_presente.
    const llego_tarde = presente ? (existente?.llego_tarde ?? false) : false;
    if (existente) {
      const { error } = await supabase
        .from("asistencia")
        .update({ presente, motivo_ausencia, llego_tarde })
        .eq("id", existente.id);
      if (error) {
        alert("No se pudo guardar: " + error.message);
        return;
      }
      setAsistencias((as) => as.map((a) => (a.id === existente.id ? { ...a, presente, motivo_ausencia, llego_tarde } : a)));
    } else {
      const payload = {
        equipo_id: equipoId,
        jugador_id: jugadorId,
        sesion_id: columna === "sesion_id" ? targetId : null,
        partido_id: columna === "partido_id" ? targetId : null,
        presente,
        motivo_ausencia,
        llego_tarde,
      };
      const { data, error } = await supabase.from("asistencia").insert(payload).select("*").single();
      if (error || !data) {
        alert("No se pudo guardar: " + error?.message);
        return;
      }
      setAsistencias((as) => [...as, data]);
    }
  }

  /** Toggle rápido, independiente del de presente/ausente — solo se llama
   * cuando ya existe un registro con presente=true (el botón no se muestra
   * si no). */
  async function marcarLlegoTarde(jugadorId: string, llego_tarde: boolean) {
    const existente = asistencias.find((a) => a.jugador_id === jugadorId);
    if (!existente) return;
    const { error } = await supabase.from("asistencia").update({ llego_tarde }).eq("id", existente.id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setAsistencias((as) => as.map((a) => (a.id === existente.id ? { ...a, llego_tarde } : a)));
  }

  async function guardarNota(jugadorId: string, nota: string) {
    const existente = asistencias.find((a) => a.jugador_id === jugadorId);
    if (!existente) return;
    const notas_adicionales = nota.trim() || null;
    const { error } = await supabase.from("asistencia").update({ notas_adicionales }).eq("id", existente.id);
    if (error) {
      alert("No se pudo guardar la nota: " + error.message);
      return;
    }
    setAsistencias((as) => as.map((a) => (a.id === existente.id ? { ...a, notas_adicionales } : a)));
  }

  if (!targetId) return null;

  if (cargando) {
    return <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">Cargando...</div>;
  }

  if (jugadores.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">
        Da de alta jugadores/as primero.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {jugadores.map((j) => {
        const registro = asistencias.find((a) => a.jugador_id === j.id);
        const resumen = faltasPorJugador[j.id];
        const notaVisible = notaAbierta === j.id;
        return (
          <div key={j.id} className="card-surface p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{j.nombre}</div>
                <div className="truncate text-xs text-[var(--color-text-muted)]">
                  {j.dorsal != null && <span>Dorsal {j.dorsal} · </span>}
                  {resumen
                    ? `${resumen.faltas} falta${resumen.faltas === 1 ? "" : "s"} de ${resumen.total}`
                    : "Sin registros todavía"}
                  {registro?.presente && registro.llego_tarde && (
                    <span className="font-medium text-[var(--color-warning)]"> · Llegó tarde</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs font-medium text-[var(--color-text-muted)]">
                  {registro?.presente === true
                    ? "Presente"
                    : registro?.presente === false
                      ? "Ausente"
                      : "—"}
                </span>
                <Switch
                  checked={registro?.presente === true}
                  onChange={(presente) => marcar(j.id, presente, presente ? null : registro?.motivo_ausencia ?? null)}
                  label={registro?.presente ? "Marcar ausente" : "Marcar presente"}
                />
                {registro?.presente === true && (
                  <button
                    onClick={() => marcarLlegoTarde(j.id, !registro.llego_tarde)}
                    aria-label={registro.llego_tarde ? "Quitar llegada tarde" : "Marcar llegada tarde"}
                    aria-pressed={registro.llego_tarde}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] border transition-colors",
                      registro.llego_tarde
                        ? "border-[var(--color-warning)] bg-[var(--color-warning)] text-white"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-warning)] hover:text-[var(--color-warning)]",
                    )}
                  >
                    <Clock size={16} />
                  </button>
                )}
                {registro && (
                  <button
                    onClick={() => setNotaAbierta(notaVisible ? null : j.id)}
                    className="flex h-9 w-6 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                    aria-label="Nota"
                  >
                    <ChevronDown size={16} className={cn("transition-transform", notaVisible && "rotate-180")} />
                  </button>
                )}
              </div>
            </div>
            {registro?.presente === false && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(columna === "partido_id" ? [...MOTIVOS, MOTIVO_NO_CONVOCADO] : MOTIVOS).map((m) => {
                  const activo = registro.motivo_ausencia === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => marcar(j.id, false, activo ? null : m.value)}
                      className="rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors"
                      style={
                        activo
                          ? { backgroundColor: m.color, borderColor: m.color, color: "#fff" }
                          : { borderColor: "var(--color-border)", color: m.color }
                      }
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}
            {notaVisible && registro && (
              <Textarea
                className="mt-2 min-h-14 text-sm"
                placeholder="Nota (ej. avisó con antelación, lesión...)"
                defaultValue={registro.notas_adicionales ?? ""}
                onBlur={(e) => guardarNota(j.id, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
