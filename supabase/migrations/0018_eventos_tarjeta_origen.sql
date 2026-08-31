-- Amplía `eventos` para el registro en vivo ampliado (ver
-- docs/superpowers/specs/2026-08-31-registro-en-vivo-ampliado-design.md):
--   - Nuevo tipo 'tarjeta' (amonestación amarilla/azul/roja) — distinta de
--     'exclusion' (los 2 minutos): un jugador puede tener las dos a la vez,
--     así que van en filas separadas, no como variantes de la misma.
--   - `origen`: desde dónde se lanzó el tiro (lateral, extremo, pivote, 9m,
--     contragolpe, 7m...) — dato aparte de `zona`, que es a dónde entra/para
--     el tiro dentro de la portería. Solo aplica a tipo='tiro'.
--
-- Sin backfill: no hay filas de tipo 'tarjeta' históricas, y `origen` no se
-- puede reconstruir a posteriori para los tiros ya registrados — se queda
-- `null` en las filas antiguas, igual que `zona` quedó `null` en el backfill
-- de 0017_eventos.sql.

alter table eventos drop constraint eventos_tipo_check;
alter table eventos add constraint eventos_tipo_check
  check (tipo = any (array['tiro', 'perdida', 'exclusion', 'tarjeta']));

alter table eventos add column origen text
  check (origen = any (array['ext_izq', 'lat_izq', 'central', 'lat_der', 'ext_der', 'pivote', '9m', 'contragolpe', '7m']));
alter table eventos add constraint eventos_origen_solo_tiro
  check (origen is null or tipo = 'tiro');

alter table eventos add column color_tarjeta text
  check (color_tarjeta = any (array['amarilla', 'azul', 'roja']));
alter table eventos add constraint eventos_color_tarjeta_solo_tarjeta
  check (color_tarjeta is null or tipo = 'tarjeta');
