# Insights automáticos en las fichas técnicas

Fecha: 2026-09-02

## Motivación

Las tres fichas técnicas (partido, jugador de temporada, rival) ya calculan
todos los desgloses necesarios (por zona, por resultado, por juego
abierto/7m) pero exigen que el usuario los lea e interprete a mano. El
objetivo es generar automáticamente frases en español que señalen los
patrones más accionables — para reajustar estrategia de tiro propio o de
colocación del portero — sin inventar datos ni sacar conclusiones de
muestras ridículas.

Ejemplos objetivo:
- "Por abajo metemos el 71% (10/14), muy por encima del 35% del resto de zonas."
- "No hemos tirado nada por abajo en todo el partido."
- "Este rival para el 78% (7/9) de lo que le tiramos por arriba."
- "En la 2ª parte solo hemos parado el 20% (2/10), frente al 60% (9/15) de la 1ª."

## Alcance

Dentro:
- Un motor de insights puro (sin React) reutilizado en las tres fichas.
- Tres categorías: patrón de zona, ejecución (fuera/poste en exceso) y
  tendencia (1ª/2ª parte en partido; últimos N partidos vs resto en jugador
  de temporada y rival).
- Un componente de presentación (`InsightsCard`) reutilizado en las tres
  páginas, mostrado arriba del todo de cada ficha.

Fuera:
- Insights por origen de lanzamiento (extremo/lateral/pivote/9m/contragolpe) —
  descartado explícitamente por el usuario en esta iteración.
- Cualquier persistencia en base de datos: todo se deriva en el cliente a
  partir de `eventos`, igual que el resto de estadísticas derivadas
  (`partidoStats.ts`, `valoracion.ts`). No hay migración nueva.
- Configuración de umbrales por el usuario: son constantes fijas en código,
  igual que `MIN_TIROS_RECIBIDOS` en `valoracion.ts`.

## Modelo de datos

```ts
// src/lib/insights.ts
export type CategoriaInsight = "zona" | "ejecucion" | "tendencia";

export type Insight = {
  texto: string;
  score: number; // magnitud de la desviación, ponderada por muestra — solo para ordenar, no se muestra
  categoria: CategoriaInsight;
};
```

Todas las funciones del motor son puras: reciben listas de `EventosRow` (u
otros arrays ya filtrados por el llamante, igual contrato que
`distribucionPorZona`/`desgloseResultados`) y devuelven `Insight[]`. No
acceden a Supabase ni a contexto de React.

### Agrupación de zonas

Reutiliza la numeración 1-9 ya establecida en `CuadriculaPorteria`/
`MapaCalorPorteria` (fila = arriba/medio/abajo, columna = izq/centro/der):

```ts
const FILAS: Record<"arriba" | "medio" | "abajo", number[]> = {
  arriba: [1, 2, 3],
  medio: [4, 5, 6],
  abajo: [7, 8, 9],
};
const COLUMNAS: Record<"izquierda" | "centro" | "derecha", number[]> = {
  izquierda: [1, 4, 7],
  centro: [2, 5, 8],
  derecha: [3, 6, 9],
};
```

## Categorías y reglas

### a) Patrón de zona

Función: `insightsZona(tiros: EventosRow[], opts: { etiquetaAcierto: "goles" | "paradas"; sujeto: string }): Insight[]`

- `tiros` ya viene filtrado por el llamante a un contexto homogéneo (propio
  o rival, juego abierto o 7m — nunca mezclados, mismo contrato que
  `eficaciaConDetalle`/`porcentajeParadas`).
- "Acierto" = `gol` si son tiros propios, `parado` si son tiros rivales
  (misma distinción que ya hace `MapaCalorPorteria` vía `aciertosPorZona`).
