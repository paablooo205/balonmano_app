import { ExternalLink, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { BloqueSesion } from "@/types/database";

/**
 * Vista de solo lectura de un bloque libre ya guardado — mismo criterio que
 * la ficha de ejercicio: al abrirlo no se ve un formulario con campos para
 * rellenar, solo el contenido en texto normal, con un botón "Editar" que
 * lleva al formulario real (BloqueModal).
 */
export function BloqueDetailModal({
  open,
  onClose,
  bloque,
  onEditar,
}: {
  open: boolean;
  onClose: () => void;
  bloque: BloqueSesion | null;
  onEditar: () => void;
}) {
  if (!bloque) return null;

  return (
    <Modal open={open} onClose={onClose} title="Bloque de entrenamiento">
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
            Minutos
          </div>
          <div className="stat-number text-2xl text-[var(--color-accent)]">{bloque.tiempo_min}&apos;</div>
        </div>

        {bloque.descripcion_libre && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
              Descripción
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed">{bloque.descripcion_libre}</p>
          </div>
        )}

        {bloque.objetivo && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
              Objetivo
            </div>
            <p className="text-sm leading-relaxed">{bloque.objetivo}</p>
          </div>
        )}

        {bloque.consignas && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
              Consignas
            </div>
            <p className="text-sm leading-relaxed">{bloque.consignas}</p>
          </div>
        )}

        {bloque.enlace && (
          <a
            href={bloque.enlace}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-[15px] border border-[var(--color-border)] p-3 text-sm font-medium text-[var(--color-accent)]"
          >
            <ExternalLink size={16} /> Abrir enlace
          </a>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cerrar
        </Button>
        <Button type="button" size="sm" onClick={onEditar}>
          <Pencil size={15} /> Editar
        </Button>
      </div>
    </Modal>
  );
}
