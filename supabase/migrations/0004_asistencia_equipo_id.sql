-- Añade equipo_id a asistencia para desnormalizar el mismo patrón multi-equipo
-- que sigue el resto de tablas (CLAUDE.md: "Toda tabla salvo `equipos` lleva
-- `equipo_id` FK"). Hoy es derivable transitivamente vía jugador_id/sesion_id/
-- partido_id, pero conviene tenerlo directo para poder filtrar/indexar por
-- equipo sin joins y mantener la RLS y las queries consistentes con las demás
-- tablas.
--
-- La tabla `asistencia` está vacía (sin UI todavía; se construye en la Fase 4),
-- así que se añade como NOT NULL directamente, sin necesidad de backfill.

alter table asistencia
  add column equipo_id uuid not null references equipos (id) on delete cascade;

create index idx_asistencia_equipo on asistencia (equipo_id);
