-- Evita filas duplicadas de convocatoria/asistencia para el mismo
-- jugador en el mismo partido o la misma sesión (p.ej. un doble toque en
-- el checklist creando dos filas en vez de reutilizar la existente).
-- Postgres no aplica `unique` a pares donde alguna columna es NULL (cada
-- NULL cuenta como distinto), así que una fila de entrenamiento
-- (partido_id NULL) nunca choca con la restricción de partido, y
-- viceversa — ambas conviven sin necesitar una cláusula WHERE.
alter table asistencia add constraint asistencia_jugador_partido_unico unique (jugador_id, partido_id);
alter table asistencia add constraint asistencia_jugador_sesion_unico unique (jugador_id, sesion_id);
