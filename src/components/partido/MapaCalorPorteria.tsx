/**
 * Variante de solo lectura de `CuadriculaPorteria` — misma rejilla 3×3, misma
 * proporción (`aspect-ratio: 3/2`) y el mismo `color-mix` de intensidad, pero
 * sin interactividad: no hay `onZona`, no hay estado "armado", no hay toggle
 * de mapa de calor — aquí SIEMPRE está en modo mapa de calor, es su única
 * razón de ser (el toggle solo tenía sentido en la cuadrícula interactiva,
 * donde apagarlo evita que un jugador vea el patrón del rival mientras se
 * registra en directo).
 *
 * Cada celda muestra siempre el número de zona (esquina, atenuado) y, si hay
 * `total`, el porcentaje sobre ese total (grande) con el recuento real debajo
 * (pequeño) — honestidad estadística: nunca un porcentaje suelto sin decir
 * sobre cuántos intentos se calculó. Sin `total`, muestra el recuento crudo.
 * Una zona sin ningún tiro registrado se queda en gris neutro con un guion,
 * no en "0%" (0% sugeriría que se intentó y falló, no que no hay datos).
 *
 * Reutilizable en cualquier ficha que necesite "por dónde tira X" — partido,
 * jugador (temporada o un partido concreto), y más adelante rivales: mismo
 * componente, solo cambia qué eventos alimentan `conteosPorZona`.
 */
export function MapaCalorPorteria({
  conteosPorZona,
  total,
}: {
  conteosPorZona: Record<number, number>;
  /** Si se pasa, cada celda muestra porcentaje sobre este total (+ el
   * recuento real debajo, más pequeño) en vez del recuento crudo solo. */
  total?: number;
}) {
  const max = Math.max(1, ...Object.values(conteosPorZona));

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div
        className="relative overflow-hidden rounded border-[3px] border-white/25 bg-[#15151a]"
        style={{ aspectRatio: "3 / 2" }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[.22]" preserveAspectRatio="none">
          {[1, 2].map((i) => (
            <line key={`v${i}`} x1={`${i * 33.33}%`} y1="0" x2={`${i * 33.33}%`} y2="100%" stroke="white" strokeWidth="1.5" />
          ))}
          {[1, 2].map((i) => (
            <line key={`h${i}`} x1="0" y1={`${i * 33.33}%`} x2="100%" y2={`${i * 33.33}%`} stroke="white" strokeWidth="1.5" />
          ))}
        </svg>
        <div className="relative grid h-full grid-cols-3 grid-rows-3 gap-[3px] p-[3px]">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((zona) => {
            const cnt = conteosPorZona[zona] ?? 0;
            const pct = total ? Math.round((cnt / total) * 100) : null;
            return (
              <div
                key={zona}
                className="relative flex flex-col items-center justify-center gap-0.5 rounded-[2px]"
                style={{
                  background:
                    cnt > 0
                      ? `color-mix(in oklab, var(--color-accent) ${Math.round(22 + 58 * (cnt / max))}%, #15151a)`
                      : "rgba(255,255,255,.06)",
                }}
              >
                <span className="stat-number pointer-events-none absolute left-1 top-0.5 text-[9px] leading-none text-white/30">
                  {zona}
                </span>
                {cnt > 0 ? (
                  <>
                    <span className="stat-number text-sm text-white">{pct !== null ? `${pct}%` : cnt}</span>
                    {pct !== null && <span className="text-[8px] leading-none text-white/45">{cnt}</span>}
                  </>
                ) : (
                  <span className="stat-number text-sm text-white/20">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
