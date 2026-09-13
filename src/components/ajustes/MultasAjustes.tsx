import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { Field, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { DisparadorMulta, MultasConfigRow, MultasTiposRow } from "@/types/database";

const ETIQUETA_DISPARADOR: Record<DisparadorMulta, string> = {
  tardanza: "Automático: llegar tarde",
  falta_injustificada: "Automático: falta sin avisar",
};

export function MultasAjustes() {
  const { equipoId } = useEquipo();
  const [config, setConfig] = useState<MultasConfigRow | null>(null);
  const [tipos, setTipos] = useState<MultasTiposRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoToggle, setGuardandoToggle] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoImporte, setNuevoImporte] = useState("");
  const [creandoTipo, setCreandoTipo] = useState(false);

  async function cargar() {
    const [cfg, t] = await Promise.all([
      supabase.from("multas_config").select("*").eq("equipo_id", equipoId).maybeSingle(),
      supabase.from("multas_tipos").select("*").eq("equipo_id", equipoId).order("created_at"),
    ]);
    setConfig(cfg.data);
    setTipos(t.data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  async function toggleActivo(activo: boolean) {
    setGuardandoToggle(true);
    const { error } = await supabase
      .from("multas_config")
      .upsert({ equipo_id: equipoId, activo }, { onConflict: "equipo_id" });
    if (error) {
      alert("No se pudo guardar: " + error.message);
      setGuardandoToggle(false);
      return;
    }
    // Primera activación con catálogo vacío: siembra los dos tipos
    // automáticos con importes por defecto, editables al momento — da
    // valor inmediato sin exigir configurar nada antes de usarlo.
    if (activo && tipos.length === 0) {
      const { error: seedError } = await supabase.from("multas_tipos").insert([
        { equipo_id: equipoId, nombre: "Llegar tarde", importe: 1, disparador: "tardanza" },
        { equipo_id: equipoId, nombre: "Falta sin avisar", importe: 3, disparador: "falta_injustificada" },
      ]);
      if (seedError) {
        alert("No se pudo crear el catálogo inicial: " + seedError.message);
      }
    }
    setGuardandoToggle(false);
    cargar();
  }

  async function guardarTipo(id: string, campo: "nombre" | "importe", valor: string) {
    const cambios = campo === "nombre" ? { nombre: valor.trim() } : { importe: Number(valor) || 0 };
    if (campo === "nombre" && !cambios.nombre) return;
    const { error } = await supabase.from("multas_tipos").update(cambios).eq("id", id);
    if (error) {
      alert("No se pudo guardar: " + error.message);
      return;
    }
    setTipos((ts) => ts.map((t) => (t.id === id ? { ...t, ...cambios } : t)));
  }

  async function borrarTipo(id: string, nombre: string) {
    const t = tipos.find((t) => t.id === id);
    if (t?.disparador) {
      alert(
        "No se puede borrar: está vinculado a la detección automática de multas. Puedes renombrarlo o cambiar su importe, pero no borrarlo.",
      );
      return;
    }
    if (!confirm(`¿Borrar el tipo "${nombre}"? Las multas ya puestas con este tipo no se borran.`)) return;
    const { error } = await supabase.from("multas_tipos").delete().eq("id", id);
    if (error) {
      alert("No se pudo borrar: " + error.message);
      return;
    }
    setTipos((ts) => ts.filter((t) => t.id !== id));
  }

  async function crearTipo() {
    if (!nuevoNombre.trim()) {
      alert("El nombre es obligatorio.");
      return;
    }
    setCreandoTipo(true);
    const { data, error } = await supabase
      .from("multas_tipos")
      .insert({ equipo_id: equipoId, nombre: nuevoNombre.trim(), importe: Number(nuevoImporte) || 0, disparador: null })
      .select("*")
      .single();
    setCreandoTipo(false);
    if (error || !data) {
      alert("No se pudo crear: " + error?.message);
      return;
    }
    setTipos((ts) => [...ts, data]);
    setNuevoNombre("");
    setNuevoImporte("");
  }

  if (cargando) return null;

  const activo = config?.activo ?? false;

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Sistema de multas</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Multa automática al marcar "llegó tarde" o falta injustificada en el checklist de asistencia.
          </p>
        </div>
        {/* Switch no soporta prop `disabled` (src/components/ui/switch.tsx) — solo se atenúa visualmente mientras guarda. */}
        <Switch checked={activo} onChange={toggleActivo} label="Sistema de multas activo" className={guardandoToggle ? "opacity-50" : ""} />
      </div>

      {activo && (
        <div className="mt-1 flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
          {tipos.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  defaultValue={t.nombre}
                  onBlur={(e) => guardarTipo(t.id, "nombre", e.target.value)}
                  className="text-sm"
                />
                {t.disparador && (
                  <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-accent)]">
                    {ETIQUETA_DISPARADOR[t.disparador]}
                  </span>
                )}
              </div>
              <Input
                type="number"
                min={0}
                step="0.5"
                defaultValue={t.importe}
                onBlur={(e) => guardarTipo(t.id, "importe", e.target.value)}
                className="w-20 text-sm"
              />
              <span className="text-xs text-[var(--color-text-muted)]">€</span>
              {t.disparador ? (
                <button
                  disabled
                  title="No se puede borrar: vinculado a la detección automática de multas"
                  aria-label={`No se puede borrar "${t.nombre}": vinculado a la detección automática de multas`}
                  className="cursor-not-allowed text-[var(--color-text-faint)]"
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <button
                  onClick={() => borrarTipo(t.id, t.nombre)}
                  aria-label={`Borrar tipo "${t.nombre}"`}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}

          <div className="mt-2 flex items-end gap-2 border-t border-[var(--color-border)] pt-3">
            <Field label="Nuevo tipo" className="flex-1">
              <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej. Equipación olvidada" />
            </Field>
            <Field label="Importe">
              <Input type="number" min={0} step="0.5" value={nuevoImporte} onChange={(e) => setNuevoImporte(e.target.value)} className="w-20" />
            </Field>
            <Button size="sm" onClick={crearTipo} disabled={creandoTipo}>
              {creandoTipo ? "..." : "+ Añadir"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
