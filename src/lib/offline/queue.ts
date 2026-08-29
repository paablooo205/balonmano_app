// Cola de escrituras offline para "sesiones" y "partidos" (sesión de
// entrenamiento y partido del día — el único alcance que pide el plan para
// offline). Un único usuario escribe, así que el manejo de conflictos es
// deliberadamente simple: "guardar en orden, con reintento al reconectar".

import { supabase } from "@/lib/supabaseClient";
import { dbDelete, dbGet, dbGetAll, dbPut, STORE_CACHE, STORE_QUEUE } from "./db";

export type TablaOffline = "sesiones" | "partidos";
export type TipoOperacion = "insert" | "update" | "delete";

export type PendingOp = {
  /** Clave autoincremental de IndexedDB; define el orden de reproducción. */
  opId?: number;
  tabla: TablaOffline;
  tipo: TipoOperacion;
  /** id (uuid) de la fila en Supabase, generado en cliente si es un insert nuevo. */
  rowId: string;
  /** Fila completa (insert/update) — no se usa en delete. */
  payload?: Record<string, unknown>;
  createdAt: number;
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

/** Se dispara cada vez que la cola cambia (encolar, o quitar tras sincronizar). */
export function onQueueChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function encolarOperacion(op: Omit<PendingOp, "opId" | "createdAt">): Promise<void> {
  await dbPut(STORE_QUEUE, { ...op, createdAt: Date.now() } satisfies PendingOp);
  notify();
}

export async function obtenerCola(): Promise<PendingOp[]> {
  const ops = await dbGetAll<PendingOp>(STORE_QUEUE);
  return ops.sort((a, b) => (a.opId ?? 0) - (b.opId ?? 0));
}

export async function contarPendientes(): Promise<number> {
  return (await obtenerCola()).length;
}

/**
 * Detecta si una respuesta de supabase-js falló por un problema de red (offline,
 * DNS, timeout...) en vez de un error de negocio (validación, RLS, etc.).
 * postgrest-js devuelve `status: 0` cuando el propio `fetch` falla, así que es
 * la señal más fiable — más que parsear el texto del mensaje de error.
 */
export function esErrorDeRed(status: number | undefined): boolean {
  return !navigator.onLine || status === 0 || status === undefined;
}

// ---------------------------------------------------------------------------
// Flush: reproduce la cola contra Supabase, en orden, al reconectar.
// ---------------------------------------------------------------------------

let flushing = false;

export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const cola = await obtenerCola();
    for (const op of cola) {
      if (!navigator.onLine) break;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tabla = supabase.from(op.tabla as any);
      let error: { message: string } | null = null;
      let status: number | undefined;

      if (op.tipo === "insert") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ error, status } = await tabla.insert(op.payload as any));
      } else if (op.tipo === "update") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ error, status } = await tabla.update(op.payload as any).eq("id", op.rowId));
      } else {
        ({ error, status } = await tabla.delete().eq("id", op.rowId));
      }

      if (error) {
        if (esErrorDeRed(status)) {
          // Seguimos offline (o la red se cortó a mitad de flush): dejamos la
          // operación en la cola y reintentamos en el próximo "online"/arranque.
          console.warn("[offline] flush interrumpido por un error de red, se reintentará más tarde.", error);
          break;
        }
        // Error "real" (validación, RLS...): no tiene sentido reintentar esta
        // misma operación en bucle. Se registra y se descarta para no bloquear
        // el resto de la cola.
        console.error(
          `[offline] operación descartada (${op.tabla} ${op.tipo} ${op.rowId}) por un error no recuperable:`,
          error,
        );
      }

      if (op.opId !== undefined) await dbDelete(STORE_QUEUE, op.opId);
      notify();
    }
  } finally {
    flushing = false;
  }
}

let inicializado = false;

/** Arranca el flush automático: al cargar la app y cada vez que vuelve la red. */
export function inicializarSincronizacionOffline(): void {
  if (inicializado || typeof window === "undefined") return;
  inicializado = true;
  window.addEventListener("online", () => void flushQueue());
  void flushQueue();
}

// ---------------------------------------------------------------------------
// Caché de lectura + mezcla de pendientes, para que la UI no "pierda" datos
// (ni las escrituras aún no sincronizadas) si el fetch de red falla offline.
// ---------------------------------------------------------------------------

export async function guardarCache<T>(tabla: TablaOffline, equipoId: string, filas: T[]): Promise<void> {
  await dbPut(STORE_CACHE, { key: `${tabla}:${equipoId}`, filas });
}

export async function leerCache<T>(tabla: TablaOffline, equipoId: string): Promise<T[] | undefined> {
  const entry = await dbGet<{ key: string; filas: T[] }>(STORE_CACHE, `${tabla}:${equipoId}`);
  return entry?.filas;
}

/**
 * Aplica la cola pendiente sobre una lista ya cargada, para que se vean en la
 * UI los cambios encolados (todavía no confirmados por Supabase).
 */
export function aplicarPendientes<T extends { id: string }>(
  tabla: TablaOffline,
  filas: T[],
  cola: PendingOp[],
): T[] {
  let resultado = filas;
  for (const op of cola) {
    if (op.tabla !== tabla) continue;
    if (op.tipo === "delete") {
      resultado = resultado.filter((f) => f.id !== op.rowId);
      continue;
    }
    const fila = { ...(op.payload as unknown as T), id: op.rowId };
    const idx = resultado.findIndex((f) => f.id === op.rowId);
    resultado = idx >= 0 ? resultado.map((f, i) => (i === idx ? fila : f)) : [...resultado, fila];
  }
  return resultado;
}
