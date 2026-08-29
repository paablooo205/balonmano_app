-- Adjuntos (imágenes/recursos) que el entrenador puede dejar en una sesión de
-- entrenamiento a tener en cuenta (ej. foto de la pizarra, vídeo de referencia).
-- Array de rutas de Storage (bucket "adjuntos", igual patrón que
-- jugadores.ficha_oficial_url), no un objeto — el nombre se deriva de la ruta.

alter table sesiones
  add column adjuntos jsonb not null default '[]'::jsonb;
