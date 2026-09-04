# CLAUDE.md — Reglas del proyecto

PWA de planificación deportiva para un club de balonmano multi-equipo (un único usuario, uso desde móvil y ordenador con sincronización real).

## Stack
- **Frontend**: React + Vite + TypeScript, `vite-plugin-pwa` (manifest + service worker, caché del app shell, `NetworkFirst` para Supabase).
- **Estilos**: Tailwind CSS v4 (`@theme` en `src/index.css`), sin librería de componentes — utilidades propias en `src/components/ui`.
- **Backend/datos**: Supabase (Postgres + Auth + Storage). Un único usuario, login por email/contraseña. RLS activo en todas las tablas (`auth.role() = 'authenticated'`).
- **Rutas**: `react-router-dom`, con layout de equipo en `/equipos/:equipoId/*`.
- **Offline**: sesión de entrenamiento y partido del día cacheados en IndexedDB; escrituras encoladas localmente hasta recuperar conexión. Sin resolución de conflictos (único escritor).
- **Diagramas tácticos**: SVG a medida, sin librería de diagramas.

## Base de datos
- Esquema fuente de verdad: `supabase/migrations/*.sql`. Cualquier cambio de esquema va como migración nueva, nunca editando una ya aplicada.
- Tipos TypeScript alineados a mano en `src/types/database.ts` (sin generador conectado); si el esquema cambia, actualizar ambos en el mismo commit.
- **Toda tabla salvo `equipos` lleva `equipo_id` FK** — el sistema es multi-equipo desde el origen, nunca asumir un único equipo ni hardcodear IDs.
- Todo dato de negocio (jugador, ejercicio, sesión, partido, entrada de modelo de juego...) tiene `notas_adicionales` de texto libre.
- Todo dato es editable y borrable después de creado, no solo alta — **excepción deliberada**: `equipos`, `periodos`, `mesociclos` y `microciclos` no tienen CRUD en la app (decisión explícita del usuario). Se gestionan re-ejecutando `scripts/seed-*.ts` desde el Excel real o editando directamente en el SQL Editor de Supabase — son datos que se fijan una vez por temporada, no de uso frecuente. No construir pantallas de edición para estas tablas salvo que el usuario lo pida explícitamente.

## Estética — no negociable
Diseño importado del proyecto de Claude Design del usuario ("App gestión equipo balonmano", `Balonmano Club.dc.html`) — sustituye a cualquier dirección visual anterior.

- **Claro, no oscuro**: fondo de página crema (`--color-bg:#f2f0ee`), tarjetas sólidas blancas (`.card-surface`, `--color-card:#ffffff`, sombra suave, `border-radius:0.875rem`). Sin fondo jaspeado, sin blobs animados — eso pertenece a una dirección visual anterior, ya retirada.
- **Escudo de fondo (marca de agua)**: decisión deliberada, reintroducida tras haber sido retirada antes — no confundir con la dirección visual anterior. El escudo del club (`/balonmano.webp`) aparece como silueta ensombrecida de fondo vía el componente `EscudoFondo` (`src/components/layout/EscudoFondo.tsx`): `grayscale` + opacidad baja (6-10%), `fixed`, `pointer-events-none`, posición/tamaño/rotación distintos por pantalla (no un blob animado — sin animación en bucle, solo posicionamiento estático). Presente en Login (esquina inferior derecha), selección de equipo (esquina inferior izquierda, tamaño grande) y, en `EquipoLayout` detrás de todas las páginas de un equipo (esquina inferior derecha — nunca izquierda, para no quedar tapado por el `SideNav` en escritorio —, tamaño muy grande y recortado por el viewport — efecto de que entra en la pantalla, no un escudo completo; offset/tamaño distintos en móvil vs `md:` para que no quede demasiado escondido en pantallas pequeñas). Al añadir una pantalla nueva de nivel superior, replicar el patrón en vez de omitirlo.
- **Cabeceras tipo "hero band"**: cada sección lleva una cabecera de tinta oscura (`--color-ink:#111114`, componente `PageHeader`) con eyebrow rojo en mayúsculas + título condensado grande; Partido usa la variante roja (`variant="accent"`) en vez de tinta.
- **Paleta**: negro-tinta (`--color-ink`) + rojo como acento de marca (`--color-accent:#e11225`) + blanco/crema. Excepción sancionada y deliberada: los estados de asistencia (presente=verde, justificado=ámbar, injustificado=rojo, lesión=neutro) sí usan colores semánticos — viene directamente del diseño de Claude Design, no lo trates como precedente para añadir más colores en otros sitios. Fuera de eso, un único acento, mismo estilo visual para todos los equipos.
- **Tipografía**: titulares y cifras destacadas en Barlow Condensed (`var(--font-display)`, mayúsculas, muy condensada); cuerpo/UI en Archivo (`var(--font-sans)`). Ambas autoalojadas vía `@fontsource` (nunca CDN de Google Fonts — la PWA debe seguir funcionando offline).
- **Forma**: radios moderados (tarjetas ~14px, botones ~15px vía `rounded-[15px]` en `Button`) — nada de `rounded-full` en botones/CTAs. Los chips/badges pequeños sí pueden ser pill.
- **Patrón de tarjeta de evento**: barra de acento de 5px a la izquierda (rojo=partido, tinta=entrenamiento) en las tarjetas de sesión/partido del Dashboard y Calendario — es diseño explícito del mockup, mantenerlo tal cual.
- Mobile-first: botones grandes, alto contraste, poco texto obligatorio.
- Todo en español.

## Estructura de carpetas
- `/src/components/ui` → componentes de UI reutilizables (estilo shadcn, sin la librería)
- `/src/components/layout` → navegación y shell de equipo (`PageHeader` = cabecera "hero band", `SideNav`/`BottomNav`)
- `/src/pages` → pantallas/rutas
- `/src/lib` → cliente Supabase, utilidades, configuración de navegación
- `/src/types` → tipos alineados con el esquema Postgres
- `/supabase/migrations` → esquema versionado

## Notificaciones
Solo tres casos (nada por cada entrenamiento individual): partido próximo, cambio de mesociclo, recordatorio semanal (domingos) de planificar entrenamientos. Vía Notifications/Push API del navegador — soporte en iOS es limitado, avisar explícitamente antes de dar por hecha cualquier función de push en iOS.

## Desarrollo por fases
Este proyecto se construye fase a fase (ver conversación con el usuario para el detalle de cada una). No adelantar trabajo de una fase futura salvo que el usuario lo pida explícitamente.
