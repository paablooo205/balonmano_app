import { useOutletContext, useParams } from "react-router-dom";
import type { EquiposRow } from "@/types/database";

interface EquipoContext {
  equipo: EquiposRow | null;
}

/** Equipo activo (layout de /equipos/:equipoId) + su id de ruta. */
export function useEquipo() {
  const { equipo } = useOutletContext<EquipoContext>();
  const { equipoId } = useParams<{ equipoId: string }>();
  return { equipo, equipoId: equipoId! };
}
