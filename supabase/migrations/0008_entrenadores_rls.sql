-- Pasa el modelo de "un único usuario ve todo" a "cada equipo tiene sus propios
-- entrenadores, aislamiento estricto entre equipos". Introduce `entrenadores`
-- (perfil ligado 1:1 a un auth.users) y `entrenadores_equipos` (relación N:M
-- entrenador-equipo), y sustituye las políticas `auth_full_access` (cualquier
-- autenticado, acceso total) de 0001_init_schema.sql por políticas que exigen
-- pertenencia real al equipo.
--
-- PRINCIPIO DE SEGURIDAD: cerrado por defecto. "Crear equipo" e "invitar a un
-- entrenador a un equipo" son de una fase posterior todavía no diseñada, así
-- que aquí NO se define ninguna política de INSERT para `equipos` ni para
-- `entrenadores_equipos`. Sin política de INSERT + RLS activo, Postgres deniega
-- el INSERT a cualquier rol que no sea el de servicio/migración — es justo lo
-- que queremos. En concreto, NO se abre un INSERT de `entrenadores_equipos`
-- restringido a "tu propio entrenador_id": eso permitiría a cualquier
-- entrenador autenticado auto-vincularse a cualquier equipo_id existente sin
-- invitación.

-- ============================================================================
-- TABLAS
-- ============================================================================
create table entrenadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table entrenadores_equipos (
  entrenador_id uuid not null references entrenadores (id) on delete cascade,
  equipo_id uuid not null references equipos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entrenador_id, equipo_id)
);
create index idx_entrenadores_equipos_equipo on entrenadores_equipos (equipo_id);

-- ============================================================================
-- FUNCIÓN HELPER — reutilizada por todas las políticas de RLS de datos.
-- `security definer` es imprescindible: sin él, la propia RLS de
-- `entrenadores_equipos` bloquearía la subconsulta desde dentro de la política
-- de cualquier otra tabla. `set search_path = public` es obligatorio junto con
-- `security definer` (evita search-path hijacking).
-- ============================================================================
create or replace function equipo_del_entrenador(p_equipo_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from entrenadores_equipos ee
    join entrenadores e on e.id = ee.entrenador_id
    where ee.equipo_id = p_equipo_id and e.auth_user_id = auth.uid()
  );
$$;

-- ============================================================================
-- RLS: entrenadores
-- ============================================================================
alter table entrenadores enable row level security;

create policy "entrenadores_select_own" on entrenadores
  for select using (auth_user_id = auth.uid());

create policy "entrenadores_update_own" on entrenadores
  for update using (auth_user_id = auth.uid());

-- Alta de la propia fila (se usará en el registro/onboarding de una fase
-- futura). Un entrenador solo puede crear su propia fila (auth_user_id debe
-- ser el suyo), nunca la de otro, así que abrir esto ahora no compromete a
-- nadie.
create policy "entrenadores_insert_own" on entrenadores
  for insert with check (auth_user_id = auth.uid());

-- ============================================================================
-- RLS: entrenadores_equipos — solo lectura de las propias vinculaciones.
-- Sin insert/update/delete (ver nota de cabecera).
-- ============================================================================
alter table entrenadores_equipos enable row level security;

create policy "entrenadores_equipos_select_own" on entrenadores_equipos
  for select using (
    entrenador_id in (select id from entrenadores where auth_user_id = auth.uid())
  );

-- ============================================================================
-- RLS: equipos — solo select/update de los equipos propios. Sin insert (crear
-- equipo es de una fase posterior todavía no diseñada).
-- ============================================================================
drop policy "auth_full_access" on equipos;

create policy "equipos_select_own" on equipos
  for select using (equipo_del_entrenador(id));

create policy "equipos_update_own" on equipos
  for update using (equipo_del_entrenador(id)) with check (equipo_del_entrenador(id));

-- ============================================================================
-- RLS: resto de tablas con equipo_id — for all cubre select/insert/update/
-- delete porque todas esas operaciones ya necesitaban equipo_id, sin riesgo de
-- fila huérfana (a diferencia de equipos/entrenadores_equipos).
-- ============================================================================
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'periodos','mesociclos','microciclos','horario_recurrente',
      'sesiones','ejercicios','sistemas_defensivos','modelo_juego',
      'jugadores','asistencia','partidos','recursos'
    ])
  loop
    execute format('drop policy "auth_full_access" on %I;', t);
    execute format(
      'create policy "equipo_del_entrenador" on %I for all using (equipo_del_entrenador(equipo_id)) with check (equipo_del_entrenador(equipo_id));',
      t
    );
  end loop;
end $$;

-- ============================================================================
-- updated_at automático en entrenadores (reutiliza set_updated_at() de
-- 0001_init_schema.sql / 0005_fix_function_search_path.sql).
-- ============================================================================
create trigger set_updated_at before update on entrenadores
  for each row execute function set_updated_at();

-- ============================================================================
-- BOOTSTRAP — datos, no DDL, pero va en esta misma migración para que quede
-- todo en un commit atómico. Vincula las 2 cuentas de auth ya existentes a los
-- 2 equipos ya existentes (cross join intencionado, confirmado explícitamente
-- por el usuario: 2 entrenadores × 2 equipos = 4 filas), para no dejar a nadie
-- fuera en el momento en que la RLS estricta entra en vigor.
-- ============================================================================
insert into entrenadores (nombre, auth_user_id) values
  ('Pablo', 'd5b9899f-4ff2-4ad2-b0ff-53f1445ceef2'),
  ('Entrenador/a', '79b05b79-dd69-4f6a-84cf-a2882fafcff3');

insert into entrenadores_equipos (entrenador_id, equipo_id)
select e.id, eq.id from entrenadores e cross join equipos eq;
