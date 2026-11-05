-- Tiempo muerto (nuestro o del rival) como evento de la tabla `eventos`, para
-- que la analítica lo trate igual que el resto de acciones (ver
-- docs/superpowers/specs/2026-11-04-analitica-partido-design.md §5).
-- Solo amplía el check de `tipo`: no toca ninguna fila existente.
-- equipo_origen indica quién lo pide; jugador_id queda null.
alter table eventos drop constraint eventos_tipo_check;
alter table eventos add constraint eventos_tipo_check
  check (tipo = any (array['tiro', 'perdida', 'exclusion', 'tarjeta', 'tiempo_muerto']));
