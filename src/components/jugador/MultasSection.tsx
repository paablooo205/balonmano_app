import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { MultaManualModal } from "./MultaManualModal";
import type { MultasRow, MultasTiposRow } from "@/types/database";

const FORMATO_EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function MultasSection({ equipoId, jugadorId }: { equipoId: string; jugadorId: string }) {
  const [activo, setActivo] = useState(false);
  const [multas, setMultas] = useState<MultasRow[]>([]);
  const [tipos, setTipos] = useState<MultasTiposRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [saldando, setSaldando] = useState(false);

  async function cargar() {
    const [cfg, m, t] = await Promise.all([
      supabase.from("multas_config").select("*").eq("equipo_id", equipoId).maybeSingle(),
      supabase.from("multas").select("*").eq("jugador_id", jugadorId).order("fecha", { ascending: false }),
      supabase.from("multas_tipos").select("*").eq("equipo_id", equipoId).eq("activo", true),
    ]);
    setActivo(cfg.data?.activo ?? false);
    setMultas(m.data ?? []);
    setTipos(t.data ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId, jugadorId]);

  if (cargando || !activo) return null;

  const deuda = multas.filter((m) => !m.pagada).reduce((s, m) => s + m.importe, 0);

  async function saldar() {
    if (!confirm(`¿Marcar como saldados ${FORMATO_EUR.format(deuda)} de multas pendientes?`)) return;
    setSaldando(true);
    const { error } = await supabase
      .from("multas")
      .update({ pagada: true, pagada_at: new Date().toISOString() })
      .eq("jugador_id", jugadorId)
      .eq("pagada", false);
    setSaldando(false);
    if (error) {
      alert("No se pudo saldar: " + error.message);
      return;
    }
    cargar();
  }

  async function borrarMulta(m: MultasRow) {
    if (!confirm(`¿Borrar la multa "${m.concepto}" (${FORMATO_EUR.format(m.importe)})?`)) return;
    const { error } = await supabase.from("multas").delete().eq("id", m.id);
    if (error) {
      alert("No se pudo borrar: " + error.message);
      return;
    }
    setMultas((ms) => ms.filter((x) => x.id !== m.id));
  }

  return (
    <div>
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
        Multas
      </div>
      <div className="card-surface p-4">
        <div className="flex items-end justify-between gap-2">
          <div className="stat-number text-[2.375rem] leading-none text-[var(--color-accent)]">
            {FORMATO_EUR.format(deuda)}
          </div>
          <div className="flex shrink-0 gap-2">
            {deuda > 0 && (
              <Button size="sm" variant="secondary" onClick={saldar} disabled={saldando}>
                {saldando ? "..." : "Saldar"}
              </Button>
            )}
            <Button size="sm" onClick={() => setModalAbierto(true)}>
              + Multa
            </Button>
          </div>
        </div>
        {multas.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3">
            {multas.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span
                    className={
                      m.pagada
                        ? "text-[var(--color-text-faint)] line-through"
                        : "text-[var(--color-text-muted)]"
                    }
                  >
                    {new Date(m.fecha + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} · {m.concepto}
                  </span>
                  {m.notas_adicionales && (
                    <div className="text-[10px] text-[var(--color-text-faint)]">{m.notas_adicionales}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-medium">{FORMATO_EUR.format(m.importe)}</span>
                  <button
                    onClick={() => borrarMulta(m)}
                    aria-label={`Borrar multa "${m.concepto}"`}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MultaManualModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        equipoId={equipoId}
        jugadorId={jugadorId}
        tipos={tipos}
        onSaved={() => {
          setModalAbierto(false);
          cargar();
        }}
      />
    </div>
  );
}
