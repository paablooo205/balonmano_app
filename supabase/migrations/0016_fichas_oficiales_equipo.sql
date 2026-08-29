-- Añade una única ruta de Storage (bucket `adjuntos`) con las fichas
-- oficiales de toda la plantilla del equipo en un solo archivo (p. ej. un PDF
-- de la federación con toda la plantilla), análoga a
-- `jugadores.ficha_oficial_url` (0001_init_schema.sql) pero a nivel de equipo
-- en vez de por jugador. Guarda solo la ruta (como en
-- 0007_sesiones_adjuntos.sql), no un objeto — el nombre se deriva de la ruta.
--
-- No requiere cambios de RLS: la política `equipos_update_own`
-- (0008_entrenadores_rls.sql) usa `using (equipo_del_entrenador(id))
-- with check (equipo_del_entrenador(id))` sin restricción por columna, así
-- que ya cubre la fila completa, incluida esta columna nueva.

alter table equipos add column fichas_oficiales_url text;
