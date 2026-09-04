alter table ejercicios add column imagenes jsonb not null default '[]'::jsonb;

create policy "auth_read_adjuntos_ejercicios_compartidos" on storage.objects
  for select using (
    bucket_id = 'adjuntos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = 'ejercicios'
    and exists (
      select 1 from ejercicios
      where equipo_id = ((storage.foldername(name))[2])::uuid
        and compartido = true
        and imagenes @> to_jsonb(array[name])
    )
  );
