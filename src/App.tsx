import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthGate } from "@/components/auth/AuthGate";
import { PwaUpdateBanner } from "@/components/layout/PwaUpdateBanner";
import { EquipoLayout } from "@/components/layout/EquipoLayout";
import { SharedPartidoPage } from "@/pages/SharedPartidoPage";
import { TeamSelectPage } from "@/pages/TeamSelectPage";
import { UnirseEquipoPage } from "@/pages/UnirseEquipoPage";
import { InicioPage } from "@/pages/InicioPage";
import { CalendarioPage } from "@/pages/CalendarioPage";
import { EntrenamientoDetailPage } from "@/pages/EntrenamientoDetailPage";
import { SesionDetailPage } from "@/pages/SesionDetailPage";
import { EjerciciosPage } from "@/pages/EjerciciosPage";
import { EjercicioDetailPage } from "@/pages/EjercicioDetailPage";
import { ModeloJuegoPage } from "@/pages/ModeloJuegoPage";
import { EquipoPage } from "@/pages/EquipoPage";
import { JugadorDetailPage } from "@/pages/JugadorDetailPage";
import { PartidoPage } from "@/pages/PartidoPage";
import { PartidoDetailPage } from "@/pages/PartidoDetailPage";
import { RivalesPage } from "@/pages/RivalesPage";
import { RivalDetailPage } from "@/pages/RivalDetailPage";
import { ProgresoPage } from "@/pages/ProgresoPage";
import { AjustesPage } from "@/pages/AjustesPage";

/** Árbol de rutas que sí requieren sesión — sin cambios respecto al que
 * existía antes de introducir la ruta pública `/compartido/:token`. Vive en
 * su propio `<Routes>` (no anidado como hijos directos de una `<Route>`)
 * para poder envolverlo en `<AuthGate>` sin afectar a esa ruta pública. */
function AppAutenticada() {
  return (
    <Routes>
      <Route path="/" element={<TeamSelectPage />} />
      <Route path="/unirse/:codigo" element={<UnirseEquipoPage />} />
      <Route path="/equipos/:equipoId" element={<EquipoLayout />}>
        <Route index element={<Navigate to="inicio" replace />} />
        <Route path="inicio" element={<InicioPage />} />
        <Route path="calendario" element={<CalendarioPage />} />
        <Route path="calendario/:fecha" element={<EntrenamientoDetailPage />} />
        <Route path="sesion/:sesionId" element={<SesionDetailPage />} />
        <Route path="equipo" element={<EquipoPage />} />
        <Route path="jugador/:jugadorId" element={<JugadorDetailPage />} />
        <Route path="partido" element={<PartidoPage />} />
        <Route path="partido/:partidoId" element={<PartidoDetailPage />} />
        <Route path="rivales" element={<RivalesPage />} />
        <Route path="rivales/:rivalId" element={<RivalDetailPage />} />
        <Route path="modelo-juego" element={<ModeloJuegoPage />} />
        <Route path="ejercicios" element={<EjerciciosPage />} />
        <Route path="ejercicios/:ejercicioId" element={<EjercicioDetailPage />} />
        <Route path="progreso" element={<ProgresoPage />} />
        <Route path="ajustes" element={<AjustesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PwaUpdateBanner />
      <Routes>
        <Route path="/compartido/:token" element={<SharedPartidoPage />} />
        <Route
          path="/*"
          element={
            <AuthGate>
              <AppAutenticada />
            </AuthGate>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
