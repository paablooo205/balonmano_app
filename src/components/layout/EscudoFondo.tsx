import { cn } from "@/lib/utils";

/**
 * Escudo del club como marca de agua de fondo — grayscale + opacidad muy baja
 * convierte la ilustración a color en una silueta ensombrecida, sin necesitar
 * una versión monocromo aparte del archivo. Cada pantalla pasa su propia
 * posición/tamaño/rotación vía className; -z-10 por defecto para no depender
 * del stacking context del padre.
 */
export function EscudoFondo({ className, opacity = 0.06 }: { className?: string; opacity?: number }) {
  return (
    <img
      src="/balonmano.webp"
      alt=""
      aria-hidden="true"
      className={cn("pointer-events-none fixed -z-10 select-none object-contain", className)}
      style={{ opacity, filter: "grayscale(1)" }}
    />
  );
}
