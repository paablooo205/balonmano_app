const TAMANO_PAGINA = 1000;

/**
 * Trae TODAS las filas de una consulta, página a página. PostgREST corta
 * cada respuesta en 1000 filas sin avisar — con un equipo de 10+ partidos
 * (`eventos`) o una temporada de asistencia, una consulta normal devolvía
 * una lista truncada y los cálculos salían mal en silencio.
 *
 * `pagina` debe construir la consulta con un orden estable (p.ej.
 * `.order("id")`) y aplicar `.range(desde, hasta)` — sin orden, las páginas
 * pueden solaparse o saltarse filas. Devuelve la misma forma `{ data, error }`
 * que una consulta normal: `data` es null si falla cualquier página (nunca
 * una lista parcial que parezca completa).
 */
export async function traerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[] | null; error: unknown }> {
  const todas: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await pagina(desde, desde + TAMANO_PAGINA - 1);
    if (error || !data) return { data: null, error };
    todas.push(...data);
    if (data.length < TAMANO_PAGINA) return { data: todas, error: null };
  }
}
