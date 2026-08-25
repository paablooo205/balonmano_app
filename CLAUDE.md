@AGENTS.md
# CLAUDE.md — Reglas del proyecto

## Stack
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (preset Vega)
- Server Components por defecto. Usa 'use client' solo cuando haya interactividad real.

## SEO y semántica (no negociable)
- HTML semántico: <header>, <nav>, <main>, <article>, <section>, <footer>. Nada de div soup.
- Un único <h1> por página, jerarquía lógica de h2/h3 después.
- Metadatos (title, description, canonical, Open Graph) definidos por página, nunca genéricos.
- Datos estructurados JSON-LD (schema.org) cuando aplique (negocio local, producto, etc.).
- Imágenes con next/image y alt descriptivo siempre.
- URLs limpias tipo slug, nunca query strings.

## Rendimiento
- Lazy loading para todo lo que no esté en el viewport inicial.
- Nada de librerías pesadas si hay alternativa nativa o más ligera.

## Estructura de carpetas
- /components → componentes de UI reutilizables
- /modules → módulos de negocio (crm, bookings, payments) parametrizados por tenant
- /app → rutas

## Multi-tenant
- Cualquier tabla o query nueva debe considerar tenant_id y respetar RLS. Nunca asumas un único cliente.