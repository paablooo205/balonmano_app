# Sistema de multas

Fecha: 2026-09-13

## Motivación

El entrenador quiere poder aplicar multas económicas a jugadores que llegan
tarde o faltan sin avisar a un entrenamiento o partido, con un importe
configurable, y ver la deuda acumulada de cada jugador en su ficha. Debe
poder activarse/desactivarse y configurarse por equipo (el sistema es
multi-equipo desde el origen), y no debe afectar en nada a quien lo deje
desactivado.

## Hallazgos previos al diseño (contexto necesario)

- **Los dos eventos que originan una multa ya están modelados** en la tabla
  `asistencia` (`supabase/migrations/0001_init_schema.sql`, `0006`, `0020`,
  `0022`): `llego_tarde boolean` (solo válido si `presente=true`) y
  `motivo_ausencia = 'injustificado'` (solo válido si `presente=false`). Se
  marcan hoy desde `AsistenciaChecklist.tsx`, componente único compartido
  entre entrenamiento (`SesionDetailPage`) y partido (`DayAgenda.tsx`). No
  hace falta ningún flujo nuevo de captura — el sistema de multas se
  engancha sobre estas dos columnas ya existentes.
- **No existe ningún precedente de "feature activable por equipo" en la
  BD.** Cada tabla nueva vive en su propio espacio (`horario_recurrente`,
  `periodos`, `observaciones`...); no hay tabla de configuración genérica
  ni columna JSON de ajustes en `equipos`. Este sistema introduce el primer
  ejemplo de ese patrón (tabla `multas_config` dedicada, una fila por
  equipo).
- **`AjustesPage.tsx`** monta sus secciones como componentes
  autocontenidos (`src/components/ajustes/*Ajustes.tsx`) que resuelven
  `equipoId` internamente vía `useEquipo()`, sin recibirlo por props (ver
  `NotificacionesAjustes.tsx`). El componente nuevo sigue el mismo patrón.
- **`JugadorDetailPage.tsx`** ya tiene una sección "Asistencia a
  entrenamientos" (línea ~298) con el patrón visual exacto a replicar para
  "Multas": título uppercase `text-[11px] font-semibold uppercase
  tracking-[0.14em] text-[var(--color-text-faint)]` + `card-surface p-4`
  debajo.
- **Convención de migraciones reciente** (`0019_rivales.sql`,
  `0026_observaciones.sql`, más simples que las de `0001`): tablas nuevas
  llevan `equipo_id` + `created_at`, sin `updated_at` ni trigger salvo que
  haga falta trackear modificación — no hace falta aquí. RLS con
  `private.equipo_del_entrenador(equipo_id)` (la función vive en el schema
  `private`, no `auth.role() = 'authenticated'` como dice todavía, de forma
  desactualizada, `CLAUDE.md`).

## Alcance

Dentro:
- 3 tablas nuevas: `multas_config` (interruptor por equipo), `multas_tipos`
  (catálogo editable de infracciones con importe), `multas` (histórico real
  por jugador).
- Enganche automático en `AsistenciaChecklist.tsx`: marcar "llegó tarde" o
  motivo "injustificado" crea/actualiza/borra la multa correspondiente,
  solo si el sistema está activo para ese equipo.
- Nueva sección en Ajustes (`MultasAjustes.tsx`): interruptor + catálogo de
  tipos (nombre, importe, editable/borrable, "+ Añadir tipo").
- Nueva sección "Multas" en `JugadorDetailPage.tsx` (componente
  `MultasSection.tsx`, autocontenido): deuda pendiente, botón "Marcar como
  saldado", historial, botón "+ Multa" manual. Solo visible si el sistema
  está activo.
- Tipos en `src/types/database.ts` + entradas en `Database.public.Tables`.

Fuera:
- Sin indicador de deuda en el listado de plantilla (`JugadoresSection`) —
  el usuario pidió explícitamente que aparezca en la ficha individual, no
  en el listado.
- Sin exportar/PDF de multas.
- Sin notificación push — no encaja en los 3 casos ya cerrados en
  `CLAUDE.md` (partido próximo, cambio de mesociclo, recordatorio semanal).
