import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { urlFirmada } from "@/lib/storage";
import { cn } from "@/lib/utils";

/** Miniatura real de una imagen de ejercicio (nunca solo un nombre de archivo o un enlace) — obtiene su URL firmada al montarse. */
export function MiniaturaImagen({
  ruta,
  className,
  onClick,
}: {
  ruta: string;
  className?: string;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setUrl(null);
    urlFirmada(ruta)
      .then((u) => {
        if (vivo) setUrl(u);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ruta]);

  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-[var(--color-card-hover)]", className)}>
        <Loader2 size={18} className="animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      onClick={onClick}
      className={cn("object-cover", onClick && "cursor-pointer", className)}
    />
  );
}
