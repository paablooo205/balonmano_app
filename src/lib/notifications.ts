// Avisos locales vía Notifications API del navegador.
//
// IMPORTANTE — límites reales de esta implementación:
// - Solo se comprueban las condiciones (partido próximo, cambio de mesociclo,
//   recordatorio de domingo) cuando la app está ABIERTA. No hay un servidor de
//   push detrás, así que si el móvil lleva días sin abrir la PWA, esos avisos
//   simplemente no llegan — no es un push real que despierte el dispositivo.
// - En iOS, las notificaciones web solo funcionan si la PWA está instalada en
//   pantalla de inicio (Compartir → Añadir a pantalla de inicio) y con iOS
//   16.4+; incluso así, el soporte en segundo plano es limitado comparado con
//   una app nativa. En Android/escritorio funciona de forma más fiable.
import { supabase } from "@/lib/supabaseClient";
import { toISODate } from "@/lib/calendar";

export function soportaNotificaciones(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permisoActual(): NotificationPermission | "no-soportado" {
  if (!soportaNotificaciones()) return "no-soportado";
  return Notification.permission;
}

export async function pedirPermiso(): Promise<NotificationPermission> {
  if (!soportaNotificaciones()) return "denied";
  return Notification.requestPermission();
}

async function mostrar(titulo: string, cuerpo: string) {
  if (permisoActual() !== "granted") return;
  const opciones: NotificationOptions = { body: cuerpo, icon: "/icons/icon-192.png", tag: titulo };
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(titulo, opciones);
      return;
    } catch {
      // sin service worker activo: sigue al fallback de abajo
    }
  }
  try {
    new Notification(titulo, opciones);
  } catch {
    // Notification puede lanzar en contextos sin permiso de foreground (raro
    // llegados aquí, pero no debe romper el resto de la comprobación).
  }
}

const marca = (clave: string) => `notif:${clave}`;
const yaAvisado = (clave: string) => localStorage.getItem(marca(clave)) !== null;
const marcarAvisado = (clave: string, valor = "1") => localStorage.setItem(marca(clave), valor);

/**
 * Comprueba las 3 condiciones de aviso para un equipo y dispara las
 * notificaciones que correspondan. Pensado para llamarse una vez por carga
 * de la app (equipo activo) — es barato y no repite avisos ya mostrados.
 */
export async function comprobarNotificaciones(equipoId: string, nombreEquipo: string): Promise<void> {
  if (permisoActual() !== "granted") return;
  const hoy = toISODate(new Date());

  // 1) Partido próximo (hoy o mañana)
  const mañana = toISODate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const { data: partidos } = await supabase
    .from("partidos")
    .select("id, rival, fecha")
    .eq("equipo_id", equipoId)
    .in("fecha", [hoy, mañana]);
  for (const p of partidos ?? []) {
    const clave = `partido:${p.id}`;
    if (yaAvisado(clave)) continue;
    const cuando = p.fecha === hoy ? "hoy" : "mañana";
    void mostrar(`${nombreEquipo}: partido ${cuando}`, `vs ${p.rival}`);
    marcarAvisado(clave);
  }

  // 2) Cambio de mesociclo
  const { data: microciclos } = await supabase
    .from("microciclos")
    .select("mesociclo_id, fecha_inicio, fecha_fin")
    .eq("equipo_id", equipoId);
  const actual = (microciclos ?? []).find((m) => m.fecha_inicio && m.fecha_fin && hoy >= m.fecha_inicio && hoy <= m.fecha_fin);
  if (actual?.mesociclo_id) {
    const claveMeso = `mesociclo-visto:${equipoId}`;
    const ultimoVisto = localStorage.getItem(marca(claveMeso));
    if (ultimoVisto !== actual.mesociclo_id) {
      // No es el primer arranque de la app (ultimoVisto === null): solo
      // avisamos cuando de verdad CAMBIA respecto al último mesociclo visto.
      if (ultimoVisto !== null) {
        const { data: meso } = await supabase.from("mesociclos").select("nombre").eq("id", actual.mesociclo_id).maybeSingle();
        void mostrar(`${nombreEquipo}: nueva fase de temporada`, meso?.nombre ?? "Empieza un nuevo mesociclo");
      }
      localStorage.setItem(marca(claveMeso), actual.mesociclo_id);
    }
  }

  // 3) Recordatorio de domingo para planificar la semana
  if (new Date().getDay() === 0) {
    const claveDomingo = `domingo:${equipoId}:${hoy}`;
    if (!yaAvisado(claveDomingo)) {
      void mostrar(`${nombreEquipo}: planifica la semana`, "Es domingo — revisa los entrenamientos de esta semana.");
      marcarAvisado(claveDomingo);
    }
  }
}
