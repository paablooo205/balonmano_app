/**
 * Imagen de fondo tematizada por época del año para la cabecera del
 * entrenamiento (SesionDetailPage). Los archivos viven en `public/hero/` para
 * que el service worker los cachee como parte del app shell (funcionan
 * offline) — nunca una URL externa.
 *
 * Solo hay imagen para las épocas que tienen archivo (navidad, halloween,
 * otoño, invierno) — primavera y verano, al no tener imagen todavía, se
 * quedan con el fondo de tinta liso de siempre. Basta con añadir el archivo
 * correspondiente en `public/hero/` y un tramo aquí para activarlas.
 */
type Tramo = { desde: [number, number]; hasta: [number, number]; archivo: string };

const TRAMOS: Tramo[] = [
  { desde: [9, 1], hasta: [10, 19], archivo: "otono.png" },
  { desde: [10, 20], hasta: [11, 2], archivo: "halloween.png" },
  { desde: [11, 3], hasta: [12, 19], archivo: "otono.png" },
  { desde: [12, 20], hasta: [1, 7], archivo: "navidad.png" },
  { desde: [1, 8], hasta: [3, 20], archivo: "invierno.png" },
];

function dentroDelTramo(mes: number, dia: number, t: Tramo): boolean {
  const [mDesde, dDesde] = t.desde;
  const [mHasta, dHasta] = t.hasta;
  const valor = mes * 100 + dia;
  const inicio = mDesde * 100 + dDesde;
  const fin = mHasta * 100 + dHasta;
  if (inicio <= fin) return valor >= inicio && valor <= fin;
  // Tramo que cruza el fin de año (ej. Navidad: 20 dic - 7 ene).
  return valor >= inicio || valor <= fin;
}

/** Ruta a la imagen de fondo de la época actual, o null si no hay ninguna definida. */
export function imagenDeTemporada(fecha: Date = new Date()): string | null {
  const mes = fecha.getMonth() + 1;
  const dia = fecha.getDate();
  const tramo = TRAMOS.find((t) => dentroDelTramo(mes, dia, t));
  return tramo ? `/hero/${tramo.archivo}` : null;
}
