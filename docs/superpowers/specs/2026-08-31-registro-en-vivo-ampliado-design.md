# Registro en vivo ampliado — Design

**Status:** approved by user in chat, section by section (2026-08-31). Awaiting written-spec review before implementation plan.

## Goal

Sustituir el panel de "Partido en directo" construido en el Punto 2 de esta sesión (grupos apilados sin origen, sin tarjetas, sin atribución de portero/robo) por una pantalla más completa, inspirada en un mockup de Claude Design que trajo el usuario (`Registro en vivo balonmano.dc.html` + README adjunto), pero **adaptada a la marca ya establecida** (tinta + rojo, Barlow Condensed/Archivo autoalojadas) y **recortada** al catálogo de acciones que el usuario quiere de verdad — no el catálogo completo del mockup.

## Non-Goals (fuera de esta fase)

- **Fichas técnicas rediseñadas** (partido y jugador) con gráficos/dashboard — es la Fase 2, spec aparte, después de que esta fase esté implementada y haya datos reales circulando con el modelo ampliado.
- Categorías del mockup que el usuario descartó explícitamente: pasos, dobles regates, blocajes, faltas recibidas/cometidas, asistencias, juego pasivo, falta en ataque, mal pase (como acción propia — sigue existiendo como "Balón perdido" genérico).
- "+1 rival" (contador manual) — redundante con "Gol en contra" (que ya lleva zona real).
- Pestañas de categoría (el mockup las usa porque tiene 20+ acciones en 5 categorías grandes) — con el catálogo recortado, grupos apilados con etiqueta siguen siendo legibles sin esconder nada. El usuario puede pedir pestañas explícitamente si al verlo prefiere ese patrón.

## Alcance del catálogo de acciones (confirmado con el usuario)

Tiro (gol/parado/fuera/poste, con zona+origen+penalti) · Robo de balón (ya existente, "Balón ganado") · Pérdida de balón (ya existente) · Exclusión 2' (ya existente) · **Amonestación/tarjeta (nueva: amarilla/azul/roja)** · Parada/Gol recibido del portero (ya existente, pero **ahora atribuido a un portero propio concreto**, no sin jugador).

## Data Model

**Migración nueva sobre `eventos`** (ejecutada por el agente `db-schema`, mismo patrón que 0017 — verificar el nombre real de los checks existentes en el esquema en vivo antes de alterarlos, no asumir un nombre):

1. Ampliar el enum de `tipo` para admitir `'tarjeta'` (hoy: `tiro`, `perdida`, `exclusion`).
2. `origen text` — nullable, check con 9 valores: `ext_izq`, `lat_izq`, `central`, `lat_der`, `ext_der`, `pivote`, `9m`, `contragolpe`, `7m`. Constraint: `origen is null or tipo = 'tiro'` (mismo patrón que `eventos_zona_solo_tiro`).
3. `color_tarjeta text` — nullable, check con 3 valores: `amarilla`, `azul`, `roja`. Constraint: `color_tarjeta is null or tipo = 'tarjeta'`.
4. Sin backfill: no hay filas históricas de tipo `tarjeta`, y `origen` empieza vacío para todo lo existente (no se puede reconstruir de dónde se tiró a posteriori) — se queda `null` en las filas antiguas, coherente con cómo `zona` ya quedó `null` en el backfill de 0017.

**Cambio de comportamiento (cliente, no esquema):** `jugador_id` deja de forzarse a `null` para dos acciones con `equipo_origen='rival'`:
- Parada / Gol recibido → se guarda el `jugador_id` del portero propio seleccionado (estaba en pista).
- Balón ganado (robo) → se guarda el `jugador_id` del jugador propio que lo hizo.

`Gol en contra` sigue sin jugador (sigue siendo una acción del rival sin más detalle nuestro).

**Tipos TypeScript** (`src/types/database.ts`): `TipoEvento` gana `'tarjeta'`; nuevo `OrigenLanzamiento` (9 valores); nuevo `ColorTarjeta` (`amarilla`|`azul`|`roja`); `EventosRow` gana `origen: OrigenLanzamiento | null` y `color_tarjeta: ColorTarjeta | null`.

## Component Architecture

**Reemplaza por completo** `accionesBlock` de `ContadoresEnVivo.tsx` (Punto 2) y extiende `CuadriculaPorteria.tsx`. Se mantiene: cabecera (marcador/cronómetro/parte), `jugadorBlock` (ahora con selección obligatoria), cronología unificada tabla+jsonb, `deshacer`, todo el mecanismo de escritura offline (`registrarEvento`/`borrarEvento`/`encolarOperacion`) — nada de eso cambia.

**Layout responsive, tablet como objetivo principal:**
- `≥` un breakpoint tipo `md`/`lg`: grid de 3 columnas (`Jugador` ~200px | `Zona de tiro` flexible | `Acción` ~320px) + fila inferior (`Stats` | `Cronología`) — misma estructura que el mockup, con los tokens de marca del proyecto.
- `<` ese breakpoint (móvil vertical): una columna apilada.
- Modo apaisado de una mano (el `compacto` que ya existe, detectado por `useMovilHorizontal`): se mantiene como variante estrecha de dos columnas, reutilizando los mismos sub-componentes (no una tercera implementación paralela).

