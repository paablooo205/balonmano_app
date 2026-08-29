# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pablo, entrenador de balonmano en el club Balonmano Corazonistas, gestiona varios
equipos a la vez (hoy: Infantil Masculino B y Cadete Femenino; el sistema debe poder
sumar más equipos sin cambios de arquitectura). Es el único usuario de la app hoy.
Usa la app desde el móvil, de pie, con prisa, dentro del pabellón durante
entrenamientos y partidos — y desde el ordenador, con calma, para planificar en casa.

## Product Purpose

Herramienta de planificación deportiva integral para un club de balonmano
multi-equipo: planificación anual (periodos/mesociclos/microciclos, sembrada del
Excel real de temporada del club), biblioteca de ejercicios, modelo de juego con
diagramas tácticos interactivos, calendario con horario recurrente, gestión de
plantilla y asistencia, partidos con contadores en vivo y ficha técnica, recursos,
y avisos (partido próximo, cambio de mesociclo, recordatorio semanal de planificar).

## Positioning

No es un SaaS genérico para clubes de balonmano: está construido alrededor del
documento de planificación anual real de este club concreto (el Excel de
Corazonistas) y de sus sistemas defensivos reales (5:1, 6:0), con el flujo de
trabajo exacto de un entrenador que reparte su tiempo entre el pabellón (con mala
cobertura) y la planificación tranquila en casa.

## Operating Context

- Pabellón, de pie, con prisa: pasar lista de un entrenamiento, tocar estadísticas
  de un partido en vivo (goles, pérdidas, 7 metros...) con cobertura intermitente.
- Casa/despacho, con calma: planificar la semana, dar de alta jugadores/as,
  ejercicios, revisar el modelo de juego.
- Contenido real ya cargado: plan de temporada completo (`PLANIFICACION ANUAL
  OBJETIVOS.xlsx`, 6 hojas) sembrado por equipo en Supabase; fichas de los sistemas
  defensivos 5:1 y 6:0.

## Capabilities and Constraints

- Multi-equipo desde el origen: toda tabla salvo `equipos` lleva `equipo_id` FK.
- Hoy, un único usuario de Supabase Auth (sin roles ni permisos por entrenador) y
  RLS abierto a cualquier `authenticated`. **Indeciso / a vigilar**: el usuario ha
  dicho que este proyecto podría llegar a compartirse con otros entrenadores del
  mismo club en el futuro — eso exigiría rediseñar auth/RLS a nivel de
  entrenador/equipo más adelante. No construir nada de eso de forma especulativa
  ahora; solo tenerlo presente al tomar decisiones que serían caras de deshacer.
  Para software de un cliente real, "podría compartirse algún día" no es un
  hipotético abstracto — es la razón concreta para no hardcodear supuestos de
  usuario único donde sea barato evitarlo.
- Offline-first en los dos momentos que más importan: sesión de entrenamiento del
  día y partido del día (cola de escrituras en IndexedDB, un único escritor, sin
  resolución de conflictos).
- Notificaciones locales (Notifications API del navegador), sin servidor de push;
  soporte real en iOS limitado y así debe comunicarse siempre en la UI.
- PWA instalable, mismo look para todos los equipos (sin colores diferenciados).

## Brand Commitments

Nombre y escudo del club: "Balonmano Corazonistas" (logo en `public/balonmano.webp`).
Paleta: negro/gris muy oscuro + rojo como único acento. El usuario confirmó
explícitamente que no hay más elementos de marca que preservar (ni lema, ni
colores de equipación, ni redes sociales) — rojo/negro + este logo son la
identidad completa a día de hoy.

## Evidence on Hand

- `PLANIFICACION ANUAL OBJETIVOS.xlsx` (raíz del repo) — plan de temporada real,
  ya leído y sembrado por equipo.
- `public/balonmano.webp` — escudo real del club.
- Sin más activos reales (fotos de jugadoras/es, patrocinadores) por ahora — no
  inventar ninguno.

## Product Principles

- Construido para el flujo de trabajo real de un entrenador concreto (checklist de
  asistencia, toques en vivo de partido, ritual de planificar en domingo), no para
  ser un software de club genérico.
- Offline-first exactamente donde más duele: la asistencia de un entrenamiento y
  las estadísticas de un partido en vivo nunca deben perderse por falta de
  cobertura en el pabellón.
- Todo dato de negocio (jugador/a, ejercicio, sesión, partido, entrada de modelo de
  juego) tiene un campo de notas adicionales de texto libre y es editable/borrable
  después de creado — con la única excepción deliberada de `equipos`,
  `periodos`, `mesociclos` y `microciclos` (se gestionan re-sembrando desde el
  Excel o en Supabase directamente).
- Misma identidad visual para todos los equipos del club — cambiar de equipo no
  debe sentirse como cambiar de app.
- Arquitectura de usuario único hoy, pero con la posibilidad real (no solo
  teórica) de pasar a varios entrenadores del mismo club más adelante.

## Accessibility & Inclusion

Sin requisito de accesibilidad personal declarado más allá de las buenas
prácticas ya aplicadas (alto contraste, botones grandes, mobile-first).
