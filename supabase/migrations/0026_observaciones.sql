create table observaciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  texto text not null,
  created_at timestamptz not null default now()
);
create index idx_observaciones_equipo on observaciones (equipo_id);

alter table observaciones enable row level security;
create policy "equipo_del_entrenador" on observaciones for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