- Sin historial de pagos parciales ni de "quién saldó cuándo" más allá de
  `pagada_at` — "saldar" es una acción simple que marca todo lo pendiente
  como pagado de una vez, sin trazabilidad adicional.
- Sin UI para reasignar el `disparador` de un tipo ya existente — si el
  entrenador quiere cambiar qué tipo dispara "tardanza"/"falta sin avisar",
  borra el tipo actual y crea uno nuevo con ese disparador (ver más abajo).

## Modelo de datos

Migración `0034_sistema_multas.sql`:

```sql
-- Sistema de multas por tardanza/falta injustificada a entrenamiento o
-- partido, activable y configurable por equipo desde Ajustes (ver
-- docs/superpowers/specs/2026-09-13-sistema-multas-design.md). Los tipos
-- con `disparador` no nulo se enganchan automáticamente a los campos ya
-- existentes en `asistencia` (`llego_tarde` / `motivo_ausencia =
-- 'injustificado'`); el resto son de aplicación manual desde la ficha del
-- jugador.

create table multas_config (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null unique references equipos (id) on delete cascade,
  activo boolean not null default false,
  created_at timestamptz not null default now()
);

create table multas_tipos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  nombre text not null,
  importe numeric(10, 2) not null check (importe >= 0),
  disparador text check (disparador in ('tardanza', 'falta_injustificada')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_multas_tipos_equipo on multas_tipos (equipo_id);
-- Como mucho un tipo activo con cada disparador por equipo — evita
-- ambigüedad en el enganche automático (ver AsistenciaChecklist más abajo).
create unique index idx_multas_tipos_disparador_unico on multas_tipos (equipo_id, disparador)
  where disparador is not null;

create table multas (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos (id) on delete cascade,
  jugador_id uuid not null references jugadores (id) on delete cascade,
  tipo_id uuid references multas_tipos (id) on delete set null,
  -- Copia de multas_tipos.nombre/importe en el momento de crear la multa:
  -- si luego se edita el importe del tipo, las multas ya puestas no cambian.
  concepto text not null,
  importe numeric(10, 2) not null check (importe >= 0),
  origen text not null check (origen in ('automatica', 'manual')),
  asistencia_id uuid references asistencia (id) on delete cascade,
  constraint multas_origen_asistencia_check check (
    (origen = 'automatica' and asistencia_id is not null) or
    (origen = 'manual' and asistencia_id is null)
  ),
  pagada boolean not null default false,
  pagada_at timestamptz,
  constraint multas_pagada_at_check check (
    (pagada and pagada_at is not null) or (not pagada and pagada_at is null)
  ),
  fecha date not null default current_date,
  notas_adicionales text,
  created_at timestamptz not null default now()
);
create index idx_multas_equipo on multas (equipo_id);
create index idx_multas_jugador on multas (jugador_id);
-- Un registro de asistencia genera como mucho una multa automática.
create unique index idx_multas_asistencia_unica on multas (asistencia_id)
  where asistencia_id is not null;

alter table multas_config enable row level security;
alter table multas_tipos enable row level security;
alter table multas enable row level security;

create policy "equipo_del_entrenador" on multas_config for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
create policy "equipo_del_entrenador" on multas_tipos for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
create policy "equipo_del_entrenador" on multas for all
  using (private.equipo_del_entrenador(equipo_id))
  with check (private.equipo_del_entrenador(equipo_id));
```

**"Deuda pendiente" de un jugador** = `sum(importe) where jugador_id = X and
pagada = false`. "Saldar" no borra nada ni resetea un contador aparte: es un
`update` masivo de todas las multas pendientes de ese jugador a
`pagada = true, pagada_at = now()`. El histórico completo (pagadas y
pendientes) se sigue viendo en la ficha, tachado lo ya saldado.

## Enganche automático (`AsistenciaChecklist.tsx`)

El componente carga, además de lo que ya carga hoy, la config y el catálogo
del equipo:

