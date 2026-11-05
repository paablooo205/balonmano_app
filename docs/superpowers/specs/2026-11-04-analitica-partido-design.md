# Analítica de partido — motor de métricas y ficha técnica con storytelling

Fecha: 2026-11-04 · Estado: diseño aprobado en conversación, pendiente de revisión escrita.

## 1. Objetivo y alcance

Hoy la ficha técnica describe (cuántos tiros, dónde) pero no explica por qué se gana o se pierde. Este proyecto añade:

1. **Motor de métricas** (`src/lib/analitica/`): posesiones y eficiencia, goles esperados, +/− y formaciones, situaciones numéricas, rachas/tiempos muertos, referencias de temporada y calidad de datos.
2. **Captura mínima nueva** en el registro en vivo: tiro rival fuera, exclusión rival, tiempo muerto, robo sin jugador.
3. **Ficha técnica del partido rediseñada** con storytelling (web y enlace compartido).
4. **PDF del partido** con la misma estructura (fase 3).

**Uso principal**: análisis post-partido. **Lector**: cuerpo técnico (contenido técnico, sin simplificar). El enlace compartido muestra la **misma ficha completa**.

**Fuera de alcance** (subproyectos posteriores, reutilizan este motor y estos gráficos): ficha de jugador/portero, vista de temporada, vista de rival.

## 2. Principios no negociables

- **Honestidad estadística**: toda cifra lleva su muestra (n tiros, n posesiones, n partidos). Lo que no se puede calcular se muestra como "No disponible en este partido" con el motivo — nunca un 0 o un número inventado.
- **Sin escribir datos existentes**: nada de esto modifica filas ya registradas. Las migraciones solo añaden.
- **Funciones puras y testeadas**: el motor no toca React ni Supabase; recibe eventos y devuelve números. Cada función tiene tests con partidos de ejemplo calculados a mano.
- **Offline**: todo se calcula en cliente sobre los eventos ya cargados (`cargarEventosEquipo`, paginado).
- **Estética del proyecto** (CLAUDE.md): tarjetas claras, tinta + rojo acento, Barlow Condensed para cifras. En los gráficos, **el partido en rojo acento y la referencia en gris**; etiquetas directas sobre los datos, sin leyendas sueltas; sin donuts.

## 3. Datos de entrada y calidad

Fuentes por partido:
- Tabla `eventos`: tiros (propio/rival, resultado, zona, origen, es_penalti, minuto, **segundo**), pérdidas/robos, exclusiones, tarjetas y, con este proyecto, tiempos muertos.
- `partidos.estadisticas.eventos` (jsonb): 7m provocado/cometido, entra/sale pista (con `segundo`, `grupo`, `cubre_exclusion`).
- `partidos.duracion_parte_min`.

`calidadDatos(partido, eventos)` devuelve flags:
- `tieneSegundo`: ≥ 90 % de los eventos del partido tienen `segundo`.
- `tienePista`: hay registro de entradas/salidas (titulares confirmados).
- `tieneTirosRivalFuera`: hay al menos un tiro rival con resultado `fuera` o `poste` **o** la fecha del partido es ≥ `FECHA_CAPTURA_AMPLIADA` (constante en `constantes.ts`, fijada al día en que se despliegue la fase 1).
- `minutoFiable`: falso si todos los eventos con minuto caen en ≤ duración de la 1ª parte, o si > 30 % de los eventos de la 2ª parte comparten el mismo minuto (síntoma de reloj parado).
- `tieneExclusionesRival`, `tieneTiemposMuertos`: igual criterio que `tieneTirosRivalFuera`.

Cada métrica declara qué flags necesita; si falta alguno, devuelve `{ disponible: false, motivo }`.

Lectura común: se reutiliza `normalizarEventos` (7m por origen). Los tiros de un jugador con puesto portero hechos con resultado propio "parado" **no** se reinterpretan (no se tocan datos; queda documentado como sesgo conocido de partidos antiguos).

## 4. Métricas

### 4.1 Posesiones y eficiencia (`posesiones.ts`)
- `posesionesPropias = tirosPropios (incl. 7m) + perdidasPropias`.
- `posesionesRival = tirosRival (gol + parado + fuera + poste) + robosPropios` (robo = pérdida del rival, con o sin jugador).
- `eficienciaAtaque = golesFavor / posesionesPropias`; `eficienciaDefensa = golesContra / posesionesRival`; `diferencial = eficienciaAtaque − eficienciaDefensa`.
- `ritmo = (posesionesPropias + posesionesRival) / 2 / minutosJugados × 60`, con minutosJugados = 2 × duración de parte.
- `pctPerdidas = perdidasPropias / posesionesPropias`.
- Requiere `tieneTirosRivalFuera` para todo lo que use posesiones del rival; sin él, solo métricas propias.
- Sesgos documentados en UI: rechace tras parada cuenta como posesión extra; pérdidas rivales sin robo no registradas salvo "robo sin jugador".

