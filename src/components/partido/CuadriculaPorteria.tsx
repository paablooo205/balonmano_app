import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Portería 3×3 de zonas (1-9, de izquierda a derecha y de arriba a abajo,
 * vista de frente desde el lanzador). Siempre presente en el panel de
 * "Partido en directo": atenuada e intocable sin jugador seleccionado
 * (`tocable=false`); tocable en cuanto hay alguien seleccionado, y con el
 * marco en acento cuando hay una acción o una zona ya armada esperando la
 * otra mitad del registro (flujo bidireccional, ver ContadoresEnVivo.tsx).
 *
 * Dibujada como una portería de verdad — postes y larguero a franjas
 * rojo/blanco (como las reglamentarias), red de fondo y línea de gol — para
 * que se lea de un vistazo como "la portería" y no como una rejilla
 * abstracta. La zona armada (`zonaArmada`) queda marcada hasta que se elige
 * el resultado.
 *
 * El mapa de calor (activado por defecto) tiñe cada zona según su recuento
 * en `conteosPorZona` — lo calcula el llamante (filtrado por el jugador
 * seleccionado, o total de equipo si no hay selección).
 *
 * El componente no decide QUÉ evento se crea al tocar una zona (lo decide
 * `onZona`, en el llamante): solo dibuja la portería y reporta el toque.
 */