```ts
const [multasActivo, setMultasActivo] = useState(false);
const [tiposMulta, setTiposMulta] = useState<MultasTiposRow[]>([]);

useEffect(() => {
  (async () => {
    const [cfg, tipos] = await Promise.all([
      supabase.from("multas_config").select("*").eq("equipo_id", equipoId).maybeSingle(),
      supabase.from("multas_tipos").select("*").eq("equipo_id", equipoId).eq("activo", true),
    ]);
    setMultasActivo(cfg.data?.activo ?? false);
    setTiposMulta(tipos.data ?? []);
  })();
}, [equipoId]);

function tipoPorDisparador(disparador: "tardanza" | "falta_injustificada") {
  return tiposMulta.find((t) => t.disparador === disparador) ?? null;
}
```

Y una función que sincroniza la multa de una fila de asistencia concreta con
el disparador que le corresponde ahora mismo (o ninguno):

```ts
async function sincronizarMulta(
  asistenciaId: string,
  jugadorId: string,
  disparadorActivo: "tardanza" | "falta_injustificada" | null,
) {
  if (!multasActivo) return;
  const { data: existente } = await supabase
    .from("multas")
    .select("*")
    .eq("asistencia_id", asistenciaId)
    .maybeSingle();
  // Ya saldada: no se toca retroactivamente una decisión ya cerrada por el
  // entrenador, aunque el registro de asistencia cambie después.
  if (existente?.pagada) return;

  const tipo = disparadorActivo ? tipoPorDisparador(disparadorActivo) : null;
  if (!tipo) {
    if (existente) await supabase.from("multas").delete().eq("id", existente.id);
    return;
  }
  if (existente) {
    if (existente.tipo_id !== tipo.id) {
      await supabase
        .from("multas")
        .update({ tipo_id: tipo.id, concepto: tipo.nombre, importe: tipo.importe })
        .eq("id", existente.id);
    }
  } else {
    await supabase.from("multas").insert({
      equipo_id: equipoId,
      jugador_id: jugadorId,
      tipo_id: tipo.id,
      concepto: tipo.nombre,
      importe: tipo.importe,
      origen: "automatica",
      asistencia_id: asistenciaId,
    });
  }
}
```

Se llama desde los dos puntos que ya escriben `asistencia`:
- Al final de `marcar()` (línea ~87), con
  `disparadorActivo = presente ? (llego_tarde ? "tardanza" : null) : (motivo_ausencia === "injustificado" ? "falta_injustificada" : null)`.
- Al final de `marcarLlegoTarde()` (línea ~126), con
  `disparadorActivo = llego_tarde ? "tardanza" : null` (aquí `presente` ya es
  `true` siempre, por precondición del propio botón).

Si `multasActivo` es `false`, o no hay ningún tipo con ese `disparador`
configurado (activo o borrado), no pasa nada — el checklist se comporta
exactamente igual que hoy, cero coste para quien no usa el sistema.

## UI — Ajustes (`src/components/ajustes/MultasAjustes.tsx`)

Mismo patrón que el resto de `*Ajustes.tsx`: resuelve `equipoId` con
`useEquipo()`, sin props.

```tsx
export function MultasAjustes() {
  const { equipoId } = useEquipo();
  const [config, setConfig] = useState<MultasConfigRow | null>(null);
  const [tipos, setTipos] = useState<MultasTiposRow[]>([]);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    const [cfg, t] = await Promise.all([
      supabase.from("multas_config").select("*").eq("equipo_id", equipoId).maybeSingle(),
      supabase.from("multas_tipos").select("*").eq("equipo_id", equipoId).order("created_at"),
    ]);
    setConfig(cfg.data);
    setTipos(t.data ?? []);
    setCargando(false);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [equipoId]);

  async function toggleActivo(activo: boolean) {
    await supabase.from("multas_config").upsert({ equipo_id: equipoId, activo }, { onConflict: "equipo_id" });
    // Primera activación con catálogo vacío: siembra los dos tipos
    // automáticos con importes por defecto, editables al momento —
    // da valor inmediato sin exigir configurar nada antes de usarlo.
    if (activo && tipos.length === 0) {
      await supabase.from("multas_tipos").insert([
        { equipo_id: equipoId, nombre: "Llegar tarde", importe: 1, disparador: "tardanza" },
        { equipo_id: equipoId, nombre: "Falta sin avisar", importe: 3, disparador: "falta_injustificada" },
      ]);
    }
    cargar();
  }

  // ...resto: switch "Sistema de multas activo" (toggleActivo) y, si
  // config?.activo, lista de `tipos` con nombre/importe editables inline
  // (blur = update), botón borrar por fila, y "+ Añadir tipo" (modal con
  // nombre, importe y un desplegable "Vincular a: Ninguno / Automático:
  // llegar tarde / Automático: falta sin avisar", ocultando las opciones
  // automáticas ya ocupadas por otro tipo — así se puede recrear un
  // disparador borrado sin tocar SQL).
}
```

