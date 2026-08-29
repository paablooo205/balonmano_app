import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { EquiposRow } from "@/types/database";

export function TeamSelectPage() {
  const navigate = useNavigate();
  const [equipos, setEquipos] = useState<EquiposRow[]>([]);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");
  const [creandoEquipo, setCreandoEquipo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [temporadaNueva, setTemporadaNueva] = useState("");
  const [guardandoEquipo, setGuardandoEquipo] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [uniendose, setUniendose] = useState(false);
  const [codigoInvitacion, setCodigoInvitacion] = useState("");

  useEffect(() => {
    let activo = true;
    supabase
      .from("equipos")
      .select("*")
      .order("nombre", { ascending: true })
      .then(({ data, error }) => {
        if (!activo) return;
        if (error) {
          setEstado("error");
          return;
        }
        // RLS ya filtra a "solo mis equipos" — si es exactamente uno, nos
        // saltamos el selector y vamos directos a su Inicio.
        if (data && data.length === 1) {
          navigate(`/equipos/${data[0].id}/inicio`, { replace: true });
          return;
        }
        setEquipos(data ?? []);
        setEstado("ok");
      });
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crearEquipo(e: FormEvent) {
    e.preventDefault();
    if (!nombreNuevo.trim() || !temporadaNueva.trim()) return;
    setGuardandoEquipo(true);
    setErrorCrear(null);
    const { data, error } = await supabase.rpc("crear_equipo", {
      p_nombre: nombreNuevo.trim(),
      p_temporada: temporadaNueva.trim(),
    });
    setGuardandoEquipo(false);
    if (error || !data) {
      setErrorCrear("No se pudo crear el equipo: " + (error?.message ?? "error desconocido"));
      return;
    }
    navigate(`/equipos/${data}/ajustes`);
  }

  function unirseEquipo(e: FormEvent) {
    e.preventDefault();
    if (!codigoInvitacion.trim()) return;
    navigate(`/unirse/${codigoInvitacion.trim()}`);
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <img
        src="/balonmano.webp"
        alt="Escudo del club"
        className="pointer-events-none absolute left-4 top-6 h-24 w-auto -rotate-6 select-none object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] sm:h-32 md:left-10 md:top-10 md:h-40"
      />

      <div className="mt-24 w-full max-w-md sm:mt-16">
        <div
          className="mb-1 text-center text-3xl font-extrabold uppercase tracking-wide text-[var(--color-accent)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Coras
        </div>
        <h1 className="mb-1 text-center text-base font-medium text-[var(--color-text)]">
          Planificación deportiva
        </h1>
        <p className="mb-8 text-center text-sm text-[var(--color-text-muted)]">
          Selecciona un equipo para continuar
        </p>

        <div className="flex flex-col gap-3">
          {estado === "cargando" &&
            Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="card-surface h-20 animate-pulse bg-[var(--color-card-hover)]"
              />
            ))}

          {estado === "error" && (
            <div className="card-surface flex items-center gap-3 p-4 text-sm text-red-600">
              <ShieldAlert size={20} />
              No se han podido cargar los equipos. Revisa la conexión o la
              configuración de Supabase.
            </div>
          )}

          {estado === "ok" && equipos.length === 0 && !creandoEquipo && !uniendose && (
            <div className="card-surface flex flex-col gap-3 p-4 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">Todavía no perteneces a ningún equipo.</p>
              <Button onClick={() => setCreandoEquipo(true)}>Crear equipo</Button>
              <Button variant="secondary" onClick={() => setUniendose(true)}>
                Unirse a un equipo
              </Button>
            </div>
          )}

          {estado === "ok" && equipos.length === 0 && uniendose && (
            <form onSubmit={unirseEquipo} className="card-surface flex flex-col gap-3 p-4 text-left">
              <Field label="Código de invitación">
                <Input
                  value={codigoInvitacion}
                  onChange={(e) => setCodigoInvitacion(e.target.value)}
                  placeholder="Ej. 054621AA"
                  required
                />
              </Field>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setUniendose(false)}>
                  Atrás
                </Button>
                <Button type="submit">Unirse</Button>
              </div>
            </form>
          )}

          {estado === "ok" && equipos.length === 0 && creandoEquipo && (
            <form onSubmit={crearEquipo} className="card-surface flex flex-col gap-3 p-4 text-left">
              <Field label="Nombre del equipo">
                <Input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} required />
              </Field>
              <Field label="Temporada">
                <Input
                  value={temporadaNueva}
                  onChange={(e) => setTemporadaNueva(e.target.value)}
                  placeholder="2025-2026"
                  required
                />
              </Field>
              {errorCrear && <p className="text-sm text-red-600">{errorCrear}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setCreandoEquipo(false)} disabled={guardandoEquipo}>
                  Atrás
                </Button>
                <Button type="submit" disabled={guardandoEquipo}>
                  {guardandoEquipo ? "Creando..." : "Crear equipo"}
                </Button>
              </div>
            </form>
          )}

          {estado === "ok" &&
            equipos.map((equipo) => (
              <button
                key={equipo.id}
                onClick={() => navigate(`/equipos/${equipo.id}/inicio`)}
                className="card-surface flex items-center justify-between p-5 text-left transition-colors hover:border-[var(--color-accent)] active:bg-[var(--color-card-hover)]"
              >
                <div>
                  <div className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                    {equipo.nombre}
                  </div>
                  <div className="text-sm text-[var(--color-text-muted)]">
                    Temporada {equipo.temporada}
                  </div>
                </div>
                <ChevronRight
                  size={22}
                  className="shrink-0 text-[var(--color-accent)]"
                />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
