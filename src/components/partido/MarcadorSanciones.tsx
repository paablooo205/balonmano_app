import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { EventosRow, JugadoresRow } from "@/types/database";

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
 *
 * "Ver detalle" despliega quién ha sido sancionado y en qué minuto, sin
 * abandonar la tarjeta del gráfico.
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
    .map((e) => ({
      id: e.id,
      etiqueta: CATEGORIAS.find((c) => c.coincide(e))?.label ?? "Sanción",
      minuto: e.minuto,
      esRival: e.equipo_origen === "rival",
      nombre: e.equipo_origen === "rival" ? "Rival" : (jugadores.find((j) => j.id === e.jugador_id)?.nombre ?? "—"),
    }))
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

        <button
          type="button"
          onClick={() => setVerDetalle((v) => !v)}
          className="mt-3 flex w-full items-center justify-center gap-1 border-t border-[var(--color-border)] pt-3 text-xs font-medium text-[var(--color-accent)]"
        >
          {verDetalle ? "Ocultar quién y cuándo" : "Ver quién y cuándo"}
          {verDetalle ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {verDetalle && (
          <div className="mt-2 flex flex-col gap-1.5">
            {detalle.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{d.nombre}</span>
                <span className="shrink-0 text-[var(--color-text-muted)]">
                  {d.etiqueta} · {d.minuto !== null ? `${d.minuto}'` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
