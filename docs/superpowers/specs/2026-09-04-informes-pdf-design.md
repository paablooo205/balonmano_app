# Informes PDF (ficha de partido, jugador-en-partido, jugador-temporada) — diseño

## Contexto

El club quiere poder compartir estadísticas fuera de la app, como PDF
descargable que el entrenador pueda mandar por WhatsApp/email. No hay
librería de generación de PDF instalada; todos los cálculos necesarios ya
existen como funciones puras y reutilizables en `src/lib/partidoStats.ts` y
`src/lib/insights.ts` — este plan solo maqueta esos datos en documentos
formales, no inventa estadísticas nuevas.

Tres documentos, decididos con el usuario:

1. **Ficha técnica del partido** (equipo) — botón arriba de la ficha
   técnica del partido (`FichaTecnica.tsx`).
2. **Informe individual del jugador en el partido** — botón dentro de la
   tarjeta que se abre al pinchar un jugador en la ficha del partido
   (`PanelJugadorPartido.tsx`).
3. **Ficha de jugador — temporada completa** — botón en la ficha del
   jugador (`JugadorDetailPage.tsx`, sección Equipo).

Solo descarga — nada de envío por email ni compartir integrado en la app;
"compartir" lo hace el entrenador a mano con el archivo ya descargado.

## Librería y enfoque técnico

**`@react-pdf/renderer` (^4.9.0)** — soporta React 19 como peer dependency
(verificado), genera PDF vectorial real desde componentes React
(`<Document>`, `<Page>`, `<View>`, `<Text>`), funciona enteramente en el
cliente (sin servidor, sin `html2canvas` ni capturas de pantalla) — encaja
con que la app sea una PWA offline-first sin backend propio más allá de
Supabase.

**Fuentes: tipografía base del PDF (Helvetica), no las de la app.** La app
usa Barlow Condensed/Archivo autoalojadas para su UI, pero `@react-pdf/renderer`
necesita archivos de fuente en formato compatible con su motor
(`fontkit`, típicamente `.ttf`), registrados aparte de la UI web — replicar
exactamente la tipografía de marca añadiría una fuente de fragilidad real
(formato de archivo, tamaño de bundle, carga offline) para un documento que
nadie pidió que llevara la tipografía exacta de la app. Se usa la familia
tipográfica base **Helvetica** (siempre disponible en el motor de PDF, cero
peso añadido, cero riesgo de fuente rota) — negrita para títulos/cabeceras,
regular para el cuerpo. Sigue siendo un documento "formal y profesional"
por maquetación (jerarquía, espaciado, tablas limpias), no por tipografía
de marca.

**Colores**: los mismos hex de la paleta del proyecto
(`--color-ink:#111114`, `--color-accent:#e11225`), como valores literales
en el `StyleSheet` de `@react-pdf/renderer` — ese motor no lee variables
CSS, así que se copian los valores a mano una vez en `src/lib/pdf/pdfTheme.ts`.

**Descarga**: `pdf(<Documento .../>).toBlob()` (async) → `URL.createObjectURL` →
click en un `<a download>` temporal → revocar la URL. Sin backend, sin
`window.open` (evita bloqueos de pop-up).

## Estructura de archivos

- `src/lib/pdf/pdfTheme.ts` — constantes compartidas: colores (hex), tamaños
  de fuente, espaciados. Un único sitio para que los 3 documentos se vean
  consistentes.
- `src/lib/pdf/PdfComponents.tsx` — piezas de maquetación reutilizables por
  los 3 documentos:
  - `PdfCabecera` — franja superior tinta: nombre del club/equipo, título
    del documento, fecha de generación.
  - `PdfSeccion` — título de sección en mayúsculas + contenedor.
  - `PdfTablaEficacia` — fila(s) "Juego abierto"/"7 metros" con
    intentos/aciertos/%, a partir de un `EficaciaDetalle`.
  - `PdfTablaZonas` — tabla 3×3 (zonas 1-9) intentos/aciertos por zona, a
    partir de un `Record<number, number>` de intentos y uno de aciertos.
  - `PdfListaInsights` — lista de viñetas a partir de `Insight[]`.
- `src/lib/pdf/descargarPdf.ts` — `descargarPdf(nombreArchivo: string, documento: ReactElement<DocumentProps>): Promise<void>`.
- `src/lib/pdf/FichaPartidoPdf.tsx` — documento 1.
- `src/lib/pdf/InformeJugadorPartidoPdf.tsx` — documento 2.
- `src/lib/pdf/FichaJugadorTemporadaPdf.tsx` — documento 3.

Cada documento es un componente `<Document>` que recibe los datos ya
calculados (mismos parámetros que ya calculan `FichaTecnica.tsx`,
`DesgloseJugadorPartido.tsx` y `JugadorDetailPage.tsx` hoy) — el
componente de la página web sigue siendo el único que decide *qué*
calcular; el documento PDF solo lo maqueta.

## Documento 1 — Ficha técnica del partido

Datos: los mismos que ya calcula `FichaTecnica.tsx` (recibe `partido`,
`jugadores`, `eventos`).

Contenido, en orden:
1. Cabecera: equipo vs rival, fecha, competición, casa/fuera, resultado
   final (`marcadorPartido`).