### 4.2 Goles esperados (`xg.ts`)
Estimador común: Beta-Binomial. Para una categoría c con a aciertos en n intentos y referencia p₀, `p̂ = (a + k·p₀) / (n + k)`, k = 20.

- **xG pre-tiro (aproximado)**: categoría = tipo de lanzamiento derivado de `origen` (que viene del puesto del jugador) + penalti: `7m`, `extremo`, `pivote`, `exterior` (laterales/central/9m), `contragolpe`, `desconocido`. Referencias p₀: 7m 0,75 · extremo 0,50 · pivote 0,65 · exterior 0,40 · contragolpe 0,80 · desconocido 0,50. Histórico = todos los tiros propios del equipo **excluyendo el partido analizado** (evita sesgo de entrenamiento sobre el propio dato). Salida por tiro, por jugador y total: `xG`, `goles − xG`. Etiqueta en UI: "aproximado (según puesto)".
- **PSxG post-tiro por zona**: solo tiros a puerta (gol o parado) con zona 1-9. p₀ por zona = tasa de gol global de tiros a puerta del equipo (se calcula; si n < 30, 0,65). `PSxG(zona)` estimado con todos los tiros a puerta **del rival** de la temporada excluyendo el partido analizado.
  - **Goles evitados del portero** = Σ PSxG de los tiros a puerta que recibió − goles encajados. Texto en UI: "comparado con el portero medio de vuestro equipo".
  - **Colocación del tirador** = media de PSxG de sus tiros a puerta, con tasas por zona estimadas sobre los tiros **propios** a puerta de la temporada (excluido el partido). Se muestra como "dificultad para el portero de sus tiros a puerta" (más alto = mejor colocados), nunca como goles.
- Los 7m se tratan aparte en ambos: categoría propia en pre-tiro; el PSxG y los goles evitados usan **solo juego abierto**, y los 7m del rival se muestran aparte por portero como "7m parados / 7m recibidos".
- Solo cuentan como tiros a puerta del rival los de resultado gol o parado: los "fuera" nuevos no entran en % de paradas ni en goles evitados (en todo el código del portero se filtra a tiros a puerta).

### 4.3 Pista: +/−, con/sin, formaciones (`pista.ts`)
Requiere `tienePista` y `tieneSegundo`.
- Intervalos en pista por jugador a partir de entra/sale (mismo emparejamiento que `tiempoDePista`; entradas futuras de sustitutos de exclusión se respetan).
- `+/−` = goles a favor − goles en contra con el jugador en pista; `por30 = +/− × 1800 / segundosEnPista`.
- **Con/sin**: diferencial por posesión con el jugador en pista vs fuera (posesiones atribuidas por el `segundo` del evento que la cierra). Solo si ambos lados tienen ≥ 10 posesiones.
- **Formaciones**: conjunto de 7 (o menos en inferioridad) en pista; por formación, segundos, goles a favor/en contra, diferencial. Se muestran las de ≥ 300 s.

