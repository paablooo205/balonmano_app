export type EscudoPdf = { uri: string; width: number; height: number };

let cache: Promise<EscudoPdf> | null = null;

/** @react-pdf/renderer no soporta webp para incrustar imágenes — se convierte
 * /balonmano.webp a PNG (en escala de grises, para la misma silueta ensombrecida
 * que el fondo de la app) una vez vía canvas, aprovechando que el navegador sí
 * decodifica webp de forma nativa. Resultado cacheado en memoria. */
export function cargarEscudoPdf(): Promise<EscudoPdf> {
  if (!cache) {
    cache = new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo preparar el escudo para el PDF."));
          return;
        }
        ctx.filter = "grayscale(1)";
        ctx.drawImage(img, 0, 0);
        resolve({ uri: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => reject(new Error("No se pudo cargar el escudo."));
      img.src = "/balonmano.webp";
    });
  }
  return cache;
}
