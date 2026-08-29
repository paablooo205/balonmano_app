import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

export function RegistroPage({ onIrALogin }: { onIrALogin: () => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [confirmacionPendiente, setConfirmacionPendiente] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } },
    });
    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      setConfirmacionPendiente(true);
    }
    // Si ya hay sesión, AuthGate lo detecta solo vía onAuthStateChange.
  }

  if (confirmacionPendiente) {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <div className="card-surface w-full max-w-sm p-6 text-center">
          <img
            src="/balonmano.webp"
            alt="Escudo del club"
            className="mx-auto mb-4 h-20 w-auto -rotate-6 object-contain"
          />
          <h1
            className="mb-3 text-2xl font-extrabold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Revisa tu correo
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Te hemos enviado un enlace de confirmación a {email}. Confírmalo para poder entrar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="card-surface w-full max-w-sm p-6">
        <img
          src="/balonmano.webp"
          alt="Escudo del club"
          className="mx-auto mb-4 h-20 w-auto -rotate-6 object-contain"
        />
        <h1
          className="mb-6 text-center text-2xl font-extrabold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Crear cuenta
        </h1>

        <label className="mb-3 block text-sm">
          Nombre
          <input
            type="text"
            required
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="mt-1 h-12 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 text-base outline-none focus:border-[var(--color-accent)]"
          />
        </label>

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
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 h-12 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card-hover)] px-3 text-base outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={cargando} className="w-full">
          {cargando ? "Creando cuenta..." : "Crear cuenta"}
        </Button>

        <button
          type="button"
          onClick={onIrALogin}
          className="mt-4 w-full text-center text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          ¿Ya tienes cuenta? Inicia sesión
        </button>
      </form>
    </div>
  );
}
