import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { DIAS_SEMANA } from "@/lib/calendar";
import { Button } from "@/components/ui/button";
import { Select, Input } from "@/components/ui/field";
import type { DiaSemana, HorarioRecurrenteRow } from "@/types/database";

interface Slot {
  dia_semana: DiaSemana;
  hora_inicio: string;
  hora_fin: string;
}

const SLOT_POR_DEFECTO: Slot = { dia_semana: 1, hora_inicio: "18:00", hora_fin: "19:30" };

function aSlot(h: HorarioRecurrenteRow): Slot {
  return { dia_semana: h.dia_semana, hora_inicio: h.hora_inicio.slice(0, 5), hora_fin: h.hora_fin.slice(0, 5) };
}

export function HorarioSetup({
  equipoId,
  existente,
  onListo,
  onCancelar,
}: {
  equipoId: string;
  existente: HorarioRecurrenteRow[];
  onListo: () => void;
  onCancelar?: () => void;
}) {
  const [slots, setSlots] = useState<Slot[]>(
    existente.length > 0 ? existente.map(aSlot) : [SLOT_POR_DEFECTO],
  );
  const [guardando, setGuardando] = useState(false);

  function actualizar(i: number, cambios: Partial<Slot>) {
    setSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, ...cambios } : slot)));
  }
  function añadir() {
    setSlots((s) => [...s, SLOT_POR_DEFECTO]);
  }
  function quitar(i: number) {
    setSlots((s) => s.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    setGuardando(true);
    if (existente.length > 0) {
      const { error: delError } = await supabase
        .from("horario_recurrente")
        .delete()
        .eq("equipo_id", equipoId);
      if (delError) {
        setGuardando(false);
        alert("No se pudo actualizar: " + delError.message);
        return;
      }
    }
    const { error } = await supabase
      .from("horario_recurrente")
      .insert(slots.map((s) => ({ equipo_id: equipoId, ...s })));
    setGuardando(false);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    onListo();
  }

  return (
    <div className="card-surface p-5">
      <h2 className="text-lg font-semibold">Configura el horario de entrenamientos</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Días y horas fijas de la semana. Podrás cambiarlo luego en Ajustes.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              value={slot.dia_semana}
              onChange={(e) => actualizar(i, { dia_semana: Number(e.target.value) as DiaSemana })}
              className="flex-1"
            >
              {DIAS_SEMANA.map((d, idx) => (
                <option key={idx} value={idx}>
                  {d}
                </option>
              ))}
            </Select>
            <Input
              type="time"
              value={slot.hora_inicio}
              onChange={(e) => actualizar(i, { hora_inicio: e.target.value })}
              className="w-28"
            />
            <span className="text-[var(--color-text-muted)]">–</span>
            <Input
              type="time"
              value={slot.hora_fin}
              onChange={(e) => actualizar(i, { hora_fin: e.target.value })}
              className="w-28"
            />
            {slots.length > 1 && (
              <button onClick={() => quitar(i)} className="text-[var(--color-text-muted)] hover:text-red-500" aria-label="Quitar">
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={añadir}
        className="mt-3 flex items-center gap-1.5 text-sm text-[var(--color-accent)]"
      >
        <Plus size={16} /> Añadir otro día
      </button>

      <div className="mt-5 flex gap-2">
        {onCancelar && (
          <Button variant="secondary" className="flex-1" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </Button>
        )}
        <Button className="flex-1" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar horario"}
        </Button>
      </div>
    </div>
  );
}
