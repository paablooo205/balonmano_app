# Fichas técnicas — dashboard profesional — Design

**Status:** aprobado por el usuario en chat, sección por sección (2026-09-01). Pendiente de revisión de la spec escrita antes del plan de implementación.

## Goal

Sustituir los recuentos brutos de la Ficha técnica de partido (`src/components/partido/FichaTecnica.tsx`) y de la ficha de jugador (`src/pages/JugadorDetailPage.tsx`) por dashboards que muestran estadísticas **derivadas e interpretadas** — el tipo de panel que un entrenador lee en 5 segundos y ya sabe qué está pasando, no una tabla de números sueltos. Construye sobre los datos ya recogidos en "Registro en vivo ampliado" (tabla `eventos`: zona, origen, `es_penalti`, atribución de portero, tarjetas).

## Non-Goals (fuera de esta fase)

- Redis eño de la sección de asistencia a entrenamientos — ya funciona bien (% + barra de últimas sesiones), no es donde está el problema que se está resolviendo.
- Ficha de rivales — `MapaCalorPorteria` se construye ya pensado para reutilizarse ahí, pero la ficha de rival en sí no se construye en esta fase.
- Cualquier librería de gráficos externa — la línea de tendencia es SVG a mano, coherente con "SVG a medida, sin librería de diagramas" (CLAUDE.md).

## Principios de diseño (aplican a ambas fichas)

1. **Cifra protagonista primero, detalle debajo.** La cifra grande de arriba **se adapta al rol**: eficacia de tiro global para un jugador de campo, % de paradas para un portero que apenas lanza. El resto del dashboard (desglose juego abierto/7m, mapas de calor, cifras secundarias) va debajo, más pequeño.
2. **7 metros y juego abierto, siempre separados** — nunca mezclados en el mismo porcentaje (ya establecido al construir la tabla `eventos`).
3. **Honestidad estadística con muestra pequeña**: por debajo de un umbral de intentos (10), se muestra el porcentaje **junto con el recuento real** ("2 de 3 tiros — 67%"), nunca un porcentaje suelto. Aplica a cualquier ratio del dashboard (eficacia, % paradas, y también a la nota — ver más abajo) y es especialmente relevante en pretemporada/inicio de temporada, cuando va a ser el caso frecuente, no la excepción.
4. **Mapa de calor real, no lista de porcentajes** — `MapaCalorPorteria`, geometría/estética de `CuadriculaPorteria` en modo solo lectura. Número/porcentaje **siempre visible** en cada zona (no oculto tras hover — en móvil no existe hover; ya es el patrón que usa la cuadrícula interactiva con el número de zona).
5. Misma estética ya establecida (tarjeta oscura, acento rojo, radios ajustados en la última pasada de densidad) — nada nuevo que inventar visualmente aquí.

## Componente nuevo: `MapaCalorPorteria`

**Files:** `src/components/partido/MapaCalorPorteria.tsx` (nuevo)

Variante de solo lectura de `CuadriculaPorteria` — mismo grid 3×3, mismas proporciones (`aspect-ratio: 3/2`), mismo `color-mix` de intensidad, pero:
- Sin `onZona`, sin `tocable`/`resaltado` (no es interactivo, no hay estado de "armado").
- Cada celda muestra siempre el número de zona (esquina, atenuado) **y** el recuento/porcentaje (centrado) — no depende de un toggle de "mapa de calor" activado/desactivado como la versión interactiva; aquí SIEMPRE está en modo mapa de calor, es su única razón de ser.
- Props: `conteosPorZona: Record<number, number>` (mismo shape que ya usa `CuadriculaPorteria`, así que ambas fichas pueden construirlo con la misma lógica que ya existe en `ContadoresEnVivo.tsx` — `eventos.filter(...).reduce(...)` por zona) y un `total: number` opcional para mostrar porcentaje en vez de (o además de) el recuento crudo por zona, según haga falta.
- Reutilizable ya para la futura ficha de Rivales (mismo componente, mismos props, otro conjunto de eventos) — no requiere cambios cuando llegue esa fase.

## Estadísticas derivadas — funciones compartidas

**Files:** `src/lib/partidoStats.ts` (ampliar, no reescribir)

Nuevas funciones sobre `EventosRow[]` (ya filtrados al ámbito que corresponda — un partido, o varios):
- `eficaciaConDetalle(eventos, { soloPenalti }): { pct: number; aciertos: number; intentos: number } | null` — sustituye a `eficaciaLanzamiento` en los dashboards (esta última se mantiene para lo que ya la usa); separa juego abierto de 7m vía el flag, y devuelve `null` si `intentos === 0` (nunca `0%` engañoso).
- `distribucionPorZona(eventos): Record<number, number>` — conteo de tiros por zona, ya filtrados a los que interesan (p.ej. solo goles, o todos los intentos — lo decide el llamante filtrando antes).
- `porcentajeParadas(eventos)` (eventos ya filtrados a `tipo='tiro' && equipo_origen='rival'` de un portero) → mismo shape `{ pct, aciertos, intentos } | null` que `eficaciaConDetalle`, aciertos = `resultado==='parado'`.

## Nota media (0-10) — motor de valoración

**Files:** `src/lib/valoracion.ts` (nuevo — responsabilidad distinta de `partidoStats.ts`: esta compara a un jugador contra **el resto del equipo** en un ámbito dado, no deriva estadísticas de un único jugador/ámbito)

