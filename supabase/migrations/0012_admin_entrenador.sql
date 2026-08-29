-- Excepción DELIBERADA y ACOTADA al aislamiento estricto por equipo introducido
-- en 0008_entrenadores_rls.sql: una única cuenta admin (uso personal de
-- respaldo del mismo usuario, no un segundo entrenador real) con acceso de
-- lectura/escritura a CUALQUIER equipo del club. No es un rol de "admin
-- general" reutilizable — si en el futuro se necesita dar este alcance a otro
-- entrenador real, hay que revisar esta decisión explícitamente con el
-- usuario, no asumir que aplica.
--
-- No se toca ninguna política de RLS: como equipos, las 12 tablas con
-- equipo_id y las 4 políticas de storage.objects sobre "adjuntos" ya delegan
-- en private.equipo_del_entrenador(uuid), ampliar solo esa función basta.
-- Sigue sin haber política de INSERT en `equipos` ni `entrenadores_equipos`
-- (fuera de alcance, ver 0008).

-- ============================================================================
-- entrenadores.es_admin
-- ============================================================================
alter table entrenadores add column es_admin boolean not null default false;

comment on column entrenadores.es_admin is
  'Excepción deliberada y acotada: acceso admin a todos los equipos. Pensada '
  'para una única cuenta de respaldo personal del mismo usuario (auth_user_id '
  '79b05b79-dd69-4f6a-84cf-a2882fafcff3), no un rol general para otros '
  'entrenadores.';

update entrenadores
set es_admin = true, nombre = 'Pablo (admin)'
where auth_user_id = '79b05b79-dd69-4f6a-84cf-a2882fafcff3';

-- ============================================================================
-- private.equipo_del_entrenador(uuid) — añade el atajo de admin sin tocar
-- ninguna política existente. security definer + search_path fijo se
-- preservan tal cual quedaron en 0010/0011.
-- ============================================================================
create or replace function private.equipo_del_entrenador(p_equipo_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from entrenadores_equipos ee
    join entrenadores e on e.id = ee.entrenador_id
    where ee.equipo_id = p_equipo_id and e.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from entrenadores e
    where e.auth_user_id = auth.uid() and e.es_admin = true
  );
$$;
