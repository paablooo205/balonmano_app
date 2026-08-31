-- Tabla de eventos individuales de partido/entrenamiento, para poder guardar
-- datos por tiro (zona, resultado, si es penalti) en vez de solo un contador
-- acumulado. Sustituye la parte de `partidos.estadisticas.eventos` que hoy
-- funciona como "contador con deshacer" (goles, tiros, paradas, perdidas,
-- exclusiones).
--
-- ALCANCE DELIBERADO (decision explicita del usuario): esta migracion NO toca
-- el cronometro (`estadisticas.cronometro`) ni las sustituciones en pista
-- (`entra_pista`/`sale_pista`, usadas para minutos jugados) ni los toques de
-- "7m provocado"/"7m cometido" -- son estado continuo o matices sin
-- equivalente limpio en esta tabla, y se quedan tal cual en `estadisticas`
-- jsonb. Solo se migran los 9 tipos de contador con equivalente directo:
-- gol_favor, gol_contra, parada_portero, balon_ganado, balon_perdido,
-- tiro_fallado, siete_metido, siete_fallado, exclusion_2min.
--
-- MAPEO tipo jsonb -> fila eventos:
--   gol_favor      -> equipo_origen=propio, tipo=tiro,     resultado=gol,    es_penalti=false
--   gol_contra     -> equipo_origen=rival,  tipo=tiro,     resultado=gol,    es_penalti=false
--   parada_portero -> equipo_origen=rival,  tipo=tiro,     resultado=parado, es_penalti=false
--     (mismo evento que "tiro rival"/"nos meten o para nuestro portero" -- ver
--     nota de diseno del usuario; no se distingue que portero propio paro,
--     jugador_id queda vacio igual que en el resto de eventos del rival)
--   balon_ganado   -> equipo_origen=rival,  tipo=perdida (el rival la pierde)
--   balon_perdido  -> equipo_origen=propio, tipo=perdida
--   tiro_fallado   -> equipo_origen=propio, tipo=tiro,     resultado=fuera,  es_penalti=false
--   siete_metido   -> equipo_origen=propio, tipo=tiro,     resultado=gol,    es_penalti=true
--   siete_fallado  -> equipo_origen=propio, tipo=tiro,     resultado=fuera,  es_penalti=true
--   exclusion_2min -> equipo_origen=propio, tipo=exclusion
--
-- `zona` es NULLABLE (a diferencia del `not null` del diseno original
-- planteado por el usuario para tipo='tiro') por dos motivos: (1) los eventos
-- historicos migrados abajo no tienen zona registrada, y (2) el componente de
-- cuadricula de porteria llega en la siguiente fase -- hasta entonces los
-- botones de "Partido en directo" siguen escribiendo tiros sin zona, igual
-- que hoy. El check de tipo='tiro' solo exige `resultado`, no `zona`.
--
-- REVISION db-schema (respecto al borrador del plan): se endurecen 4 checks
-- que el borrador dejaba solo "de ida" o sin cubrir, para que la fila no
-- pueda quedar en un estado sin sentido de negocio (p.ej. una "perdida" con
-- resultado='gol', o un evento con zona/es_penalti puestos en un tipo que no
-- es tiro):
--   1. `resultado` ahora es equivalencia con tipo='tiro' (antes solo exigia
--      resultado en tiros, pero no impedia ponerlo en perdida/exclusion).
--   2. `zona` solo puede rellenarse si tipo='tiro'.
--   3. `es_penalti` solo puede ser true si tipo='tiro' (un 7m es un tiro).
--   4. `partido_id`/`sesion_id` pasan a ser mutuamente excluyentes (antes
--      solo exigia "al menos uno"), igual que `asistencia_evento_check` en
--      0001_init_schema.sql -- un evento ocurre en un partido O en una
--      sesion, nunca en los dos a la vez.
-- Se anade tambien `idx_eventos_jugador`, siguiendo la convencion del resto
-- del esquema de indexar toda columna FK (ver `idx_asistencia_jugador` etc.
-- en 0001_init_schema.sql); el backfill de abajo no cambia.

