import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Rejilla 3×3 de zonas de portería (1-9, de izquierda a derecha y de arriba a
 * abajo, vista de frente a la portería). Siempre presente en el panel de
 * "Partido en directo": atenuada e intocable sin jugador seleccionado
 * (`tocable=false`); tocable en cuanto hay alguien seleccionado, y resaltada
 * en acento cuando hay una acción o una zona ya armada esperando la otra
 * mitad del registro (flujo bidireccional, ver ContadoresEnVivo.tsx).
 *
 * El mapa de calor (activado por defecto) tiñe cada zona según su recuento en
 * `conteosPorZona` — lo calcula el llamante (normalmente filtrado por el
 * jugador seleccionado, o total de equipo si no hay selección). El número de
 * zona (1-9) se muestra siempre en la esquina superior izquierda de cada
 * celda, atenuado — lectura "técnica" incluso con el mapa de calor apagado;
 * el recuento del mapa de calor, cuando aplica, se sigue mostrando centrado.
 *
 * El componente no decide QUÉ evento se crea al tocar una zona (lo decide
 * `onZona`, en el llamante): solo dibuja la portería y reporta el toque.
 * Reutilizable en los tres contextos donde hace falta zona: tiro propio y del
 * rival en partido, y tiro propio en entrenamiento.
 *
 * Tarjeta oscura + acento rojo, igual que el resto de "Partido en directo" —
 * deliberado, no el `card-surface` claro habitual, para que se vea igual en
 * cualquier pantalla donde se monte.
 */
export function CuadriculaPorteria({
  tocable,
  resaltado,
  compacto,
  onZona,
  conteosPorZona,
}: {
  tocable: boolean;
  resaltado: boolean;
  /** Es el elemento protagonista de la pantalla — grande y centrado
   * (`max-w-[560px]` normal, `max-w-[280px]` en el apaisado de una mano,
   * donde el ancho disponible es mucho menor). Ambos límites existen para
   * que la rejilla no se estire sin control en pantallas muy anchas ni
   * empuje el resto de grupos de botones fuera de la vista en apaisado. */
  compacto?: boolean;
  onZona: (zona: number) => void;
  conteosPorZona: Record<number, number>;
}) {
  const [mapaCalor, setMapaCalor] = useState(true);
  const max = Math.max(1, ...Object.values(conteosPorZona));

  return (
    <div className={cn("mx-auto flex w-full flex-col gap-1.5", compacto ? "max-w-[280px]" : "max-w-[560px]")}>
      <div className="flex justify-end">
        <button
          onClick={() => setMapaCalor((v) => !v)}
          className={cn(
            "flex h-6 items-center rounded-[3px] px-2 text-[9px] font-semibold uppercase tracking-[0.08em] transition-colors",
            mapaCalor ? "bg-[var(--color-accent)] text-white" : "bg-white/[.08] text-white/50",
          )}
        >
          Mapa de calor
        </button>
      </div>
      <div
        className={cn(
          "relative overflow-hidden rounded border-[3px] bg-[#15151a] transition-[border-color,opacity]",
          !tocable ? "border-white/25 opacity-40" : resaltado ? "border-[var(--color-accent)]/70" : "border-white/30",
        )}
        style={{ aspectRatio: "3 / 2" }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[.22]" preserveAspectRatio="none">
          {[1, 2].map((i) => (
            <line key={`v${i}`} x1={`${i * 33.33}%`} y1="0" x2={`${i * 33.33}%`} y2="100%" stroke="white" strokeWidth="1.5" />
          ))}
          {[1, 2].map((i) => (
            <line key={`h${i}`} x1="0" y1={`${i * 33.33}%`} x2="100%" y2={`${i * 33.33}%`} stroke="white" strokeWidth="1.5" />
          ))}
        </svg>
        <div className="relative grid h-full grid-cols-3 grid-rows-3 gap-[3px] p-[3px]">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((zona) => {
            const cnt = conteosPorZona[zona] ?? 0;
            const hot = mapaCalor && cnt > 0;
            return (
              <button
                key={zona}
                disabled={!tocable}
                onClick={() => onZona(zona)}
                aria-label={`Zona ${zona}`}
                className="relative flex items-center justify-center rounded-[2px] transition-colors active:scale-[0.96] disabled:pointer-events-none"
                style={{
                  background: hot
                    ? `color-mix(in oklab, var(--color-accent) ${Math.round(22 + 58 * (cnt / max))}%, #15151a)`
                    : "rgba(255,255,255,.06)",
                }}
              >
                <span className="stat-number pointer-events-none absolute left-1 top-0.5 text-[9px] leading-none text-white/30">
                  {zona}
                </span>
                {hot && <span className="stat-number text-xs text-white">{cnt}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
