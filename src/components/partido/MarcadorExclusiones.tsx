import type { EventosRow } from "@/types/database";

const ALTURA_MAX = 64;

/**
 * Gráfico de columnas propias vs rival — el registro en vivo actual solo
 * permite exclusiones propias; la columna rival está soportada pero no
 * aparecerá en la práctica hasta que se amplíe esa pantalla (fuera de
 * alcance de esta fase).
 */
export function MarcadorExclusiones({ eventos }: { eventos: EventosRow[] }) {
  const exclusiones = eventos.filter((e) => e.tipo === "exclusion");
  if (exclusiones.length === 0) return null;

  const propias = exclusiones.filter((e) => e.equipo_origen === "propio").length;
  const rivales = exclusiones.filter((e) => e.equipo_origen === "rival").length;
  const maximo = Math.max(propias, rivales, 1);

  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Exclusiones</div>
      <div className="card-surface p-4">
        <div className="flex items-end justify-center gap-8">
          <div className="flex flex-col items-center gap-1.5">
            <span className="stat-number text-lg text-[var(--color-ink)]">{propias}</span>
            <div
              className="w-10 rounded-t-[4px]"
              style={{ height: `${Math.max((propias / maximo) * ALTURA_MAX, 4)}px`, background: "var(--color-warning)" }}
            />
            <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">Propias</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="stat-number text-lg text-[var(--color-ink)]">{rivales}</span>
            <div
              className="w-10 rounded-t-[4px]"
              style={{ height: `${Math.max((rivales / maximo) * ALTURA_MAX, 4)}px`, background: "var(--color-accent)" }}
            />
            <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--color-text-faint)]">Rival</span>
          </div>
        </div>
      </div>
    </div>
  );
}
