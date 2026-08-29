-- RPC `crear_equipo(p_nombre, p_temporada)`, pensada para llamarse directamente
-- desde el cliente vía `supabase.rpc('crear_equipo', ...)`. Es `security
-- definer` porque, a propósito (ver 0008_entrenadores_rls.sql), ni `equipos`
-- ni `entrenadores_equipos` tienen política de INSERT: sin `security definer`
-- el propio RLS bloquearía las dos escrituras que hace esta función. La
-- identidad de quien llama se resuelve SIEMPRE con `auth.uid()` dentro de la
-- función (nunca con un id que mande el cliente como parámetro), así que no
-- reabre el hueco que 0008 cerró deliberadamente: nadie puede crear un equipo
-- huérfano ni vincularse a un equipo_id ajeno. `set search_path = public` es
-- obligatorio junto con `security definer` (evita search-path hijacking),
-- igual que en `equipo_del_entrenador`.
--
-- A diferencia de `equipo_del_entrenador` (movida a `private` en 0010 porque
-- es un helper interno de RLS), esta función debe quedarse en `public` para
-- que PostgREST la exponga como endpoint RPC.

create or replace function crear_equipo(p_nombre text, p_temporada text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_entrenador_id uuid;
  v_equipo_id uuid;
begin
  select id into v_entrenador_id
  from entrenadores
  where auth_user_id = auth.uid();

  if v_entrenador_id is null then
    raise exception 'No existe un entrenador vinculado al usuario autenticado';
  end if;

  insert into equipos (nombre, temporada)
  values (p_nombre, p_temporada)
  returning id into v_equipo_id;

  insert into entrenadores_equipos (entrenador_id, equipo_id)
  values (v_entrenador_id, v_equipo_id);

  return v_equipo_id;
end;
$$;

revoke all on function crear_equipo(text, text) from public, anon;
grant execute on function crear_equipo(text, text) to authenticated;
