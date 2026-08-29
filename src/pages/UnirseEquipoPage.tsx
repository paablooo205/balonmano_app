import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

export function UnirseEquipoPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      const { data, error } = await supabase.rpc("canjear_invitacion", { p_codigo: codigo ?? "" });
      if (!activo) return;
      if (error || !data) {
        setError(error?.message ?? "No se pudo canjear la invitación.");
        return;
      }
      navigate(`/equipos/${data}/inicio`, { replace: true });
    })();
    return () => {
      activo = false;
    };
  }, [codigo, navigate]);

  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <div className="card-surface w-full max-w-sm p-6 text-center">
        <img
          src="/balonmano.webp"
          alt="Escudo del club"
          className="mx-auto mb-4 h-20 w-auto -rotate-6 object-contain"
        />
        {error ? (
          <>
            <h1
              className="mb-3 text-2xl font-extrabold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              No se pudo unir
            </h1>
            <p className="mb-4 text-sm text-red-600">{error}</p>
            <Button onClick={() => navigate("/")} className="w-full">
              Volver
            </Button>
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Uniéndote al equipo...</p>
        )}
      </div>
    </div>
  );
}
