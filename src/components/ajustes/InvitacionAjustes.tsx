import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useEquipo } from "@/hooks/useEquipo";
import { Button } from "@/components/ui/button";
import type { InvitacionesEquipoRow } from "@/types/database";

export function InvitacionAjustes() {
  const { equipoId } = useEquipo();
  const [invitacion, setInvitacion] = useState<InvitacionesEquipoRow | null>(null);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase
      .from("invitaciones_equipo")
      .select("*")
      .eq("equipo_id", equipoId)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    setInvitacion(data ?? null);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  async function generar() {
    setGenerando(true);
    setError(null);
    setCopiado(false);
    const { error } = await supabase.rpc("crear_invitacion", { p_equipo_id: equipoId });
    setGenerando(false);
    if (error) {
      setError("No se pudo generar la invitación: " + error.message);
      return;
    }
    cargar();
  }

  async function copiarEnlace(codigo: string) {
    const enlace = `${window.location.origin}/unirse/${codigo}`;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("No se pudo copiar. Copia el enlace a mano.");
    }
  }

  if (cargando) return null;

  const vigente = invitacion && !invitacion.usado && new Date(invitacion.expira_en) > new Date();

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Invitar al equipo</h2>

      {vigente && invitacion ? (
        <>
          <p className="text-sm text-[var(--color-text-muted)]">
            Comparte este enlace o código con el entrenador que quieras añadir. Caduca el{" "}
            {new Date(invitacion.expira_en).toLocaleDateString("es-ES")}.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 py-2.5">
            <code className="text-base font-semibold tracking-wide">{invitacion.codigo}</code>
            <button
              onClick={() => copiarEnlace(invitacion.codigo)}
              className="flex items-center gap-1.5 text-sm text-[var(--color-accent)]"
            >
              {copiado ? <Check size={16} /> : <Copy size={16} />}
              {copiado ? "Copiado" : "Copiar enlace"}
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={generar} disabled={generando} className="self-start">
            {generando ? "Regenerando..." : "Regenerar (invalida el código actual)"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--color-text-muted)]">
            {invitacion?.usado
              ? "El último código se ha utilizado."
              : invitacion
                ? "El último código ha caducado."
                : "Este equipo todavía no tiene ninguna invitación generada."}
          </p>
          <Button onClick={generar} disabled={generando} size="sm" className="self-start">
            {generando ? "Generando..." : "Invitar al equipo"}
          </Button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
