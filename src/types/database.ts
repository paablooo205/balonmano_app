// Tipos manuales alineados con supabase/migrations/0001_init_schema.sql.
// Si el esquema cambia, actualizar aquí (o regenerar con `supabase gen types typescript`).
//
// OJO: se usan `type` (no `interface`) para las filas — un `interface` con
// campos concretos no es estructuralmente asignable a `Record<string, unknown>`
// en TypeScript, y supabase-js exige que Row/Insert/Update lo sean para poder
// tipar `.insert()`/`.update()`. Con `interface` aquí, todo el cliente colapsa
// silenciosamente a `never` y cualquier `.insert(...)` deja de compilar.

export type UUID = string;

export type EquiposRow = {
  id: UUID;
  nombre: string;
  temporada: string;
  /** Ruta de Storage (bucket "adjuntos") con las fichas oficiales de toda la
   * plantilla en un solo archivo. Ver 0016_fichas_oficiales_equipo.sql. */
  fichas_oficiales_url: string | null;
  created_at: string;
  updated_at: string;
};

/** Un entrenador, 1:1 con una fila de auth.users. Ver 0008_entrenadores_rls.sql. */
export type EntrenadoresRow = {
  id: UUID;
  nombre: string;
  auth_user_id: UUID;
  created_at: string;
  updated_at: string;
};

/** Relación N:M entrenador-equipo. Sin RLS de insert/update/delete desde el
 * cliente todavía (ver 0008_entrenadores_rls.sql) — se rellena por migración
 * de bootstrap o, en fases futuras, por la función de invitación. */
export type EntrenadoresEquiposRow = {
  entrenador_id: UUID;
  equipo_id: UUID;
  created_at: string;
};

/** Código de invitación a un equipo. Sin RLS de insert/update/delete desde el
 * cliente — todo pasa por las funciones `crear_invitacion`/`canjear_invitacion`
 * (security definer). Ver 0015_invitaciones_equipo.sql. */
export type InvitacionesEquipoRow = {
  id: UUID;
  equipo_id: UUID;
  codigo: string;
  creado_por: UUID;
  creado_en: string;
  expira_en: string;
  usado: boolean;
  usado_por: UUID | null;
};

