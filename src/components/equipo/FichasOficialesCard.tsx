import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { AdjuntoFicha } from "./AdjuntoFicha";
import { supabase } from "@/lib/supabaseClient";
import { subirArchivo, borrarArchivo } from "@/lib/storage";

/**
 * Fichas oficiales de toda la plantilla en un único archivo por equipo
 * (ej. el PDF de la federación con todos los jugadores), separado de la
 * ficha individual de cada jugador (`JugadorFormModal`). Escribe directo en
 * `equipos.fichas_oficiales_url` — sin borrador/cancelar, cada acción se
 * confirma al momento.
 */
export function FichasOficialesCard({ equipoId }: { equipoId: string }) {
  const [ruta, setRuta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const { data } = await supabase
        .from("equipos")
        .select("fichas_oficiales_url")
        .eq("id", equipoId)
        .maybeSingle();
      setRuta(data?.fichas_oficiales_url ?? null);
      setCargando(false);
    })();
  }, [equipoId]);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    try {
      const nuevaRuta = await subirArchivo(`equipo/${equipoId}`, file);
      const { error } = await supabase
        .from("equipos")
        .update({ fichas_oficiales_url: nuevaRuta })
        .eq("id", equipoId);
      if (error) {
        await borrarArchivo(nuevaRuta).catch(() => {});
        alert("No se pudo guardar: " + error.message);
        return;
      }
      if (ruta) void borrarArchivo(ruta).catch(() => {});
      setRuta(nuevaRuta);
    } catch (err) {
      alert("No se pudo subir el archivo: " + (err as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar() {
    if (!ruta) return;
    if (!confirm("¿Quitar las fichas oficiales del equipo?")) return;
    const anterior = ruta;
    const { error } = await supabase.from("equipos").update({ fichas_oficiales_url: null }).eq("id", equipoId);
    if (error) {
      alert("No se pudo quitar: " + error.message);
      return;
    }
    setRuta(null);
    void borrarArchivo(anterior).catch(() => {});
  }

  if (cargando) return null;

  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-[var(--color-text-muted)]">Fichas oficiales</h2>
      {ruta ? (
        <AdjuntoFicha ruta={ruta} onQuitar={quitar} />
      ) : (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] py-3 text-sm text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]">
          <Upload size={16} />
          {subiendo ? "Subiendo..." : "Subir fichas oficiales (PDF o imagen)"}
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleArchivo} disabled={subiendo} />
        </label>
      )}
    </div>
  );
}
