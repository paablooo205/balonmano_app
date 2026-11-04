/** Constantes del motor de analítica — todas aquí, documentadas (spec §4).
 * Cambiar un valor aquí es cambiar la definición de una métrica. */

/** Peso (en tiros) de la referencia en el estimador Beta-Binomial. */
export const K_PRIOR = 20;

/** Probabilidad de gol de referencia por tipo de lanzamiento (xG pre-tiro). */
export const XG_REFERENCIA = {
  "7m": 0.75,
  extremo: 0.5,
  pivote: 0.65,
  exterior: 0.4,
  contragolpe: 0.8,
  desconocido: 0.5,
} as const;

/** PSxG: tasa base si hay menos de PSXG_MIN_MUESTRA tiros a puerta. */
export const PSXG_BASE_DEFECTO = 0.65;
export const PSXG_MIN_MUESTRA = 30;

/** Referencias fijas mientras haya menos de N_MEZCLA_REFERENCIA partidos. */
export const REFERENCIA_FIJA = {
  eficienciaAtaque: 0.55,
  eficienciaDefensa: 0.55,
  pctPerdidas: 0.15,
  pctParadas: 0.33,
  ritmo: 55,
} as const;
export const N_MEZCLA_REFERENCIA = 3;

export const DURACION_EXCLUSION_SEG = 120;
/** Mínimo de segundos en igualdad y en inferioridad para calcular el coste por exclusión. */
export const MIN_SEG_ESTADO_COSTE = 60;
export const MIN_SEG_FORMACION = 300;
export const MIN_POSESIONES_CON_SIN = 10;
export const RACHA_MIN_GOLES = 3;
export const SEQUIA_MIN_SEG = 300;
export const VENTANA_TIEMPO_MUERTO_SEG = 300;
/** Ventana previa a un parcial en la que se buscan causas (exclusión, TM...). */
export const VENTANA_CONTEXTO_PARCIAL_SEG = 60;
export const UMBRAL_TIENE_SEGUNDO = 0.9;
/** Fracción máxima de eventos de la 2ª parte en un mismo minuto antes de
 * considerar el minuto no fiable (síntoma de reloj parado). */
export const MAX_FRACCION_MISMO_MINUTO = 0.3;

/** Día de despliegue de la captura ampliada (tiro rival fuera, 2' rival,
 * tiempo muerto). Desde esta fecha, que no haya un "fuera" rival significa
 * que no lo hubo, no que no se registrara. Fijar al desplegar la fase 1. */
export const FECHA_CAPTURA_AMPLIADA = "2026-11-05";

/** Un factor solo protagoniza el titular si mueve al menos este número de goles. */
export const UMBRAL_FACTOR_DOMINANTE = 0.5;
