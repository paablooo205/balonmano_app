-- Alinea las políticas del bucket "adjuntos" (0002_storage.sql) con el
-- aislamiento estricto por equipo introducido en 0008_entrenadores_rls.sql.
--
-- Las rutas del bucket siguen el patrón `{tipo}/{equipo_id}/{archivo}` (ver
-- src/lib/storage.ts: subirArchivo(carpeta, file), donde carpeta es
-- `sesiones/${equipoId}`, `jugadores/${equipoId}` o `recursos/${equipoId}`).
-- storage.foldername(name) devuelve solo los segmentos de carpeta (sin el
-- nombre de archivo), 1-indexado: [1] = tipo, [2] = equipo_id.

drop policy "auth_read_adjuntos" on storage.objects;
drop policy "auth_write_adjuntos" on storage.objects;
drop policy "auth_update_adjuntos" on storage.objects;
drop policy "auth_delete_adjuntos" on storage.objects;

create policy "auth_read_adjuntos" on storage.objects
  for select using (
    bucket_id = 'adjuntos'
    and auth.role() = 'authenticated'
    and equipo_del_entrenador(((storage.foldername(name))[2])::uuid)
  );

create policy "auth_write_adjuntos" on storage.objects
  for insert with check (
    bucket_id = 'adjuntos'
    and auth.role() = 'authenticated'
    and equipo_del_entrenador(((storage.foldername(name))[2])::uuid)
  );

create policy "auth_update_adjuntos" on storage.objects
  for update using (
    bucket_id = 'adjuntos'
    and auth.role() = 'authenticated'
    and equipo_del_entrenador(((storage.foldername(name))[2])::uuid)
  );

create policy "auth_delete_adjuntos" on storage.objects
  for delete using (
    bucket_id = 'adjuntos'
    and auth.role() = 'authenticated'
    and equipo_del_entrenador(((storage.foldername(name))[2])::uuid)
  );
