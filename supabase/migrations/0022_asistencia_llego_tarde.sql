-- Eje independiente del de ausencia: un jugador puede estar presente y aun
-- así haber llegado tarde. Solo tiene sentido cuando presente=true — misma
-- forma de restricción cruzada que ya usa asistencia_motivo_solo_ausente
-- para motivo_ausencia (ahí el eje es "solo cuando ausente", aquí es "solo
-- cuando presente").
alter table asistencia add column llego_tarde boolean not null default false;
alter table asistencia add constraint asistencia_llego_tarde_solo_presente
  check (not llego_tarde or presente);
