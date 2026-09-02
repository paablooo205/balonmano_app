import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { encolarOperacion, esErrorDeRed } from "@/lib/offline/queue";
import { cargarRivalesEquipo } from "@/lib/rivales";
import { toISODate } from "@/lib/calendar";
import type { PartidosRow, RivalesRow } from "@/types/database";

function estadoInicial(partido: PartidosRow | null, fechaPorDefecto: string) {
  return {
    fecha: partido?.fecha ?? fechaPorDefecto,
    rival: partido?.rival ?? "",
    rivalId: partido?.rival_id ?? null,
    casaFuera: (partido?.casa_fuera ?? "") as "casa" | "fuera" | "",
    competicion: partido?.competicion ?? "",
    resultado: partido?.resultado ?? "",
    sistemaPropio: partido?.sistema_propio ?? "",
    sistemaRival: partido?.sistema_rival ?? "",
    problemasDetectados: partido?.problemas_detectados ?? "",
    accionesSiguienteSemana: partido?.acciones_siguiente_semana ?? "",
    notas: partido?.notas_adicionales ?? "",
  };
}

/** Si ya tiene algo del análisis post-partido relleno, se asume jugado al abrir para editar. */
function yaJugadoInicial(partido: PartidosRow | null): boolean {
  if (!partido) return false;
  return Boolean(
    partido.resultado ||
      partido.sistema_propio ||
      partido.sistema_rival ||
      partido.problemas_detectados ||
      partido.acciones_siguiente_semana,
  );
}

