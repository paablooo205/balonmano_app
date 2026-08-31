import {
  eficaciaLanzamiento,
  exclusiones,
  golesFavor,
  perdidas,
  robos,
  tarjetas,
  tirosTotales,
} from "@/lib/partidoStats";
import type { EventosRow } from "@/types/database";

/**
 * Tarjetas de estadísticas acumuladas del partido en vivo — filtradas por
 * `jugadorId` si se pasa, totales de equipo si no. Reutiliza las mismas
 * funciones de conteo que `FichaTecnica.tsx`.
 */
export function PanelStats({
  eventos,
  jugadorId,
  titulo,
}: {
  eventos: EventosRow[];
  jugadorId: string | null;
  titulo: string;
}) {
  const filtrados = jugadorId ? eventos.filter((e) => e.jugador_id === jugadorId) : eventos;
  const eficacia = eficaciaLanzamiento(filtrados);

  const stats: { label: string; valor: string }[] = [
    { label: "Tiros", valor: String(tirosTotales(filtrados)) },
    { label: "Goles", valor: String(golesFavor(filtrados)) },
    { label: "Eficacia", valor: eficacia !== null ? `${eficacia}%` : "—" },
    { label: "Pérdidas", valor: String(perdidas(filtrados)) },
    { label: "Robos", valor: String(robos(filtrados)) },
    { label: "Exclusiones", valor: String(exclusiones(filtrados)) },
    { label: "Tarjetas", valor: String(tarjetas(filtrados)) },
  ];

  return (
    <div className="rounded-xl border border-white/[.09] bg-white/[.03] p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">{titulo}</span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">Acumulado del partido</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-white/[.07] bg-white/[.04] px-2 py-1.5">
            <div className="text-[8px] font-semibold uppercase leading-tight tracking-[0.06em] text-white/40">{s.label}</div>
            <div className="stat-number mt-0.5 text-base text-white">{s.valor}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
