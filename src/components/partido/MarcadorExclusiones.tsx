import { crearEscalaTiempo } from "@/lib/escalaTiempo";
import type { EventosRow } from "@/types/database";

/**
 * Línea de tiempo simple: un punto por cada exclusión, posicionado según
 * cuándo ocurrió (propia en ámbar, rival en rojo) — sin eje Y, solo
 * posición horizontal. El registro en vivo actual solo permite exclusiones
 * propias; el color rival está soportado pero no aparecerá en la práctica
 * hasta que se amplíe esa pantalla (fuera de alcance de esta fase).
 */
export function MarcadorExclusiones({ eventos }: { eventos: EventosRow[] }) {
  const exclusiones = eventos.filter((e) => e.tipo === "exclusion").sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  if (exclusiones.length === 0) return null;

  const w = 300;
  const escalaX = crearEscalaTiempo(
    exclusiones.map((e) => e.creado_en),
    w,
  );
  const propias = exclusiones.filter((e) => e.equipo_origen === "propio").length;
  const rivales = exclusiones.filter((e) => e.equipo_origen === "rival").length;

  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Exclusiones</div>
      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <svg viewBox={`0 0 ${w} 20`} className="h-5 w-full" preserveAspectRatio="none">
          <line x1="0" y1="10" x2={w} y2="10" stroke="white" strokeOpacity="0.15" strokeWidth="1" />
          {exclusiones.map((e) => (
            <circle key={e.id} cx={escalaX(e.creado_en)} cy="10" r="4" fill={e.equipo_origen === "propio" ? "var(--color-warning)" : "var(--color-accent)"} />
          ))}
        </svg>
        <div className="mt-2 flex gap-3 text-[9px] text-white/40">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-warning)" }} />
            Propias ({propias})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
            Rival ({rivales})
          </span>
        </div>
      </div>
    </div>
  );
}