- Para cada uno de los 6 grupos (3 filas + 3 columnas):
  1. Si el grupo tiene `< 5` tiros, se descarta (no se genera insight de %
     ni de comparación para ese grupo).
  2. Si tiene `>= 5`, calcula `pctGrupo` = aciertos/intentos del grupo, y
     `pctResto` = aciertos/intentos del resto de zonas (solo si el resto
     también tiene `>= 5`; si no, se descarta la comparación).
  3. `deviacion = pctGrupo - pctResto` (en puntos porcentuales). Si
     `|deviacion| >= 20`, genera un insight con
     `score = |deviacion| * Math.log2(intentosGrupo)` (pondera magnitud por
     tamaño de muestra) y texto:
     - Propio: `"Por {grupo} {etiquetaAcierto === 'goles' ? 'metemos' : 'paramos'} el {pctGrupo}% ({aciertos}/{intentos}), {deviacion > 0 ? 'muy por encima' : 'muy por debajo'} del {pctResto}% del resto de zonas."`
- Insight de ausencia: si el total general de `tiros` es `>= 10` y algún
  grupo tiene `0` intentos, genera
  `"No hemos {etiquetaAcierto === 'goles' ? 'tirado' : 'recibido tiros'} nada por {grupo} en todo el {contexto}."`
  con `score` fijo moderado (p.ej. `15`, por debajo del score típico de una
  desviación fuerte con muestra decente, para que no eclipse insights con
  datos reales si compiten por el top 3-4).
- Fila y columna se evalúan por separado con las mismas reglas — no se
  combinan en "esquinas" (9 zonas individuales quedan fuera del insight
  automático; el detalle celda a celda ya lo cubre `MapaCalorPorteria`).

Se llama cuatro veces por ficha (propio/rival × juego abierto/7m), igual
que ya se calculan por separado `zonasJuego`/`zonasPenalti`/
`zonasRivalJuego`/`zonasRivalPenalti` — de ahí los cuatro campos
`zonaPropioJuego`/`zonaPropioPenalti`/`zonaRivalJuego`/`zonaRivalPenalti`
en `generarInsights`.

### b) Ejecución (fuera/poste en exceso)

Función: `insightsEjecucion(tirosJuegoAbierto: EventosRow[]): Insight[]`

- Solo tiros propios en juego abierto (nunca 7m — un fallo a puerta vacía
  en 7m no es comparable).
- Si `intentos < 8`, no genera nada.
- `pctFalloNoForzado = (fuera + poste) / intentos * 100`.
- Si `pctFalloNoForzado >= 25`, genera:
  `"{fuera + poste} de cada {intentos} tiros se van fuera o al poste — más fallo propio que del portero rival."`
  con `score = pctFalloNoForzado * Math.log2(intentos)`.

### c) Tendencia

Función genérica: `insightsTendencia(periodoA: EventosRow[], periodoB: EventosRow[], etiquetas: { a: string; b: string }, opts: { etiquetaAcierto: "goles" | "paradas" }): Insight[]`

- `periodoA`/`periodoB` ya vienen filtrados y homogéneos (mismo contexto
  propio/rival, juego abierto/7m) por el llamante.
- Si `intentos(periodoA) < 5` o `intentos(periodoB) < 5`, no genera nada.
- `deviacion = pct(periodoB) - pct(periodoA)`. Si `|deviacion| >= 20`,
  genera:
  `"En {etiquetas.b} solo {verbo} el {pctB}% ({aciertosB}/{intentosB}), frente al {pctA}% ({aciertosA}/{intentosA}) de {etiquetas.a}."`
  (o "más" en vez de "solo" si `deviacion > 0`), con
  `score = |deviacion| * Math.log2(Math.min(intentosA, intentosB))`.

Uso por ficha:
- **Partido**: `periodoA` = eventos con `minuto <= 30` (o sin cronómetro
  fiable → se omite, ver "Casos límite"), `periodoB` = eventos con
  `minuto > 30`. Etiquetas "la 1ª parte"/"la 2ª parte".
- **Jugador (temporada)** y **rival**: `periodoB` = eventos de los últimos
  3 partidos jugados (por fecha), `periodoA` = el resto. Etiquetas "los
  últimos 3 partidos"/"el resto de la temporada" (jugador) o "el resto de
  enfrentamientos" (rival). Si hay menos de 4 partidos en total, no hay
  "resto" que compare de forma justa → no se genera.

Se aplica tanto a tiro propio como a nuestra portería (dos llamadas, igual
patrón que el resto del motor).

### Combinación y ranking

