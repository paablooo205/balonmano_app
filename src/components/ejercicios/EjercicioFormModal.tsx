import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { useEntrenador } from "@/hooks/useEntrenador";
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
  compartido: boolean;
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
    compartido: e?.compartido ?? false,
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
  permitirBorrar = true,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  ejercicio: EjerciciosRow | null;
  onSaved: () => void;
  onDeleted: () => void;
  permitirBorrar?: boolean;
}) {
  const { equipo } = useEquipo();
  const { id: entrenadorId, nombre: entrenadorNombre } = useEntrenador();
  const [form, setForm] = useState<FormState>(() => toFormState(ejercicio));
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // Un ejercicio ajeno compartido se ve, nunca se edita — ver spec
  // "Formulario", modo de solo lectura.
  const readOnly = ejercicio !== null && ejercicio.equipo_id !== equipoId;

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

    // Un ejercicio nuevo, o uno ya existente de antes de esta función sin
    // autor conocido, se atribuye a quien lo guarda ahora mismo. Uno ya
    // atribuido nunca se vuelve a tocar, aunque lo edite otro entrenador
    // del mismo equipo más tarde.
    const necesitaAtribucion = !ejercicio?.creado_por_nombre;
    const atribucion: Partial<Pick<EjerciciosRow, "creado_por" | "creado_por_nombre" | "equipo_origen_nombre">> = necesitaAtribucion
      ? {
          creado_por: entrenadorId,
          creado_por_nombre: entrenadorNombre,
          equipo_origen_nombre: equipo?.nombre ?? null,
        }
      : {};

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
      compartido: form.compartido,
      notas_adicionales: form.notas_adicionales || null,
      ...atribucion,
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
    <Modal open={open} onClose={onClose} title={readOnly ? "Ejercicio compartido" : ejercicio ? "Editar ejercicio" : "Nuevo ejercicio"}>
      {readOnly && (
        <div className="mb-3 rounded-lg bg-[var(--color-card-hover)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
          Compartido por {ejercicio?.creado_por_nombre ?? "otro equipo"}
          {ejercicio?.equipo_origen_nombre ? ` · ${ejercicio.equipo_origen_nombre}` : ""}
        </div>
      )}

      <form id="ejercicio-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <fieldset disabled={readOnly} className="contents">
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

          <label className="flex items-center gap-2 text-sm has-[:disabled]:text-[var(--color-text-muted)] has-[:disabled]:opacity-70">
            <input
              type="checkbox"
              checked={form.compartido}
              onChange={(e) => set("compartido", e.target.checked)}
              className="h-5 w-5 accent-[var(--color-accent)] disabled:cursor-not-allowed"
            />
            Compartir con los demás equipos del club
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
        </fieldset>
      </form>

      {readOnly ? (
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2">
          {ejercicio && permitirBorrar ? (
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
      )}
    </Modal>
  );
}
