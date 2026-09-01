# Ficha técnica de partido — rediseño con gráficos — spec de diseño

**Contexto:** `FichaTecnica.tsx` (partido) ya existe como dashboard de estadísticas derivadas (fase anterior). Esta fase la rediseña con gráficos variados en vez de cifras/tablas planas. Se mantiene `MapaCalorPorteria` tal cual; todo lo demás del cuerpo del componente se sustituye.

## Diagnóstico del bug de alineación (para corregir primero)

Encontrado en `BloqueTiro` (dentro de `FichaTecnica.tsx` actual): la rama "con datos" usa `text-sm` para la línea de detalle, pero la rama "sin datos" usa `text-xs` — distinto tamaño de fuente → distinta altura de línea → cuando un lado tiene tiros y el otro no (caso normal: p.ej. hubo tiros en juego abierto pero ningún 7m), el `MapaCalorPorteria` de cada lado arranca a una altura Y distinta dentro de la misma fila `grid-cols-2`. Fix: usar `text-sm` en ambas ramas. Una vez igualadas, `MapaCalorPorteria` ya se dimensiona igual solo por su propio `aspect-ratio` — no hace falta tocar nada más para el tamaño.

## Sin librería de gráficos — decisión técnica

El proyecto no tiene ninguna instalada (`package.json` revisado). Se decide **no añadir ninguna** en vez de Recharts/Chart.js/visx:
- Los cuatro tipos de gráfico nuevos (anillo, barras apiladas, línea con doble eje compartido, marcador temporal) se resuelven con fórmulas simples y bien conocidas (arco SVG por trigonometría, interpolación lineal para escalas de tiempo/valor) — nada que justifique 60-100kB de dependencia.
- Encaja con el precedente ya establecido en este mismo proyecto: `CuadriculaPorteria`, `MapaCalorPorteria` y `TendenciaEficacia` son SVG/CSS a medida, cero librerías.
- El riesgo señalado por el usuario (escala temporal) se mitiga con una función compartida y cuidadosamente acotada (`crearEscalaTiempo`, ver abajo) en vez de dejar que cada gráfico reimplemente su propio cálculo de fechas.
- "La más ligera que encaje" — la opción más ligera posible es no añadir nada, y aquí encaja.

## Funciones de datos nuevas (`src/lib/partidoStats.ts`, `src/lib/escalaTiempo.ts`)

- `desgloseResultados(eventos): {gol, parado, fuera, poste}` — cuenta por resultado; el llamante ya filtra (tipo=tiro, equipo_origen, es_penalti) antes de pasar, mismo contrato que `distribucionPorZona`.
- `serieMarcador(eventos): {ts, favor, contra}[]` — goles en orden cronológico con marcador acumulado en cada uno. Sin resultado, es una lista vacía.
- `crearEscalaTiempo(timestamps, ancho)`: función pura, sin estado — dado un array de timestamps ISO y un ancho en px, devuelve `(ts) => x`. Con 0 timestamps o con todos iguales (rango cero), devuelve siempre `0` — nunca división por cero.

**Decisión de alcance temporal:** tanto la línea de marcador como el marcador de exclusiones calculan su propio eje X a partir *solo* de los eventos que ellos mismos dibujan (goles para uno, exclusiones para el otro) — no de la duración completa del partido. Es más simple, evita una fuente de fallos adicional, y es coherente con `TendenciaEficacia` (que también escala solo sobre sus propios puntos). Cada gráfico es su propia ventana temporal local, no pretende compartir eje con los demás gráficos de la pantalla — la spec del usuario solo pide eje compartido *dentro* del gráfico de marcador (entre su línea de resultado y su línea de diferencia), no entre gráficos distintos.

## Colores — reutilizando la paleta ya sancionada en esta zona oscura

`ContadoresEnVivo.tsx`/`partidoStats.ts` ya usan, dentro de "Partido en directo" (excepción oscura ya sancionada), una paleta más amplia que ink+accent: `var(--color-success)` (verde, gol), `#3d8ad6` (azul, parado), `var(--color-warning)` (ámbar, pérdida propia / exclusión propia), `var(--color-accent)` (rojo, fuera/rival). Esta fase reutiliza exactamente esos mismos tokens para lo que ya representan — no se inventa ningún color nuevo, salvo un matiz de `--color-accent` (vía `color-mix`, misma técnica que ya usa `MapaCalorPorteria`) para diferenciar "poste" de "fuera" en el anillo de 4 segmentos (hoy `colorTiro()` los pinta igual, y aquí sí hace falta distinguirlos visualmente).

