import type { EventosRow } from "@/types/database";

const ALTURA_MAX = 64;

type Categoria = { key: string; label: string; coincide: (e: EventosRow) => boolean };

const CATEGORIAS: Categoria[] = [
  { key: "amarilla", label: "Amarilla", coincide: (e) => e.tipo === "tarjeta" && e.color_tarjeta === "amarilla" },
  { key: "azul", label: "Azul", coincide: (e) => e.tipo === "tarjeta" && e.color_tarjeta === "azul" },
  { key: "roja", label: "Roja", coincide: (e) => e.tipo === "tarjeta" && e.color_tarjeta === "roja" },
  { key: "dosmin", label: "2 min", coincide: (e) => e.tipo === "exclusion" },
];

/**
 * Gráfico de columnas de sanciones (tarjetas amarilla/azul/roja + exclusión
 * de 2') — una pareja de columnas por tipo, propias (rojo, siempre nuestro
 * color) vs rival (negro, siempre). El registro en vivo actual solo permite
 * sanciones propias; la columna rival está soportada pero no aparecerá en
 * la práctica hasta que se amplíe esa pantalla (fuera de alcance de esta
 * fase, mismo criterio que ya tenía este gráfico solo con exclusiones).
 */
export function MarcadorSanciones({ eventos }: { eventos: EventosRow[] }) {
  const filas = CATEGORIAS.map((cat) => {
    const coincidentes = eventos.filter(cat.coincide);
    return {
      ...cat,
      propias: coincidentes.filter((e) => e.equipo_origen === "propio").length,
      rivales: coincidentes.filter((e) => e.equipo_origen === "rival").length,
    };
  });

  const total = filas.reduce((sum, f) => sum + f.propias + f.rivales, 0);
  if (total === 0) return null;

  const maximo = Math.max(...filas.flatMap((f) => [f.propias, f.rivales]), 1);

  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Sanciones</div>
      <div className="card-surface p-4">
        <div className="flex items-end justify-around gap-2">
          {filas.map((f) => (
            <div key={f.key} className="flex flex-col items-center gap-1.5">
              <div className="flex items-end gap-1">
                <div className="flex flex-col items-center gap-1">
                  <span className="stat-number text-sm text-[var(--color-ink)]">{f.propias}</span>
                  <div
                    className="w-5 rounded-t-[3px]"
                    style={{ height: `${Math.max((f.propias / maximo) * ALTURA_MAX, 4)}px`, background: "var(--color-accent)" }}
                  />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="stat-number text-sm text-[var(--color-ink)]">{f.rivales}</span>
                  <div
                    className="w-5 rounded-t-[3px]"
                    style={{ height: `${Math.max((f.rivales / maximo) * ALTURA_MAX, 4)}px`, background: "var(--color-ink)" }}
                  />
                </div>
              </div>
              <span className="text-[9px] uppercase tracking-[0.06em] text-[var(--color-text-faint)]">{f.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-center gap-3 text-[9px] text-[var(--color-text-faint)]">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
            Nuestro
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-ink)" }} />
            Rival
          </span>
        </div>
      </div>
    </div>
  );
}
