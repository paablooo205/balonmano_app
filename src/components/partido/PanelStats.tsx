import {
  BOTONES_TIRO_RIVAL,
  contarBotonTiro,
  eficaciaLanzamiento,
  exclusiones,
  golesFavor,
  minutosJugados,
  perdidas,
  robos,
  tarjetas,
  tirosTotales,
} from "@/lib/partidoStats";
import type { EventoPartido, EventosRow } from "@/types/database";

const BOTON_PARADA = BOTONES_TIRO_RIVAL.find((b) => b.label === "Parada")!;
const BOTON_GOL_EN_CONTRA = BOTONES_TIRO_RIVAL.find((b) => b.label === "Gol en contra")!;

/**
 * Tarjetas de estadísticas acumuladas del partido en vivo — filtradas por
 * `jugadorId` si se pasa, totales de equipo si no. Reutiliza las mismas
 * funciones de conteo que `FichaTecnica.tsx`.
 *
 * Con un jugador seleccionado se añade "Minutos" al principio (viene del
 * jsonb entra_pista/sale_pista, no de la tabla `eventos` — de ahí el prop
 * aparte `eventosJsonb`). Sin jugador seleccionado no tiene sentido sumar
 * minutos de toda la plantilla, así que no aparece.
 *
 * Si además el jugador es portero (`esPortero`), se añaden "Paradas" y
 * "Goles recibidos" — son los números que de verdad le importan a un
 * portero (sus propios "Tiros/Goles/Eficacia" son casi siempre cero, no
 * tiene sentido destacarlos primero).
 */
export function PanelStats({
  eventos,
  eventosJsonb,
  jugadorId,
  titulo,
  esPortero,
}: {
  eventos: EventosRow[];
  eventosJsonb: EventoPartido[];
  jugadorId: string | null;
  titulo: string;
  esPortero: boolean;
}) {
  const filtrados = jugadorId ? eventos.filter((e) => e.jugador_id === jugadorId) : eventos;
  const eficacia = eficaciaLanzamiento(filtrados);

  const statsJugador: { label: string; valor: string }[] = jugadorId
    ? [{ label: "Minutos", valor: `${minutosJugados(eventosJsonb, jugadorId)}'` }]
    : [];

  const statsPortero: { label: string; valor: string }[] = esPortero
    ? [
        { label: "Paradas", valor: String(contarBotonTiro(filtrados, BOTON_PARADA)) },
        { label: "Goles recibidos", valor: String(contarBotonTiro(filtrados, BOTON_GOL_EN_CONTRA)) },
      ]
    : [];

  const stats: { label: string; valor: string }[] = [
    ...statsJugador,
    ...statsPortero,
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
