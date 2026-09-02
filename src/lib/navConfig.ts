import {
  Home,
  CalendarDays,
  Users,
  Trophy,
  BrainCircuit,
  Dumbbell,
  LineChart,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  path: string; // relativo a /equipos/:equipoId
  icon: LucideIcon;
  /** Visible directamente en la barra inferior móvil (máx. 5). El resto vive bajo "Más". */
  enBarraInferior: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "inicio", label: "Inicio", path: "inicio", icon: Home, enBarraInferior: true },
  { key: "calendario", label: "Calendario", path: "calendario", icon: CalendarDays, enBarraInferior: true },
  { key: "equipo", label: "Equipo", path: "equipo", icon: Users, enBarraInferior: true },
  { key: "partido", label: "Partido", path: "partido", icon: Trophy, enBarraInferior: true },
  { key: "rivales", label: "Rivales", path: "rivales", icon: Shield, enBarraInferior: false },
  { key: "modelo-juego", label: "Modelo de juego", path: "modelo-juego", icon: BrainCircuit, enBarraInferior: false },
  { key: "ejercicios", label: "Ejercicios", path: "ejercicios", icon: Dumbbell, enBarraInferior: false },
  { key: "progreso", label: "Progreso de temporada", path: "progreso", icon: LineChart, enBarraInferior: false },
  { key: "ajustes", label: "Ajustes", path: "ajustes", icon: Settings, enBarraInferior: false },
];
