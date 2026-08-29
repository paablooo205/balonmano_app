-- Endurece equipo_del_entrenador(uuid): PostgREST expone automáticamente
-- cualquier función del esquema `public` como /rest/v1/rpc/<nombre>. El
-- advisor de seguridad de Supabase marcó esto tras 0008_entrenadores_rls.sql
-- (anon y authenticated podían invocarla directamente). La movemos a un
-- esquema `private` (no expuesto por PostgREST) preservando su OID vía
-- `set schema`, para que las políticas de RLS que ya la referencian sigan
-- funcionando sin necesidad de recrearlas.

create schema if not exists private;

alter function equipo_del_entrenador(uuid) set schema private;

revoke execute on function private.equipo_del_entrenador(uuid) from public, anon, authenticated;
