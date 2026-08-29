import { useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { urlFirmada, nombreArchivo } from "@/lib/storage";

export function AdjuntoFicha({ ruta, onQuitar }: { ruta: string; onQuitar?: () => void }) {
  const [abriendo, setAbriendo] = useState(false);

  async function abrir() {
    setAbriendo(true);
    try {
      const url = await urlFirmada(ruta);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("No se pudo abrir el archivo.");
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 py-2">
      <button
        type="button"
        onClick={abrir}
        disabled={abriendo}
        className="flex flex-1 items-center gap-2 truncate text-left text-sm text-[var(--color-text)] hover:text-[var(--color-accent)]"
      >
        {abriendo ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
        <span className="truncate">{nombreArchivo(ruta)}</span>
      </button>
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label="Quitar archivo"
          className="text-[var(--color-text-muted)] hover:text-red-500"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