Los dos tipos con `disparador` no nulo llevan un badge ("Automático") junto
al nombre para que quede claro que están enganchados al checklist de
asistencia.

## UI — Ficha de jugador (`src/components/jugador/MultasSection.tsx`)

Componente autocontenido (como `AsistenciaChecklist`, no recibe datos ya
cargados) — se monta en `JugadorDetailPage.tsx` justo debajo de la sección
"Asistencia a entrenamientos" (después de la línea ~335), sin añadir nada a
su `cargar()` para no complicar más esa carga ya extensa:

```tsx
<MultasSection equipoId={equipoId} jugadorId={jugador.id} />
```

```tsx
export function MultasSection({ equipoId, jugadorId }: { equipoId: string; jugadorId: string }) {
  const [activo, setActivo] = useState(false);
  const [multas, setMultas] = useState<MultasRow[]>([]);
  const [tipos, setTipos] = useState<MultasTiposRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);

  async function cargar() {
    const [cfg, m, t] = await Promise.all([
      supabase.from("multas_config").select("*").eq("equipo_id", equipoId).maybeSingle(),
      supabase.from("multas").select("*").eq("jugador_id", jugadorId).order("fecha", { ascending: false }),
      supabase.from("multas_tipos").select("*").eq("equipo_id", equipoId).eq("activo", true),
    ]);
    setActivo(cfg.data?.activo ?? false);
    setMultas(m.data ?? []);
    setTipos(t.data ?? []);
    setCargando(false);
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [equipoId, jugadorId]);

  if (cargando || !activo) return null;

  const deuda = multas.filter((m) => !m.pagada).reduce((s, m) => s + m.importe, 0);
  const formateado = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(deuda);

  async function saldar() {
    await supabase
      .from("multas")
      .update({ pagada: true, pagada_at: new Date().toISOString() })
      .eq("jugador_id", jugadorId)
      .eq("pagada", false);
    cargar();
  }

  return (
    <div>
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
        Multas
      </div>
      <div className="card-surface p-4">
        <div className="flex items-end justify-between gap-2">
          <div className="stat-number text-[2.375rem] leading-none text-[var(--color-accent)]">{formateado}</div>
          <div className="flex shrink-0 gap-2">
            {deuda > 0 && <Button size="sm" variant="secondary" onClick={saldar}>Saldar</Button>}
            <Button size="sm" onClick={() => setModalAbierto(true)}>+ Multa</Button>
          </div>
        </div>
        {multas.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3">
            {multas.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-xs">
                <span className={m.pagada ? "text-[var(--color-text-faint)] line-through" : "text-[var(--color-text-muted)]"}>
                  {m.fecha} · {m.concepto}
                </span>
                <span className="font-medium">{m.importe.toFixed(2)} €</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MultaManualModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        equipoId={equipoId}
        jugadorId={jugadorId}
        tipos={tipos}
        onSaved={() => { setModalAbierto(false); cargar(); }}
      />
    </div>
  );
}
```

`MultaManualModal` (nuevo, mismo carpeta): formulario mínimo — desplegable
de `tipos` (nombre + importe visible en cada opción), fecha (por defecto
hoy), nota opcional (`notas_adicionales`). Al guardar, `insert` en `multas`
con `origen: "manual"`, `asistencia_id: null`, `concepto`/`importe` copiados
del tipo elegido en ese momento.

