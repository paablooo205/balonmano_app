-- Bucket único para adjuntos (fichas de jugadores, recursos del club).
-- Privado: solo el usuario autenticado puede leer/escribir.
insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;

create policy "auth_read_adjuntos" on storage.objects
  for select using (bucket_id = 'adjuntos' and auth.role() = 'authenticated');

create policy "auth_write_adjuntos" on storage.objects
  for insert with check (bucket_id = 'adjuntos' and auth.role() = 'authenticated');

create policy "auth_update_adjuntos" on storage.objects
  for update using (bucket_id = 'adjuntos' and auth.role() = 'authenticated');

create policy "auth_delete_adjuntos" on storage.objects
  for delete using (bucket_id = 'adjuntos' and auth.role() = 'authenticated');
