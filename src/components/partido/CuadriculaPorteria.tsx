import { cn } from "@/lib/utils";

/**
 * Rejilla 3×3 de zonas de portería (1-9, de izquierda a derecha y de arriba a
 * abajo, vista de frente a la portería). Siempre presente en el panel de
 * acciones de "Partido en directo": atenuada e intocable en reposo, se
 * ilumina y se vuelve tocable cuando `activo` es true.
 *
 * El componente no decide CUÁNDO se activa (lo deciden los botones de
 * resultado del panel que la monta — Gol/Parado/Parada/Gol en contra) ni QUÉ
 * evento se crea al tocar una zona (lo decide `onZona`): solo dibuja la
 * portería y reporta el toque. Reutilizable en los tres contextos donde hace
 * falta zona: tiro propio y del rival en partido, y tiro propio en
 * entrenamiento.
 *
 * Tarjeta oscura + acento rojo al tocar, igual que el resto de "Partido en
 * directo" — deliberado, no el `card-surface` claro habitual, para que se
 * vea igual en cualquier pantalla donde se monte.
 */
export function CuadriculaPorteria({
  activo,
  compacto,
  onZona,
}: {
  activo: boolean;
  /** En el layout apaisado de "Partido en directo" la columna donde vive es
   * muy estrecha (44% del ancho de pantalla) — sin este límite, la rejilla
   * al 100% del ancho se estira tanto de alto que empuja el resto de grupos
   * de botones fuera de la vista sin hacer scroll. */
  compacto?: boolean;
  onZona: (zona: number) => void;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto overflow-hidden rounded-xl border-[3px] bg-[#15151a] transition-[border-color,opacity]",
        activo ? "border-[var(--color-accent)]/70" : "border-white/25 opacity-40",
        compacto && "max-w-[160px]",
      )}
      style={{ aspectRatio: "3 / 2" }}
    >
      {/* Red de la portería — puramente decorativa, marca las mismas 9 celdas que los botones. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[.22]" preserveAspectRatio="none">
        {[1, 2].map((i) => (
          <line key={`v${i}`} x1={`${i * 33.33}%`} y1="0" x2={`${i * 33.33}%`} y2="100%" stroke="white" strokeWidth="1.5" />
        ))}
        {[1, 2].map((i) => (
          <line key={`h${i}`} x1="0" y1={`${i * 33.33}%`} x2="100%" y2={`${i * 33.33}%`} stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="relative grid h-full grid-cols-3 grid-rows-3 gap-[3px] p-[3px]">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((zona) => (
          <button
            key={zona}
            disabled={!activo}
            onClick={() => onZona(zona)}
            aria-label={`Zona ${zona}`}
            className="rounded-md bg-white/[.06] transition-colors active:scale-[0.96] active:bg-[var(--color-accent)]/60 disabled:pointer-events-none"
          />
        ))}
      </div>
    </div>
  );
}
