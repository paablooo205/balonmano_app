-- Sistema de multas por tardanza/falta injustificada a entrenamiento o
-- partido, activable y configurable por equipo desde Ajustes (ver
-- docs/superpowers/specs/2026-09-13-sistema-multas-design.md). Los tipos
-- con `disparador` no nulo se enganchan automáticamente a los campos ya
-- existentes en `asistencia` (`llego_tarde` / `motivo_ausencia =
-- 'injustificado'`); el resto son de aplicación manual desde la ficha del
-- jugador.

create table multas_config (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null unique references equipos (id) on delete cascade,
  activo boolean not null default false,
  created_at timestamptz not null default now()
);

create table multas_tipos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null,
  importe numeric(10, 2) not null check (importe >= 0),
  disparador text check (disparador in ('tardanza', 'falta_injustificada')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_multas_tipos_equipo on multas_tipos (equipo_id);
-- Como mucho un tipo activo con cada disparador por equipo — evita
-- ambigüedad en el enganche automático (ver AsistenciaChecklist en la
-- Tarea 4).
create unique index idx_multas_tipos_disparador_unico on multas_tipos (equipo_id, disparador)
  where disparador is not null;

create table multas (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  jugador_id uuid not null references jugadores (id) on delete cascade,
  tipo_id uuid references multas_tipos (id) on delete set null,
  -- Copia de multas_tipos.nombre/importe en el momento de crear la multa:
  -- si luego se edita el importe del tipo, las multas ya puestas no cambian.
  concepto text not null,
  importe numeric(10, 2) not null check (importe >= 0),
  origen text not null check (origen in ('automatica', 'manual')),
  asistencia_id uuid references asistencia (id) on delete cascade,
  constraint multas_origen_asistencia_check check (
    (origen = 'automatica' and asistencia_id is not null) or
    (origen = 'manual' and asistencia_id is null)
  ),
  pagada boolean not null default false,
  pagada_at timestamptz,
  constraint multas_pagada_at_check check (
    (pagada and pagada_at is not null) or (not pagada and pagada_at is null)
  ),
  fecha date not null default current_date,
  notas_adicionales text,
  created_at timestamptz not null default now()
);
create index idx_multas_equipo on multas (equipo_id);
create index idx_multas_jugador on multas (jugador_id);
-- Un registro de asistencia genera como mucho una multa automática.
create unique index idx_multas_asistencia_unica on multas (asistencia_id)
  where asistencia_id is not null;

alter table multas_config enable row level security;
alter table multas_tipos enable row level security;
alter table multas enable row level security;

create policy "equipo_del_entrenador" on multas_config for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
create policy "equipo_del_entrenador" on multas_tipos for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
create policy "equipo_del_entrenador" on multas for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