export function CuadriculaPorteria({
  tocable,
  resaltado,
  compacto,
  onZona,
  conteosPorZona,
  zonaArmada = null,
  ajustarAlto = false,
}: {
  tocable: boolean;
  resaltado: boolean;
  /** Es el elemento protagonista de la pantalla — grande y centrado
   * (`max-w-[560px]` normal, `max-w-[280px]` en el apaisado de una mano). */
  compacto?: boolean;
  onZona: (zona: number) => void;
  conteosPorZona: Record<number, number>;
  zonaArmada?: number | null;
  /** Pantalla fija: la portería ocupa el alto disponible del contenedor
   * (que debe tener alto definido) manteniendo su proporción 3:2, en vez
   * de dimensionarse por ancho y empujar lo de abajo fuera de la vista. */
  ajustarAlto?: boolean;
}) {
  const [mapaCalor, setMapaCalor] = useState(true);
  const max = Math.max(1, ...Object.values(conteosPorZona));
  const total = Object.values(conteosPorZona).reduce((a, b) => a + b, 0);

  // Franjas reglamentarias de los postes: rojo/blanco alternos de ~20cm.
  const franjasVerticales = "repeating-linear-gradient(180deg, var(--color-accent) 0 14px, #f4f4f5 14px 28px)";
  const franjasHorizontales = "repeating-linear-gradient(90deg, var(--color-accent) 0 14px, #f4f4f5 14px 28px)";
  const grosor = compacto ? 7 : 10;

  return (
    // Con `ajustarAlto`, el contenedor exterior es un contenedor de tamaño
    // (container queries) y el bloque interior — cabecera + portería +
    // rótulo — toma el menor ancho entre el disponible y el que permite el
    // alto (alto − cabecera, línea de gol y rótulo, × 1,5). El bloque va
    // pegado abajo, junto a lo que haya debajo (estadísticas), en vez de
    // dejar un hueco entre ambos cuando sobra alto.
    <div
      className={cn(ajustarAlto ? "flex h-full flex-col justify-end" : "mx-auto w-full", !ajustarAlto && (compacto ? "max-w-[280px]" : "max-w-[560px]"))}
      style={ajustarAlto ? { containerType: "size" } : undefined}
    >
    <div
      className="mx-auto flex w-full flex-col gap-2"
      style={ajustarAlto ? { width: `min(100cqw, calc((100cqh - ${compacto ? 30 : 82}px) * 1.5))` } : undefined}
    >
      <div className={cn("flex items-center justify-between gap-2", ajustarAlto && compacto && "hidden")}>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
          Portería {total > 0 && <span className="stat-number ml-1 text-white/80">· {total} tiros</span>}
        </span>
        <button
          onClick={() => setMapaCalor((v) => !v)}
          aria-pressed={mapaCalor}
          className={cn(
            "flex h-11 shrink-0 items-center gap-2 rounded px-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors",
            mapaCalor ? "text-white" : "text-white/60",
          )}
        >
          <span
            className={cn(
              "relative h-4 w-7 rounded-full transition-colors",
              mapaCalor ? "bg-[var(--color-accent)]" : "bg-white/20",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left]",
                mapaCalor ? "left-[14px]" : "left-0.5",
              )}
            />
          </span>
          Mapa de calor
        </button>
      </div>

      <div className={cn("transition-opacity", !tocable && "opacity-40")}>
        {/* Marco: larguero arriba + dos postes. Sin poste abajo — la línea de
            gol es el suelo. */}
        <div
          className={cn(
            "relative rounded-t-[3px] transition-shadow",
            resaltado && tocable && "shadow-[0_0_0_2px_var(--color-accent),0_0_24px_-4px_var(--color-accent)]",
          )}
          style={{
            aspectRatio: "3 / 2",
            paddingTop: grosor,
            paddingLeft: grosor,
            paddingRight: grosor,
            backgroundImage: `${franjasHorizontales}, ${franjasVerticales}, ${franjasVerticales}`,
            backgroundSize: `100% ${grosor}px, ${grosor}px 100%, ${grosor}px 100%`,
            backgroundPosition: "top left, top left, top right",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Red: trama diagonal muy suave sobre fondo oscuro. */}
          <div
            className="relative grid h-full grid-cols-3 grid-rows-3"
            style={{
              backgroundColor: "#141418",
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(255,255,255,.045) 0 1px, transparent 1px 11px), repeating-linear-gradient(-45deg, rgba(255,255,255,.045) 0 1px, transparent 1px 11px)",
            }}
          >
            {Array.from({ length: 9 }, (_, i) => i + 1).map((zona) => {
              const cnt = conteosPorZona[zona] ?? 0;
              const hot = mapaCalor && cnt > 0;
              const armada = zonaArmada === zona;
              const col = (zona - 1) % 3;
              const fila = Math.floor((zona - 1) / 3);
              return (
                <button
                  key={zona}
                  disabled={!tocable}
                  onClick={() => onZona(zona)}
                  aria-label={`Zona ${zona}${cnt > 0 ? `, ${cnt} tiros` : ""}`}
                  aria-pressed={armada}
                  className={cn(
                    "relative flex items-center justify-center transition-colors active:bg-white/15 disabled:pointer-events-none",
                    col < 2 && "border-r border-dashed border-white/15",
                    fila < 2 && "border-b border-dashed border-white/15",
                  )}
                  style={{
                    background: armada
                      ? "color-mix(in oklab, var(--color-accent) 70%, transparent)"
                      : hot
                        ? `color-mix(in oklab, var(--color-accent) ${Math.round(14 + 50 * (cnt / max))}%, transparent)`
                        : undefined,
                  }}
                >
                  <span className="stat-number pointer-events-none absolute left-1.5 top-1 text-[11px] leading-none text-white/45">
                    {zona}
                  </span>
                  {hot && !armada && (
                    <span className={cn("stat-number leading-none text-white", compacto ? "text-lg" : "text-2xl")}>{cnt}</span>
                  )}
                  {armada && (
                    <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white">Zona {zona}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {/* Línea de gol + perspectiva. */}
        <div className="h-[3px] bg-white/70" />
        <div className="mt-1.5 flex justify-between px-0.5 text-[11px] leading-none text-white/60" aria-hidden="true">
          <span>← Izq.</span>
          <span>Vista desde el lanzador</span>
          <span>Der. →</span>
        </div>
      </div>
      </div>
    </div>
  );
}
