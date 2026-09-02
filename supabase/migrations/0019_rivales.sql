-- Tabla `rivales`: nombre de cada rival por equipo, para poder filtrar
-- eventos/partidos por rival — capa de lectura, no se recoge ningún dato
-- nuevo (ver docs/superpowers/specs/2026-09-02-rivales-design.md). Cada
-- equipo tiene su propia lista de rivales, aislada: dos equipos del club
-- que se enfrenten al mismo club rival no comparten fila.
create table rivales (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null,
  notas text,
  created_at timestamptz not null default now()
);
create index idx_rivales_equipo on rivales (equipo_id);

alter table rivales enable row level security;
create policy "equipo_del_entrenador" on rivales for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));

-- `partidos.rival` (texto libre) se mantiene sin tocar — sigue siendo el
-- nombre denormalizado que ya lee media app (Calendario, Inicio,
-- PartidoDetailPage, el selector de la Ficha de jugador...). `rival_id` es
-- la nueva FK opcional que permite filtrar por rival.
alter table partidos add column rival_id uuid references rivales (id);

-- Backfill: una fila de `rivales` por cada combinación (equipo_id, nombre)
-- ya presente en partidos (el `distinct` ya evita duplicados dentro de esta
-- misma migración), después enlaza cada partido a la fila que le
-- corresponde por nombre dentro de su propio equipo. Se normaliza con
-- `btrim` solo para el backfill (nunca se toca `partidos.rival` en sí) para
-- no fragmentar en rivales distintos variantes con espacios de más/menos
-- del mismo nombre ya presentes en el texto libre histórico — no resuelve
-- diferencias de mayúsculas/minúsculas, que si aparecen hay que unificarlas
-- a mano en el SQL Editor (ver spec: el desplegable evita duplicados nuevos
-- hacia adelante, pero no decide por el usuario qué grafía ya existente es
-- la canónica).
insert into rivales (equipo_id, nombre)
select distinct equipo_id, btrim(rival) from partidos;

update partidos p
set rival_id = r.id
from rivales r
where r.equipo_id = p.equipo_id and r.nombre = btrim(p.rival);
