-- El linter de seguridad de Supabase marca `set_updated_at` por tener
-- search_path mutable (puede ser secuestrado por un search_path de sesión
-- malicioso). Se fija explícitamente.
alter function set_updated_at() set search_path = public;
