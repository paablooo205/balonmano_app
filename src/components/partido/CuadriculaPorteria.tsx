import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResultadoTiro } from "@/types/database";

const RESULTADOS: { valor: ResultadoTiro; label: string }[] = [
  { valor: "gol", label: "Gol" },
  { valor: "fuera", label: "Fuera" },
  { valor: "parado", label: "Parado" },
  { valor: "poste", label: "Poste" },
];

/**
 * Cuadrícula de portería (rejilla 3×3, zonas numeradas 1-9 de izquierda a
 * derecha y de arriba a abajo, vista de frente a la portería) para registrar
 * un tiro con resultado + zona + si es penalti en un único flujo. Reutilizable
 * en los tres contextos donde hace falta: tiro propio en partido, tiro/gol
 * del rival en partido, y tiro propio en entrenamiento — el llamante decide
 * `equipo_origen`/`partido_id`/`sesion_id`/`jugador_id` al recibir `onConfirmar`.
 *
 * Tarjeta oscura + acento rojo (igual que el resto de "Partido en directo"),
 * deliberadamente NO el `card-surface` claro habitual — así se ve igual en
 * cualquier pantalla donde se monte, en vez de cambiar de tema según el
 * contexto donde se abra.
 *
 * Flujo: primero resultado (+ si es penalti), luego zona — tocar una zona
 * confirma y cierra en un solo gesto, para poder anotar con una mano mientras
 * se dirige el partido/entrenamiento.
 */
export function CuadriculaPorteria({
  open,
  titulo,
  onClose,
  onConfirmar,
}: {
  open: boolean;
  titulo: string;
  onClose: () => void;
  onConfirmar: (datos: { resultado: ResultadoTiro; zona: number; esPenalti: boolean }) => void;
}) {
  const [resultado, setResultado] = useState<ResultadoTiro | null>(null);
  const [esPenalti, setEsPenalti] = useState(false);

  if (!open) return null;

  function cerrar() {
    setResultado(null);
    setEsPenalti(false);
    onClose();
  }

  function tocarZona(zona: number) {
    if (!resultado) return;
    onConfirmar({ resultado, zona, esPenalti });
    setResultado(null);
    setEsPenalti(false);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
      onClick={cerrar}
    >
      <div
        className="flex w-full flex-col gap-5 rounded-t-[20px] bg-[#0d0d0f] p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] md:max-w-sm md:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-white">{titulo}</h2>
          <button aria-label="Cerrar" onClick={cerrar} className="text-white/50 hover:text-white/80">
            <X size={20} />
          </button>
        </div>

        <div>
          <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Resultado</div>
          <div className="grid grid-cols-4 gap-1.5">
            {RESULTADOS.map((r) => (
              <button
                key={r.valor}
                onClick={() => setResultado(r.valor)}
                className={cn(
                  "flex h-11 items-center justify-center rounded-xl text-[13px] font-semibold transition-colors",
                  resultado === r.valor ? "bg-[var(--color-accent)] text-white" : "bg-white/[.08] text-white/70",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setEsPenalti((v) => !v)}
          className={cn(
            "flex h-11 items-center justify-center rounded-xl text-[13px] font-semibold transition-colors",
            esPenalti ? "bg-[var(--color-accent)] text-white" : "bg-white/[.08] text-white/60",
          )}
        >
          7 metros
        </button>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Zona</span>
            {!resultado && <span className="text-[10px] text-white/35">Elige primero el resultado</span>}
          </div>
          <PorteriaGrid disabled={!resultado} onZona={tocarZona} />
        </div>
      </div>
    </div>
  );
}

function PorteriaGrid({ disabled, onZona }: { disabled: boolean; onZona: (zona: number) => void }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border-[3px] border-white/25 bg-[#15151a] transition-opacity",
        disabled && "opacity-40",
      )}
      style={{ aspectRatio: "3 / 2" }}
    >
      {/* Red de la portería — puramente decorativa, marca las mismas 9 celdas que los botones. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[.14]" preserveAspectRatio="none">
        {[1, 2].map((i) => (
          <line key={`v${i}`} x1={`${i * 33.33}%`} y1="0" x2={`${i * 33.33}%`} y2="100%" stroke="white" strokeWidth="1.5" />
        ))}
        {[1, 2].map((i) => (
          <line key={`h${i}`} x1="0" y1={`${i * 33.33}%`} x2="100%" y2={`${i * 33.33}%`} stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="relative grid h-full grid-cols-3 grid-rows-3 gap-[3px] p-[3px]">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((zona) => (
          <button
            key={zona}
            disabled={disabled}
            onClick={() => onZona(zona)}
            aria-label={`Zona ${zona}`}
            className="rounded-md bg-white/[.04] transition-colors active:scale-[0.96] active:bg-[var(--color-accent)]/50 disabled:pointer-events-none"
          />
        ))}
      </div>
    </div>
  );
}
