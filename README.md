# Balonmano — Planificación Deportiva (PWA)

PWA para gestionar la planificación deportiva de un club de balonmano multi-equipo: React + Vite + TypeScript + Tailwind, Supabase (Postgres + Auth + Storage), instalable y con caché offline del app shell.

## Requisitos

- Node.js 20+
- Un proyecto de Supabase (URL + anon key de **Project Settings → API**)

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # rellenar con tus credenciales de Supabase
npm run dev
```

## Base de datos

El esquema vive en `supabase/migrations/` (SQL versionado, con foreign keys reales y RLS). Aplícalo en tu proyecto Supabase, en orden, desde el **SQL Editor** del dashboard o con la CLI:

```bash
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

Incluye:
- `0001_init_schema.sql` — todas las tablas (equipos, periodos, mesociclos, microciclos, sesiones, ejercicios, sistemas defensivos, modelo de juego, jugadores, asistencia, partidos, recursos...)
- `0002_storage.sql` — bucket `adjuntos` (fichas de jugadores, recursos)
- `0003_seed_equipos.sql` — equipos iniciales (Infantil Masculino B, Cadete Femenino)

## Autenticación

Un único usuario, sin roles. Crea el usuario desde **Authentication → Users** en el dashboard de Supabase (email + contraseña) — no hay alta de usuarios desde la app.

## Scripts

```bash
npm run dev      # servidor de desarrollo
npm run build    # build de producción (type-check + vite build)
npm run preview  # sirve el build de producción localmente
npm run lint     # eslint
```