```ts
export function generarInsights(entradas: {
  zonaPropioJuego: EventosRow[]; zonaPropioPenalti: EventosRow[];
  zonaRivalJuego: EventosRow[]; zonaRivalPenalti: EventosRow[];
  ejecucionPropioJuego: EventosRow[];
  tendencia?: { propio: [EventosRow[], EventosRow[]]; rival: [EventosRow[], EventosRow[]]; etiquetas: { a: string; b: string } };
}): Insight[]
```

Recopila todas las categorías aplicables, concatena, ordena desc por
`score` y devuelve los primeros 4 (`slice(0, 4)`). Sin cuota fija por
categoría — si los 4 insights más llamativos son todos de zona, se
muestran los 4 de zona.

`generarInsights` es el único punto de entrada que usan las páginas; las
funciones `insightsZona`/`insightsEjecucion`/`insightsTendencia` se
exportan igualmente para testearlas por separado.

## Componente `InsightsCard`

`src/components/dashboard/InsightsCard.tsx` (junto a `MapaCalorPorteria`,
mismo directorio por convención de "componentes de dashboard de solo
lectura").

- Props: `{ insights: Insight[] }`.
- Si `insights.length === 0`, no renderiza nada (`return null`) — mismo
  patrón que el bloque condicional de "Problemas detectados" en
  `FichaTecnica.tsx`.
- `card-surface` claro (no la variante oscura de "Partido en directo"):
  eyebrow rojo "PATRONES DETECTADOS" + lista de frases, cada una con un
  punto de acento a la izquierda (mismo rojo, sin codificar categoría por
  color — la categoría no es información para el usuario, solo para el
  ranking interno).

## Ubicación en cada ficha

En las tres páginas, `<InsightsCard />` se monta **arriba del todo** del
contenido de la ficha (antes del marcador/anillos de eficacia) — lo
primero que se ve al entrar:

- `FichaTecnica.tsx`: antes de `<LineaMarcador />`.
- `JugadorDetailPage.tsx`: antes del bloque de cabecera de estadística de
  temporada.
- `RivalDetailPage.tsx`: antes de las tarjetas de historial
  (Partidos/Victorias/Empates/Derrotas), en la vista "Todos los partidos"
  (no tiene sentido en la vista de un partido concreto contra ese rival,
  que ya reutiliza `FichaTecnica.tsx` y por tanto ya lleva su propio
  `InsightsCard`).

Cada página arma los arrays de entrada con los mismos eventos que ya usa
para sus propios cálculos (`tirosJuego`, `tirosRivalJuego`, etc. —
ninguno nuevo) y llama a `generarInsights(...)`.

## Casos límite

- **Jugador de campo (no portero)**: no se generan insights de "nuestra
  portería" para ese jugador — solo de tiro propio. Mismo criterio que ya
  separa `esPortero` en el resto de `JugadorDetailPage.tsx`.
- **Portero**: no se generan insights de "tiro propio" — solo de paradas.
- **Partido en curso / sin cronómetro fiable** (p.ej. partido antiguo
  migrado sin `minuto` registrado en sus eventos): el insight de tendencia
  1ª/2ª parte no se genera si no hay suficientes eventos con `minuto` no
  nulo en cada mitad (mismo umbral de `>= 5`).
- **Rival con un solo partido jugado**: no hay insight de tendencia (no
  hay "resto" con el que comparar), pero sí de zona/ejecución si el
  volumen lo permite.
- **Ficha de rival, vista de un partido concreto**: no lleva `InsightsCard`
  propio — ya se renderiza `FichaTecnica.tsx`, que trae el suyo.

## Testing

`src/lib/insights.test.ts` (Vitest, mismo patrón que el resto de
`src/lib/*.ts`): casos por función (`insightsZona`, `insightsEjecucion`,
`insightsTendencia`, `generarInsights`) cubriendo umbral no alcanzado,
insight de ausencia, ranking con categorías mixtas, y el recorte a 4.

## Fuera de esta iteración (posible trabajo futuro, no se construye ahora)

- Insights por origen de lanzamiento.
- Umbrales configurables por el usuario.
- Insights que combinen jugador + zona (p.ej. "el 3 tira siempre arriba a
  la izquierda") — el jugador ya tiene su propia ficha con su propio
  desglose de zona; añadir esto sería duplicar alcance sin que el usuario
  lo haya pedido.
