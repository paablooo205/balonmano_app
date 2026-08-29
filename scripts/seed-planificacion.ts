/**
 * Siembra periodos / mesociclos / microciclos para cada equipo existente,
 * a partir de "PLANIFICACION ANUAL OBJETIVOS.xlsx" (hojas PLANIFICACION,
 * MICROCICLOS, COMP. 1, COMP. 2). Contenido literal del Excel, adaptado
 * solo en fechas (recalculadas a la temporada de cada equipo) y en
 * formato de texto (espacios múltiples -> saltos de línea).
 *
 * Uso: npm run seed:planificacion
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, existsSync } from "node:fs";
import { utils, read } from "xlsx";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";

const EXCEL_PATH = "PLANIFICACION ANUAL OBJETIVOS.xlsx";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const SEED_EMAIL = process.env.SEED_EMAIL;
const SEED_PASSWORD = process.env.SEED_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local");
}
if (!SEED_EMAIL || !SEED_PASSWORD) {
  throw new Error(
    "Faltan SEED_EMAIL / SEED_PASSWORD en .env.local (las credenciales de tu usuario de Supabase Auth) — necesarias porque RLS exige sesión autenticada.",
  );
}
if (!existsSync(EXCEL_PATH)) {
  throw new Error(`No se encuentra "${EXCEL_PATH}" en la raíz del proyecto.`);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Utilidades ─────────────────────────────────────────────────────────────

function cleanText(raw: string): string {
  return raw.replace(/\s{2,}/g, "\n").trim();
}

/** Lunes de una semana ISO 8601 dada (year = año ISO de esa semana). */
function isoWeekMonday(week: number, year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // 0 = lunes
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 42 semanas de la temporada 2025/2026: ISO 36..52/2025 + 1..25/2026. */
const SEASON_WEEKS: { start: string; end: string }[] = [];
for (let w = 36; w <= 52; w++) SEASON_WEEKS.push(range(w, 2025));
for (let w = 1; w <= 25; w++) SEASON_WEEKS.push(range(w, 2026));
function range(week: number, year: number) {
  const mon = isoWeekMonday(week, year);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return { start: fmt(mon), end: fmt(sun) };
}

/** Detecta tramos [colStart,colEnd] de una fila, a partir de sus etiquetas no vacías. */
function labelSpans(row: string[], colFrom: number, colTo: number) {
  const spans: { label: string; colStart: number; colEnd: number }[] = [];
  let current: { label: string; colStart: number } | null = null;
  for (let c = colFrom; c <= colTo; c++) {
    const v = (row[c] ?? "").toString().trim();
    if (v !== "") {
      if (current) spans.push({ ...current, colEnd: c - 1 });
      current = { label: v, colStart: c };
    }
  }
  if (current) spans.push({ ...current, colEnd: colTo });
  return spans;
}

function tipoPeriodo(nombre: string): string {
  if (/PREPAR/i.test(nombre)) return "preparatorio";
  if (/COMPETITIVO/i.test(nombre)) return "competitivo";
  if (/VACAC/i.test(nombre)) return "vacaciones";
  if (/TRANS/i.test(nombre)) return "transicion";
  return "otro";
}

// ─── Lectura del Excel ──────────────────────────────────────────────────────

const wb = read(readFileSync(EXCEL_PATH));
function sheetArray(name: string): string[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Hoja "${name}" no encontrada en el Excel.`);
  return utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
}

const plan = sheetArray("PLANIFICACION");
const micro = sheetArray("MICROCICLOS");
const comp1 = sheetArray("COMP. 1");
const comp2 = sheetArray("COMP. 2");

const COL_FROM = 1;
const COL_TO = 42; // 42 microciclos

// Filas de la hoja PLANIFICACION (índices verificados manualmente)
const R = {
  periodo: 3,
  mesociclos: 5,
  microciclos: 6,
  semana: 7,
  competicion: 8,
  rival: 9,
  contentSubPeriodo: 10,
  ataque: 11,
  defensa: 17,
  contraataque: 23,
  repliegue: 29,
  portero: 35,
};

// 1) PERIODOS (6, incluye VACAC. sin contenido técnico-táctico)
const periodoSpans = labelSpans(plan[R.periodo], COL_FROM, COL_TO);

// 2) MESOCICLOS (11)
const mesocicloSpans = labelSpans(plan[R.mesociclos], COL_FROM, COL_TO);

// 3) Bloques de contenido (5, se mapean en orden a los periodos no-vacacionales)
const contentSpans = labelSpans(plan[R.contentSubPeriodo], COL_FROM, COL_TO);
const periodosNoVacac = periodoSpans.filter((p) => tipoPeriodo(p.label) !== "vacaciones");
if (contentSpans.length !== periodosNoVacac.length) {
  throw new Error(
    `Se esperaban ${periodosNoVacac.length} bloques de contenido y se encontraron ${contentSpans.length}.`,
  );
}
const contentByPeriodoLabel = new Map<string, { colStart: number; colEnd: number }>();
periodosNoVacac.forEach((p, i) => contentByPeriodoLabel.set(p.label, contentSpans[i]));

function contentTextForPeriodo(row: number, periodoLabel: string): string {
  const span = contentByPeriodoLabel.get(periodoLabel);
  if (!span) return "";
  // el texto vive en la primera columna del tramo
  return cleanText((plan[row][span.colStart] ?? "").toString());
}

// 4) RIVAL / COMPETICION por microciclo
const competicionSpans = labelSpans(plan[R.competicion], COL_FROM, COL_TO);
function competicionParaCol(col: number): string | null {
  const s = competicionSpans.find((s) => col >= s.colStart && col <= s.colEnd);
  return s ? s.label : null;
}
function rivalParaCol(col: number): string | null {
  const v = (plan[R.rival][col] ?? "").toString().trim();
  return v || null;
}

// 5) Grid técnico-táctico (hoja MICROCICLOS): microciclo_num = col - 2, cols 3..44
const MICRO_CATEGORIES: { key: string; rows: number[] }[] = [
  { key: "ataque", rows: [20, 21, 22, 23, 24, 25, 26, 27, 28] },
  { key: "defensa", rows: [30, 31, 32, 33, 34, 35, 36, 37] },
  { key: "contraataque", rows: [39, 40, 41, 42, 43, 44] },
  { key: "repliegue", rows: [46, 47, 48, 49, 50] },
  { key: "portero", rows: [52, 53, 54, 55, 56, 57, 58, 59] },
];
const PREP_FISICA_ROW = 61;

function contenidosParaMicrociclo(microNum: number): Record<string, unknown> {
  const col = microNum + 2;
  const contenidos: Record<string, string[]> = {};
  for (const cat of MICRO_CATEGORIES) {
    const items: string[] = [];
    for (const row of cat.rows) {
      const itemName = (micro[row][1] ?? "").toString().trim();
      const marcado = (micro[row][col] ?? "").toString().trim().toUpperCase() === "X";
      if (itemName && marcado) items.push(itemName);
    }
    contenidos[cat.key] = items;
  }
  const prepFisica =
    (micro[PREP_FISICA_ROW][col] ?? "").toString().trim().toUpperCase() === "X";
  return { ...contenidos, preparacion_fisica: prepFisica };
}

// 6) COMP. 1 / COMP. 2 -> texto para mesociclos.notas_adicionales
function parseComp(sheet: string[][], tituloHoja: string): Map<number, string> {
  // Nº de mesociclo por grupo (fila 9: "MESOCICLO 2", "MESOCOCLO 3"...)
  const mesoRow = sheet[9];
  const mesoLabels = labelSpans(mesoRow, 0, mesoRow.length - 1).map((g) => ({
    num: parseInt(g.label.match(/\d+/)?.[0] ?? "0", 10),
    colStart: g.colStart,
  }));

  // Columnas reales de individual/colectiva/sistema: se leen de la fila de
  // cabecera (10), NO se calculan por aritmética — el desplazamiento no es
  // uniforme entre grupos en este Excel.
  const headerRow = sheet[10];
  const levelCols: { col: number }[] = [];
  headerRow.forEach((v, c) => {
    if ((v ?? "").toString().trim() !== "") levelCols.push({ col: c });
  });
  if (levelCols.length !== mesoLabels.length * 3) {
    throw new Error(
      `"${tituloHoja}": se esperaban ${mesoLabels.length * 3} columnas de nivel y se encontraron ${levelCols.length}.`,
    );
  }
  const groups = mesoLabels.map((m, i) => ({
    num: m.num,
    individual: levelCols[i * 3].col,
    colectiva: levelCols[i * 3 + 1].col,
    sistema: levelCols[i * 3 + 2].col,
  }));

  const areaRows: { key: string; row: number }[] = [
    { key: "ATAQUE", row: 11 },
    { key: "DEFENSA", row: 17 },
    { key: "CONTRATAQUE", row: 23 },
    { key: "REPLIEGUE", row: 29 },
    { key: "PORTERO", row: 35 },
  ];
  const result = new Map<number, string>();
  for (const g of groups) {
    const cols = { individual: g.individual, colectiva: g.colectiva, sistema: g.sistema };
    let text = `Desglose técnico-táctico del mesociclo (fuente: hoja "${tituloHoja}")\n`;
    for (const area of areaRows) {
      const row = sheet[area.row];
      const individual = cleanText((row[cols.individual] ?? "").toString());
      const colectiva = cleanText((row[cols.colectiva] ?? "").toString());
      const sistema = cleanText((row[cols.sistema] ?? "").toString());
      if (!individual && !colectiva && !sistema) continue;
      text += `\n${area.key}`;
      if (individual) text += `\n- Técnico-táctico individual: ${individual}`;
      if (colectiva) text += `\n- Táctica colectiva: ${colectiva}`;
      if (sistema) text += `\n- Sistema de juego: ${sistema}`;
      text += "\n";
    }
    result.set(g.num, text.trim());
  }
  return result;
}
const notasComp1 = parseComp(comp1, "COMP. 1");
const notasComp2 = parseComp(comp2, "COMP. 2");
const notasPorMesociclo = new Map<number, string>([...notasComp1, ...notasComp2]);

// ─── Construcción de los objetos a insertar (independiente de fechas de equipo) ──

interface PeriodoSeed {
  nombre: string;
  tipo: string;
  colStart: number;
  colEnd: number;
  contenido_ataque: string;
  contenido_defensa: string;
  contenido_contraataque: string;
  contenido_repliegue: string;
  contenido_portero: string;
}
const periodosSeed: PeriodoSeed[] = periodoSpans.map((p) => ({
  nombre: p.label,
  tipo: tipoPeriodo(p.label),
  colStart: p.colStart,
  colEnd: p.colEnd,
  contenido_ataque: contentTextForPeriodo(R.ataque, p.label),
  contenido_defensa: contentTextForPeriodo(R.defensa, p.label),
  contenido_contraataque: contentTextForPeriodo(R.contraataque, p.label),
  contenido_repliegue: contentTextForPeriodo(R.repliegue, p.label),
  contenido_portero: contentTextForPeriodo(R.portero, p.label),
}));

interface MesocicloSeed {
  numero: number;
  nombre: string;
  colStart: number;
  colEnd: number;
  notas_adicionales: string | null;
}
const mesociclosSeed: MesocicloSeed[] = mesocicloSpans.map((m) => {
  const numero = parseInt(m.label, 10);
  return {
    numero,
    nombre: `Mesociclo ${numero}`,
    colStart: m.colStart,
    colEnd: m.colEnd,
    notas_adicionales: notasPorMesociclo.get(numero) ?? null,
  };
});

interface MicrocicloSeed {
  numero: number;
  colIndex: number;
  fecha_inicio: string;
  fecha_fin: string;
  rival: string | null;
  competicion: string | null;
  contenidos: Record<string, unknown>;
}
const microciclosSeed: MicrocicloSeed[] = [];
for (let i = 1; i <= 42; i++) {
  const col = COL_FROM + (i - 1); // col1..col42
  microciclosSeed.push({
    numero: i,
    colIndex: col,
    fecha_inicio: SEASON_WEEKS[i - 1].start,
    fecha_fin: SEASON_WEEKS[i - 1].end,
    rival: rivalParaCol(col),
    competicion: competicionParaCol(col),
    contenidos: contenidosParaMicrociclo(i),
  });
}

function periodoDeColumna(col: number) {
  return periodosSeed.find((p) => col >= p.colStart && col <= p.colEnd)!;
}
function mesocicloDeColumna(col: number) {
  // punto medio del mesociclo decide el periodo "dueño" en empates de borde
  return mesociclosSeed.find((m) => col >= m.colStart && col <= m.colEnd)!;
}

console.log(
  `Excel parseado: ${periodosSeed.length} periodos, ${mesociclosSeed.length} mesociclos, ${microciclosSeed.length} microciclos.`,
);

// ─── Siembra en Supabase, por cada equipo existente ────────────────────────

async function main() {
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: SEED_EMAIL!,
    password: SEED_PASSWORD!,
  });
  if (authError) throw authError;

  const { data: equipos, error: equiposError } = await supabase.from("equipos").select("*");
  if (equiposError) throw equiposError;
  if (!equipos || equipos.length === 0) {
    throw new Error("No hay equipos en la tabla `equipos`. Aplica las migraciones/seed primero.");
  }

  for (const equipo of equipos) {
    const { count } = await supabase
      .from("periodos")
      .select("id", { count: "exact", head: true })
      .eq("equipo_id", equipo.id);
    if (count && count > 0) {
      console.log(`⏭  ${equipo.nombre}: ya tiene periodos sembrados, se omite.`);
      continue;
    }

    console.log(`\n▶ Sembrando "${equipo.nombre}"...`);

    // Periodos
    const { data: periodosIns, error: pErr } = await supabase
      .from("periodos")
      .insert(
        periodosSeed.map((p) => ({
          equipo_id: equipo.id,
          nombre: p.nombre,
          tipo: p.tipo,
          fecha_inicio: microciclosSeed.find((mc) => mc.colIndex === p.colStart)!.fecha_inicio,
          fecha_fin: microciclosSeed.find((mc) => mc.colIndex === p.colEnd)!.fecha_fin,
          contenido_ataque: p.contenido_ataque || null,
          contenido_defensa: p.contenido_defensa || null,
          contenido_contraataque: p.contenido_contraataque || null,
          contenido_repliegue: p.contenido_repliegue || null,
          contenido_portero: p.contenido_portero || null,
        })),
      )
      .select("id, nombre");
    if (pErr) throw pErr;
    const periodoIdByNombre = new Map(periodosIns!.map((p) => [p.nombre, p.id]));
    console.log(`  ✓ ${periodosIns!.length} periodos`);

    // Mesociclos
    const { data: mesociclosIns, error: mErr } = await supabase
      .from("mesociclos")
      .insert(
        mesociclosSeed.map((m) => {
          const periodo = periodoDeColumna(Math.round((m.colStart + m.colEnd) / 2));
          return {
            equipo_id: equipo.id,
            periodo_id: periodoIdByNombre.get(periodo.nombre)!,
            nombre: m.nombre,
            notas_adicionales: m.notas_adicionales,
          };
        }),
      )
      .select("id, nombre");
    if (mErr) throw mErr;
    const mesocicloIdByNombre = new Map(mesociclosIns!.map((m) => [m.nombre, m.id]));
    console.log(`  ✓ ${mesociclosIns!.length} mesociclos`);

    // Microciclos
    const { error: mcErr } = await supabase.from("microciclos").insert(
      microciclosSeed.map((mc) => {
        const mesociclo = mesocicloDeColumna(mc.colIndex);
        return {
          equipo_id: equipo.id,
          mesociclo_id: mesocicloIdByNombre.get(mesociclo.nombre)!,
          semana: mc.numero,
          fecha_inicio: mc.fecha_inicio,
          fecha_fin: mc.fecha_fin,
          rival: mc.rival,
          competicion: mc.competicion,
          contenidos: mc.contenidos,
        };
      }),
    );
    if (mcErr) throw mcErr;
    console.log(`  ✓ ${microciclosSeed.length} microciclos`);
  }

  console.log("\nSiembra completada.");
}

main().catch((err) => {
  console.error("Error en la siembra:", err);
  process.exit(1);
});
