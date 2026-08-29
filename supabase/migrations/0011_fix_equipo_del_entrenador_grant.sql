-- Corrige 0010_harden_equipo_del_entrenador.sql: el revoke de EXECUTE incluyó
-- por error al rol `authenticated`. Postgres exige que el rol que evalúa una
-- política de RLS tenga permiso de ejecución sobre cualquier función que esa
-- política invoque, incluso siendo `security definer` — sin este grant, la
-- RLS de todas las tablas con `equipo_del_entrenador(equipo_id)` habría
-- denegado el acceso a cualquier entrenador real. Mover la función a un
-- esquema no expuesto por PostgREST (0010) ya bastaba para que no fuera
-- invocable como RPC; revocarle EXECUTE a `authenticated` no era necesario
-- para eso y rompía el uso legítimo dentro de las políticas.

grant execute on function private.equipo_del_entrenador(uuid) to authenticated;