export type PeriodosRow = {
  id: UUID;
  equipo_id: UUID;
  nombre: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  tipo: string | null;
  contenido_ataque: string | null;
  contenido_defensa: string | null;
  contenido_contraataque: string | null;
  contenido_repliegue: string | null;
  contenido_portero: string | null;
  /** Objetivo general de la fase en una frase, independiente del desglose por área. Ver 0013_planificacion_objetivos.sql. */
  objetivo_general: string | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

export type MesociclosRow = {
  id: UUID;
  equipo_id: UUID;
  periodo_id: UUID | null;
  nombre: string;
  objetivo: string | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

export type MicrociclosRow = {
  id: UUID;
  equipo_id: UUID;
  mesociclo_id: UUID | null;
  semana: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  rival: string | null;
  competicion: string | null;
  contenidos: Record<string, unknown>;
  /** Objetivo semanal en una frase. En blanco por defecto al generarse — se rellena semana a semana. Ver 0013_planificacion_objetivos.sql. */
  objetivo: string | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type HorarioRecurrenteRow = {
  id: UUID;
  equipo_id: UUID;
  dia_semana: DiaSemana;
  hora_inicio: string;
  hora_fin: string;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

export type EstadoSesion = "planificada" | "realizada" | "cancelada";

export type BloqueSesion = {
  tiempo_min: number;
  ejercicio_id?: UUID;
  descripcion_libre?: string;
  objetivo?: string;
  consignas?: string;
};

export type SesionesRow = {
  id: UUID;
  equipo_id: UUID;
  microciclo_id: UUID | null;
  fecha: string;
  dia_semana: DiaSemana | null;
  duracion_min: number | null;
  estado: EstadoSesion;
  bloques: BloqueSesion[];
  /** Rutas de Storage (bucket "adjuntos") de imágenes/recursos a tener en cuenta en el entreno. */
  adjuntos: string[];
  valoracion: number | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

export type EjerciciosRow = {
  id: UUID;
  equipo_id: UUID;
  nombre: string;
  categoria: string | null;
  contenido: string[];
  jugadores_min: number | null;
  jugadores_max: number | null;
  espacio: string | null;
  material: string | null;
  duracion_min: number | null;
  dificultad: string | null;
  descripcion: string | null;
  organizacion: string | null;
  reglas: string | null;
  consignas: string | null;
  progresion: string | null;
  regresion: string | null;
  errores_frecuentes: string | null;
  correcciones: string | null;
  transferencia_partido: string | null;
  favorito: boolean;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

export type JugadoresRow = {
  id: UUID;
  equipo_id: UUID;
  nombre: string;
  año_nacimiento: number | null;
  dorsal: number | null;
  puesto: string | null;
  puestos_secundarios: string[];
  nivel_actual: string | null;
  fortalezas: string | null;
  aspectos_a_mejorar: string | null;
  objetivo_individual: string | null;
  ficha_oficial_url: string | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

/** Toques que siguen viviendo en `estadisticas.eventos` (jsonb) tras
 * 0017_eventos.sql — no son "contadores" con equivalente en la tabla
 * `eventos`: son matices (7m provocado/cometido) o estado ligado al
 * cronómetro (entra/sale de pista, para derivar minutos jugados). */
export type TipoEventoPartido = "siete_provocado" | "siete_cometido" | "entra_pista" | "sale_pista";

export type EventoPartido = {
  id: UUID;
  tipo: TipoEventoPartido;
  /** Jugador/a al que se atribuye la acción; null para "sin asignar" o acciones del rival. */
  jugador_id: UUID | null;
  /** Minutos transcurridos de cronómetro en el momento del toque; null si el cronómetro no se había iniciado. */
  minuto: number | null;
  creado_en: string;
};

/** Cronómetro del partido — acumula segundos de la parte en curso, para sobrevivir a recargas/offline. */
export type CronometroPartido = {
  parte: 1 | 2;
  segundosAcumulados: number;
  corriendo: boolean;
  /** ISO de cuándo se pulsó "Reanudar" la última vez; null si está en pausa. */
  ultimaMarca: string | null;
};

export type EstadisticasPartido = {
  eventos?: EventoPartido[];
  cronometro?: CronometroPartido;
};

export type PartidosRow = {
  id: UUID;
  equipo_id: UUID;
  microciclo_id: UUID | null;
  rival: string;
  fecha: string;
  casa_fuera: "casa" | "fuera" | null;
  competicion: string | null;
  resultado: string | null;
  sistema_propio: string | null;
  sistema_rival: string | null;
  estadisticas: EstadisticasPartido;
  problemas_detectados: string | null;
  acciones_siguiente_semana: string | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

export type EquipoOrigenEvento = "propio" | "rival";
export type TipoEvento = "tiro" | "perdida" | "exclusion" | "tarjeta";
export type ResultadoTiro = "gol" | "fuera" | "parado" | "poste";
export type OrigenLanzamiento = "ext_izq" | "lat_izq" | "central" | "lat_der" | "ext_der" | "pivote" | "9m" | "contragolpe" | "7m";
export type ColorTarjeta = "amarilla" | "azul" | "roja";

/** Evento individual de partido/entrenamiento (tabla `eventos`, ver
 * 0017_eventos.sql / 0018_eventos_tarjeta_origen.sql). */
export type EventosRow = {
  id: UUID;
  equipo_id: UUID;
  partido_id: UUID | null;
  sesion_id: UUID | null;
  jugador_id: UUID | null;
  equipo_origen: EquipoOrigenEvento;
  tipo: TipoEvento;
  resultado: ResultadoTiro | null;
  /** Zona de portería 1-9 (rejilla 3x3) — a dónde entra/para el tiro. Null:
   * zona desconocida (histórico) o tipo != 'tiro'. */
  zona: number | null;
  /** Desde dónde se lanzó. Null: histórico anterior a esta columna, puesto
   * del jugador sin mapeo conocido, o tipo != 'tiro'. */
  origen: OrigenLanzamiento | null;
  es_penalti: boolean;
  /** Solo tipo='tarjeta'. */
  color_tarjeta: ColorTarjeta | null;
  creado_en: string;
};

export type MotivoAusencia = "justificado" | "injustificado" | "lesion";

export type AsistenciaRow = {
  id: UUID;
  equipo_id: UUID;
  jugador_id: UUID;
  sesion_id: UUID | null;
  partido_id: UUID | null;
  presente: boolean;
  motivo_ausencia: MotivoAusencia | null;
  notas_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

// `OptionalInsert` lista las columnas que en supabase/migrations/0001_init_schema.sql
// (y 0004 para `asistencia`) son NULLABLE o tienen DEFAULT — por tanto pueden
// omitirse en un `.insert()`. Cualquier columna NOT NULL sin DEFAULT queda fuera
// de esa lista y por tanto es obligatoria en `Insert`, para que un `.insert()`
// incompleto falle en tiempo de compilación en vez de en runtime contra Postgres.
type TableDef<
  Row extends Record<string, unknown>,
  OptionalInsert extends keyof Row = never,
> = {
  Row: Row;
  Insert: Omit<Row, OptionalInsert> & Partial<Pick<Row, OptionalInsert>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      equipos: TableDef<EquiposRow, "id" | "fichas_oficiales_url" | "created_at" | "updated_at">;
      entrenadores: TableDef<EntrenadoresRow, "id" | "created_at" | "updated_at">;
      entrenadores_equipos: TableDef<EntrenadoresEquiposRow, "created_at">;
      invitaciones_equipo: TableDef<
        InvitacionesEquipoRow,
        "id" | "creado_en" | "expira_en" | "usado" | "usado_por"
      >;
      periodos: TableDef<
        PeriodosRow,
        | "id"
        | "fecha_inicio"
        | "fecha_fin"
        | "tipo"
        | "contenido_ataque"
        | "contenido_defensa"
        | "contenido_contraataque"
        | "contenido_repliegue"
        | "contenido_portero"
        | "objetivo_general"
        | "notas_adicionales"
        | "created_at"
        | "updated_at"
      >;
      mesociclos: TableDef<
        MesociclosRow,
        "id" | "periodo_id" | "objetivo" | "notas_adicionales" | "created_at" | "updated_at"
      >;
      microciclos: TableDef<
        MicrociclosRow,
        | "id"
        | "mesociclo_id"
        | "semana"
        | "fecha_inicio"
        | "fecha_fin"
        | "rival"
        | "competicion"
        | "contenidos"
        | "objetivo"
        | "notas_adicionales"
        | "created_at"
        | "updated_at"
      >;
      horario_recurrente: TableDef<
        HorarioRecurrenteRow,
        "id" | "notas_adicionales" | "created_at" | "updated_at"
      >;
      sesiones: TableDef<
        SesionesRow,
        | "id"
        | "microciclo_id"
        | "dia_semana"
        | "duracion_min"
        | "estado"
        | "bloques"
        | "valoracion"
        | "notas_adicionales"
        | "created_at"
        | "updated_at"
      >;
      ejercicios: TableDef<
        EjerciciosRow,
        | "id"
        | "categoria"
        | "contenido"
        | "jugadores_min"
        | "jugadores_max"
        | "espacio"
        | "material"
        | "duracion_min"
        | "dificultad"
        | "descripcion"
        | "organizacion"
        | "reglas"
        | "consignas"
        | "progresion"
        | "regresion"
        | "errores_frecuentes"
        | "correcciones"
        | "transferencia_partido"
        | "favorito"
        | "notas_adicionales"
        | "created_at"
        | "updated_at"
      >;
      jugadores: TableDef<
        JugadoresRow,
        | "id"
        | "año_nacimiento"
        | "dorsal"
        | "puesto"
        | "puestos_secundarios"
        | "nivel_actual"
        | "fortalezas"
        | "aspectos_a_mejorar"
        | "objetivo_individual"
        | "ficha_oficial_url"
        | "notas_adicionales"
        | "created_at"
        | "updated_at"
      >;
      partidos: TableDef<
        PartidosRow,
        | "id"
        | "microciclo_id"
        | "casa_fuera"
        | "competicion"
        | "resultado"
        | "sistema_propio"
        | "sistema_rival"
        | "estadisticas"
        | "problemas_detectados"
        | "acciones_siguiente_semana"
        | "notas_adicionales"
        | "created_at"
        | "updated_at"
      >;
      asistencia: TableDef<
        AsistenciaRow,
        "id" | "sesion_id" | "partido_id" | "presente" | "notas_adicionales" | "created_at" | "updated_at"
      >;
      eventos: TableDef<
        EventosRow,
        "id" | "partido_id" | "sesion_id" | "jugador_id" | "resultado" | "zona" | "origen" | "es_penalti" | "color_tarjeta" | "creado_en"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      // RPC de 0014_crear_equipo.sql — crea el equipo y vincula al que llama
      // (resuelto por auth.uid() en el servidor) de forma atómica.
      crear_equipo: {
        Args: { p_nombre: string; p_temporada: string };
        Returns: UUID;
      };
      // RPCs de 0015_invitaciones_equipo.sql — únicas vías de escritura sobre
      // `invitaciones_equipo`/vinculación por invitación (ver esa tabla).
      crear_invitacion: {
        Args: { p_equipo_id: string };
        Returns: string;
      };
      canjear_invitacion: {
        Args: { p_codigo: string };
        Returns: UUID;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
