export type EscudoPdf = { uri: string; width: number; height: number };

let cache: Promise<EscudoPdf> | null = null;

// El PDF solo muestra el escudo a ~180pt de alto y al 7% de opacidad — no
// hace falta la resolución nativa (594x841), que solo infla el canvas, la
// cadena base64 y el trabajo de decodificación de @react-pdf/renderer al
// incrustarlo. 300px de lado mayor es de sobra para esa presencia mínima.
const LADO_MAYOR_MAX = 300;

/** @react-pdf/renderer no soporta webp para incrustar imágenes — se convierte
 * /balonmano.webp a PNG (en escala de grises, para la misma silueta ensombrecida
 * que el fondo de la app, y reducido de tamaño) una vez vía canvas,
 * aprovechando que el navegador sí decodifica webp de forma nativa. Resultado
 * cacheado en memoria. */
export function cargarEscudoPdf(): Promise<EscudoPdf> {
  if (!cache) {
    cache = new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const factor = Math.min(1, LADO_MAYOR_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.round(img.naturalWidth * factor);
        const height = Math.round(img.naturalHeight * factor);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo preparar el escudo para el PDF."));
          return;
        }
        ctx.filter = "grayscale(1)";
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ uri: canvas.toDataURL("image/png"), width, height });
      };
      img.onerror = () => reject(new Error("No se pudo cargar el escudo."));
      img.src = "/balonmano.webp";
    });
  }
  return cache;
}
