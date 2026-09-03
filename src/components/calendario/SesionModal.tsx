import { useState } from "react";
import { Trash2, Upload, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import { subirArchivo, borrarArchivo, urlFirmada, nombreArchivo } from "@/lib/storage";
import type { DiaSemana, EstadoSesion, SesionesRow } from "@/types/database";

const ESTADOS: { value: EstadoSesion; label: string }[] = [
  { value: "planificada", label: "Planificada" },
  { value: "realizada", label: "Realizada" },
  { value: "cancelada", label: "Cancelada" },
];

export function SesionModal({
  open,
  onClose,
  equipoId,
  microcicloId,
  fecha,
  diaSemana,
  duracionSugerida,
  sesion,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  microcicloId: string | null;
  fecha: string;
  diaSemana: DiaSemana;
  duracionSugerida: number | null;
  sesion: SesionesRow | null;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [duracion, setDuracion] = useState(sesion?.duracion_min ?? duracionSugerida ?? 90);
  const [estado, setEstado] = useState<EstadoSesion>(sesion?.estado ?? "planificada");
  const [valoracion, setValoracion] = useState(sesion?.valoracion?.toString() ?? "");
  const [notas, setNotas] = useState(sesion?.notas_adicionales ?? "");
  const [adjuntos, setAdjuntos] = useState<string[]>(sesion?.adjuntos ?? []);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  async function subirAdjunto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    try {
      const ruta = await subirArchivo(`sesiones/${equipoId}`, file);
      setAdjuntos((as) => [...as, ruta]);
    } catch (err) {
      alert("No se pudo subir el archivo: " + (err as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  function quitarAdjunto(i: number) {
    const ruta = adjuntos[i];
    setAdjuntos((as) => as.filter((_, idx) => idx !== i));
    void borrarArchivo(ruta).catch(() => {});
  }

  async function guardar() {
    setGuardando(true);
    const id = sesion?.id ?? crypto.randomUUID();
    const ahora = new Date().toISOString();
    // Fila completa (con id generado en cliente si es nueva) para poder
    // encolarla y mostrarla de inmediato aunque no haya red todavía.
    const payload: SesionesRow = {
      id,
      equipo_id: equipoId,
      microciclo_id: microcicloId,
      fecha,
      dia_semana: diaSemana,
      duracion_min: duracion || null,
      estado,
      // Los bloques ya no se editan desde este modal (ver SesionDetailPage.tsx
      // y BloqueModal.tsx) — se preservan tal cual para no borrarlos al
      // guardar cambios de duración/estado/valoración/notas.
      bloques: sesion?.bloques ?? [],
      adjuntos,
      valoracion: valoracion ? Number(valoracion) : null,
      notas_adicionales: notas || null,
      created_at: sesion?.created_at ?? ahora,
      updated_at: ahora,
    };
    const tipo = sesion ? "update" : "insert";

    if (!navigator.onLine) {
      await encolarOperacion({ tabla: "sesiones", tipo, rowId: id, payload });
      setGuardando(false);
      onSaved();
      return;
    }

    const { error, status } = sesion
      ? await supabase.from("sesiones").update(payload).eq("id", sesion.id)
      : await supabase.from("sesiones").insert(payload);
    setGuardando(false);
    if (error) {
      if (esErrorDeRed(status)) {
        await encolarOperacion({ tabla: "sesiones", tipo, rowId: id, payload });
        onSaved();
        return;
      }
      alert("No se pudo guardar: " + error.message);
      return;
    }
    onSaved();
  }

  async function borrar() {
    if (!sesion) return;
    if (!confirm("¿Borrar esta sesión? No se puede deshacer.")) return;
    setBorrando(true);

    if (!navigator.onLine) {
      await encolarOperacion({ tabla: "sesiones", tipo: "delete", rowId: sesion.id });
      setBorrando(false);
      onDeleted();
      return;
    }

    const { error, status } = await supabase.from("sesiones").delete().eq("id", sesion.id);
    setBorrando(false);
    if (error) {
      if (esErrorDeRed(status)) {
        await encolarOperacion({ tabla: "sesiones", tipo: "delete", rowId: sesion.id });
        onDeleted();
        return;
      }
      alert("No se pudo borrar: " + error.message);
      return;
    }
    onDeleted();
  }

  async function abrirAdjunto(ruta: string) {
    try {
      const url = await urlFirmada(ruta);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("No se pudo abrir el archivo.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={sesion ? "Sesión de entrenamiento" : "Nueva sesión"}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duración (min)">
            <Input type="number" min={0} value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} />
          </Field>
          <Field label="Estado (opcional)">
            <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoSesion)}>
              {ESTADOS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Valoración (1-5, opcional)">
          <Input type="number" min={1} max={5} value={valoracion} onChange={(e) => setValoracion(e.target.value)} />
        </Field>

        <div>
          <div className="mb-2 text-sm text-[var(--color-text-muted)]">
            Adjuntos (imágenes o recursos a tener en cuenta)
          </div>
          <div className="flex flex-col gap-2">
            {adjuntos.map((ruta, i) => (
              <div
                key={ruta}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => abrirAdjunto(ruta)}
                  className="flex-1 truncate text-left text-sm hover:text-[var(--color-accent)]"
                >
                  {nombreArchivo(ruta)}
                </button>
                <button
                  type="button"
                  onClick={() => quitarAdjunto(i)}
                  aria-label="Quitar adjunto"
                  className="text-[var(--color-text-muted)] hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]">
              {subiendo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {subiendo ? "Subiendo..." : "Adjuntar imagen o archivo"}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={subirAdjunto} disabled={subiendo} />
            </label>
          </div>
        </div>

        <Field label="Notas adicionales">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        {sesion ? (
          <Button variant="destructive" size="sm" onClick={borrar} disabled={borrando}>
            {borrando ? "Borrando..." : "Borrar"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
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
