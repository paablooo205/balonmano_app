-- Añade dos campos de texto libre para la planificación anual, puramente aditivo:
--   periodos.objetivo_general   -> una frase con el objetivo global de la fase (independiente
--                                   del desglose por área táctica en las 5 columnas contenido_*).
--   microciclos.objetivo        -> una frase con el objetivo semanal del microciclo (independiente
--                                   del checklist por área táctica en la columna contenidos jsonb).
--
-- Sin sección de RLS: la política "equipo_del_entrenador" creada en
-- 0008_entrenadores_rls.sql es `for all using (equipo_del_entrenador(equipo_id))
-- with check (...)` sobre la fila completa de periodos/microciclos, no sobre columnas
-- concretas, así que cubre automáticamente estas columnas nuevas sin cambios.

alter table periodos add column objetivo_general text;

alter table microciclos add column objetivo text;