create table eventos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  partido_id uuid references partidos (id) on delete cascade,
  sesion_id uuid references sesiones (id) on delete cascade,
  jugador_id uuid references jugadores (id) on delete set null,
  equipo_origen text not null check (equipo_origen in ('propio', 'rival')),
  tipo text not null check (tipo in ('tiro', 'perdida', 'exclusion')),
  resultado text check (resultado in ('gol', 'fuera', 'parado', 'poste')),
  zona smallint check (zona between 1 and 9),
  es_penalti boolean not null default false,
  creado_en timestamptz not null default now(),
  constraint eventos_evento_check check (
    (partido_id is not null and sesion_id is null)
    or (partido_id is null and sesion_id is not null)
  ),
  constraint eventos_resultado_solo_tiro check ((tipo = 'tiro') = (resultado is not null)),
  constraint eventos_zona_solo_tiro check (zona is null or tipo = 'tiro'),
  constraint eventos_penalti_solo_tiro check (es_penalti = false or tipo = 'tiro')
);
create index idx_eventos_equipo on eventos (equipo_id);
create index idx_eventos_partido on eventos (partido_id);
create index idx_eventos_sesion on eventos (sesion_id);
create index idx_eventos_jugador on eventos (jugador_id);

alter table eventos enable row level security;

create policy "equipo_del_entrenador" on eventos
  for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));

-- ============================================================================
-- BACKFILL -- migra los 9 tipos de contador de `partidos.estadisticas.eventos`
-- (jsonb) a filas de `eventos`, y limpia esos mismos tipos del jsonb para que
-- no queden duplicados. cronometro, entra_pista, sale_pista, siete_provocado
-- y siete_cometido se preservan sin tocar.
-- ============================================================================
insert into eventos (equipo_id, partido_id, jugador_id, equipo_origen, tipo, resultado, es_penalti, creado_en)
select
  p.equipo_id,
  p.id,
  (e ->> 'jugador_id')::uuid,
  case (e ->> 'tipo')
    when 'gol_contra' then 'rival'
    when 'parada_portero' then 'rival'
    when 'balon_ganado' then 'rival'
    else 'propio'
  end,
  case (e ->> 'tipo')
    when 'balon_ganado' then 'perdida'
    when 'balon_perdido' then 'perdida'
    when 'exclusion_2min' then 'exclusion'
    else 'tiro'
  end,
  case (e ->> 'tipo')
    when 'gol_favor' then 'gol'
    when 'gol_contra' then 'gol'
    when 'siete_metido' then 'gol'
    when 'parada_portero' then 'parado'
    when 'tiro_fallado' then 'fuera'
    when 'siete_fallado' then 'fuera'
    else null
  end,
  (e ->> 'tipo') in ('siete_metido', 'siete_fallado'),
  (e ->> 'creado_en')::timestamptz
from partidos p, jsonb_array_elements(p.estadisticas -> 'eventos') as e
where (e ->> 'tipo') in (
  'gol_favor', 'gol_contra', 'parada_portero', 'balon_ganado',
  'balon_perdido', 'tiro_fallado', 'siete_metido', 'siete_fallado', 'exclusion_2min'
);

-- Quita del jsonb los tipos ya migrados, conservando cronometro (columna
-- aparte, no tocada) y el resto de toques (entra_pista, sale_pista,
-- siete_provocado, siete_cometido).
update partidos
set estadisticas = jsonb_set(
  estadisticas,
  '{eventos}',
  coalesce(
    (
      select jsonb_agg(e)
      from jsonb_array_elements(estadisticas -> 'eventos') as e
      where (e ->> 'tipo') not in (
        'gol_favor', 'gol_contra', 'parada_portero', 'balon_ganado',
        'balon_perdido', 'tiro_fallado', 'siete_metido', 'siete_fallado', 'exclusion_2min'
      )
    ),
    '[]'::jsonb
  )
)
where estadisticas -> 'eventos' is not null;
