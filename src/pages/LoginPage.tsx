import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { EscudoFondo } from "@/components/layout/EscudoFondo";

export function LoginPage({ onIrARegistro }: { onIrARegistro: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) {
      setError("Email o contraseña incorrectos.");
    }
  }

  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <EscudoFondo className="-bottom-24 -right-24 h-[130vw] w-[130vw] max-h-[48rem] max-w-[48rem] rotate-[-8deg]" />
      <form onSubmit={handleSubmit} className="card-surface w-full max-w-sm animate-entrada p-6">
        <img
          src="/balonmano.webp"
          alt="Escudo del club"
          className="mx-auto mb-4 h-20 w-auto -rotate-6 object-contain"
        />
        <h1
          className="mb-6 text-center text-2xl font-extrabold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Iniciar sesión
        </h1>

        <label className="mb-3 block text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-12 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 text-base outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        <label className="mb-4 block text-sm">
          Contraseña
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-12 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 text-base outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={cargando} className="w-full">
          {cargando ? "Entrando..." : "Entrar"}
        </Button>

        <button
          type="button"
          onClick={onIrARegistro}
          className="mt-4 w-full text-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          ¿No tienes cuenta? Crear una
        </button>
      </form>
    </div>
  );
}
