update ejercicios
set notas_adicionales = concat_ws(
  E'\n\n',
  nullif(trim(notas_adicionales), ''),
  nullif(concat_ws(
    E'\n\n',
    case when trim(coalesce(organizacion, '')) <> '' then 'Organización:' || E'\n' || trim(organizacion) end,
    case when trim(coalesce(reglas, '')) <> '' then 'Reglas:' || E'\n' || trim(reglas) end,
    case when trim(coalesce(consignas, '')) <> '' then 'Consignas:' || E'\n' || trim(consignas) end,
    case when trim(coalesce(progresion, '')) <> '' then 'Progresión:' || E'\n' || trim(progresion) end,
    case when trim(coalesce(regresion, '')) <> '' then 'Regresión:' || E'\n' || trim(regresion) end,
    case when trim(coalesce(errores_frecuentes, '')) <> '' then 'Errores frecuentes:' || E'\n' || trim(errores_frecuentes) end,
    case when trim(coalesce(correcciones, '')) <> '' then 'Correcciones:' || E'\n' || trim(correcciones) end,
    case when trim(coalesce(transferencia_partido, '')) <> '' then 'Transferencia al partido:' || E'\n' || trim(transferencia_partido) end
  ), '')
)
where
  trim(coalesce(organizacion, '')) <> '' or
  trim(coalesce(reglas, '')) <> '' or
  trim(coalesce(consignas, '')) <> '' or
  trim(coalesce(progresion, '')) <> '' or
  trim(coalesce(regresion, '')) <> '' or
  trim(coalesce(errores_frecuentes, '')) <> '' or
  trim(coalesce(correcciones, '')) <> '';

alter table ejercicios
  drop column organizacion,
  drop column reglas,
  drop column consignas,
  drop column progresion,
  drop column regresion,
  drop column errores_frecuentes,
  drop column correcciones,
  drop column transferencia_partido;