### 4.4 Situaciones numéricas (`numericas.ts`)
Requiere `tieneSegundo`. Intervalos de exclusión: `[segundo, segundo + 120)` (también tarjeta roja = 2' de inferioridad). Estado por instante = nº excluidos propios − nº excluidos rival → igualdad / inferioridad / superioridad. Por estado: segundos, goles a favor/en contra, posesiones, eficiencia. **Coste por exclusión** = (diferencial por minuto en igualdad − en inferioridad) × 2. Superioridad requiere `tieneExclusionesRival`.

### 4.5 Rachas, sequías y tiempos muertos (`rachas.ts`)
Requiere `tieneSegundo` (sin segundo exacto: No disponible; el modo degradado por minuto queda para una fase posterior).
- **Parcial**: secuencia de ≥ 3 goles consecutivos del mismo equipo; se guarda inicio/fin y contexto (eventos de exclusión, tiempo muerto, cambio o descanso en `[inicio − 60 s, fin]`).
- **Sequía**: ≥ 300 s sin gol de un equipo.
- **Tiempo muerto**: diferencial de goles en `[t − 300, t)` vs `(t, t + 300]`, por tiempo muerto; en temporada, media por equipo que lo pide.

### 4.6 Referencias (`referencias.ts`)
Para cada métrica, media de temporada del equipo sobre los partidos que tienen los flags necesarios, **excluyendo el partido analizado**, con su n. Si n < 3, se mezcla con la referencia fija: `ref = (n·mediaPropia + 3·valorFijo) / (n + 3)`. Valores fijos: eficiencia ataque 0,55 · eficiencia defensa 0,55 · % pérdidas 0,15 · % paradas 0,33 · ritmo 55. Todo valor fijo vive en un único archivo de constantes, documentado.

### 4.7 Titular y factores del partido (`factores.ts`)
Descomposición del diferencial de goles del partido frente al diferencial de referencia, en goles equivalentes:
- **Acierto de tiro** = (goles − xG) − media de temporada de (goles − xG).
- **Pérdidas** = (pctPerdidasRef − pctPerdidas) × posesionesPropias × eficienciaAtaqueRef.
- **Portería** = goles evitados − media de temporada.
- **Situaciones numéricas** = (goles netos en inferioridad/superioridad − lo esperado por sus segundos a la eficiencia de igualdad) − media de temporada de ese mismo valor.
- **7 metros** = (goles 7m − xG 7m) − media de temporada de ese mismo valor.
- **Residuo** = diferencial real − (referencia + Σ factores), mostrado como "otros" (la descomposición no es exacta y se dice).
El **titular** se genera con el factor de mayor |valor| y el resultado: plantillas cerradas en español (sin texto libre generado), p. ej. "Ganamos 29-24 desde la portería: +3,1 goles evitados".

## 5. Captura nueva en el registro en vivo

1. **Tiro rival "Fuera"** (grupo Portero, junto a Parada y Gol en contra): `tipo=tiro, equipo_origen=rival, resultado=fuera`, sin zona, atribuido al portero seleccionado.
2. **"2' rival"** (grupo Sanción), sin jugador seleccionado: `tipo=exclusion, equipo_origen=rival, jugador_id=null`. Cuenta atrás bajo los goles del rival en el marcador. Corregir `exclusiones()` y demás contadores para contar solo `equipo_origen=propio` donde corresponda.
3. **Tiempo muerto** (dos botones junto al reloj, "TM" nuestro y "TM rival"): nuevo `tipo='tiempo_muerto'` en `eventos` (migración 0036 que **solo** amplía el check de `tipo`; `equipo_origen` indica quién). Al pulsarlo: pausa el reloj, cuenta atrás de 1:00 a pantalla completa (cerrable), restantes por equipo (3 por partido, máx. 2 por parte). Deshacer lo quita como cualquier acción.
4. **Robo sin jugador**: el botón Robo funciona sin jugador seleccionado (`jugador_id=null`).

Tipos TS y migración en el mismo commit (regla de CLAUDE.md).

## 6. Ficha técnica del partido

Orden, con títulos de sección que son la conclusión (plantillas):
1. **Titular** (4.7).
2. **Qué decidió el partido**: gráfico de cascada — referencia → factores → resultado real.
3. **Franja de KPIs**: eficiencia ataque, eficiencia defensa, diferencial, ritmo, % pérdidas, goles evitados. Valor, referencia, delta y n.
4. **Flujo del partido**: línea de diferencia de marcador por segundo; bandas sombreadas de inferioridad/superioridad; marcas de tiempos muertos; parciales anotados.
5. **Ataque**: gráfico de puntos acierto por tipo de lanzamiento (partido vs temporada); barras divergentes goles − xG por jugador.
6. **Defensa y portería**: goles evitados por portero; mapa de portería divergente (goles reales − PSxG por zona).
7. **Jugadores**: tabla ordenable (min, +/−, con/sin, goles/tiros, goles − xG, pérdidas, robos, sanciones).
8. **Formaciones**: top por minutos con diferencial.

Gráficos en SVG propio, en `src/components/analitica/graficos/` (cascada, flujo, puntos, barras divergentes, portería divergente, tabla ordenable), reutilizables. Accesibilidad: `role="img"` + `aria-label` con el resumen; textos ≥ 11 px; contraste AA.

## 7. Arquitectura

```
src/lib/analitica/
  calidad.ts  posesiones.ts  xg.ts  pista.ts  numericas.ts
  rachas.ts  referencias.ts  factores.ts  constantes.ts  index.ts
  *.test.ts (uno por archivo)
src/components/analitica/graficos/*.tsx
src/components/partido/FichaTecnica.tsx   (reescrita sobre lo anterior)
src/lib/pdf/FichaPartidoPdf.tsx            (fase 3)
```
`index.ts` expone `analizarPartido(partido, eventosPartido, contextoTemporada) → AnalisisPartido`, un único objeto tipado que consume la ficha (web y PDF). El contexto de temporada son los partidos y eventos del equipo, ya cargados.

## 8. Pruebas y verificación

- Tests unitarios por métrica con partidos de ejemplo calculados a mano (incluye casos límite: sin datos, un solo tiro, exclusión que cruza el descanso, sustituto de exclusión, formaciones en inferioridad).
- Tests de invariantes: Σ goles por estado numérico = marcador; Σ +/− de los 7 en pista coherente con el marcador por intervalos; factores + residuo = diferencial real.
- Contraste con datos reales: para al menos un partido real, posesiones y goles por estado calculados también en SQL y comparados.
- Revisión visual con capturas en tablet y móvil; revisión de estética (agente ui-estetica).

## 9. Fases

1. Motor de métricas + captura nueva (+ migración 0036).
2. Ficha técnica web (incluye enlace compartido).
3. PDF del partido.
Cada fase se revisa (matemáticas y visual) antes de la siguiente.
