import { supabase } from "@/lib/supabaseClient";

const BUCKET = "adjuntos";

/** Sube un archivo a Storage y devuelve la ruta guardada (no la URL firmada, que caduca). */
export async function subirArchivo(carpeta: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "bin";
  const ruta = `${carpeta}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, file, { upsert: false });
  if (error) throw error;
  return ruta;
}

/** Genera una URL firmada temporal para abrir/descargar un archivo privado. */
export async function urlFirmada(ruta: string, segundos = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, segundos);
  if (error) throw error;
  return data.signedUrl;
}

export async function borrarArchivo(ruta: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([ruta]);
}

export function nombreArchivo(ruta: string): string {
  return ruta.split("/").pop() ?? ruta;
}
