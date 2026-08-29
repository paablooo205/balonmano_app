import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { PageHeader } from "@/components/layout/PageHeader";
import { HorarioSetup } from "@/components/calendario/HorarioSetup";
import { NotificacionesAjustes } from "@/components/ajustes/NotificacionesAjustes";
import { PlanificacionAjustes } from "@/components/ajustes/PlanificacionAjustes";
import { InvitacionAjustes } from "@/components/ajustes/InvitacionAjustes";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { usePreferenciaMenu, type PreferenciaMenu } from "@/hooks/usePreferenciaMenu";
import type { HorarioRecurrenteRow } from "@/types/database";

const OPCIONES_MENU: { valor: PreferenciaMenu; label: string }[] = [
  { valor: "auto", label: "Automático" },
  { valor: "abajo", label: "Abajo" },
  { valor: "lateral", label: "Lateral" },
];

export function AjustesPage() {
  const { equipo, equipoId } = useEquipo();
  const { preferencia: preferenciaMenu, setPreferencia: setPreferenciaMenu } = usePreferenciaMenu();
  const [horario, setHorario] = useState<HorarioRecurrenteRow[]>([]);
  const [cargandoHorario, setCargandoHorario] = useState(true);

  const [nombre, setNombre] = useState(equipo?.nombre ?? "");
  const [temporada, setTemporada] = useState(equipo?.temporada ?? "");
  const [guardandoEquipo, setGuardandoEquipo] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  useEffect(() => {
    setNombre(equipo?.nombre ?? "");
    setTemporada(equipo?.temporada ?? "");
  }, [equipo]);

  async function cargarHorario() {
    setCargandoHorario(true);
    const { data } = await supabase.from("horario_recurrente").select("*").eq("equipo_id", equipoId);
    setHorario(data ?? []);
    setCargandoHorario(false);
  }

  useEffect(() => {
    cargarHorario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  async function guardarEquipo() {
    if (!nombre.trim() || !temporada.trim()) {
      alert("Nombre y temporada son obligatorios.");
      return;
    }
    setGuardandoEquipo(true);
    const { error } = await supabase
      .from("equipos")
      .update({ nombre: nombre.trim(), temporada: temporada.trim() })
      .eq("id", equipoId);
    setGuardandoEquipo(false);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ajustes" />

      <div className="card-surface flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Datos del equipo</h2>
        <Field label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Field>
        <Field label="Temporada">
          <Input value={temporada} onChange={(e) => setTemporada(e.target.value)} />
        </Field>
        <Button onClick={guardarEquipo} disabled={guardandoEquipo} size="sm" className="self-start">
          {guardandoEquipo ? (
            "Guardando..."
          ) : guardadoOk ? (
            <span className="flex items-center gap-1.5">
              <Check size={16} /> Guardado
            </span>
          ) : (
            "Guardar"
          )}
        </Button>
      </div>

      <div className="card-surface flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Apariencia</h2>
        <Field label="Posición del menú">
          <div className="tab-pill-group">
            {OPCIONES_MENU.map((op) => (
              <button
                key={op.valor}
                type="button"
                className="tab-pill"
                data-active={preferenciaMenu === op.valor}
                onClick={() => setPreferenciaMenu(op.valor)}
              >
                {op.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {!cargandoHorario && (
        <HorarioSetup
          equipoId={equipoId}
          existente={horario}
          onListo={() => {
            cargarHorario();
          }}
        />
      )}

      <PlanificacionAjustes />

      <InvitacionAjustes />

      <NotificacionesAjustes />
    </div>
  );
}
