/** Indexadas por Date.getDay() (0 = domingo ... 6 = sábado), igual que dia_semana en BD. */
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Cabecera de semana visual, empezando en lunes (alineada con los microciclos, que van lunes-domingo). */
export const DIAS_SEMANA_CORTO = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Lunes de la semana que contiene `d` — alineado con los microciclos (lunes-domingo). */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7; // domingo(0) -> 6, lunes(1) -> 0, ...
  return addDays(d, -offset);
}

export function getWeekDates(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Semanas (arrays de 7 fechas) que cubren el mes, incluyendo días de meses vecinos. */
export function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);

  const weeks: Date[][] = [];
  let cursor = start;
  while (cursor <= end) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
