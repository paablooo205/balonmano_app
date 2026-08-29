import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import type { EjerciciosRow } from "@/types/database";

const CATEGORIAS = ["Calentamiento", "Técnica individual", "Táctica colectiva", "Sistema de juego", "Físico", "Portero", "Otro"];
const DIFICULTADES = ["Iniciación", "Medio", "Avanzado"];

type FormState = {
  nombre: string;
  categoria: string;
  contenido: string;
  jugadores_min: string;
  jugadores_max: string;
  espacio: string;
  material: string;
  duracion_min: string;
  dificultad: string;
  descripcion: string;
  organizacion: string;
  reglas: string;
  consignas: string;
  progresion: string;
  regresion: string;
  errores_frecuentes: string;
  correcciones: string;
  transferencia_partido: string;
  favorito: boolean;
  notas_adicionales: string;
};

function toFormState(e: EjerciciosRow | null): FormState {
  return {
    nombre: e?.nombre ?? "",
    categoria: e?.categoria ?? "",
    contenido: e?.contenido?.join(", ") ?? "",
    jugadores_min: e?.jugadores_min?.toString() ?? "",
    jugadores_max: e?.jugadores_max?.toString() ?? "",
    espacio: e?.espacio ?? "",
    material: e?.material ?? "",
    duracion_min: e?.duracion_min?.toString() ?? "",
    dificultad: e?.dificultad ?? "",
    descripcion: e?.descripcion ?? "",
    organizacion: e?.organizacion ?? "",
    reglas: e?.reglas ?? "",
    consignas: e?.consignas ?? "",
    progresion: e?.progresion ?? "",
    regresion: e?.regresion ?? "",
    errores_frecuentes: e?.errores_frecuentes ?? "",
    correcciones: e?.correcciones ?? "",
    transferencia_partido: e?.transferencia_partido ?? "",
    favorito: e?.favorito ?? false,
    notas_adicionales: e?.notas_adicionales ?? "",
  };
}

export function EjercicioFormModal({
  open,
  onClose,
  equipoId,
  ejercicio,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  ejercicio: EjerciciosRow | null;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(ejercicio));
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // El modal permanece montado entre aperturas, así que sin este efecto
  // reabrirlo (para el mismo ejercicio tras cancelar, para uno distinto, o
  // para "nuevo" otra vez) mostraría datos de la sesión de edición anterior.
  useEffect(() => {
    if (open) setForm(toFormState(ejercicio));
     
  }, [open, ejercicio]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const payload = {
      equipo_id: equipoId,
      nombre: form.nombre.trim(),
      categoria: form.categoria || null,
      contenido: form.contenido
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      jugadores_min: form.jugadores_min ? Number(form.jugadores_min) : null,
      jugadores_max: form.jugadores_max ? Number(form.jugadores_max) : null,
      espacio: form.espacio || null,
      material: form.material || null,
      duracion_min: form.duracion_min ? Number(form.duracion_min) : null,
      dificultad: form.dificultad || null,
      descripcion: form.descripcion || null,
      organizacion: form.organizacion || null,
      reglas: form.reglas || null,
      consignas: form.consignas || null,
      progresion: form.progresion || null,
      regresion: form.regresion || null,
      errores_frecuentes: form.errores_frecuentes || null,
      correcciones: form.correcciones || null,
      transferencia_partido: form.transferencia_partido || null,
      favorito: form.favorito,
      notas_adicionales: form.notas_adicionales || null,
    };

    const { error } = ejercicio
      ? await supabase.from("ejercicios").update(payload).eq("id", ejercicio.id)
      : await supabase.from("ejercicios").insert(payload);

    setGuardando(false);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!ejercicio) return;
    if (!confirm(`¿Borrar "${ejercicio.nombre}"? No se puede deshacer.`)) return;
    setBorrando(true);
    const { error } = await supabase.from("ejercicios").delete().eq("id", ejercicio.id);
    setBorrando(false);
    if (error) {
      alert("No se pudo borrar: " + error.message);
      return;
    }
    onDeleted();
  }

  return (
    <Modal open={open} onClose={onClose} title={ejercicio ? "Editar ejercicio" : "Nuevo ejercicio"}>
      <form id="ejercicio-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nombre *">
          <Input required value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría">
            <Select value={form.categoria} onChange={(e) => set("categoria", e.target.value)}>
              <option value="">—</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dificultad">
            <Select value={form.dificultad} onChange={(e) => set("dificultad", e.target.value)}>
              <option value="">—</option>
              {DIFICULTADES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Contenido / tags (separados por comas)">
          <Input
            placeholder="lanzamiento, 2x2, ataque vs 6:0..."
            value={form.contenido}
            onChange={(e) => set("contenido", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Jugadores mín.">
            <Input type="number" min={0} value={form.jugadores_min} onChange={(e) => set("jugadores_min", e.target.value)} />
          </Field>
          <Field label="Jugadores máx.">
            <Input type="number" min={0} value={form.jugadores_max} onChange={(e) => set("jugadores_max", e.target.value)} />
          </Field>
          <Field label="Duración (min)">
            <Input type="number" min={0} value={form.duracion_min} onChange={(e) => set("duracion_min", e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Espacio">
            <Input value={form.espacio} onChange={(e) => set("espacio", e.target.value)} />
          </Field>
          <Field label="Material">
            <Input value={form.material} onChange={(e) => set("material", e.target.value)} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.favorito}
            onChange={(e) => set("favorito", e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]"
          />
          Marcar como favorito
        </label>

        <Field label="Descripción">
          <Textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
        </Field>
        <Field label="Organización">
          <Textarea value={form.organizacion} onChange={(e) => set("organizacion", e.target.value)} />
        </Field>
        <Field label="Reglas">
          <Textarea value={form.reglas} onChange={(e) => set("reglas", e.target.value)} />
        </Field>
        <Field label="Consignas">
          <Textarea value={form.consignas} onChange={(e) => set("consignas", e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Progresión">
            <Textarea value={form.progresion} onChange={(e) => set("progresion", e.target.value)} />
          </Field>
          <Field label="Regresión">
            <Textarea value={form.regresion} onChange={(e) => set("regresion", e.target.value)} />
          </Field>
        </div>

        <Field label="Errores frecuentes">
          <Textarea value={form.errores_frecuentes} onChange={(e) => set("errores_frecuentes", e.target.value)} />
        </Field>
        <Field label="Correcciones">
          <Textarea value={form.correcciones} onChange={(e) => set("correcciones", e.target.value)} />
        </Field>
        <Field label="Transferencia al partido">
          <Textarea value={form.transferencia_partido} onChange={(e) => set("transferencia_partido", e.target.value)} />
        </Field>
        <Field label="Notas adicionales">
          <Textarea value={form.notas_adicionales} onChange={(e) => set("notas_adicionales", e.target.value)} />
        </Field>
      </form>

      <div className="mt-2 flex items-center justify-between gap-2">
        {ejercicio ? (
          <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={borrando}>
            {borrando ? "Borrando..." : "Borrar"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="ejercicio-form" size="sm" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