export function PartidoModal({
  open,
  onClose,
  equipoId,
  microcicloId = null,
  fecha,
  partido,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  microcicloId?: string | null;
  /** Fecha por defecto al crear uno nuevo; el propio modal permite cambiarla. */
  fecha?: string;
  partido: PartidosRow | null;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [estado, setEstado] = useState(() => estadoInicial(partido, fecha ?? toISODate(new Date())));
  const [jugado, setJugado] = useState(() => yaJugadoInicial(partido));
  const [rivales, setRivales] = useState<RivalesRow[]>([]);
  const [modoRival, setModoRival] = useState<"existente" | "nuevo">("nuevo");
  const {
    fecha: fechaEstado,
    rival,
    rivalId,
    casaFuera,
    competicion,
    resultado,
    sistemaPropio,
    sistemaRival,
    problemasDetectados,
    accionesSiguienteSemana,
    notas,
  } = estado;
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  // El modal permanece montado entre aperturas (algunos padres no lo
  // desmontan al cerrarlo), así que sin este efecto reabrirlo para un
  // partido distinto — o el mismo, tras cancelar — mostraría datos de la
  // sesión de edición anterior. También recarga la lista de rivales del
  // equipo cada vez que se abre, y decide el modo por defecto: "existente"
  // preseleccionado si el partido ya está enlazado, o si el equipo ya tiene
  // algún rival registrado (fomenta reutilizar en vez de duplicar);
  // "nuevo" solo si todavía no hay ninguno.
  useEffect(() => {
    if (open) {
      setEstado(estadoInicial(partido, fecha ?? toISODate(new Date())));
      setJugado(yaJugadoInicial(partido));
      // Guarda de cancelación: si el modal se reabre para otro partido (o el
      // mismo, tras cancelar) antes de que esta carga termine, la respuesta
      // desactualizada no debe pisar el modo/rivales ya reseteados para la
      // apertura más reciente.
      let cancelado = false;
      cargarRivalesEquipo(equipoId).then((lista) => {
        if (cancelado) return;
        setRivales(lista);
        // Editar un partido sin rival_id (no puede venir del backfill de la
        // Task 1, que enlaza todos — solo si algo insertó la fila fuera de
        // la app) debe abrir en "nuevo" con el texto ya escrito, no en
        // "existente" sin nada seleccionado.
        setModoRival(partido && !partido.rival_id ? "nuevo" : partido?.rival_id || lista.length > 0 ? "existente" : "nuevo");
      });
      return () => {
        cancelado = true;
      };
    }
  }, [open, partido, fecha, equipoId]);

  function set<K extends keyof ReturnType<typeof estadoInicial>>(key: K, value: ReturnType<typeof estadoInicial>[K]) {
    setEstado((e) => ({ ...e, [key]: value }));
  }

  async function guardar() {
    if (modoRival === "nuevo" && !rival.trim()) {
      alert("El rival es obligatorio.");
      return;
    }
    if (modoRival === "existente" && !rivalId) {
      alert("Selecciona un rival.");
      return;
    }
    setGuardando(true);

    let rivalIdFinal = rivalId;
    let rivalNombreFinal = rival.trim();
    if (modoRival === "nuevo") {
      if (!navigator.onLine) {
        alert("Crear un rival nuevo requiere conexión. Conéctate o elige uno ya existente.");
        setGuardando(false);
        return;
      }
      const { data: nuevoRival, error: errorRival } = await supabase
        .from("rivales")
        .insert({ equipo_id: equipoId, nombre: rivalNombreFinal })
        .select()
        .single();
      if (errorRival || !nuevoRival) {
        alert("No se pudo crear el rival: " + (errorRival?.message ?? "error desconocido"));
        setGuardando(false);
        return;
      }
      rivalIdFinal = nuevoRival.id;
    } else {
      rivalNombreFinal = rivales.find((r) => r.id === rivalId)?.nombre ?? rivalNombreFinal;
    }

    const id = partido?.id ?? crypto.randomUUID();
    const ahora = new Date().toISOString();
    // Fila completa (con id generado en cliente si es nuevo) para poder
    // encolarla y mostrarla de inmediato aunque no haya red todavía.
    const payload: PartidosRow = {
      id,
      equipo_id: equipoId,
      microciclo_id: microcicloId,
      rival: rivalNombreFinal,
      rival_id: rivalIdFinal,
      fecha: fechaEstado,
      casa_fuera: casaFuera || null,
      competicion: competicion || null,
      resultado: jugado ? resultado || null : null,
      sistema_propio: jugado ? sistemaPropio || null : null,
      sistema_rival: jugado ? sistemaRival || null : null,
      estadisticas: partido?.estadisticas ?? {},
      problemas_detectados: jugado ? problemasDetectados || null : null,
      acciones_siguiente_semana: jugado ? accionesSiguienteSemana || null : null,
      notas_adicionales: jugado ? notas || null : null,
      created_at: partido?.created_at ?? ahora,
      updated_at: ahora,
    };
    const tipo = partido ? "update" : "insert";

    if (!navigator.onLine) {
      await encolarOperacion({ tabla: "partidos", tipo, rowId: id, payload });
      setGuardando(false);
      onSaved();
      return;
    }

    const { error, status } = partido
      ? await supabase.from("partidos").update(payload).eq("id", partido.id)
      : await supabase.from("partidos").insert(payload);
    setGuardando(false);
    if (error) {
      if (esErrorDeRed(status)) {
        await encolarOperacion({ tabla: "partidos", tipo, rowId: id, payload });
        onSaved();
        return;
      }
      alert("No se pudo guardar: " + error.message);
      return;
    }
    onSaved();
  }

  async function borrar() {
    if (!partido) return;
    if (!confirm(`¿Borrar el partido contra ${partido.rival}? No se puede deshacer.`)) return;
    setBorrando(true);

    if (!navigator.onLine) {
      await encolarOperacion({ tabla: "partidos", tipo: "delete", rowId: partido.id });
      setBorrando(false);
      onDeleted();
      return;
    }

    const { error, status } = await supabase.from("partidos").delete().eq("id", partido.id);
    setBorrando(false);
    if (error) {
      if (esErrorDeRed(status)) {
        await encolarOperacion({ tabla: "partidos", tipo: "delete", rowId: partido.id });
        onDeleted();
        return;
      }
      alert("No se pudo borrar: " + error.message);
      return;
    }
    onDeleted();
  }

  return (
    <Modal open={open} onClose={onClose} title={partido ? "Editar partido" : "Nuevo partido"}>
      <div className="flex flex-col gap-4">
        <Field label="Fecha">
          <Input type="date" value={fechaEstado} onChange={(e) => set("fecha", e.target.value)} />
        </Field>

        <div>
          <span className="mb-1.5 block text-sm text-[var(--color-text-muted)]">Rival *</span>
          <div className="tab-pill-group mb-2">
            <button
              type="button"
              className="tab-pill"
              data-active={modoRival === "existente"}
              disabled={rivales.length === 0}
              onClick={() => setModoRival("existente")}
            >
              Rival existente
            </button>
            <button
              type="button"
              className="tab-pill"
              data-active={modoRival === "nuevo"}
              onClick={() => setModoRival("nuevo")}
            >
              Rival nuevo
            </button>
          </div>
          {modoRival === "existente" ? (
            <Select value={rivalId ?? ""} onChange={(e) => set("rivalId", e.target.value || null)}>
              <option value="">Selecciona un rival…</option>
              {rivales.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </Select>
          ) : (
            <Input placeholder="Nombre del rival" value={rival} onChange={(e) => set("rival", e.target.value)} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Lugar">
            <Select value={casaFuera} onChange={(e) => set("casaFuera", e.target.value as "casa" | "fuera" | "")}>
              <option value="">—</option>
              <option value="casa">Casa</option>
              <option value="fuera">Fuera</option>
            </Select>
          </Field>
          <Field label="Competición">
            <Select value={competicion} onChange={(e) => set("competicion", e.target.value)}>
              <option value="">—</option>
              <option value="Liga">Liga</option>
              <option value="Amistoso">Amistoso</option>
            </Select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={jugado}
            onChange={(e) => setJugado(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-accent)]"
          />
          El partido ya se ha jugado
        </label>

        {jugado && (
          <>
            <Field label="Resultado">
              <Input placeholder="ej. 28-24" value={resultado} onChange={(e) => set("resultado", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sistema propio">
                <Input placeholder="ej. 6:0" value={sistemaPropio} onChange={(e) => set("sistemaPropio", e.target.value)} />
              </Field>
              <Field label="Sistema del rival">
                <Input placeholder="ej. 5:1" value={sistemaRival} onChange={(e) => set("sistemaRival", e.target.value)} />
              </Field>
            </div>
            <Field label="Problemas detectados">
              <Textarea value={problemasDetectados} onChange={(e) => set("problemasDetectados", e.target.value)} />
            </Field>
            <Field label="Acciones para la semana siguiente">
              <Textarea value={accionesSiguienteSemana} onChange={(e) => set("accionesSiguienteSemana", e.target.value)} />
            </Field>
            <Field label="Notas adicionales">
              <Textarea value={notas} onChange={(e) => set("notas", e.target.value)} />
            </Field>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        {partido ? (
          <Button variant="destructive" size="sm" onClick={borrar} disabled={borrando}>
            {borrando ? "Borrando..." : "Borrar"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
