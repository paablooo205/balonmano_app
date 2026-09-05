# Ficha de partido compartida públicamente — diseño

## Contexto

El entrenador quiere poder compartir con los jugadores (que no tienen
cuenta en la app) la ficha técnica de un partido concreto: rendimiento
del equipo en ese partido + fichas individuales de los convocados,
descargables en PDF. Sin registro, sin login, sin poder navegar por el
resto de la app.

Esto introduce la primera superficie de acceso **sin autenticación** del
proyecto. Hoy, sin excepción, toda tabla exige `auth.role() = 'authenticated'`
más `private.equipo_del_entrenador(equipo_id)` para leer o escribir. El
diseño de esta feature gira enteramente en torno a cómo exponer un
subconjunto de datos de un único partido a un visitante anónimo sin abrir
una vía de acceso a nada más.

Decidido con el usuario:

- El enlace es **por partido concreto**, no un resumen de equipo/temporada.
- Protección: **solo el token de la URL** (largo, no adivinable). Sin
  contraseña, sin caducidad automática.
- El jugador elige su ficha individual mediante un **selector con
  buscador** entre los convocados a ese partido — no una lista completa
  de nombres visible de entrada.

## Enfoque de seguridad — una única función `SECURITY DEFINER`

**Token propio, no el `id` del partido.** Nueva columna
`partidos.token_publico` (`uuid`, nulo por defecto, `unique`). Un partido
no es accesible públicamente hasta que el entrenador pulsa "Compartir" —
generar el token es un acto explícito, no una consecuencia de que alguien
adivine o vea la URL interna del partido (`/equipos/:id/partido/:partidoId`
usa el `id` real, que ya es visible en la app; usarlo también como token
público lo expondría sin que el entrenador lo decidiera).

**Toda la lectura pública pasa por una función nueva,
`obtener_partido_compartido(p_token uuid)`**, `SECURITY DEFINER`, en el
mismo estilo que `crear_equipo` (`0014_crear_equipo.sql`) y
`private.equipo_del_entrenador` (`0008`/`0010`/`0011`): identidad resuelta
dentro de la función, `set search_path = public`, `revoke all ... from
public, authenticated` seguido de un `grant execute` — con una diferencia
deliberada respecto a todo el resto del proyecto: **el `grant` es a
`anon`, no a `authenticated`**. Es la única función de todo el esquema con
acceso `anon`; se documenta como excepción explícita en el propio SQL de
la migración.

**Cero políticas RLS nuevas para `anon`** en `partidos`, `eventos`,
`jugadores` o `asistencia`. Esto es la decisión central de seguridad: una
política RLS que permitiera a `anon` leer filas con
`token_publico is not null` sería insegura, porque RLS no impide que el
cliente pida "todas las filas compartidas" sin filtrar por el token
correcto — solo decide qué filas son visibles, no obliga a que la query
las filtre. La función evita esto de raíz: recibe el token como
parámetro, lo compara con exactitud, y si no coincide no devuelve nada.
Las tablas base quedan exactamente tan cerradas a `anon` como hoy.

**Allowlist explícita de campos, no `to_jsonb(fila)` completo.** La
función construye el JSON de salida campo a campo (no vuelca la fila
entera de `partidos`/`jugadores`), para que un futuro `alter table
partidos add column <algo>` no se cuele automáticamente en la respuesta
pública. Quedan fuera explícitamente: `problemas_detectados`,
`acciones_siguiente_semana`, `notas_adicionales` de `partidos` (son
observaciones internas del entrenador, no pensadas para los jugadores) y
cualquier campo de `jugadores` más allá de `id`/`nombre`/`dorsal`/`puesto`
(nada de `año_nacimiento`, `altura_cm`, `peso_kg`, `notas_adicionales` del
jugador — no hace falta para la ficha técnica ni para el informe
individual de partido, y son datos personales).

