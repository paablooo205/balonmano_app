// Envoltorio mínimo sobre IndexedDB nativo.
//
// Se opta deliberadamente por IndexedDB nativo (sin la librería `idb`) porque
// solo necesitamos dos almacenes muy simples (una cola FIFO y una caché de
// "última lectura conocida" por tabla). Añadir una dependencia nueva para eso
// no aporta frente a ~40 líneas de wrapper, y encaja con el criterio del
// proyecto de evitar librerías cuando una utilidad propia pequeña basta.

const DB_NAME = "handball-offline";
const DB_VERSION = 1;

/** Cola de operaciones de escritura pendientes de sincronizar con Supabase. */
export const STORE_QUEUE = "pendingOps";
/** Última copia conocida de cada colección (para sobrevivir a un reload sin red). */
export const STORE_CACHE = "entityCache";

let dbPromise: Promise<IDBDatabase> | null = null;

function openOfflineDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no está disponible en este entorno."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: "opId", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openOfflineDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function dbGetAll<T>(storeName: string): Promise<T[]> {
  return withStore<T[]>(storeName, "readonly", (store) => store.getAll() as IDBRequest<T[]>);
}

export function dbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(storeName, "readonly", (store) => store.get(key) as IDBRequest<T | undefined>);
}

export function dbPut(storeName: string, value: unknown): Promise<IDBValidKey> {
  return withStore<IDBValidKey>(storeName, "readwrite", (store) => store.put(value));
}

export function dbDelete(storeName: string, key: IDBValidKey): Promise<undefined> {
  return withStore<undefined>(storeName, "readwrite", (store) => store.delete(key) as unknown as IDBRequest<undefined>);
}
