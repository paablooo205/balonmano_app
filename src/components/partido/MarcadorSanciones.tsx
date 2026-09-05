import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventosRow, JugadoresRow } from "@/types/database";

const ALTURA_MAX = 64;

type Categoria = { key: string; label: string; color: string; coincide: (e: EventosRow) => boolean };

// Mismos hex que BOTONES_TARJETA (partidoStats.ts) para las tarjetas —
// "2 min" no es una tarjeta, usa el ámbar ya establecido para exclusiones.
// Orden de menor a mayor gravedad: 2' < amarilla < roja < azul.
const CATEGORIAS: Categoria[] = [
  { key: "dosmin", label: "2 min", color: "var(--color-warning)", coincide: (e) => e.tipo === "exclusion" },
  { key: "amarilla", label: "Amarilla", color: "#f0c419", coincide: (e) => e.tipo === "tarjeta" && e.color_tarjeta === "amarilla" },
  { key: "roja", label: "Roja", color: "var(--color-accent)", coincide: (e) => e.tipo === "tarjeta" && e.color_tarjeta === "roja" },
  { key: "azul", label: "Azul", color: "#3d8ad6", coincide: (e) => e.tipo === "tarjeta" && e.color_tarjeta === "azul" },
];

/**
 * Gráfico de columnas de sanciones (tarjetas amarilla/azul/roja + exclusión
 * de 2') — una pareja de columnas por tipo, propias (rojo, siempre nuestro
 * color) vs rival (negro, siempre). El registro en vivo actual solo permite
 * sanciones propias; la columna rival está soportada pero no aparecerá en
 * la práctica hasta que se amplíe esa pantalla (fuera de alcance de esta
 * fase, mismo criterio que ya tenía este gráfico solo con exclusiones).
 *
 * "Ver quién y cuándo" despliega cada sanción como una fila con su color de
 * categoría, jugador y minuto — sin abandonar la tarjeta del gráfico.
 */
export function MarcadorSanciones({ eventos, jugadores }: { eventos: EventosRow[]; jugadores: JugadoresRow[] }) {
  const [verDetalle, setVerDetalle] = useState(false);

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

  const detalle = eventos
    .filter((e) => e.tipo === "tarjeta" || e.tipo === "exclusion")
    .map((e) => {
      const categoria = CATEGORIAS.find((c) => c.coincide(e));
      return {
        id: e.id,
        etiqueta: categoria?.label ?? "Sanción",
        color: categoria?.color ?? "var(--color-text-faint)",
        minuto: e.minuto,
        esRival: e.equipo_origen === "rival",
        nombre: e.equipo_origen === "rival" ? "Rival" : (jugadores.find((j) => j.id === e.jugador_id)?.nombre ?? "—"),
      };
    })
    .sort((a, b) => (a.minuto ?? Infinity) - (b.minuto ?? Infinity));

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

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setVerDetalle((v) => !v)}
          className="mt-3 w-full border-t border-[var(--color-border)] pt-4"
        >
          {verDetalle ? "Ocultar quién y cuándo" : "Ver quién y cuándo"}
          {verDetalle ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </Button>

        {verDetalle && (
          <div className="mt-3 flex flex-col gap-1.5">
            {detalle.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-[10px] bg-[var(--color-bg)] px-3 py-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[9px] font-bold uppercase text-white"
                  style={{ background: d.color }}
                >
                  {d.etiqueta === "2 min" ? "2'" : d.etiqueta.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--color-text)]">{d.nombre}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-faint)]">
                    {d.etiqueta} · {d.esRival ? "Rival" : "Nuestro"}
                  </div>
                </div>
                <span className="stat-number shrink-0 text-base text-[var(--color-ink)]">
                  {d.minuto !== null ? `${d.minuto}'` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