```sql
create or replace function obtener_partido_compartido(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partido partidos%rowtype;
  v_resultado jsonb;
begin
  select * into v_partido from partidos where token_publico = p_token;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'partido', jsonb_build_object(
      'id', v_partido.id,
      'equipo_id', v_partido.equipo_id,
      'rival', v_partido.rival,
      'fecha', v_partido.fecha,
      'hora', v_partido.hora,
      'casa_fuera', v_partido.casa_fuera,
      'competicion', v_partido.competicion,
      'duracion_parte_min', v_partido.duracion_parte_min,
      'resultado', v_partido.resultado,
      'sistema_propio', v_partido.sistema_propio,
      'sistema_rival', v_partido.sistema_rival,
      'estadisticas', v_partido.estadisticas
    ),
    'equipo_nombre', (select nombre from equipos where id = v_partido.equipo_id),
    'eventos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'partido_id', e.partido_id,
        'jugador_id', e.jugador_id,
        'equipo_origen', e.equipo_origen,
        'tipo', e.tipo,
        'resultado', e.resultado,
        'zona', e.zona,
        'origen', e.origen,
        'es_penalti', e.es_penalti,
        'color_tarjeta', e.color_tarjeta,
        'minuto', e.minuto,
        'creado_en', e.creado_en
      )), '[]'::jsonb)
      from eventos e
      where e.partido_id = v_partido.id
    ),
    'jugadores', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id,
        'nombre', j.nombre,
        'dorsal', j.dorsal,
        'puesto', j.puesto
      )), '[]'::jsonb)
      from jugadores j
      join asistencia a on a.jugador_id = j.id
      where a.partido_id = v_partido.id and a.presente = true
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

-- Única función de todo el esquema con acceso `anon` — decisión
-- deliberada de esta feature, ver spec 2026-09-05-partido-compartido-publico.
revoke all on function obtener_partido_compartido(uuid) from public, authenticated;
grant execute on function obtener_partido_compartido(uuid) to anon;
```

**Generar y revocar el token no necesitan función nueva.** El entrenador
ya está autenticado y `partidos` ya tiene políticas RLS de `update` para
el dueño del equipo — generar el token es
`supabase.from("partidos").update({ token_publico: crypto.randomUUID() })`
desde el cliente autenticado, igual que cualquier otro campo editable del
partido; revocarlo es el mismo `update` con `token_publico: null`. Sin
RPC adicional.

## Frontend

### `FichaTecnica.tsx` — desacoplarlo de `useEquipo()`

Hoy `FichaTecnica` no hace ninguna consulta a Supabase directamente (todo
el cálculo es client-side puro sobre `partido`/`eventos` ya recibidos vía
props) salvo una llamada a `useEquipo()` para leer `equipo?.nombre` al
generar el PDF. `useEquipo()` depende de `useOutletContext` +
`useParams<{ equipoId }>`, ambos provistos solo por `EquipoLayout` — no
existen en una ruta pública fuera de ese árbol.

Cambio: `FichaTecnica` recibe `nombreEquipo: string` como prop en lugar de
llamar a `useEquipo()` internamente. Sus dos usos actuales
(`PartidoDetailPage.tsx`, `RivalDetailPage.tsx`) pasan `equipo?.nombre ??
"Equipo"` explícitamente — mismo valor por defecto que ya usa hoy
internamente. Este cambio, por sí solo, deja `FichaTecnica` reutilizable
tanto dentro de la app autenticada como en la página pública sin ningún
otro ajuste: `PanelJugadorPartido` (que `FichaTecnica` monta al pinchar un
jugador) tampoco depende de `useEquipo()`.

Nueva prop opcional `soloLectura?: boolean` (default `false`): oculta el
botón "Compartir" cuando es `true` — no tiene sentido que un jugador
vuelva a compartir el partido desde la vista pública. La sección "Notas
del entrenador" no necesita ningún cambio condicional: como esos tres
campos no llegan en absoluto desde `obtener_partido_compartido` (la
función no los incluye), el objeto `partido` que arma la página pública
los trae a `null`, y el `if` existente
(`partido.problemas_detectados || partido.acciones_siguiente_semana ||
partido.notas_adicionales`) ya no se activa — sin tocar esa lógica.

### Botón "Compartir" en `FichaTecnica.tsx`

- `token_publico === null` → botón "Compartir ficha". Al pulsar: genera
  `crypto.randomUUID()`, hace el `update`, actualiza el `partido` en el
  estado del padre (mismo patrón `onActualizado` que ya usa
  `ContadoresEnVivo.tsx`), copia `${location.origin}/compartido/{token}`
  al portapapeles vía `navigator.clipboard.writeText`, confirmación visual
  breve (ej. cambia el texto del botón a "Copiado" 2 segundos).
