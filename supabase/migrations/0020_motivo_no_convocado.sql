-- Añade "no_convocado" a los motivos de ausencia posibles, para poder
-- distinguir en un partido "no fue convocado" (decisión del entrenador)
-- de justificado/injustificado/lesión (aplicable tanto a entrenamientos
-- como a partidos). Solo se ofrece en la UI para partidos — ver
-- AsistenciaChecklist.tsx — pero la restricción se amplía a nivel de
-- columna, no de contexto (motivo_ausencia no sabe si su fila es de
-- sesión o de partido).
alter table asistencia drop constraint asistencia_motivo_ausencia_check;
alter table asistencia add constraint asistencia_motivo_ausencia_check
  check (motivo_ausencia = any (array['justificado', 'injustificado', 'lesion', 'no_convocado']));
