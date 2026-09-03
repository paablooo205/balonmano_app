// src/components/sesion/BloqueModal.tsx
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { guardarBloques } from "@/lib/bloquesSesion";
import { EjercicioPickerModal } from "@/components/sesion/EjercicioPickerModal";
import type { BloqueSesion, EjerciciosRow, SesionesRow } from "@/types/database";

export function BloqueModal({
  open,
  onClose,
  equipoId,
  sesion,
  bloqueIndex,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  sesion: SesionesRow;
  bloqueIndex: number | null;
  onSaved: () => void;
}) {
  const editandoLibre = bloqueIndex !== null;

  const [tab, setTab] = useState<"biblioteca" | "libre">("biblioteca");
  const [tiempoBiblioteca, setTiempoBiblioteca] = useState("10");
  const [pickerAbierto, setPickerAbierto] = useState(false);
  const [tiempo, setTiempo] = useState("10");
  const [descripcion, setDescripcion] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [consignas, setConsignas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // El modal permanece montado entre aperturas (Modal solo oculta su
  // contenido), así que hay que resetear el formulario cada vez que se abre
  // — mismo patrón que EjercicioFormModal.tsx.
  useEffect(() => {
    if (!open) return;
    const bloque = bloqueIndex !== null ? sesion.bloques[bloqueIndex] : null;
    setTab("biblioteca");
    setTiempoBiblioteca("10");
    setPickerAbierto(false);
    setTiempo((bloque?.tiempo_min ?? 10).toString());
    setDescripcion(bloque?.descripcion_libre ?? "");
    setObjetivo(bloque?.objetivo ?? "");
    setConsignas(bloque?.consignas ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bloqueIndex]);

  async function guardarLibre() {
    setGuardando(true);
    try {
      const nuevoBloque: BloqueSesion = {
        tiempo_min: Number(tiempo) || 0,
        descripcion_libre: descripcion || undefined,
        objetivo: objetivo || undefined,
        consignas: consignas || undefined,
      };
      const nuevosBloques =
        bloqueIndex !== null
          ? sesion.bloques.map((b, i) => (i === bloqueIndex ? nuevoBloque : b))
          : [...sesion.bloques, nuevoBloque];
      await guardarBloques(sesion, nuevosBloques);
      onSaved();
    } catch (err) {
      alert("No se pudo guardar: " + (err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function elegirDeLaBiblioteca(ejercicio: EjerciciosRow) {
    setPickerAbierto(false);
    setGuardando(true);
    try {
      const nuevoBloque: BloqueSesion = { tiempo_min: Number(tiempoBiblioteca) || 0, ejercicio_id: ejercicio.id };
      await guardarBloques(sesion, [...sesion.bloques, nuevoBloque]);
      onSaved();
    } catch (err) {
      alert("No se pudo guardar: " + (err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (bloqueIndex === null) return;
    if (!confirm("¿Quitar este bloque de la sesión?")) return;
    setBorrando(true);
    try {
      const nuevosBloques = sesion.bloques.filter((_, i) => i !== bloqueIndex);
      await guardarBloques(sesion, nuevosBloques);
      onSaved();
    } catch (err) {
      alert("No se pudo borrar: " + (err as Error).message);
    } finally {
      setBorrando(false);
    }
  }

  const mostrarFormularioLibre = editandoLibre || tab === "libre";

  return (
    <>
      <Modal open={open} onClose={onClose} title={editandoLibre ? "Editar bloque" : "Añadir ejercicio"}>
        <div className="flex flex-col gap-4">
          {!editandoLibre && (
            <div className="tab-pill-group">
              <button type="button" className="tab-pill" data-active={tab === "biblioteca"} onClick={() => setTab("biblioteca")}>
                De la biblioteca
              </button>
              <button type="button" className="tab-pill" data-active={tab === "libre"} onClick={() => setTab("libre")}>
                Bloque libre
              </button>
            </div>
          )}

          {!mostrarFormularioLibre ? (
            <>
              <Field label="Minutos">
                <Input
                  type="number"
                  min={0}
                  value={tiempoBiblioteca}
                  onChange={(e) => setTiempoBiblioteca(e.target.value)}
                  className="w-24"
                />
              </Field>
              <Button type="button" variant="secondary" onClick={() => setPickerAbierto(true)} disabled={guardando}>
                Elegir ejercicio...
              </Button>
            </>
          ) : (
            <>
              <Field label="Minutos">
                <Input type="number" min={0} value={tiempo} onChange={(e) => setTiempo(e.target.value)} className="w-24" />
              </Field>
              <Field label="Descripción">
                <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="min-h-16" />
              </Field>
              <Field label="Objetivo">
                <Input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
              </Field>
              <Field label="Consignas">
                <Input value={consignas} onChange={(e) => setConsignas(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {editandoLibre ? (
            <Button type="button" variant="destructive" size="sm" onClick={borrar} disabled={borrando}>
              {borrando ? "Borrando..." : "Borrar"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            {mostrarFormularioLibre && (
              <Button type="button" size="sm" onClick={guardarLibre} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <EjercicioPickerModal
        open={pickerAbierto}
        onClose={() => setPickerAbierto(false)}
        equipoId={equipoId}
        onPick={elegirDeLaBiblioteca}
      />
    </>
  );
}