- `token_publico` presente → muestra el link (truncado) + botón "Copiar
  link" + botón "Dejar de compartir" (confirma con `confirm(...)`, pone
  `token_publico` a `null`).
- Requiere que `PartidoDetailPage.tsx`/`RivalDetailPage.tsx` pasen un
  callback de actualización a `FichaTecnica` (igual patrón que ya existe
  en otros sitios de la app para refrescar `partido` tras un cambio).

### Página pública — `src/pages/SharedPartidoPage.tsx`, ruta `/compartido/:token`

- Al montar: `supabase.rpc("obtener_partido_compartido", { p_token: token
  })`. Token inválido/revocado (respuesta `null`) o partido no
  encontrado → mensaje "Este enlace ya no está disponible." (sin redirigir
  a login ni a ningún otro sitio).
- Encontrado → cabecera mínima sin navegación (sin `SideNav`/`BottomNav`,
  sin `OnboardingChecklist`, sin `SyncStatusBadge` — nada que dependa de
  sesión) + `<FichaTecnica ... soloLectura nombreEquipo={equipoNombre} />`
  con los datos del RPC, más una sección aparte "Fichas individuales":
  input de texto que filtra la lista de convocados por nombre (mismo
  patrón de lista-filtrada-por-input ya usado en `EjercicioPickerModal.tsx`,
  sin componente de librería nueva) — pinchar un jugador abre su
  `PanelJugadorPartido` (reutilizado tal cual, ya no depende de
  `useEquipo()`).
- No usa `EquipoLayout`. No hay ninguna forma de navegar a otra URL de la
  app desde esta página — ni un solo `<Link>`/`navigate()` hacia rutas
  internas.

### Enrutado — sacar `/compartido/:token` de `AuthGate`

Hoy `AuthGate` envuelve el árbol de `<Routes>` completo en `App.tsx`
(nunca renderiza `children` sin sesión — devuelve `LoginPage`/`RegistroPage`
en su lugar). La única forma de servir una ruta sin pasar por ese gate es
sacarla fuera de `<AuthGate>` como rama hermana:

```tsx
<BrowserRouter>
  <PwaUpdateBanner />
  <Routes>
    <Route path="/compartido/:token" element={<SharedPartidoPage />} />
    <Route
      path="*"
      element={
        <AuthGate>
          <Routes>
            {/* todas las rutas actuales, sin cambios */}
          </Routes>
        </AuthGate>
      }
    />
  </Routes>
</BrowserRouter>
```

`PwaUpdateBanner` se mantiene fuera de ambas ramas (ya lo está hoy) — el
banner de actualización de la PWA es independiente de sesión y no tiene
sentido ocultarlo en la vista pública tampoco.

## Estructura de archivos

- `supabase/migrations/0031_partido_compartido.sql` — columna
  `partidos.token_publico` + función `obtener_partido_compartido`.
- `src/types/database.ts` — añade `token_publico: string | null` a
  `PartidosRow`; añade la entrada RPC correspondiente al tipo `Database`
  (mismo patrón que `crear_equipo`).
- `src/pages/SharedPartidoPage.tsx` — nueva página pública.
- `src/components/partido/FichaTecnica.tsx` — prop `nombreEquipo` en vez
  de `useEquipo()`, prop `soloLectura`, botón compartir/revocar.
- `src/pages/PartidoDetailPage.tsx`, `src/pages/RivalDetailPage.tsx` —
  pasan `nombreEquipo={equipo?.nombre ?? "Equipo"}` y el callback de
  actualización a `FichaTecnica`.
- `src/App.tsx` — reestructura las rutas para sacar `/compartido/:token`
  de `AuthGate`.

## Fuera de alcance

- Caducidad automática del link — decidido explícitamente con el usuario
  (solo el token como protección).
- Código de acceso adicional al link.
- Analíticas de quién ha visto el enlace o notificación al entrenador
  cuando se consulta.
- Protección adicional contra scraping/bots del endpoint público (fuera
  del alcance de esta iteración; el token en sí ya es la única defensa
  acordada).
- Compartir un resumen de equipo/temporada completa (se decidió que el
  enlace es por partido).
- Cualquier gráfico "recreado" en la vista pública o sus PDF — mismo
  criterio ya establecido para los informes: tablas y números limpios.