2. Insights automáticos (lista de viñetas, `Insight.texto`).
3. Eficacia de tiro propio: tabla juego abierto/7m (intentos/aciertos/%).
4. Tiro propio por zona: tabla 3×3, juego abierto y 7m por separado.
5. Nuestra portería: misma forma que 3-4 pero sobre tiros del rival
   (`porcentajeParadas`, zonas rivales).
6. Pérdidas y robos: dos cifras.
7. Exclusiones: propias vs rival (mismo criterio que `MarcadorExclusiones.tsx`
   — contar por `equipo_origen`, no hace falta el SVG de línea de tiempo,
   solo las dos cifras finales en una tabla).
8. Notas del entrenador: `problemas_detectados`, `acciones_siguiente_semana`,
   `notas_adicionales` (solo los que tengan contenido), como párrafos.

Botón: `<Button>` "Descargar PDF" en `FichaTecnica.tsx`, arriba del todo
(antes de `InsightsCard`) — visible en los dos sitios donde se usa
`FichaTecnica` (`PartidoDetailPage.tsx` y `RivalDetailPage.tsx`), lo cual
es correcto: es el mismo documento para el mismo partido, sin importar
desde qué pantalla se llegó a verlo.

## Documento 2 — Informe individual del jugador en el partido

Datos: los mismos que ya recibe `DesgloseJugadorPartido.tsx`
(`jugador`, `eventos` ya acotados a ese partido), más el `partido` (para
la cabecera con rival/fecha/resultado) — `PanelJugadorPartido.tsx` ya
tiene `jugador`/`eventos` en su ámbito; necesita recibir también `partido`
como prop nueva (hoy no lo tiene) para poder mostrarlo en la cabecera del
PDF y nombrar el archivo con el rival/fecha.

Dos cálculos que hoy no se hacen a este nivel (jugador + un partido) pero
usan funciones ya existentes, solo con un filtro distinto:
- **Minutos jugados**: `minutosJugados(eventosJsonb: EventoPartido[], jugadorId: string, duracionTotalMin = 60): number`
  (`partidoStats.ts:328`) — se le pasa `partido.estadisticas.eventos`
  (el jsonb de entra/sale pista del cronómetro, no la tabla `eventos`) y
  `jugador.id`; `duracionTotalMin` se deja en su valor por defecto (60)
  salvo que el partido registre una duración total distinta ya en algún
  otro sitio de la app — si no existe ese dato en `PartidosRow`, usar el
  valor por defecto sin más.
- **Exclusiones del jugador en este partido**: `exclusiones(propios)` donde
  `propios = eventos.filter(e => e.jugador_id === jugador.id)` — mismo
  filtro que ya hace `DesgloseJugadorPartido.tsx:16`.

Contenido, en orden:
1. Cabecera: dorsal + nombre del jugador, vs rival, fecha, resultado.
2. Minutos jugados.
3. Si es portero (`esPortero(jugador.puesto)`): paradas juego abierto/7m
   (tabla + zonas). Si no: goles juego abierto/7m (tabla + zonas). Mismo
   criterio exacto que `DesgloseJugadorPartido.tsx`.
4. Pérdidas y robos (de ese jugador, ese partido).
5. Exclusiones (de ese jugador, ese partido).

Botón: dentro de `PanelJugadorPartido.tsx`, junto al botón de cerrar (X) en
la cabecera del panel, o como una fila propia debajo — botón pequeño tipo
icono+texto ("Descargar PDF"), no un `<Button>` grande, dado el tamaño del
panel.

## Documento 3 — Ficha de jugador, temporada completa

Datos: los mismos que ya calcula `JugadorDetailPage.tsx` para la vista de
temporada (no la vista de un partido concreto del desplegable de ámbito).

Contenido, en orden:
1. Cabecera: nombre del jugador, dorsal, puesto, equipo, temporada.
2. Datos generales: edad (de `año_nacimiento`), altura, peso (si existen).
3. Asistencia a entrenamientos: % de asistencia, presentes/total,
   llegadas tarde (solo si `llegadasTarde > 0`, mismo criterio que ya usa
   la página).
4. Estadísticas de partido (temporada): partidos jugados, goles (o
   paradas si es portero), exclusiones totales.
5. Eficacia por zona (temporada): misma tabla 3×3 que el documento 2 pero
   con los eventos de toda la temporada.
6. Evolución de eficacia partido a partido: tabla (fecha del partido → %),
   a partir de `tendenciaEficacia` — en vez de la línea `LineaEvolucionEficacia`
   de la pantalla, una tabla simple (coherente con "tablas y números
   limpios").
7. Insights automáticos de temporada (viñetas).
8. Notas adicionales del jugador (`jugador.notas_adicionales`, si tiene
   contenido).

Botón: `<Button>` "Descargar PDF" en `JugadorDetailPage.tsx`, en la
cabecera (`hero-band`), junto al lápiz de "Editar" — visible siempre que
haya datos de temporada que mostrar (mismo criterio que ya usa la página
para decidir si hay "registros de asistencia": si no hay nada, igualmente
se puede generar un PDF con las secciones vacías omitidas, no hace falta
bloquear el botón).

## Fuera de alcance

- Envío por email o integración de "compartir" del sistema operativo —
  solo descarga del archivo.
- Réplica visual de los donuts/mapas de calor de la app dentro del PDF —
  decidido explícitamente por el usuario (tablas y números).
- Un cuarto documento a nivel de equipo con el resumen de todos los
  jugadores en un único PDF — no se ha pedido, cada documento es de un
  partido o de un jugador.
