-- Sistema de invitaciones a equipo: un entrenador con acceso a un equipo genera
-- un código corto de un solo uso (`crear_invitacion`); otro entrenador ya
-- autenticado lo canjea (`canjear_invitacion`) para vincularse a ese equipo vía
-- `entrenadores_equipos`. Sigue el mismo patrón de 0014_crear_equipo.sql:
-- funciones `security definer` en `public` (expuestas por PostgREST vía
-- `supabase.rpc(...)`), identidad resuelta siempre con `auth.uid()`, nunca con
-- un id que mande el cliente como parámetro.

-- ============================================================================
-- TABLA
-- ============================================================================
create table invitaciones_equipo (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos(id) on delete cascade,
  codigo text not null unique,
  creado_por uuid not null references entrenadores(id) on delete cascade,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null default (now() + interval '7 days'),
  usado boolean not null default false,
  usado_por uuid references entrenadores(id) on delete set null
);
create index idx_invitaciones_equipo_equipo on invitaciones_equipo(equipo_id);

-- ============================================================================
-- RLS — cerrado por defecto, mismo principio que `equipos`/`entrenadores_equipos`
-- en 0008_entrenadores_rls.sql. Solo hay política de SELECT: un entrenador
-- puede ver las invitaciones de los equipos a los que ya pertenece (por
-- ejemplo, para mostrar en la UI el código vigente y su fecha de caducidad).
-- Deliberadamente NO hay política de INSERT/UPDATE/DELETE: toda escritura pasa
-- en exclusiva por `crear_invitacion` y `canjear_invitacion`, que son
-- `security definer` y por tanto se saltan RLS para sus propias escrituras
-- controladas. Sin política de escritura + RLS activo, Postgres deniega
-- cualquier INSERT/UPDATE/DELETE directo desde el cliente sobre esta tabla,
-- que es justo lo que queremos: un entrenador sin equipo no debe poder leer ni
-- escribir aquí de ninguna otra forma, y ni siquiera un entrenador con equipo
-- debe poder fabricarse o alterar códigos a mano.
-- ============================================================================
alter table invitaciones_equipo enable row level security;

create policy "invitaciones_equipo_select_own" on invitaciones_equipo
  for select using (private.equipo_del_entrenador(equipo_id));

-- ============================================================================
-- `crear_invitacion(p_equipo_id)` — genera (o regenera) el código de
-- invitación vigente de un equipo. `security definer` es imprescindible: la
-- tabla no tiene política de INSERT/UPDATE, así que sin `security definer` la
-- propia RLS bloquearía la escritura. `set search_path = public` es
-- obligatorio junto con `security definer` (evita search-path hijacking),
-- igual que en `equipo_del_entrenador` y `crear_equipo`. La identidad de quien
-- llama se resuelve SIEMPRE con `auth.uid()` dentro de la función, nunca con
-- un entrenador_id que mande el cliente, para que nadie pueda generar
-- invitaciones en nombre de otro entrenador ni de un equipo ajeno.
-- ============================================================================
create or replace function crear_invitacion(p_equipo_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_entrenador_id uuid;
  v_codigo text;
begin
  if not private.equipo_del_entrenador(p_equipo_id) then
    raise exception 'No tienes acceso a este equipo.';
  end if;

  -- Regenerar invalida cualquier invitación anterior sin usar y todavía
  -- vigente, para que solo exista un código válido por equipo a la vez, sin
  -- necesidad de exponer update/delete al cliente.
  update invitaciones_equipo
  set expira_en = now()
  where equipo_id = p_equipo_id and not usado and expira_en > now();

  select id into v_entrenador_id
  from entrenadores
  where auth_user_id = auth.uid();

  if v_entrenador_id is null then
    -- No debería ocurrir nunca (equipo_del_entrenador ya exige un
    -- entrenador vinculado), pero se comprueba igualmente en profundidad.
    raise exception 'No existe un entrenador vinculado al usuario autenticado';
  end if;

  -- Código corto no adivinable: 8 caracteres hex en mayúsculas, derivados de
  -- un UUID v4 (gen_random_uuid(), ya usado en todo el esquema — pgcrypto/
  -- gen_random_bytes no está habilitado en este proyecto, así que se evita
  -- añadir una extensión nueva solo para esto). 32 bits de entropía útil.
  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into invitaciones_equipo (equipo_id, codigo, creado_por)
  values (p_equipo_id, v_codigo, v_entrenador_id);

  return v_codigo;
end;
$$;

revoke all on function crear_invitacion(uuid) from public, anon;
grant execute on function crear_invitacion(uuid) to authenticated;

-- ============================================================================
-- `canjear_invitacion(p_codigo)` — vincula al entrenador que llama con el
-- equipo de la invitación y la marca como usada. `security definer` por el
-- mismo motivo que `crear_invitacion`: ni `invitaciones_equipo` ni
-- `entrenadores_equipos` tienen política de INSERT/UPDATE para el cliente. La
-- identidad de quien canjea se resuelve SIEMPRE con `auth.uid()`, nunca con un
-- entrenador_id de parámetro, para que un código solo pueda canjearlo quien
-- esté autenticado en ese momento, no un tercero indicado por el llamante.
-- ============================================================================
create or replace function canjear_invitacion(p_codigo text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_invitacion invitaciones_equipo%rowtype;
  v_entrenador_id uuid;
begin
  -- `for update` bloquea la fila hasta que termine esta función: evita que dos
  -- canjes concurrentes del mismo código pasen ambos la comprobación `usado`
  -- antes de que el primero confirme. `upper()` hace la comparación insensible
  -- a mayúsculas/minúsculas (los códigos se generan siempre en mayúsculas).
  select * into v_invitacion
  from invitaciones_equipo
  where codigo = upper(p_codigo)
  for update;

  if v_invitacion.id is null then
    raise exception 'Código no válido.';
  end if;

  if v_invitacion.usado then
    raise exception 'Este código ya se ha utilizado.';
  end if;

  if v_invitacion.expira_en < now() then
    raise exception 'Este código ha caducado.';
  end if;

  select id into v_entrenador_id
  from entrenadores
  where auth_user_id = auth.uid();

  if v_entrenador_id is null then
    raise exception 'No existe un entrenador vinculado al usuario autenticado';
  end if;

  -- Evita fila duplicada si alguien reabre un enlace que ya había canjeado
  -- él mismo previamente.
  if not exists (
    select 1 from entrenadores_equipos
    where entrenador_id = v_entrenador_id and equipo_id = v_invitacion.equipo_id
  ) then
    insert into entrenadores_equipos (entrenador_id, equipo_id)
    values (v_entrenador_id, v_invitacion.equipo_id);
  end if;

  update invitaciones_equipo
  set usado = true, usado_por = v_entrenador_id
  where id = v_invitacion.id;

  return v_invitacion.equipo_id;
end;
$$;

revoke all on function canjear_invitacion(text) from public, anon;
grant execute on function canjear_invitacion(text) to authenticated;
