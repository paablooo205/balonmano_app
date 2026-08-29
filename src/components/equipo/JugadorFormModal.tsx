import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AdjuntoFicha } from "./AdjuntoFicha";
import { supabase } from "@/lib/supabaseClient";
import { subirArchivo, borrarArchivo } from "@/lib/storage";
import type { JugadoresRow } from "@/types/database";

const PUESTOS = ["Portero", "Extremo izquierdo", "Extremo derecho", "Lateral izquierdo", "Lateral derecho", "Central", "Pivote"];

function estadoInicial(jugador: JugadoresRow | null) {
  return {
    nombre: jugador?.nombre ?? "",
    añoNacimiento: jugador?.año_nacimiento?.toString() ?? "",
    dorsal: jugador?.dorsal?.toString() ?? "",
    puesto: jugador?.puesto ?? "",
    puestosSecundarios: jugador?.puestos_secundarios?.join(", ") ?? "",
    nivelActual: jugador?.nivel_actual ?? "",
    fortalezas: jugador?.fortalezas ?? "",
    aspectosAMejorar: jugador?.aspectos_a_mejorar ?? "",
    objetivoIndividual: jugador?.objetivo_individual ?? "",
    fichaOriginal: jugador?.ficha_oficial_url ?? null,
    fichaUrl: jugador?.ficha_oficial_url ?? null,
    notas: jugador?.notas_adicionales ?? "",
  };
}

export function JugadorFormModal({
  open,
  onClose,
  equipoId,
  jugador,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  jugador: JugadoresRow | null;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [estado, setEstado] = useState(() => estadoInicial(jugador));
  const {
    nombre,
    añoNacimiento,
    dorsal,
    puesto,
    puestosSecundarios,
    nivelActual,
    fortalezas,
    aspectosAMejorar,
    objetivoIndividual,
    fichaOriginal,
    fichaUrl,
    notas,
  } = estado;
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // El modal permanece montado entre aperturas (el padre no lo desmonta al
  // cerrarlo), así que `useState(inicial)` solo se ejecutaría una vez: sin
  // este efecto, reabrirlo para un jugador distinto (o el mismo, tras
  // cancelar) mostraría datos de la sesión de edición anterior.
  useEffect(() => {
    if (open) setEstado(estadoInicial(jugador));
     
  }, [open, jugador]);

  function set<K extends keyof ReturnType<typeof estadoInicial>>(key: K, value: ReturnType<typeof estadoInicial>[K]) {
    setEstado((e) => ({ ...e, [key]: value }));
  }

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    try {
      // Si ya había un archivo nuevo (sin guardar) subido en esta misma
      // sesión de edición, ese sí se puede limpiar: nunca llegó a guardarse.
      if (fichaUrl && fichaUrl !== fichaOriginal) await borrarArchivo(fichaUrl).catch(() => {});
      const ruta = await subirArchivo(`jugadores/${equipoId}`, file);
      set("fichaUrl", ruta);
    } catch (err) {
      alert("No se pudo subir el archivo: " + (err as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  function cancelar() {
    // Si se subió un archivo nuevo en esta sesión de edición y se cancela sin
    // guardar, no debe quedar huérfano en Storage.
    if (fichaUrl && fichaUrl !== fichaOriginal) void borrarArchivo(fichaUrl).catch(() => {});
    onClose();
  }

  async function guardar() {
    if (!nombre.trim()) {
      alert("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    const payload = {
      equipo_id: equipoId,
      nombre: nombre.trim(),
      año_nacimiento: añoNacimiento ? Number(añoNacimiento) : null,
      dorsal: dorsal ? Number(dorsal) : null,
      puesto: puesto || null,
      puestos_secundarios: puestosSecundarios
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
      nivel_actual: nivelActual || null,
      fortalezas: fortalezas || null,
      aspectos_a_mejorar: aspectosAMejorar || null,
      objetivo_individual: objetivoIndividual || null,
      ficha_oficial_url: fichaUrl,
      notas_adicionales: notas || null,
    };
    const { error } = jugador
      ? await supabase.from("jugadores").update(payload).eq("id", jugador.id)
      : await supabase.from("jugadores").insert(payload);
    setGuardando(false);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    // Guardado confirmado: si la ficha cambió o se quitó, ahora sí se borra
    // la que quedó reemplazada.
    if (fichaOriginal && fichaOriginal !== fichaUrl) {
      void borrarArchivo(fichaOriginal).catch(() => {});
    }
    onSaved();
  }

  async function borrar() {
    if (!jugador) return;
    if (!confirm(`¿Borrar a "${jugador.nombre}"? También se borrará su asistencia registrada. No se puede deshacer.`)) return;
    setBorrando(true);
    const { error } = await supabase.from("jugadores").delete().eq("id", jugador.id);
    setBorrando(false);
    if (error) {
      alert("No se pudo borrar: " + error.message);
      return;
    }
    if (jugador.ficha_oficial_url) {
      void borrarArchivo(jugador.ficha_oficial_url).catch(() => {});
    }
    onDeleted();
  }

  return (
    <Modal open={open} onClose={cancelar} title={jugador ? "Editar jugador/a" : "Nuevo jugador/a"}>
      <div className="flex flex-col gap-4">
        <Field label="Nombre *">
          <Input value={nombre} onChange={(e) => set("nombre", e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Año de nacimiento">
            <Input type="number" value={añoNacimiento} onChange={(e) => set("añoNacimiento", e.target.value)} />
          </Field>
          <Field label="Dorsal">
            <Input type="number" min={0} value={dorsal} onChange={(e) => set("dorsal", e.target.value)} />
          </Field>
        </div>

        <Field label="Puesto">
          <Select value={puesto} onChange={(e) => set("puesto", e.target.value)}>
            <option value="">—</option>
            {PUESTOS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Puestos secundarios (separados por comas)">
          <Input value={puestosSecundarios} onChange={(e) => set("puestosSecundarios", e.target.value)} />
        </Field>

        <Field label="Nivel actual">
          <Input value={nivelActual} onChange={(e) => set("nivelActual", e.target.value)} />
        </Field>
        <Field label="Fortalezas">
          <Textarea value={fortalezas} onChange={(e) => set("fortalezas", e.target.value)} />
        </Field>
        <Field label="Aspectos a mejorar">
          <Textarea value={aspectosAMejorar} onChange={(e) => set("aspectosAMejorar", e.target.value)} />
        </Field>
        <Field label="Objetivo individual">
          <Textarea value={objetivoIndividual} onChange={(e) => set("objetivoIndividual", e.target.value)} />
        </Field>

        <Field label="Ficha oficial (PDF o imagen)">
          {fichaUrl ? (
            <AdjuntoFicha ruta={fichaUrl} onQuitar={() => set("fichaUrl", null)} />
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]">
              <Upload size={16} />
              {subiendo ? "Subiendo..." : "Adjuntar archivo"}
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleArchivo} disabled={subiendo} />
            </label>
          )}
        </Field>

        <Field label="Notas adicionales">
          <Textarea value={notas} onChange={(e) => set("notas", e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        {jugador ? (
          <Button variant="destructive" size="sm" onClick={borrar} disabled={borrando}>
            {borrando ? "Borrando..." : "Borrar"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={cancelar}>
            Cancelar
          </Button>
          <Button size="sm" onClick={guardar} disabled={guardando || subiendo}>
            {guardando ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
