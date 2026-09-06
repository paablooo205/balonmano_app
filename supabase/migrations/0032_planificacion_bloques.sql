-- supabase/migrations/0032_planificacion_bloques.sql
-- Añade fecha_inicio/fecha_fin/orden a mesociclos para la sección
-- "Planifica la temporada": un mesociclo sin periodo_id, con estas fechas
-- rellenas, es un "bloque" gestionado desde esa pantalla nueva. Los
-- mesociclos existentes (con periodo_id, dados de alta desde el Excel)
-- quedan con estas tres columnas en null y no se ven afectados.
alter table mesociclos
  add column fecha_inicio date,
  add column fecha_fin date,
  add column orden integer;
