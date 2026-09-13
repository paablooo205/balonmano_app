import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { toISODate } from "@/lib/calendar";
import type { MultasTiposRow } from "@/types/database";

const FORMATO_EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function MultaManualModal({
  open,
  onClose,
  equipoId,
  jugadorId,
  tipos,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  jugadorId: string;
  tipos: MultasTiposRow[];
  onSaved: () => void;
}) {
  const [tipoId, setTipoId] = useState("");
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) {
      setTipoId(tipos[0]?.id ?? "");
      setFecha(toISODate(new Date()));
      setNota("");
    }
  }, [open, tipos]);

  async function guardar() {
    const tipo = tipos.find((t) => t.id === tipoId);
    if (!tipo) {
      alert("Elige un tipo de multa.");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from("multas").insert({
      equipo_id: equipoId,
      jugador_id: jugadorId,
      tipo_id: tipo.id,
      concepto: tipo.nombre,
      importe: tipo.importe,
      origen: "manual",
      fecha,
      notas_adicionales: nota.trim() || null,
    });
    setGuardando(false);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Añadir multa">
      <div className="flex flex-col gap-4">
        {tipos.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No hay ningún tipo de multa configurado. Añade uno desde Ajustes.
          </p>
        ) : (
          <>
            <Field label="Tipo">
              <Select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} — {FORMATO_EUR.format(t.importe)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Nota (opcional)">
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={guardando || tipos.length === 0}>
          {guardando ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </Modal>
  );
}
