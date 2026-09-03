-- Hora de inicio del partido, opcional (los partidos ya existentes no la
-- tienen, y no siempre se conoce de antemano) — mismo tipo `time` que ya
-- usa horario_recurrente para los entrenamientos.
alter table partidos add column hora time;
