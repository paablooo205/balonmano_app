import type { CSSProperties } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Fila de un bloque de sesión, arrastrable para reordenar. El gesto de
 * arrastre se activa desde toda la tarjeta (mantener pulsado + mover) vía el
 * `activationConstraint` del sensor en `SesionDetailPage.tsx`, así que un
 * toque corto sigue abriendo el bloque o el icono de borrar con normalidad.
 */
export function BloqueRow({
  id,
  numero,
  nombre,
  detalle,
  tiempoMin,
  sinAcceso,
  enlace,
  onAbrir,
  onQuitar,
}: {
  id: string;
  numero: number;
  nombre: string;
  detalle: string;
  tiempoMin: number;
  sinAcceso: boolean;
  enlace?: string;
  onAbrir: () => void;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const contenido = (
    <>
      <span className="stat-number flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--color-ink)] text-base text-white">
        {numero}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{nombre}</div>
        {detalle && <div className="truncate text-xs text-[var(--color-text-muted)]">{detalle}</div>}
      </div>
      <span className="stat-number shrink-0 text-[var(--color-accent)]">{tiempoMin}&apos;</span>
    </>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="card-surface flex touch-none items-center gap-1 p-3"
    >
      {sinAcceso ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">{contenido}</div>
      ) : (
        <button
          onClick={onAbrir}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:text-[var(--color-accent)]"
        >
          {contenido}
        </button>
      )}
      {enlace && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            window.open(enlace, "_blank", "noopener,noreferrer");
          }}
          aria-label="Abrir enlace"
          className="shrink-0 p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          <ExternalLink size={16} />
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onQuitar();
        }}
        aria-label="Quitar bloque"
        className="shrink-0 p-1.5 text-[var(--color-text-muted)] hover:text-red-500"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