**Sub-componentes nuevos/tocados:**
- `ColumnaJugador` — lista existente + gating: sin jugador seleccionado, todos los botones de acción están deshabilitados excepto "Gol en contra". Seleccionar un portero (`puesto` coincide con la codificación de portero — verificar el valor real en `jugadores.puesto` durante la implementación, no asumir) salta el grupo de acción activo a "Portero". Seleccionar cualquier jugador preselecciona `origen` según su puesto (mapeo definido abajo); si el puesto no mapea a ningún origen conocido, no se preselecciona nada (el entrenador lo elige a mano, sin bloquear el flujo).
- `CuadriculaPorteria` (ya existe) + nueva fila de chips de **origen** debajo (9 opciones, editable con un toque, valor persistente hasta cambiarlo). Toggle "Mapa de calor" nuevo, reutiliza el `color-mix`/intensidad que ya calcula el componente para la cuenta por zona.
- `PanelAccion` — grupos apilados con etiqueta: **Tiro** (Gol/Parado/Fuera/Poste, ya existente) · **Portero** (Parada/Gol recibido, ahora exige portero seleccionado) · **Pérdida / Robo** (Balón perdido/Balón ganado) · **Sanción** (Exclusión 2' + 3 tarjetas). Interruptor "Penalti (7m)" se mantiene igual que en el Punto 2 (aplica al siguiente tiro, se apaga solo). Se añade botón "Anular" explícito (limpia acción/zona pendiente) y una barra de estado de una línea ("Selecciona un jugador" → "Elige la acción" → "Toca la zona de la portería"), calcada del mockup en comportamiento, con los tokens de marca.
- `PanelStats` (nuevo) — tarjetas Tiros/Goles/Eficacia/Pérdidas/Robos/Exclusiones/Tarjetas, filtradas por el jugador seleccionado o totales de equipo sin selección. Usa funciones ya existentes en `partidoStats.ts` (`golesFavor`, `eficaciaLanzamiento`, etc.) más las nuevas para robos/tarjetas.
- `CronologiaPanel` — el que ya existe, sin cambios de fondo (solo nuevas etiquetas para tarjeta/portero-atribuido).
- Atajos de teclado `Z` (deshacer) y `Espacio` (pausa/inicia) — listeners a nivel de la pantalla, no estorban en táctil.

## Mapeo puesto → origen (preselección)

| `puesto` (heurística) | `origen` |
|---|---|
| Lateral izquierdo | `lat_izq` |
| Central | `central` |
| Lateral derecho | `lat_der` |
| Extremo izquierdo | `ext_izq` |
| Extremo derecho | `ext_der` |
| Pivote | `pivote` |
| Portero / otro / no reconocido | sin preselección |

**Riesgo a verificar en implementación:** `jugadores.puesto` es texto libre en el esquema actual (no un enum), poblado originalmente desde una carga de Excel — hay que mirar los valores reales en la base antes de escribir el mapeo, no asumir que coinciden con las siglas del mockup (`LI`/`CE`/`LD`/`EI`/`ED`/`PIV`/`POR`). Si no coinciden, la función de mapeo debe reconocer variantes razonables (mayúsculas/minúsculas, con/sin puntos) y, si no reconoce nada, no preseleccionar — nunca debe bloquear el registro.

## Interaction Flow (sin cambios de fondo respecto al Punto 2, ampliado)

1. Seleccionar jugador (obligatorio salvo para "Gol en contra"). Si es portero, el grupo activo salta a "Portero". El origen se preselecciona según su puesto.
2. Camino A: tocar una acción de tiro/portero (arma la cuadrícula) → tocar zona → confirma. Camino B (nuevo, del mockup): tocar primero una zona → queda armada → tocar la acción de tiro/portero correspondiente confirma. "Anular" limpia lo pendiente sin registrar.
3. Acciones sin zona (Fuera, Poste, Pérdida, Robo, Exclusión, Tarjeta) se registran al instante.
4. El interruptor "Penalti (7m)" se aplica al siguiente tiro que se registre (de cualquier grupo) y se apaga solo después.
5. "Deshacer" (botón o tecla `Z`) quita el evento más reciente, sea cual sea su origen/tipo — sin cambios respecto al Punto 2.

## Testing / Verification

Sin test runner en el repo (igual que las fases anteriores): `npx tsc -b --noEmit`, `npm run lint`, `npm run build`, revisión del agente `ui-estetica` sobre el resultado, y checklist manual del usuario en el navegador (no hay credenciales de login disponibles para verificarlo yo mismo). El checklist debe cubrir explícitamente: flujo bidireccional acción↔zona, atribución de portero/robo a jugador, preselección de origen por puesto (y su fallback cuando no reconoce el puesto), tarjetas, y que el layout tablet y el layout móvil compacto sigan ambos operativos.

## Qué sustituye exactamente

Todo el trabajo del "Punto 2" de esta sesión (commits `1b18722`, `2c56e6a`) queda sustituido por esta fase: `CuadriculaPorteria.tsx` se extiende (no se reescribe desde cero, ya es una pieza pura reutilizable), `ContadoresEnVivo.tsx` se reestructura (nuevo layout responsive + nuevos grupos), `partidoStats.ts` gana los tipos/funciones nuevos y pierde ninguno de los ya existentes (todo lo de Punto 1 y Punto 2 se mantiene, se añade encima).
