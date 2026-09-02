/**
 * Línea de tendencia de eficacia de tiro partido a partido — mismo espíritu
 * y matemática que `LineaMarcador` (SVG a medida, sin librería, coordenadas
 * con margen desde el principio para que ningún punto quede recortado
 * contra el borde del viewBox), pero una sola línea y eje X en partidos
 * jugados en vez de en tiempo dentro de un partido. Con menos de 2 partidos
 * con tiros registrados no hay tendencia que trazar — no renderiza nada.
 */
export function LineaEvolucionEficacia({ puntos }: { puntos: { label: string; pct: number | null }[] }) {
  const validos = puntos.filter((p): p is { label: string; pct: number } => p.pct !== null);
  if (validos.length < 2) return null;

  const w = 300;
  const h = 60;
  const padX = 4;
  const padY = 4;
  const paso = (w - 2 * padX) / (validos.length - 1);
  const coords = validos.map((p, i) => ({
    x: padX + i * paso,
    y: padY + (1 - p.pct / 100) * (h - 2 * padY),
  }));
  const puntosPolyline = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
        Evolución de eficacia
      </div>
      <div className="card-surface p-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
          <polyline
            points={puntosPolyline}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r="3" fill="var(--color-accent)" />
          ))}
        </svg>
      </div>
    </div>
  );
}
