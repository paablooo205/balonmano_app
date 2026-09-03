-- Compartir ejercicios entre equipos: única excepción deliberada al
-- aislamiento por equipo_id de todo el proyecto. `compartido=true` amplía
-- solo la lectura (ver política ejercicios_select más abajo) — las
-- políticas de escritura no cambian ni un carácter.
alter table ejercicios add column compartido boolean not null default false;

-- `creado_por` se guarda como referencia real (uso futuro), pero la
-- atribución que se MUESTRA nunca sale de un join en vivo contra
-- `entrenadores`/`equipos` — ninguna de las dos tiene hoy lectura entre
-- equipos, y esta función no les añade ninguna. Se copia el nombre como
-- texto en el momento de compartir/guardar (ver EjercicioFormModal.tsx).
alter table ejercicios add column creado_por uuid references entrenadores (id);
alter table ejercicios add column creado_por_nombre text;
alter table ejercicios add column equipo_origen_nombre text;

-- Favoritos por equipo que MIRA, no por equipo dueño del ejercicio — un
-- equipo que solo ve un ejercicio compartido debe poder marcarlo
-- favorito sin tocar la fila de otro equipo.
create table ejercicio_favoritos (
  equipo_id uuid not null references equipos (id) on delete cascade,
  ejercicio_id uuid not null references ejercicios (id) on delete cascade,
  primary key (equipo_id, ejercicio_id)
);
create index idx_ejercicio_favoritos_ejercicio on ejercicio_favoritos (ejercicio_id);

alter table ejercicio_favoritos enable row level security;
create policy "equipo_del_entrenador" on ejercicio_favoritos for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));

-- Backfill: el único favorito que existe hoy es el del propio equipo
-- dueño de cada ejercicio — sin ambigüedad posible.
insert into ejercicio_favoritos (equipo_id, ejercicio_id)
select equipo_id, id from ejercicios where favorito = true;

drop index if exists idx_ejercicios_favorito;
alter table ejercicios drop column favorito;

-- La política actual de ejercicios es una única "for all" (mismo
-- using/with check para select/insert/update/delete). Para que SELECT
-- sea más permisivo sin ampliar también las escrituras, hace falta
-- partirla en 4 políticas independientes.
drop policy "equipo_del_entrenador" on ejercicios;

create policy "ejercicios_select" on ejercicios for select
  to authenticated
  using (private.equipo_del_entrenador(equipo_id) or compartido);

create policy "ejercicios_insert" on ejercicios for insert
  with check (private.equipo_del_entrenador(equipo_id));

create policy "ejercicios_update" on ejercicios for update
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));

create policy "ejercicios_delete" on ejercicios for delete
  using (private.equipo_del_entrenador(equipo_id));
