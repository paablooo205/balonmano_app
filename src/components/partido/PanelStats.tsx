import {
  BOTONES_TIRO_RIVAL,
  contarBotonTiro,
  exclusiones,
  formatoReloj,
  golesFavor,
  minutosJugados,
  perdidas,
  robos,
  tarjetas,
  tirosTotales,
} from "@/lib/partidoStats";
import { cn } from "@/lib/utils";
import type { EventoPartido, EventosRow } from "@/types/database";

const BOTON_PARADA = BOTONES_TIRO_RIVAL.find((b) => b.label === "Parada")!;
const BOTON_GOL_EN_CONTRA = BOTONES_TIRO_RIVAL.find((b) => b.label === "Gol en contra")!;

/**
 * Estadísticas acumuladas del partido en vivo — filtradas por `jugadorId`
 * si se pasa, totales de equipo si no. Mismas funciones de conteo que
 * `FichaTecnica.tsx`.
 *
 * Jerarquía: arriba, en grande, la cifra que define al jugador — goles
 * sobre tiros con su % (jugador de campo) o paradas sobre tiros recibidos
 * (portero); sin jugador seleccionado, ambas para el equipo. Debajo, en una
 * línea compacta, el resto (minutos, pérdidas, robos, sanciones). Antes eran
 * 9 casillas iguales y lo importante no destacaba.
 *
 * "Minutos" solo con jugador seleccionado (sale del jsonb entra/sale pista,
 * de ahí el prop aparte `eventosJsonb`).
 */
export function PanelStats({
  eventos,
  eventosJsonb,
  jugadorId,
  duracionTotalMin,
  minutoActual,
  titulo,
  esPortero,
  vertical = false,
  exclusion = null,
}: {
  /** Exclusión de 2' en curso del jugador seleccionado (cuenta atrás en
   * reloj de partido): banda roja arriba de la tarjeta. */
  exclusion?: { restante: number; finSegundo: number } | null;
  /** Columna estrecha (debajo de la lista de jugadores, pantalla fija):
   * cifras apiladas en vez de en franja horizontal. */
  vertical?: boolean;
  eventos: EventosRow[];
  eventosJsonb: EventoPartido[];
  jugadorId: string | null;
  duracionTotalMin: number;
  /** Minuto en curso: una entrada a pista sin salida cuenta hasta aquí,
   * no hasta el final del partido (en vivo salían 50' en el minuto 15). */
  minutoActual: number | null;
  titulo: string;
  esPortero: boolean;
}) {
  const filtrados = jugadorId ? eventos.filter((e) => e.jugador_id === jugadorId) : eventos;

  const goles = golesFavor(filtrados);
  const tiros = tirosTotales(filtrados);
  const paradas = contarBotonTiro(filtrados, BOTON_PARADA);
  const recibidos = paradas + contarBotonTiro(filtrados, BOTON_GOL_EN_CONTRA);

  const mostrarAtaque = !esPortero;
  const mostrarPorteria = esPortero || !jugadorId;

  const secundarias: { label: string; valor: string }[] = [
    ...(jugadorId ? [{ label: "Min.", valor: `${minutosJugados(eventosJsonb, jugadorId, duracionTotalMin, minutoActual ?? 0)}'` }] : []),
    { label: "Pérdidas", valor: String(perdidas(filtrados)) },
    { label: "Robos", valor: String(robos(filtrados)) },
    { label: "Excl.", valor: String(exclusiones(filtrados)) },
    { label: "Tarjetas", valor: String(tarjetas(filtrados)) },
  ];

  return (
    <div className="rounded-[6px] border border-white/[.09] bg-white/[.03] px-3 py-2.5">
      {exclusion && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-[4px] bg-[var(--color-accent)] px-2.5 py-1.5 text-white">
          <span className="text-[12px] font-bold uppercase tracking-[0.06em]">Excluido 2' · vuelve a las {formatoReloj(exclusion.finSegundo)}</span>
          <span className="stat-number text-[20px] leading-none">{formatoReloj(exclusion.restante)}</span>
        </div>
      )}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-white">{titulo}</span>
        {!vertical && <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/60">En este partido</span>}
      </div>

      {/* Una sola franja: cifras protagonistas a la izquierda, el resto en
          una columna de pares a la derecha — en pantalla fija cada píxel de
          alto se lo lleva la portería. */}
      <div className={cn("flex gap-4", vertical ? "flex-col gap-3" : "items-stretch")}>
        <div className={cn("flex min-w-0 flex-1", vertical ? "flex-col gap-3" : "gap-4")}>
          {mostrarAtaque && <CifraRatio etiqueta="Goles / tiros" aciertos={goles} intentos={tiros} />}
          {mostrarPorteria && <CifraRatio etiqueta={jugadorId ? "Paradas / tiros" : "Paradas / tiros rival"} aciertos={paradas} intentos={recibidos} />}
        </div>
        <div
          className={cn(
            "grid shrink-0 grid-cols-2 content-center gap-x-4 gap-y-1 border-white/[.07]",
            vertical ? "border-t pt-2.5" : "border-l pl-4",
          )}
        >
          {secundarias.map((s) => (
            <span key={s.label} className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/60">{s.label}</span>
              <span className="stat-number text-[16px] leading-none text-white">{s.valor}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Cifra protagonista "aciertos/intentos" con su % y una barra fina —
 * el recuento siempre visible junto al %, nunca un % suelto. */
function CifraRatio({ etiqueta, aciertos, intentos }: { etiqueta: string; aciertos: number; intentos: number }) {
  const pct = intentos > 0 ? Math.round((aciertos / intentos) * 100) : null;
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-white/60">{etiqueta}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="stat-number text-[30px] leading-none text-white">
          {aciertos}
          <span className="text-white/45">/{intentos}</span>
        </span>
        <span className="stat-number text-lg leading-none text-[var(--color-accent)]">{pct !== null ? `${pct}%` : "—"}</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.1]">
        <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}