**Entrada:** lista de jugadores del equipo, eventos del ámbito (un partido, o varios), partidos del ámbito (para derivar minutos vía `minutosJugados`, que ya existe y sigue leyendo del jsonb sin cambios).

**Algoritmo, por jugador:**
1. Se agrupa a los compañeros **comparables** — de campo contra de campo, porteros contra porteros (`esPortero(puesto)`, ya existe) — solo entran los que tienen datos en ese ámbito (algún evento o minutos jugados > 0).
2. **Jugadores de campo**, 4 submétricas, cada una convertida a percentil (0-1) dentro del grupo comparable:
   - Eficacia de tiro (ratio, no se ajusta por minutos) — peso 40%.
   - Robos por 30 min jugados — peso 20%.
   - Pérdidas por 30 min jugados, invertido (menos es mejor) — peso 20%.
   - Exclusiones + tarjetas por 30 min jugados, invertido — peso 20%.
   - Si el jugador no tiene tiros en el ámbito, esa submétrica no participa (no se le penaliza por no lanzar) — se renormalizan los pesos de las submétricas restantes.
3. **Porteros**: 100% en base a `porcentajeParadas` (ratio, no se ajusta por minutos).
4. Percentil ponderado × 10 = nota.
5. **Sin nota** (`null`, se muestra "—") si: el jugador jugó menos de 10 minutos en el ámbito, o hay menos de 2 compañeros comparables con datos en ese ámbito. Mismo principio de honestidad estadística que el resto del dashboard, aplicado a la pieza más "interpretativa" de todas.

**Función pública:** `calcularNotas(jugadores: JugadoresRow[], eventos: EventosRow[], partidos: PartidosRow[]): Map<UUID, number | null>` — se llama una vez por ámbito (todo el partido, o toda la temporada filtrada), calcula para todos los jugadores a la vez (necesita el grupo completo para los percentiles), el llamante lee del mapa por `jugador.id`.

## Ficha técnica de partido

**Files:** `src/components/partido/FichaTecnica.tsx` (reescritura)

- **Cabecera**: resultado, rival, fecha, casa/fuera (ya existe en `PartidoDetailPage.tsx`, esta ficha se monta debajo — sin cambios ahí).
- **Tiro propio**: eficacia global grande arriba (`eficaciaConDetalle` sin filtro de penalti), debajo dos bloques — Juego abierto y 7 metros — cada uno con su cifra + `MapaCalorPorteria` de las zonas de esos tiros.
- **Nuestra portería**: a partir de eventos `equipo_origen='rival'` (ya atribuidos al portero en pista) — % de paradas grande, `MapaCalorPorteria` de por dónde nos han tirado (sirve para ver goles encajados Y paradas a la vez, mismo mapa).
- **Pérdidas / Robos / Exclusiones**: cifras destacadas simples (sin mapa de calor, no aporta nada ahí).
- **Tabla por jugador**: goles, tiros, % eficacia individual, **nota /10** — ordenada de más a menos goles. Cada fila navega a `/equipos/:equipoId/jugador/:jugadorId?partido=:partidoId` (el jugador convocado en ESE partido, preseleccionado — ver más abajo).

## Ficha técnica de jugador

**Files:** `src/pages/JugadorDetailPage.tsx` (reescritura)

- **Selector arriba**: "Toda la temporada" | un partido concreto de los que jugó. Lee un query param `?partido=` al montar (para el enlace desde la ficha de partido) — si viene, arranca con ese partido preseleccionado en vez de "toda la temporada". El resto del dashboard se recalcula según la selección (mismas funciones de `partidoStats.ts`/`valoracion.ts`, ámbito = eventos de ese partido en vez de eventos de toda la temporada).
- **Misma estructura que la ficha de partido**: eficacia global (adaptada al rol — % paradas si es portero y apenas lanza, eficacia de tiro si no), desglose juego abierto/7m con sus mapas de calor, sección de portero si aplica.
- **Nota /10** para el ámbito seleccionado, calculada contra los compañeros de ese mismo ámbito (`calcularNotas` con los eventos/partidos ya filtrados a la selección).
- **Línea de tendencia**: sparkline SVG a mano, eficacia de tiro partido a partido (los partidos donde jugó, en orden cronológico) — solo tiene sentido en "Toda la temporada", se oculta si hay un partido concreto seleccionado (no hay tendencia que mostrar con un solo punto).
- **Asistencia a entrenamientos**: se mantiene tal cual (Non-Goal).

## Verification

Sin test runner (igual que las fases anteriores): `tsc -b --noEmit`, `eslint`, `build`, revisión de `ui-estetica`, y el propio usuario revisando con datos reales tras cada paso del orden de trabajo (no hay generador de datos de ejemplo construido — se prueba contra los partidos/jugadores reales ya en la base).

## Orden de trabajo (con punto de revisión del usuario entre cada uno, ya confirmado)

1. `MapaCalorPorteria` (sin él no se puede construir el resto).
2. Ficha técnica de partido (`eficaciaConDetalle`/`distribucionPorZona`/`porcentajeParadas` en `partidoStats.ts`, `calcularNotas` en `valoracion.ts`, reescritura de `FichaTecnica.tsx`).
3. Ficha técnica de jugador (reescritura de `JugadorDetailPage.tsx`, selector + deep-link + sparkline).
