import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { aplicarPendientes, guardarCache, leerCache, obtenerCola, onQueueChange } from "@/lib/offline/queue";
import type {
  HorarioRecurrenteRow,
  MesociclosRow,
  MicrociclosRow,
  PeriodosRow,
  SesionesRow,
  PartidosRow,
} from "@/types/database";

export function useCalendarData(equipoId: string) {
  const [horario, setHorario] = useState<HorarioRecurrenteRow[]>([]);
  const [periodos, setPeriodos] = useState<PeriodosRow[]>([]);
  const [mesociclos, setMesociclos] = useState<MesociclosRow[]>([]);
  const [microciclos, setMicrociclos] = useState<MicrociclosRow[]>([]);
  const [sesiones, setSesiones] = useState<SesionesRow[]>([]);
  const [partidos, setPartidos] = useState<PartidosRow[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    setCargando(true);
    const [h, per, mc, m, s, p] = await Promise.all([
      supabase.from("horario_recurrente").select("*").eq("equipo_id", equipoId),
      supabase.from("periodos").select("*").eq("equipo_id", equipoId),
      supabase.from("mesociclos").select("*").eq("equipo_id", equipoId),
      supabase.from("microciclos").select("*").eq("equipo_id", equipoId).order("semana"),
      supabase.from("sesiones").select("*").eq("equipo_id", equipoId),
      supabase.from("partidos").select("*").eq("equipo_id", equipoId),
    ]);
    setHorario(h.data ?? []);
    setPeriodos(per.data ?? []);
    setMesociclos(mc.data ?? []);
    setMicrociclos(m.data ?? []);

    // Sesión de entrenamiento y partido del día se cachean en IndexedDB: si el
    // fetch falla por estar offline (data === null), se recurre a la última
    // copia conocida en vez de vaciar el calendario. Si tiene éxito, se
    // refresca esa copia para la próxima vez que se abra la app sin red.
    const sesionesBase = s.data ?? (await leerCache<SesionesRow>("sesiones", equipoId)) ?? [];
    const partidosBase = p.data ?? (await leerCache<PartidosRow>("partidos", equipoId)) ?? [];
    if (s.data) void guardarCache("sesiones", equipoId, s.data);
    if (p.data) void guardarCache("partidos", equipoId, p.data);

    const cola = await obtenerCola();
    setSesiones(aplicarPendientes("sesiones", sesionesBase, cola));
    setPartidos(aplicarPendientes("partidos", partidosBase, cola));

    setCargando(false);
  }, [equipoId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Cuando la cola cambia (se encola algo nuevo, o el flush automático
  // termina de sincronizar tras recuperar conexión) refrescamos la vista.
  useEffect(() => onQueueChange(() => void recargar()), [recargar]);

  return { horario, periodos, mesociclos, microciclos, sesiones, partidos, cargando, recargar };
}

export function microcicloDeFecha(microciclos: MicrociclosRow[], fechaISO: string) {
  return microciclos.find((m) => m.fecha_inicio && m.fecha_fin && fechaISO >= m.fecha_inicio && fechaISO <= m.fecha_fin) ?? null;
}

export function mesocicloDeMicrociclo(mesociclos: MesociclosRow[], microciclo: MicrociclosRow | null) {
  if (!microciclo?.mesociclo_id) return null;
  return mesociclos.find((m) => m.id === microciclo.mesociclo_id) ?? null;
}

export function periodoDeMesociclo(periodos: PeriodosRow[], mesociclo: MesociclosRow | null) {
  if (!mesociclo?.periodo_id) return null;
  return periodos.find((p) => p.id === mesociclo.periodo_id) ?? null;
}
