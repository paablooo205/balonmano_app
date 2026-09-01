/**
 * Convierte una lista de timestamps ISO en una función que devuelve la
 * posición horizontal (0 a `ancho`) proporcional al tiempo transcurrido
 * desde el primer timestamp de la lista. Con 0 timestamps o con todos
 * iguales (rango cero — un único instante, o varios eventos en el mismo
 * milisegundo), siempre devuelve 0 — nunca división por cero, y no hay
 * "transcurrido" real que repartir en esos casos.
 *
 * Cada gráfico que la usa (`LineaMarcador`, `MarcadorExclusiones`) calcula
 * su propia escala a partir de sus propios puntos — no hay un eje temporal
 * compartido entre gráficos distintos de la pantalla, cada uno es su
 * propia ventana temporal local (ver spec, decisión explícita).
 */
export function crearEscalaTiempo(timestamps: string[], ancho: number): (ts: string) => number {
  if (timestamps.length === 0) return () => 0;
  const valores = timestamps.map((t) => new Date(t).getTime());
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min;
  if (rango === 0) return () => 0;
  return (ts: string) => ((new Date(ts).getTime() - min) / rango) * ancho;
}
