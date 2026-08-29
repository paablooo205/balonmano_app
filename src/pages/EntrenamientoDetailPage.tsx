import { useNavigate, useParams } from "react-router-dom";
import { useEquipo } from "@/hooks/useEquipo";
import { useCalendarData } from "@/hooks/useCalendarData";
import { DayAgenda } from "@/components/calendario/DayAgenda";
import { PageHeader } from "@/components/layout/PageHeader";
import { DIAS_SEMANA } from "@/lib/calendar";

export function EntrenamientoDetailPage() {
  const { equipoId } = useEquipo();
  const { fecha: fechaISO } = useParams<{ fecha: string }>();
  const navigate = useNavigate();
  const { horario, periodos, mesociclos, microciclos, sesiones, partidos, cargando, recargar } =
    useCalendarData(equipoId);

  if (cargando) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Cargando...</div>;
  }
  if (!fechaISO) {
    return <div className="card-surface p-6 text-center text-[var(--color-text-muted)]">Día no encontrado.</div>;
  }

  const fecha = new Date(fechaISO + "T00:00:00");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${DIAS_SEMANA[fecha.getDay()]} ${fecha.getDate()}/${fecha.getMonth() + 1}/${fecha.getFullYear()}`}
        eyebrow="Entrenamiento"
        onBack={() => navigate(`/equipos/${equipoId}/calendario`)}
        backLabel="Calendario"
      />

      <DayAgenda
        fecha={fecha}
        equipoId={equipoId}
        horario={horario}
        periodos={periodos}
        mesociclos={mesociclos}
        microciclos={microciclos}
        sesiones={sesiones}
        partidos={partidos}
        onChanged={recargar}
        permitirAltaPartido={false}
      />
    </div>
  );
}
