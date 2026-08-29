-- Esquema inicial: gestión de planificación deportiva multi-equipo (club de balonmano).
-- Un único usuario (auth.users), pero el modelo está preparado para N equipos.

create extension if not exists "pgcrypto";

-- ============================================================================
-- EQUIPOS (raíz — todo lo demás cuelga de aquí por equipo_id)
-- ============================================================================
create table equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  temporada text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- PLANIFICACIÓN ANUAL
-- ============================================================================
create table periodos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null,
  fecha_inicio date,
  fecha_fin date,
  tipo text,
  contenido_ataque text,
  contenido_defensa text,
  contenido_contraataque text,
  contenido_repliegue text,
  contenido_portero text,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_periodos_equipo on periodos (equipo_id);

create table mesociclos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  periodo_id uuid references periodos (id) on delete cascade,
  nombre text not null,
  objetivo text,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_mesociclos_equipo on mesociclos (equipo_id);
create index idx_mesociclos_periodo on mesociclos (periodo_id);

create table microciclos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  mesociclo_id uuid references mesociclos (id) on delete cascade,
  semana integer,
  fecha_inicio date,
  fecha_fin date,
  rival text,
  competicion text,
  contenidos jsonb not null default '{}'::jsonb,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_microciclos_equipo on microciclos (equipo_id);
create index idx_microciclos_mesociclo on microciclos (mesociclo_id);

-- ============================================================================
-- CALENDARIO
-- ============================================================================
create table horario_recurrente (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0=domingo ... 6=sábado
  hora_inicio time not null,
  hora_fin time not null,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_horario_equipo on horario_recurrente (equipo_id);

create table sesiones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  microciclo_id uuid references microciclos (id) on delete set null,
  fecha date not null,
  dia_semana smallint check (dia_semana between 0 and 6),
  duracion_min integer,
  estado text not null default 'planificada', -- planificada | realizada | cancelada
  bloques jsonb not null default '[]'::jsonb, -- [{tiempo_min, ejercicio_id?, descripcion_libre?, objetivo, consignas}]
  valoracion smallint,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sesiones_equipo on sesiones (equipo_id);
create index idx_sesiones_microciclo on sesiones (microciclo_id);
create index idx_sesiones_fecha on sesiones (fecha);

-- ============================================================================
-- BIBLIOTECA DE EJERCICIOS
-- ============================================================================
create table ejercicios (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null,
  categoria text,
  contenido jsonb not null default '[]'::jsonb, -- tags de contenido técnico-táctico
  jugadores_min smallint,
  jugadores_max smallint,
  espacio text,
  material text,
  duracion_min integer,
  dificultad text,
  descripcion text,
  organizacion text,
  reglas text,
  consignas text,
  progresion text,
  regresion text,
  errores_frecuentes text,
  correcciones text,
  transferencia_partido text,
  favorito boolean not null default false,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ejercicios_equipo on ejercicios (equipo_id);
create index idx_ejercicios_categoria on ejercicios (categoria);
create index idx_ejercicios_favorito on ejercicios (favorito);

-- ============================================================================
-- MODELO DE JUEGO
-- ============================================================================
create table sistemas_defensivos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null, -- p.ej. "5:1", "6:0"
  puesto text not null,
  con_balon text,
  sin_balon text,
  situaciones_especiales jsonb not null default '{}'::jsonb, -- circulación extremo, desdoblamiento pivote...
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sistemas_defensivos_equipo on sistemas_defensivos (equipo_id);
create index idx_sistemas_defensivos_nombre on sistemas_defensivos (nombre);

create table modelo_juego (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  area text not null check (area in ('ataque', 'defensa', 'transicion')),
  concepto text not null,
  descripcion text,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_modelo_juego_equipo on modelo_juego (equipo_id);

-- ============================================================================
-- EQUIPO (jugadores + asistencia)
-- ============================================================================
create table jugadores (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null,
  año_nacimiento integer,
  dorsal smallint,
  puesto text,
  puestos_secundarios jsonb not null default '[]'::jsonb,
  nivel_actual text,
  fortalezas text,
  aspectos_a_mejorar text,
  objetivo_individual text,
  ficha_oficial_url text,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_jugadores_equipo on jugadores (equipo_id);

-- ============================================================================
-- PARTIDOS
-- ============================================================================
create table partidos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  microciclo_id uuid references microciclos (id) on delete set null,
  rival text not null,
  fecha date not null,
  casa_fuera text check (casa_fuera in ('casa', 'fuera')),
  competicion text,
  resultado text,
  sistema_propio text,
  sistema_rival text,
  estadisticas jsonb not null default '{}'::jsonb, -- {eventos: [{id, tipo, contraataque?, minuto, creado_en}], cronometro} — ver src/types/database.ts
  problemas_detectados text,
  acciones_siguiente_semana text,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_partidos_equipo on partidos (equipo_id);
create index idx_partidos_microciclo on partidos (microciclo_id);
create index idx_partidos_fecha on partidos (fecha);

create table asistencia (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores (id) on delete cascade,
  sesion_id uuid references sesiones (id) on delete cascade,
  partido_id uuid references partidos (id) on delete cascade,
  presente boolean not null default true,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asistencia_evento_check check (
    (sesion_id is not null and partido_id is null)
    or (sesion_id is null and partido_id is not null)
  )
);
create index idx_asistencia_jugador on asistencia (jugador_id);
create index idx_asistencia_sesion on asistencia (sesion_id);
create index idx_asistencia_partido on asistencia (partido_id);
-- Evita duplicar el registro de asistencia de un jugador al mismo evento
create unique index uq_asistencia_jugador_sesion on asistencia (jugador_id, sesion_id) where sesion_id is not null;
create unique index uq_asistencia_jugador_partido on asistencia (jugador_id, partido_id) where partido_id is not null;

-- ============================================================================
-- RECURSOS
-- ============================================================================
create table recursos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null,
  tipo text,
  archivo_url text,
  enlace text,
  notas_adicionales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_recursos_equipo on recursos (equipo_id);

-- ============================================================================
-- RLS: usuario único autenticado, acceso total a todo si hay sesión válida.
-- ============================================================================
alter table equipos enable row level security;
alter table periodos enable row level security;
alter table mesociclos enable row level security;
alter table microciclos enable row level security;
alter table horario_recurrente enable row level security;
alter table sesiones enable row level security;
alter table ejercicios enable row level security;
alter table sistemas_defensivos enable row level security;
alter table modelo_juego enable row level security;
alter table jugadores enable row level security;
alter table partidos enable row level security;
alter table asistencia enable row level security;
alter table recursos enable row level security;

create policy "auth_full_access" on equipos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on periodos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on mesociclos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on microciclos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on horario_recurrente for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on sesiones for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on ejercicios for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on sistemas_defensivos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on modelo_juego for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on jugadores for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on partidos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on asistencia for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth_full_access" on recursos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================================
-- updated_at automático
-- ============================================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'equipos','periodos','mesociclos','microciclos','horario_recurrente',
      'sesiones','ejercicios','sistemas_defensivos','modelo_juego',
      'jugadores','partidos','asistencia','recursos'
    ])
  loop
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at();',
      t
    );
  end loop;
end $$;
