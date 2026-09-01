import { crearEscalaTiempo } from "@/lib/escalaTiempo";
import { serieMarcador } from "@/lib/partidoStats";
import type { EventosRow } from "@/types/database";

/**
 * Dos gráficos apilados que comparten el mismo eje X (misma escala temporal,
 * calculada una sola vez a partir de los mismos puntos): arriba el marcador
 * real (nuestra línea en acento, la del rival en blanco atenuado), abajo la
 * diferencia de goles (una sola línea, por encima/debajo de la línea de
 * cero). Con menos de 2 goles en el partido no hay línea que trazar — mismo
 * criterio que `TendenciaEficacia`.
 */
export function LineaMarcador({ eventos }: { eventos: EventosRow[] }) {
  const serie = serieMarcador(eventos);
  if (serie.length < 2) return null;

  const w = 300;
  const hMarcador = 60;
  const hDiff = 36;
  const escalaX = crearEscalaTiempo(
    serie.map((p) => p.ts),
    w,
  );

  const maxGoles = Math.max(...serie.map((p) => Math.max(p.favor, p.contra)), 1);
  const yMarcador = (v: number) => hMarcador - (v / maxGoles) * hMarcador;

  const maxDiffAbs = Math.max(...serie.map((p) => Math.abs(p.favor - p.contra)), 1);
  const yDiff = (v: number) => hDiff / 2 - (v / maxDiffAbs) * (hDiff / 2);

  const puntosFavor = serie.map((p) => `${escalaX(p.ts)},${yMarcador(p.favor)}`).join(" ");
  const puntosContra = serie.map((p) => `${escalaX(p.ts)},${yMarcador(p.contra)}`).join(" ");
  const puntosDiff = serie.map((p) => `${escalaX(p.ts)},${yDiff(p.favor - p.contra)}`).join(" ");

  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Marcador</div>
      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <svg viewBox={`0 0 ${w} ${hMarcador}`} className="h-16 w-full" preserveAspectRatio="none">
          <polyline points={puntosFavor} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={puntosContra} fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="mb-2 mt-1 flex gap-3 text-[9px] text-white/40">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
            Nosotros
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            Rival
          </span>
        </div>
        <div className="border-t border-white/[.07] pt-2">
          <div className="mb-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-white/30">Diferencia</div>
          <svg viewBox={`0 0 ${w} ${hDiff}`} className="h-9 w-full" preserveAspectRatio="none">
            <line x1="0" y1={hDiff / 2} x2={w} y2={hDiff / 2} stroke="white" strokeOpacity="0.15" strokeWidth="1" />
            <polyline points={puntosDiff} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