| Concepto | Color |
|---|---|
| Gol | `var(--color-success)` |
| Parado | `#3d8ad6` |
| Fuera | `var(--color-accent)` |
| Poste | `color-mix(in oklab, var(--color-accent) 55%, white)` |
| Robos (forzados al rival) | `var(--color-success)` |
| Pérdidas propias | `var(--color-warning)` |
| Exclusión propia | `var(--color-warning)` |
| Exclusión rival | `var(--color-accent)` |
| Nosotros (línea de marcador) | `var(--color-accent)` |
| Rival (línea de marcador) | `white` al 40% opacidad |

## Decisiones de alcance

- **Exclusiones rivales:** el esquema y el marcador de exclusiones soportan ambos colores, pero el registro en vivo actual (`ContadoresEnVivo.registrarExclusion`) solo permite registrar exclusiones **propias** — no existe manera de registrar una del rival hoy. El marcador mostrará correctamente ambas si algún día se registran, pero en la práctica el color "rival" no aparecerá todavía. Fuera de alcance de esta fase (tocaría el registro en vivo, no la ficha técnica).
- **Tarjetas:** la cifra "Tarjetas" (hoy en la rejilla de 4 cifras simples) no aparece en la lista de gráficos nuevos del usuario. Se elimina de esta pantalla sin sustituto — `tarjetas()` se queda en `partidoStats.ts` (usado en otros sitios), solo deja de mostrarse aquí. Si se echa en falta, es barato añadir una cifra suelta en cualquier punto.
- **Nota /10 y tabla de jugador:** la tabla actual "Por jugador" (con columna Nota) se sustituye por las barras apiladas, que no llevan nota (no encaja en una barra). El panel local que se abre al tocar un jugador (mini-desglose de ese partido) tampoco muestra la nota — el usuario pidió específicamente "eficacia, zonas de tiro", no la nota. Fácil de añadir después si se quiere.
- **Poste en las barras apiladas:** el usuario especifica "gol / fuera / parado" para las barras (3, no 4) — poste queda fuera de las barras (si un jugador solo tiene postes, su barra se ve vacía salvo por su borde). Es una omisión deliberada del usuario, respetada tal cual.
- **Bloque de notas/problemas/acciones:** no mencionado en la lista de gráficos ni en el orden de disposición — se mantiene al final, sin cambios, porque quitarlo sería una regresión no pedida.
- **`BloqueTiro` se extrae a un archivo compartido** (`src/components/partido/BloqueTiro.tsx`, junto con `CifraProtagonista` — ambos privados hoy dentro de `FichaTecnica.tsx`): el panel local de jugador necesita exactamente el mismo bloque (título + %/recuento + mapa de calor) en el mismo tema oscuro — a diferencia de la duplicación claro/oscuro de la fase de jugador (justificada porque eran temas distintos), aquí es el mismo tema exacto, así que compartir el componente es lo correcto en vez de duplicar.
- **Panel de jugador es un overlay propio, no el `Modal` de `src/components/ui/modal.tsx`:** ese `Modal` usa `card-surface` (tema claro) — reutilizarlo tal cual metería una tarjeta blanca dentro de la pantalla oscura de partido. Se construye un overlay propio, mismo patrón visual (`bg-black/70` + tarjeta que ocupa el fondo, cierra al tocar fuera) pero en oscuro, coherente con el resto de esta pantalla.

## Orden de disposición final (dentro de `FichaTecnica.tsx`)

1. Línea de marcador (resultado real + diferencia)
2. Anillo de eficacia (juego abierto + 7m, lado a lado)
3. Mapas de calor alineados (tiro propio / nuestra portería)
4. Barras apiladas por jugador (abre panel local al tocar)
5. Anillo de pérdidas/robos
6. Marcador de exclusiones
7. Bloque de notas/problemas/acciones (sin cambios, se mantiene al final)

Aire entre secciones: `gap-4` ya establecido en el contenedor raíz, se mantiene — ninguna sección lleva menos margen del que ya usan las secciones actuales.
