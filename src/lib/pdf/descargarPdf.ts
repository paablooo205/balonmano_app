import { pdf } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";

/** Genera el PDF en el cliente y dispara su descarga — sin backend, sin
 * window.open (evita bloqueos de pop-up). */
export async function descargarPdf(nombreArchivo: string, documento: ReactElement<DocumentProps>): Promise<void> {
  const blob = await pdf(documento).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".pdf") ? nombreArchivo : `${nombreArchivo}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
