import { useNavigate } from "react-router-dom";
import { useEquipo } from "@/hooks/useEquipo";
import { MapaCalorPorteria } from "@/components/partido/MapaCalorPorteria";
import {
  distribucionPorZona,
  eficaciaConDetalle,
  exclusiones,
  perdidas,
  porcentajeParadas,
  robos,
  tarjetas,
  type EficaciaDetalle,
} from "@/lib/partidoStats";
import { calcularNotas } from "@/lib/valoracion";
import type { EventosRow, JugadoresRow, PartidosRow } from "@/types/database";

export function FichaTecnica({
  partido,
  jugadores,
  eventos,
}: {
  partido: PartidosRow;
  jugadores: JugadoresRow[];
  eventos: EventosRow[];
}) {
  const navigate = useNavigate();
  const { equipoId } = useEquipo();

  const eficaciaGlobal = eficaciaConDetalle(eventos);
  const eficaciaJuego = eficaciaConDetalle(eventos, { soloPenalti: false });
  const eficaciaPenalti = eficaciaConDetalle(eventos, { soloPenalti: true });
  const tirosJuego = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && !e.es_penalti);
  const tirosPenalti = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio" && e.es_penalti);
  const zonasJuego = distribucionPorZona(tirosJuego);
  const zonasPenalti = distribucionPorZona(tirosPenalti);

  const tirosRival = eventos.filter((e) => e.tipo === "tiro" && e.equipo_origen === "rival");
  const paradas = porcentajeParadas(eventos);
  const zonasRival = distribucionPorZona(tirosRival);

  const notas = calcularNotas(jugadores, eventos, [partido]);
  const jugadoresConDatos = new Set(eventos.filter((e) => e.jugador_id).map((e) => e.jugador_id));
  const filasJugadores = jugadores
    .filter((j) => jugadoresConDatos.has(j.id))
    .map((j) => {
      const propios = eventos.filter((e) => e.jugador_id === j.id);
      const golesJ = propios.filter((e) => e.tipo === "tiro" && e.resultado === "gol").length;
      const tirosJ = propios.filter((e) => e.tipo === "tiro" && e.equipo_origen === "propio").length;
      return { jugador: j, goles: golesJ, tiros: tirosJ, eficacia: eficaciaConDetalle(propios), nota: notas.get(j.id) ?? null };
    })
    .sort((a, b) => b.goles - a.goles);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Tiro propio</div>
        <CifraProtagonista detalle={eficaciaGlobal} etiqueta="de eficacia global" vacio="Sin tiros registrados todavía." />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BloqueTiro titulo="Juego abierto" detalle={eficaciaJuego} zonas={zonasJuego} total={tirosJuego.length} />
          <BloqueTiro titulo="7 metros" detalle={eficaciaPenalti} zonas={zonasPenalti} total={tirosPenalti.length} />
        </div>
      </div>

      <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Nuestra portería</div>
        <CifraProtagonista detalle={paradas} etiqueta="de paradas" vacio="El rival no ha tirado todavía." />
        <div className="mt-3">
          <MapaCalorPorteria conteosPorZona={zonasRival} total={tirosRival.length} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <CifraSimple label="Pérdidas" valor={perdidas(eventos)} />
        <CifraSimple label="Robos" valor={robos(eventos)} />
        <CifraSimple label="Exclusiones" valor={exclusiones(eventos)} />
        <CifraSimple label="Tarjetas" valor={tarjetas(eventos)} />
      </div>

      {filasJugadores.length > 0 && (
        <div className="rounded border border-white/[.09] bg-[#15151a] p-4">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/60">Por jugador</div>
          <div className="flex flex-col gap-1">
            {filasJugadores.map((f) => (
              <button
                key={f.jugador.id}
                onClick={() => navigate(`/equipos/${equipoId}/jugador/${f.jugador.id}?partido=${partido.id}`)}
                className="flex items-center gap-3 rounded-[3px] bg-white/[.04] px-3 py-2 text-left"
              >
                <span className="stat-number w-6 shrink-0 text-sm text-white/60">{f.jugador.dorsal ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-white">{f.jugador.nombre}</span>
                <span className="stat-number w-6 shrink-0 text-right text-sm text-white">{f.goles}</span>
                <span className="w-14 shrink-0 text-right text-[10px] text-white/40">{f.tiros} tiros</span>
                <span className="w-12 shrink-0 text-right text-[10px] text-white/40">
                  {f.eficacia ? `${f.eficacia.pct}%` : "—"}
                </span>
                <span className="stat-number w-8 shrink-0 text-right text-sm" style={{ color: "var(--color-accent)" }}>
                  {f.nota !== null ? f.nota.toFixed(1) : "—"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(partido.problemas_detectados || partido.acciones_siguiente_semana || partido.notas_adicionales) && (
        <div className="card-surface flex flex-col gap-3 p-4">
          {partido.problemas_detectados && (
            <div>
              <div className="text-sm font-medium text-[var(--color-accent)]">Problemas detectados</div>
              <p className="whitespace-pre-line text-sm">{partido.problemas_detectados}</p>
            </div>
          )}
          {partido.acciones_siguiente_semana && (
            <div>
              <div className="text-sm font-medium text-[var(--color-accent)]">Acciones para la semana siguiente</div>
              <p className="whitespace-pre-line text-sm">{partido.acciones_siguiente_semana}</p>
            </div>
          )}
          {partido.notas_adicionales && (
            <div>
              <div className="text-sm font-medium text-[var(--color-accent)]">Notas adicionales</div>
              <p className="whitespace-pre-line text-sm">{partido.notas_adicionales}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CifraProtagonista({ detalle, etiqueta, vacio }: { detalle: EficaciaDetalle; etiqueta: string; vacio: string }) {
  if (!detalle) return <div className="text-sm text-white/40">{vacio}</div>;
  return (
    <div>
      <div className="stat-number text-4xl leading-none text-white">{detalle.pct}%</div>
      <div className="mt-1 text-xs text-white/50">
        {etiqueta} ({detalle.aciertos} de {detalle.intentos})
      </div>
    </div>
  );
}

function BloqueTiro({
  titulo,
  detalle,
  zonas,
  total,
}: {
  titulo: string;
  detalle: EficaciaDetalle;
  zonas: Record<number, number>;
  total: number;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">{titulo}</div>
      {detalle ? (
        <div className="mb-2 text-sm text-white/70">
          <span className="stat-number text-lg text-white">{detalle.pct}%</span> ({detalle.aciertos} de {detalle.intentos})
        </div>
      ) : (
        <div className="mb-2 text-xs text-white/35">Sin tiros.</div>
      )}
      <MapaCalorPorteria conteosPorZona={zonas} total={total} />
    </div>
  );
}

function CifraSimple({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-[3px] border border-white/[.07] bg-white/[.04] px-2 py-2 text-center">
      <div className="stat-number text-xl text-white">{valor}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.06em] text-white/40">{label}</div>
    </div>
  );
}
