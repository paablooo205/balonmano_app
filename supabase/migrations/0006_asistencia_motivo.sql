-- Motivo de ausencia, seleccionable al marcar a alguien como no presente
-- (Justificado / Injustificado / Lesión). Solo tiene sentido cuando
-- presente=false; se fuerza con un check en vez de un enum aparte, mismo
-- patrón que `area` y `casa_fuera` en 0001_init_schema.sql.

alter table asistencia
  add column motivo_ausencia text check (motivo_ausencia in ('justificado', 'injustificado', 'lesion'));

alter table asistencia
  add constraint asistencia_motivo_solo_ausente check (motivo_ausencia is null or presente = false);
