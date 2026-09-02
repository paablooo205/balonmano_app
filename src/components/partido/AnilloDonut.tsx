function coordenadaArco(cx: number, cy: number, r: number, angulo: number) {
  const rad = ((angulo - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function trazarArco(cx: number, cy: number, r: number, anguloInicio: number, anguloFin: number): string {
  const inicio = coordenadaArco(cx, cy, r, anguloFin);
  const fin = coordenadaArco(cx, cy, r, anguloInicio);
  const largoArco = anguloFin - anguloInicio <= 180 ? 0 : 1;
  return `M ${inicio.x} ${inicio.y} A ${r} ${r} 0 ${largoArco} 0 ${fin.x} ${fin.y}`;
}

/**
 * Anillo (donut) genérico de N segmentos con leyenda honesta debajo (color +
 * etiqueta + recuento real de cada segmento, nunca solo el arco sin cifra).
 * Sin datos (`total === 0`): anillo gris neutro + "Sin datos" en el centro,
 * nunca un anillo relleno falso. Un único segmento con el 100% del total:
 * círculo completo (un arco de 360° con el mismo punto de inicio y fin no
 * dibuja nada en SVG — caso especial).
 */
export function AnilloDonut({
  segmentos,
  tamano = 96,
  centro,
}: {
  segmentos: { label: string; valor: number; color: string }[];
  tamano?: number;
  centro?: React.ReactNode;
}) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const segmentosConValor = segmentos.filter((s) => s.valor > 0);
  const r = tamano / 2 - 8;
  const cx = tamano / 2;
  const cy = tamano / 2;

  let anguloActual = 0;
  const arcos = segmentosConValor.map((s) => {
    const anguloInicio = anguloActual;
    const anguloFin = anguloActual + (s.valor / total) * 360;
    anguloActual = anguloFin;
    return { ...s, path: trazarArco(cx, cy, r, anguloInicio, anguloFin) };
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: tamano, height: tamano }}>
        <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`}>
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth="10" />
          ) : segmentosConValor.length === 1 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={segmentosConValor[0].color} strokeWidth="10" />
          ) : (
            arcos.map((a, i) => <path key={i} d={a.path} fill="none" stroke={a.color} strokeWidth="10" strokeLinecap="butt" />)
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center">
          {centro ?? (total === 0 && <span className="text-[9px] text-[var(--color-text-faint)]">Sin datos</span>)}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-1">
        {segmentos.map((s) => (
          <span key={s.label} className="flex items-center gap-1 text-[9px] text-[var(--color-text-faint)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            {s.label} ({s.valor})
          </span>
        ))}
      </div>
    </div>
  );
}
