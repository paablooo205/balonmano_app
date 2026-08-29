import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { addDays, startOfWeek, toISODate } from "@/lib/calendar";
import type { EquiposRow, MesociclosRow, MicrociclosRow } from "@/types/database";

type FaseForm = {
  key: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  objetivo_general: string;
  numMesociclos: number;
};

type MesocicloForm = {
  key: string;
  nombre: string;
  objetivo: string;
};

function nuevaClave(): string {
  return Math.random().toString(36).slice(2);
}

function faseVacia(): FaseForm {
  return { key: nuevaClave(), nombre: "", fecha_inicio: "", fecha_fin: "", objetivo_general: "", numMesociclos: 1 };
}

/** Semanas lunes-domingo que cubren [fechaInicio, fechaFin], alineadas con el resto del calendario. */
function semanasDeRango(fechaInicio: string, fechaFin: string): { fecha_inicio: string; fecha_fin: string }[] {
  const fin = new Date(fechaFin);
  const semanas: { fecha_inicio: string; fecha_fin: string }[] = [];
  let cursor = startOfWeek(new Date(fechaInicio));
  while (cursor <= fin) {
    semanas.push({ fecha_inicio: toISODate(cursor), fecha_fin: toISODate(addDays(cursor, 6)) });
    cursor = addDays(cursor, 7);
  }
  return semanas;
}

/**
 * Alta de la estructura de temporada (fases -> mesociclos -> microciclos) para
 * un equipo que todavía no tiene ninguna. Se muestra desde PlanificacionAjustes
 * en el hueco que hoy queda vacío cuando `periodos.length === 0`.
 */
