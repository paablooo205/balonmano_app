import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { JugadorFormModal } from "./JugadorFormModal";
import { cargarEventosEquipo } from "@/lib/eventos";
import type { EventosRow, JugadoresRow } from "@/types/database";

export function JugadoresSection({ equipoId }: { equipoId: string }) {
  const navigate = useNavigate();
  const [jugadores, setJugadores] = useState<JugadoresRow[]>([]);
  const [eventos, setEventos] = useState<EventosRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);

  async function cargar() {
    setCargando(true);
    const [j, ev] = await Promise.all([
      supabase.from("jugadores").select("*").eq("equipo_id", equipoId).order("dorsal", { nullsFirst: false }),
      cargarEventosEquipo(equipoId),
    ]);
    setJugadores(j.data ?? []);
    setEventos(ev);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  function golesDe(jugadorId: string): number {
    return eventos.filter((e) => e.jugador_id === jugadorId && e.tipo === "tiro" && e.equipo_origen === "propio" && e.resultado === "gol").length;
  }

  const filtrados = jugadores.filter((j) => j.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  function alGuardarOBorrar() {
    setModalAbierto(false);
    cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <Input
            pill
            placeholder="Buscar jugador/a..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button size="sm" className="ml-3" onClick={() => setModalAbierto(true)}>
          <Plus size={18} /> Nuevo
        </Button>
      </div>

      {cargando && <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>}

      {!cargando && filtrados.length === 0 && (
        <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">
          {jugadores.length === 0 ? "Todavía no hay jugadores/as. Da de alta el primero." : "Nadie coincide con la búsqueda."}
        </div>
      )}

      <div className="card-surface divide-y divide-[var(--color-border)] overflow-hidden p-0">
        {filtrados.map((j) => (
          <button
            key={j.id}
            onClick={() => navigate(`/equipos/${equipoId}/jugador/${j.id}`)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <div className="stat-number flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[var(--color-ink)] text-lg text-white">
              {j.dorsal ?? "—"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">{j.nombre}</div>
              <div className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-faint)]">
                {j.puesto || "Sin puesto"}
              </div>
            </div>
            <div className="mr-1 shrink-0 text-right">
              <div className="stat-number text-lg text-[var(--color-accent)]">{golesDe(j.id)}</div>
              <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-faint)]">
                Goles
              </div>
            </div>
            <ChevronRight size={17} className="shrink-0 text-[var(--color-text-faint)]" />
          </button>
        ))}
      </div>

      <JugadorFormModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        equipoId={equipoId}
        jugador={null}
        onSaved={alGuardarOBorrar}
        onDeleted={alGuardarOBorrar}
      />
    </div>
  );
}
