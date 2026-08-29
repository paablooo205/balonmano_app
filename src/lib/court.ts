// Geometría de la pista de balonmano (40 x 20 m), coordenadas en metros.
// x: 0..40 (longitud), y: 0..20 (anchura). Portería defendida en x=0.

export const CANCHA_LARGO = 40;
export const CANCHA_ANCHO = 20;
export const ANCHO_PORTERIA = 3; // separación entre postes

function puntoEnCirculo(cx: number, cy: number, r: number, anguloDeg: number) {
  const rad = (anguloDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Línea de área (6m/9m): dos arcos centrados en cada poste, radio `r`,
 * que se encuentran en el eje central de la portería (construcción oficial IHF).
 * `lado` = 1 para la portería en x=0, -1 para la portería en x=largo.
 */
export function lineaDeArea(r: number, lado: 1 | -1 = 1, ancho = CANCHA_ANCHO): string {
  const cy = ancho / 2;
  const postI = cy - ANCHO_PORTERIA / 2;
  const postD = cy + ANCHO_PORTERIA / 2;
  // ángulo donde el arco (centrado en el poste) cruza el eje y = cy
  const medioAncho = ANCHO_PORTERIA / 2;
  const anguloEncuentro = (Math.asin(medioAncho / r) * 180) / Math.PI;

  const goalX = lado === 1 ? 0 : CANCHA_LARGO;
  const signo = lado; // hacia dentro del campo

  const pasos = 24;
  const puntos: { x: number; y: number }[] = [];

  // Arco superior (poste izquierdo, y = postI): de -90° a anguloEncuentro
  for (let i = 0; i <= pasos; i++) {
    const a = -90 + (i / pasos) * (90 + anguloEncuentro);
    const p = puntoEnCirculo(0, postI, r, a);
    puntos.push({ x: goalX + signo * p.x, y: p.y });
  }
  // Arco inferior (poste derecho, y = postD): de -anguloEncuentro a 90°
  for (let i = 0; i <= pasos; i++) {
    const a = -anguloEncuentro + (i / pasos) * (90 + anguloEncuentro);
    const p = puntoEnCirculo(0, postD, r, a);
    puntos.push({ x: goalX + signo * p.x, y: p.y });
  }

  return puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

export type NombreSistema = "5:1" | "6:0";

export interface PosicionPuesto {
  puesto: string;
  x: number;
  y: number;
}

/**
 * Posiciones tácticas aproximadas de cada puesto, defendiendo la portería en x=0.
 * Las distancias mínimas entre puestos de un mismo sistema están pensadas para que
 * quepa una zona táctil de radio `RADIO_TOQUE_PUESTO` alrededor de cada uno sin que
 * se solapen entre sí (ver comprobación de distancias en los comentarios de cada
 * sistema). Al añadir un sistema nuevo, procura mantener esa separación mínima.
 */
export const POSICIONES_SISTEMA: Record<NombreSistema, PosicionPuesto[]> = {
  "5:1": [
    { puesto: "AVANZADO", x: 8.5, y: 10 },
    { puesto: "CENTRAL", x: 4, y: 10 },
    { puesto: "LATERAL", x: 5, y: 4.7 },
    { puesto: "LATERAL", x: 5, y: 15.3 },
    { puesto: "EXTREMOS", x: 2, y: 1.2 },
    { puesto: "EXTREMOS", x: 2, y: 18.8 },
  ],
  "6:0": [
    { puesto: "CENTRAL", x: 4.5, y: 7.6 },
    { puesto: "CENTRAL", x: 4.5, y: 12.4 },
    { puesto: "LATERAL", x: 5.3, y: 3.3 },
    { puesto: "LATERAL", x: 5.3, y: 16.7 },
    { puesto: "EXTREMOS", x: 1.8, y: 0.8 },
    { puesto: "EXTREMOS", x: 1.8, y: 19.2 },
  ],
};

/** Radio visual del punto de jugador, en metros (unidades del viewBox). */
export const RADIO_PUESTO = 1.15;

/**
 * Radio de la zona táctil (hit-area) del punto de jugador, en metros.
 * Es mayor que `RADIO_PUESTO` para que el área clicable sea cómoda en móvil
 * (el punto visual se mantiene pequeño para no desproporcionar la pista).
 */
export const RADIO_TOQUE_PUESTO = 2.1;

/** Tamaño de fuente de la etiqueta de puesto bajo cada punto, en metros. */
export const FONT_SIZE_PUESTO = 1.4;
