-- Momento exacto de cada acción: segundos de partido transcurridos (reloj
-- de partido, 2ª parte con el offset de la 1ª — p.ej. 1145 = 19:05). Permite
-- mostrar "19:05" en la cronología y, sobre todo, la cuenta atrás de las
-- exclusiones de 2' (vuelve en segundo + 120).
--
-- Solo se AÑADE una columna nullable: no se toca ninguna fila existente. Las
-- acciones ya registradas se quedan con `segundo` null y siguen usando
-- `minuto` como hasta ahora; `minuto` se sigue rellenando también en las
-- nuevas para no romper nada que lo use.
alter table eventos add column segundo integer check (segundo >= 0);
