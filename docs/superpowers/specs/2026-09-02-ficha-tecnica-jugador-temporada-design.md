# Ficha técnica de jugador — estadística de temporada — spec de diseño

**Contexto:** sustituye a `JugadorDetailPage.tsx`'s sección "Rendimiento" (barras simples) por un dashboard con foco en la temporada completa, reutilizando al máximo los componentes ya construidos en la fase "ficha técnica de partido — gráficos" (`AnilloDonut`, `BloqueTiro`/`MapaCalorPorteria`, y el estilo de `LineaMarcador`). Esta rama parte del HEAD de esa fase (no de `master`), así que esos componentes ya existen aquí.

## Decisiones de esta fase

- **`DesgloseJugadorPartido` (extraído de `PanelJugadorPartido`)**: el contenido de "partido concreto" (pérdidas/robos + 2×`BloqueTiro`, portero-aware) se extrae a un componente propio sin chrome de pantalla, para que lo usen tanto `PanelJugadorPartido` (envuelto en el modal, sin cambios de comportamiento) como la vista de "partido concreto" de esta ficha nueva (embebido directamente en la página) — una sola fuente de verdad, tal como pide el usuario ("no mantener dos versiones del mismo componente").
- **`LineaEvolucionEficacia` (nuevo)**: mismo espíritu que `LineaMarcador`/la ya descartada `TendenciaEficacia` — SVG a medida, sin librería, coordenadas con margen desde el primer commit (aprendido de la corrección de recorte de bordes de la fase anterior, no se repite ese error). Una sola línea, eje X = partidos jugados en orden cronológico, eje Y = % de eficacia de tiro combinado (juego+7m) de ese partido. Con menos de 2 partidos con tiros, no renderiza nada.
- **Anillo de paradas del portero**: mismo patrón exacto que el anillo de eficacia ya existente en `FichaTecnica.tsx` (4 segmentos: gol/parado/fuera/poste, mismos colores) — solo cambia qué tiros alimenta (`tirosRivalJuego`/`tirosRivalPenalti` en vez de `tirosJuego`/`tirosPenalti`), con "Parado" como segmento protagonista en el centro en vez de "Gol". No se inventa un esquema de color ni de segmentos nuevo.
- **`MIN_TIROS_RECIBIDOS` se exporta desde `valoracion.ts`** (hoy privado) y se reutiliza tal cual para un aviso de muestra pequeña junto al anillo de paradas del portero — no se reimplementa el umbral en otro sitio. El anillo NO se oculta por debajo del umbral (ya muestra el recuento real en su leyenda, cumpliendo la honestidad estadística); se añade un aviso adicional de "interpreta con cautela" solo cuando hay algo de muestra (1 a `MIN_TIROS_RECIBIDOS - 1` intentos) pero no la suficiente — con 0 intentos, el propio anillo ya se muestra vacío ("Sin datos"), no hace falta aviso extra.
- **Eficacia combinada** (cabecera del anillo, y cada punto de la línea de evolución) siempre junta juego abierto + 7 metros — mismo criterio ya usado en la cabecera del anillo de `FichaTecnica.tsx`. El desglose separado (nunca mezclado) vive en los dos `BloqueTiro` de abajo, igual que en partido.
- **`?vista=` en `PartidoDetailPage.tsx`** (punto 5 del encargo, no bloqueante pero incluido): añade soporte para `?vista=ficha` (o `live`) en la URL, validando el valor contra las 3 vistas reales — sin esto, el enlace "Ver ficha técnica completa" desde esta nueva ficha de jugador no podría abrir directamente esa vista.
- **Selector de ámbito**: mismo patrón ya usado en la fase de jugador anterior (ahora descartada, pero el patrón en sí era correcto y ya pasó su propia revisión): `<Select>` con "Toda la temporada" + partidos jugados, `?partido=<id>` preselecciona, con `ambitoValido` cayendo a "temporada" si el id no corresponde a ningún partido jugado por este jugador.
- **KPIs de cabecera y asistencia a entrenamientos**: sin cambios — el encargo solo afecta a la sección "Rendimiento".

## Constraints globales (heredadas)

- 7 metros y juego abierto nunca se mezclan en el mismo porcentaje.
- Todo porcentaje/recuento se muestra siempre honesto.
- Sin librerías de gráficos.
- Tema claro estándar (`card-surface`) — esta página no es "Partido en directo". `MapaCalorPorteria` (vía `BloqueTiro`) sigue siendo su propio widget oscuro autocontenido.
- Todo en español.