export function AsistenteConfiguracionTemporada({
  equipoId,
  onCompletado,
}: {
  equipoId: string;
  onCompletado: () => void;
}) {
  const [paso, setPaso] = useState<"inicio" | "duplicar" | "fases" | "mesociclos">("inicio");
  const [fases, setFases] = useState<FaseForm[]>([faseVacia()]);
  const [mesociclosPorFase, setMesociclosPorFase] = useState<Record<string, MesocicloForm[]>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [equiposOrigen, setEquiposOrigen] = useState<EquiposRow[]>([]);
  const [equipoOrigenId, setEquipoOrigenId] = useState("");
  const [fechaInicioTemporada, setFechaInicioTemporada] = useState("");

  useEffect(() => {
    if (paso !== "duplicar") return;
    supabase
      .from("equipos")
      .select("*")
      .neq("id", equipoId)
      .order("nombre")
      .then(({ data }) => setEquiposOrigen(data ?? []));
  }, [paso, equipoId]);

  async function cargarDesdeOrigen() {
    if (!equipoOrigenId || !fechaInicioTemporada) return;
    const { data: periodosOrigen } = await supabase
      .from("periodos")
      .select("*")
      .eq("equipo_id", equipoOrigenId)
      .order("fecha_inicio");
    if (!periodosOrigen || periodosOrigen.length === 0) {
      setError("Ese equipo todavía no tiene fases configuradas.");
      return;
    }
    const { data: mesociclosOrigen } = await supabase
      .from("mesociclos")
      .select("*")
      .eq("equipo_id", equipoOrigenId);

    const primeraFecha = periodosOrigen.find((p) => p.fecha_inicio)?.fecha_inicio ?? null;
    const offsetDias = primeraFecha
      ? Math.round((new Date(fechaInicioTemporada).getTime() - new Date(primeraFecha).getTime()) / 86400000)
      : 0;

    const nuevasFases: FaseForm[] = periodosOrigen.map((p) => ({
      key: nuevaClave(),
      nombre: p.nombre,
      fecha_inicio: p.fecha_inicio ? toISODate(addDays(new Date(p.fecha_inicio), offsetDias)) : "",
      fecha_fin: p.fecha_fin ? toISODate(addDays(new Date(p.fecha_fin), offsetDias)) : "",
      objetivo_general: "",
      numMesociclos: (mesociclosOrigen ?? []).filter((m) => m.periodo_id === p.id).length || 1,
    }));
    setFases(nuevasFases);
    setError(null);
    setPaso("fases");
  }

  function actualizarFase(key: string, cambios: Partial<FaseForm>) {
    setFases((fs) => fs.map((f) => (f.key === key ? { ...f, ...cambios } : f)));
  }

  function añadirFase() {
    setFases((fs) => [...fs, faseVacia()]);
  }

  function quitarFase(key: string) {
    setFases((fs) => (fs.length > 1 ? fs.filter((f) => f.key !== key) : fs));
  }

  function validarFases(): string | null {
    if (fases.length === 0) return "Añade al menos una fase.";
    for (const f of fases) {
      if (!f.nombre.trim()) return "Todas las fases necesitan un nombre.";
      if (!f.fecha_inicio || !f.fecha_fin) return "Todas las fases necesitan fecha de inicio y de fin.";
      if (f.fecha_inicio > f.fecha_fin) return `"${f.nombre}": la fecha de inicio es posterior a la de fin.`;
    }
    return null;
  }

  function irAMesociclos() {
    const err = validarFases();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setMesociclosPorFase((prev) => {
      const siguiente: Record<string, MesocicloForm[]> = {};
      for (const f of fases) {
        const actuales = prev[f.key] ?? [];
        siguiente[f.key] =
          actuales.length === f.numMesociclos
            ? actuales
            : Array.from({ length: f.numMesociclos }, (_, i) => actuales[i] ?? { key: nuevaClave(), nombre: "", objetivo: "" });
      }
      return siguiente;
    });
    setPaso("mesociclos");
  }

  function cambiarNumMesociclos(faseKey: string, n: number) {
    const num = Math.max(0, n);
    setFases((fs) => fs.map((f) => (f.key === faseKey ? { ...f, numMesociclos: num } : f)));
    setMesociclosPorFase((prev) => {
      const actuales = prev[faseKey] ?? [];
      const ajustados =
        num <= actuales.length
          ? actuales.slice(0, num)
          : [...actuales, ...Array.from({ length: num - actuales.length }, () => ({ key: nuevaClave(), nombre: "", objetivo: "" }))];
      return { ...prev, [faseKey]: ajustados };
    });
  }

  function actualizarMesociclo(faseKey: string, key: string, cambios: Partial<MesocicloForm>) {
    setMesociclosPorFase((prev) => ({
      ...prev,
      [faseKey]: (prev[faseKey] ?? []).map((m) => (m.key === key ? { ...m, ...cambios } : m)),
    }));
  }

  /** Índice global 1..N de un mesociclo, recorriendo las fases en orden — para el placeholder "Mesociclo N". */
  function indiceGlobalDeMesociclo(faseKey: string, mesocicloKey: string): number {
    let i = 1;
    for (const f of fases) {
      for (const m of mesociclosPorFase[f.key] ?? []) {
        if (f.key === faseKey && m.key === mesocicloKey) return i;
        i++;
      }
    }
    return i;
  }

  async function confirmar() {
    setGuardando(true);
    setError(null);
    try {
      const { data: periodosInsertados, error: errPeriodos } = await supabase
        .from("periodos")
        .insert(
          fases.map((f) => ({
            equipo_id: equipoId,
            nombre: f.nombre.trim(),
            fecha_inicio: f.fecha_inicio,
            fecha_fin: f.fecha_fin,
            objetivo_general: f.objetivo_general.trim() || null,
          })),
        )
        .select();
      if (errPeriodos || !periodosInsertados) throw errPeriodos ?? new Error("No se pudieron crear las fases.");

      type OrigenMesociclo = { faseKey: string };
      const origen: OrigenMesociclo[] = [];
      const filasMesociclos: Array<Pick<MesociclosRow, "equipo_id" | "periodo_id" | "nombre" | "objetivo">> = [];
      fases.forEach((f, i) => {
        const periodoId = periodosInsertados[i].id;
        (mesociclosPorFase[f.key] ?? []).forEach((m) => {
          filasMesociclos.push({
            equipo_id: equipoId,
            periodo_id: periodoId,
            nombre: m.nombre.trim() || `Mesociclo ${indiceGlobalDeMesociclo(f.key, m.key)}`,
            objetivo: m.objetivo.trim() || null,
          });
          origen.push({ faseKey: f.key });
        });
      });

      let mesociclosInsertados: MesociclosRow[] = [];
      if (filasMesociclos.length > 0) {
        const { data, error: errMeso } = await supabase.from("mesociclos").insert(filasMesociclos).select();
        if (errMeso || !data) throw errMeso ?? new Error("No se pudieron crear los mesociclos.");
        mesociclosInsertados = data;
      }

      const idsPorFase: Record<string, string[]> = {};
      mesociclosInsertados.forEach((row, i) => {
        const { faseKey } = origen[i];
        (idsPorFase[faseKey] ??= []).push(row.id);
      });

      const filasMicrociclos: Array<
        Pick<MicrociclosRow, "equipo_id" | "mesociclo_id" | "semana" | "fecha_inicio" | "fecha_fin" | "contenidos" | "objetivo">
      > = [];
      let semanaGlobal = 1;
      for (const f of fases) {
        const ids = idsPorFase[f.key] ?? [];
        if (ids.length === 0) continue;
        const semanas = semanasDeRango(f.fecha_inicio, f.fecha_fin);
        const base = Math.floor(semanas.length / ids.length);
        const resto = semanas.length % ids.length;
        let cursor = 0;
        ids.forEach((mesocicloId, idx) => {
          const n = base + (idx < resto ? 1 : 0);
          for (let s = 0; s < n; s++) {
            const semana = semanas[cursor];
            filasMicrociclos.push({
              equipo_id: equipoId,
              mesociclo_id: mesocicloId,
              semana: semanaGlobal,
              fecha_inicio: semana.fecha_inicio,
              fecha_fin: semana.fecha_fin,
              contenidos: {},
              objetivo: null,
            });
            cursor++;
            semanaGlobal++;
          }
        });
      }

      if (filasMicrociclos.length > 0) {
        const { error: errMicro } = await supabase.from("microciclos").insert(filasMicrociclos);
        if (errMicro) throw errMicro;
      }

      onCompletado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la temporada.");
    } finally {
      setGuardando(false);
    }
  }

  if (paso === "inicio") {
    return (
      <div className="card-surface flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Configura la temporada</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Este equipo todavía no tiene fases ni mesociclos. Da de alta la estructura de la temporada en dos pasos
          rápidos — los microciclos semanales se generan solos.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => setPaso("fases")}>Empezar desde cero</Button>
          <Button variant="secondary" onClick={() => setPaso("duplicar")}>
            Crear a partir de un equipo existente
          </Button>
        </div>
      </div>
    );
  }

  if (paso === "duplicar") {
    return (
      <div className="card-surface flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Duplicar estructura de otro equipo</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Se copian los nombres de las fases, sus fechas (ajustadas a la nueva fecha de inicio) y el número de
          mesociclos de cada una. Los objetivos nunca se copian — se escriben de nuevo para esta temporada.
        </p>

        {equiposOrigen.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No tienes otro equipo con temporada configurada.</p>
        ) : (
          <Field label="Equipo de origen">
            <select
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 py-2.5 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              value={equipoOrigenId}
              onChange={(e) => setEquipoOrigenId(e.target.value)}
            >
              <option value="">Selecciona un equipo...</option>
              {equiposOrigen.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nombre} ({eq.temporada})
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Fecha de inicio de esta temporada">
          <Input type="date" value={fechaInicioTemporada} onChange={(e) => setFechaInicioTemporada(e.target.value)} />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPaso("inicio")}>
            Atrás
          </Button>
          <Button onClick={cargarDesdeOrigen} disabled={!equipoOrigenId || !fechaInicioTemporada}>
            Continuar
          </Button>
        </div>
      </div>
    );
  }

  if (paso === "fases") {
    return (
      <div className="card-surface flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Paso 1 de 2 · Fases de la temporada</h2>

        <div className="flex flex-col gap-4">
          {fases.map((f, i) => (
            <div key={f.key} className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Fase {i + 1}</span>
                {fases.length > 1 && (
                  <button
                    onClick={() => quitarFase(f.key)}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                    aria-label="Quitar fase"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <Field label="Nombre">
                <Input value={f.nombre} onChange={(e) => actualizarFase(f.key, { nombre: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha de inicio">
                  <Input
                    type="date"
                    value={f.fecha_inicio}
                    onChange={(e) => actualizarFase(f.key, { fecha_inicio: e.target.value })}
                  />
                </Field>
                <Field label="Fecha de fin">
                  <Input
                    type="date"
                    value={f.fecha_fin}
                    onChange={(e) => actualizarFase(f.key, { fecha_fin: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Objetivo general (opcional)">
                <Textarea
                  className="min-h-16"
                  placeholder="Una frase con el objetivo de esta fase..."
                  value={f.objetivo_general}
                  onChange={(e) => actualizarFase(f.key, { objetivo_general: e.target.value })}
                />
              </Field>
            </div>
          ))}
        </div>

        <Button variant="secondary" size="sm" onClick={añadirFase} className="self-start">
          <Plus size={16} /> Añadir fase
        </Button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPaso("inicio")}>
            Atrás
          </Button>
          <Button onClick={irAMesociclos}>Siguiente</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Paso 2 de 2 · Mesociclos</h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        No hace falta que rellenes el objetivo de cada semana ahora — puedes dejarlo en blanco e ir completándolo
        semana a semana.
      </p>

      <div className="flex flex-col gap-5">
        {fases.map((f) => (
          <div key={f.key} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{f.nombre || "Fase sin nombre"}</span>
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                Mesociclos
                <Input
                  type="number"
                  min={0}
                  value={f.numMesociclos}
                  onChange={(e) => cambiarNumMesociclos(f.key, parseInt(e.target.value, 10) || 0)}
                  className="w-16 px-2 py-1.5 text-center"
                />
              </label>
            </div>

            {(mesociclosPorFase[f.key] ?? []).map((m) => (
              <div key={m.key} className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3">
                <Field label="Nombre">
                  <Input
                    placeholder={`Mesociclo ${indiceGlobalDeMesociclo(f.key, m.key)}`}
                    value={m.nombre}
                    onChange={(e) => actualizarMesociclo(f.key, m.key, { nombre: e.target.value })}
                  />
                </Field>
                <Field label="Objetivo (opcional)">
                  <Textarea
                    className="min-h-14"
                    placeholder="Una frase con el objetivo de este mesociclo..."
                    value={m.objetivo}
                    onChange={(e) => actualizarMesociclo(f.key, m.key, { objetivo: e.target.value })}
                  />
                </Field>
              </div>
            ))}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setPaso("fases")} disabled={guardando}>
          Atrás
        </Button>
        <Button onClick={confirmar} disabled={guardando}>
          {guardando ? "Creando temporada..." : "Crear temporada"}
        </Button>
      </div>
    </div>
  );
}