## Tipos (`src/types/database.ts`)

```ts
export type DisparadorMulta = "tardanza" | "falta_injustificada";
export type OrigenMulta = "automatica" | "manual";

export type MultasConfigRow = {
  id: UUID;
  equipo_id: UUID;
  activo: boolean;
  created_at: string;
};

export type MultasTiposRow = {
  id: UUID;
  equipo_id: UUID;
  nombre: string;
  importe: number;
  disparador: DisparadorMulta | null;
  activo: boolean;
  created_at: string;
};

export type MultasRow = {
  id: UUID;
  equipo_id: UUID;
  jugador_id: UUID;
  tipo_id: UUID | null;
  concepto: string;
  importe: number;
  origen: OrigenMulta;
  asistencia_id: UUID | null;
  pagada: boolean;
  pagada_at: string | null;
  fecha: string;
  notas_adicionales: string | null;
  created_at: string;
};
```

Y en `Database.public.Tables`:

```ts
multas_config: TableDef<MultasConfigRow, "id" | "activo" | "created_at">;
multas_tipos: TableDef<MultasTiposRow, "id" | "activo" | "created_at">;
multas: TableDef<
  MultasRow,
  "id" | "tipo_id" | "asistencia_id" | "pagada" | "pagada_at" | "fecha" | "notas_adicionales" | "created_at"
>;
```

## Testing

Sin Vitest nuevo — es UI + queries Supabase + un cálculo de suma trivial
(`deuda`), sin la superficie de umbrales/scoring que justificó tests
unitarios en otras fases (insights automáticos). Verificación: `tsc` +
`lint` + `build` limpios, más prueba manual del usuario:
1. Activar el sistema en Ajustes de un equipo, confirmar que se siembran los
   dos tipos automáticos con importes editables.
2. Marcar "llegó tarde" en el checklist de una sesión → aparece la multa en
   la ficha del jugador. Desmarcarlo → desaparece.
3. Marcar motivo "injustificado" en un partido → misma comprobación.
4. Añadir una multa manual con un tipo propio, saldar la deuda, comprobar
   que el histórico queda tachado pero visible.
5. Desactivar el sistema del equipo → la sección "Multas" desaparece de la
   ficha del jugador y el checklist deja de crear multas nuevas.

## Casos límite

- **Sistema desactivado en un equipo que ya tiene multas de cuando estaba
  activo**: la sección desaparece de la ficha (no se pierden datos, solo se
  oculta) y el checklist deja de sincronizar — si se reactiva más tarde, el
  histórico sigue ahí tal cual.
- **Se borra el tipo automático de "tardanza" (o "falta sin avisar")**: el
  enganche automático para ese disparador deja de aplicarse (no hay tipo
  que buscar) hasta que se cree uno nuevo con ese `disparador` desde
  "+ Añadir tipo" en Ajustes — las multas ya puestas con ese tipo conservan
  su `concepto`/`importe` copiados, solo `tipo_id` pasa a `null`.
- **Corregir una asistencia con una multa automática ya saldada** (p. ej.
  cambiar "llegó tarde" a "no llegó tarde" después de que el entrenador ya
  marcó esa multa como pagada): no se toca — `sincronizarMulta` ignora
  cualquier multa con `pagada = true`, para no deshacer retroactivamente
  una cuenta ya cerrada. Si la corrección sigue mereciendo ajuste, se hace a
  mano (editar o borrar esa fila desde el historial, o añadir una multa
  manual).
- **Multa automática cuyo `asistencia_id` se borra** (se borra la fila de
  `asistencia`, no solo se cambia): `on delete cascade` borra la multa con
  ella, automática o no — no puede quedar huérfana de un evento que ya no
  existe.
- **Equipo sin fila en `multas_config`** (nunca se ha tocado Ajustes): se
  trata como `activo = false` en todas las lecturas (`maybeSingle()` +
  `?? false`), sin necesitar backfill ni fila por defecto al crear un
  equipo nuevo.
