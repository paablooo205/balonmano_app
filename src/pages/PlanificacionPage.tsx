import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrainCircuit, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { PageHeader } from "@/components/layout/PageHeader";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { BloqueCard } from "@/components/planificacion/BloqueCard";
import { conciliarSemanas, numerarSemanas, semanasDeRango } from "@/lib/microciclos";
import type { MesociclosRow, MicrociclosRow } from "@/types/database";

export function PlanificacionPage() {
  const { equipoId } = useEquipo();
  const navigate = useNavigate();
  const [bloques, setBloques] = useState<MesociclosRow[]>([]);
  const [microciclos, setMicrociclos] = useState<MicrociclosRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoInicio, setNuevoInicio] = useState("");
  const [nuevoFin, setNuevoFin] = useState("");
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  async function cargar() {
    setCargando(true);
    const [
      { data: meso, error: errorMeso },
      { data: micro, error: errorMicro },
    ] = await Promise.all([
      supabase.from("mesociclos").select("*").eq("equipo_id", equipoId).order("fecha_inicio"),
      supabase.from("microciclos").select("*").eq("equipo_id", equipoId).order("fecha_inicio"),
    ]);
    if (errorMeso || errorMicro) {
      alert("No se pudo cargar la planificación: " + (errorMeso?.message ?? errorMicro?.message));
    }
    setBloques(meso ?? []);
    setMicrociclos(micro ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  async function guardarCampoBloque(id: string, campo: "nombre" | "objetivo", valorRaw: string) {
    const valor = campo === "nombre" ? valorRaw.trim() : valorRaw.trim() || null;
    if (campo === "nombre" && !valor) return;
    const { error } = await supabase
      .from("mesociclos")
      .update({ [campo]: valor } as Partial<MesociclosRow>)
      .eq("id", id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setBloques((bs) => bs.map((b) => (b.id === id ? { ...b, [campo]: valor } : b)));
  }

  async function guardarCampoSemana(id: string, campo: "objetivo" | "rival" | "competicion", valorRaw: string) {
    const valor = valorRaw.trim() || null;
    const { error } = await supabase
      .from("microciclos")
      .update({ [campo]: valor } as Partial<MicrociclosRow>)
      .eq("id", id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setMicrociclos((ms) => ms.map((m) => (m.id === id ? { ...m, [campo]: valor } : m)));
  }

  async function guardarFechasBloque(bloque: MesociclosRow, nuevaInicio: string, nuevaFin: string) {
    if (nuevaInicio > nuevaFin) {
      alert("La fecha de inicio no puede ser posterior a la de fin.");
      return;
    }
    if ((new Date(nuevaFin).getTime() - new Date(nuevaInicio).getTime()) / 86400000 > 730) {
      alert("El bloque no puede durar más de 2 años. Revisa las fechas.");
      return;
    }
    const actuales = microciclos.filter((m) => m.mesociclo_id === bloque.id);
    const plan = conciliarSemanas(actuales, nuevaInicio, nuevaFin);

    if (plan.borrarConAviso.length > 0) {
      const detalle = plan.borrarConAviso
        .map(
          (m) =>
            `- Semana del ${m.fecha_inicio}: ${[m.objetivo, m.rival, m.competicion].filter(Boolean).join(" · ") || "contenido guardado"}`,
        )
        .join("\n");
      const confirmado = confirm(
        `Al cambiar las fechas se perderían estas semanas, que ya tienen datos:\n\n${detalle}\n\n¿Seguro que quieres continuar y borrarlas?`,
      );
      if (!confirmado) return;
    }

    const idsABorrar = [...plan.borrarSinAviso, ...plan.borrarConAviso].map((m) => m.id);
    if (idsABorrar.length > 0) {
      const { error } = await supabase.from("microciclos").delete().in("id", idsABorrar);
      if (error) {
        alert("No se pudo guardar: " + error.message);
        await cargar();
        return;
      }
    }
    if (plan.crear.length > 0) {
      const { error } = await supabase.from("microciclos").insert(
        plan.crear.map((s) => ({
          equipo_id: bloque.equipo_id,
          mesociclo_id: bloque.id,
          fecha_inicio: s.fecha_inicio,
          fecha_fin: s.fecha_fin,
          contenidos: {},
          objetivo: null,
        })),
      );
      if (error) {
        alert("No se pudo guardar: " + error.message);
        await cargar();
        return;
      }
    }

    const { data: supervivientes } = await supabase
      .from("microciclos")
      .select("*")
      .eq("mesociclo_id", bloque.id)
      .order("fecha_inicio");
    const resultadosRenumeracion = await Promise.all(
      numerarSemanas(supervivientes ?? []).map((m) => supabase.from("microciclos").update({ semana: m.semana }).eq("id", m.id)),
    );
    if (resultadosRenumeracion.some((r) => r.error)) {
      alert("Las semanas se guardaron pero puede que su numeración haya quedado incompleta. Recarga para comprobarlo.");
    }

    const { error: errorFechas } = await supabase
      .from("mesociclos")
      .update({ fecha_inicio: nuevaInicio, fecha_fin: nuevaFin })
      .eq("id", bloque.id);
    if (errorFechas) {
      alert("No se pudo guardar: " + errorFechas.message);
      await cargar();
      return;
    }
    await cargar();
  }

  async function borrarBloque(bloque: MesociclosRow) {
    const numSemanas = microciclos.filter((m) => m.mesociclo_id === bloque.id).length;
    const confirmado = confirm(
      `¿Borrar el bloque "${bloque.nombre}" y sus ${numSemanas} semanas? Las sesiones o partidos que las tuvieran asociadas no se borran, pero perderán el objetivo semanal. No se puede deshacer.`,
    );
    if (!confirmado) return;
    const { error } = await supabase.from("mesociclos").delete().eq("id", bloque.id);
    if (error) {
      alert("No se pudo borrar: " + error.message);
      return;
    }
    await cargar();
  }

  async function crearBloque() {
    if (!nuevoNombre.trim() || !nuevoInicio || !nuevoFin) {
      alert("Rellena nombre y fechas para crear el bloque.");
      return;
    }
    if (nuevoInicio > nuevoFin) {
      alert("La fecha de inicio no puede ser posterior a la de fin.");
      return;
    }
    if ((new Date(nuevoFin).getTime() - new Date(nuevoInicio).getTime()) / 86400000 > 730) {
      alert("El bloque no puede durar más de 2 años. Revisa las fechas.");
      return;
    }
    setGuardandoNuevo(true);
    const { data: nuevo, error } = await supabase
      .from("mesociclos")
      .insert({
        equipo_id: equipoId,
        periodo_id: null,
        nombre: nuevoNombre.trim(),
        fecha_inicio: nuevoInicio,
        fecha_fin: nuevoFin,
      })
      .select()
      .single();
    if (error || !nuevo) {
      alert("No se pudo crear el bloque: " + (error?.message ?? ""));
      setGuardandoNuevo(false);
      return;
    }
    const semanas = numerarSemanas(semanasDeRango(nuevoInicio, nuevoFin));
    if (semanas.length > 0) {
      const { error: errorSemanas } = await supabase.from("microciclos").insert(
        semanas.map((s) => ({
          equipo_id: equipoId,
          mesociclo_id: nuevo.id,
          semana: s.semana,
          fecha_inicio: s.fecha_inicio,
          fecha_fin: s.fecha_fin,
          contenidos: {},
          objetivo: null,
        })),
      );
      if (errorSemanas) {
        alert("El bloque se creó pero no se pudieron crear sus semanas: " + errorSemanas.message);
      }
    }
    setNuevoNombre("");
    setNuevoInicio("");
    setNuevoFin("");
    setCreando(false);
    setGuardandoNuevo(false);
    await cargar();
  }

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }

  const ordenados = [...bloques].sort((a, b) => (a.fecha_inicio ?? "").localeCompare(b.fecha_inicio ?? ""));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Planifica la temporada"
        action={
          <Button size="sm" variant="secondary" onClick={() => navigate(`/equipos/${equipoId}/modelo-juego`)}>
            <BrainCircuit size={16} /> Ver progreso
          </Button>
        }
      />

      {ordenados.length === 0 && !creando && (
        <div className="card-surface p-4 text-sm text-[var(--color-text-muted)]">
          Todavía no has creado ningún bloque. Un bloque es un tramo de la temporada (por ejemplo, "Primera vuelta")
          con sus propias fechas — dentro se generan solas las semanas.
        </div>
      )}

      {ordenados.map((bloque) => (
        <BloqueCard
          key={bloque.id}
          bloque={bloque}
          semanas={microciclos.filter((m) => m.mesociclo_id === bloque.id)}
          abierto={abiertoId === bloque.id}
          onToggle={() => setAbiertoId((id) => (id === bloque.id ? null : bloque.id))}
          onGuardarCampo={(campo, valor) => guardarCampoBloque(bloque.id, campo, valor)}
          onGuardarFechas={(inicio, fin) => guardarFechasBloque(bloque, inicio, fin)}
          onGuardarSemana={guardarCampoSemana}
          onBorrar={() => borrarBloque(bloque)}
        />
      ))}

      {creando ? (
        <div className="card-surface flex flex-col gap-3 p-4">
          <Field label="Nombre del bloque">
            <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Primera vuelta" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de inicio">
              <Input type="date" value={nuevoInicio} onChange={(e) => setNuevoInicio(e.target.value)} />
            </Field>
            <Field label="Fecha de fin">
              <Input type="date" value={nuevoFin} onChange={(e) => setNuevoFin(e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCreando(false)} disabled={guardandoNuevo}>
              Cancelar
            </Button>
            <Button onClick={crearBloque} disabled={guardandoNuevo}>
              {guardandoNuevo ? "Creando..." : "Crear bloque"}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setCreando(true)} className="gap-2 self-start">
          <Plus size={16} /> Nuevo bloque
        </Button>
      )}
    </div>
  );
}
