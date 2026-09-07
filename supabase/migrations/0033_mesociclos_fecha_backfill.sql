-- "Planifica la temporada" pasa a editar TODOS los mesociclos del equipo,
-- vengan de un periodo (Excel) o no — antes solo mostraba los que tenían
-- periodo_id null. Los mesociclos con periodo_id nunca tuvieron fecha_inicio/
-- fecha_fin propias (su rango se calculaba al vuelo a partir del min/max de
-- sus microciclos, ver rangoDeMesociclo() en ModeloJuegoPage.tsx) — se
-- rellenan aquí, una sola vez, con ese mismo cálculo, para que a partir de
-- ahora se editen exactamente igual que un bloque nuevo. Decisión explícita
-- del usuario: tras este relleno quedan totalmente independientes de su
-- periodo de origen — el periodo no vuelve a limitar nada, solo queda como
-- referencia (periodo_id sigue apuntando a él, sin más efecto).
update mesociclos m
set fecha_inicio = sub.min_inicio,
    fecha_fin = sub.max_fin
from (
  select mesociclo_id, min(fecha_inicio) as min_inicio, max(fecha_fin) as max_fin
  from microciclos
  where mesociclo_id is not null and fecha_inicio is not null and fecha_fin is not null
  group by mesociclo_id
) sub
where m.id = sub.mesociclo_id
  and m.periodo_id is not null
  and m.fecha_inicio is null;
