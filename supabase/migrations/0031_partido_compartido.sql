-- 0031_partido_compartido.sql
alter table partidos add column token_publico uuid unique;

-- Única función de todo el esquema con acceso `anon` — decisión deliberada
-- de esta feature (compartir la ficha de un partido sin cuenta), ver spec
-- docs/superpowers/specs/2026-09-05-partido-compartido-publico-design.md.
-- Construye la respuesta campo a campo (allowlist), nunca to_jsonb(fila)
-- completo, para que un alter table futuro no se cuele en lo expuesto.
-- Excluye deliberadamente: problemas_detectados/acciones_siguiente_semana/
-- notas_adicionales de partidos (notas internas del entrenador) y todo
-- dato personal de jugadores salvo id/equipo_id/nombre/dorsal/puesto.
create or replace function obtener_partido_compartido(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partido partidos%rowtype;
  v_resultado jsonb;
begin
  select * into v_partido from partidos where token_publico = p_token;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'partido', jsonb_build_object(
      'id', v_partido.id,
      'equipo_id', v_partido.equipo_id,
      'microciclo_id', null,
      'rival', v_partido.rival,
      'rival_id', null,
      'fecha', v_partido.fecha,
      'hora', v_partido.hora,
      'casa_fuera', v_partido.casa_fuera,
      'competicion', v_partido.competicion,
      'duracion_parte_min', v_partido.duracion_parte_min,
      'resultado', v_partido.resultado,
      'sistema_propio', v_partido.sistema_propio,
      'sistema_rival', v_partido.sistema_rival,
      'estadisticas', v_partido.estadisticas,
      'problemas_detectados', null,
      'acciones_siguiente_semana', null,
      'notas_adicionales', null,
      'token_publico', null,
      'created_at', v_partido.created_at,
      'updated_at', v_partido.updated_at
    ),
    'equipo_nombre', (select nombre from equipos where id = v_partido.equipo_id),
    'eventos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'equipo_id', e.equipo_id,
        'partido_id', e.partido_id,
        'sesion_id', null,
        'jugador_id', e.jugador_id,
        'equipo_origen', e.equipo_origen,
        'tipo', e.tipo,
        'resultado', e.resultado,
        'zona', e.zona,
        'origen', e.origen,
        'es_penalti', e.es_penalti,
        'color_tarjeta', e.color_tarjeta,
        'minuto', e.minuto,
        'creado_en', e.creado_en
      )), '[]'::jsonb)
      from eventos e
      where e.partido_id = v_partido.id
    ),
    'jugadores', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id,
        'equipo_id', j.equipo_id,
        'nombre', j.nombre,
        'año_nacimiento', null,
        'dorsal', j.dorsal,
        'altura_cm', null,
        'peso_kg', null,
        'puesto', j.puesto,
        'puestos_secundarios', '[]'::jsonb,
        'nivel_actual', null,
        'fortalezas', null,
        'aspectos_a_mejorar', null,
        'objetivo_individual', null,
        'ficha_oficial_url', null,
        'notas_adicionales', null,
        'created_at', j.created_at,
        'updated_at', j.updated_at
      )), '[]'::jsonb)
      from jugadores j
      join asistencia a on a.jugador_id = j.id
      where a.partido_id = v_partido.id and a.presente = true
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

-- El propio entrenador (autenticado) también debe poder abrir/probar su
-- propio link compartido en el mismo navegador con sesión iniciada, así
-- que el grant cubre ambos roles no-owner: anon (visitante sin cuenta) y
-- authenticated (el entrenador probando el link, o cualquier otro
-- entrenador del club). Ningún otro rol tiene permiso.
revoke all on function obtener_partido_compartido(uuid) from public;
grant execute on function obtener_partido_compartido(uuid) to anon, authenticated;
