import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { RequireRole, RootRedirect } from "./auth/RequireRole";
import { copy } from "./copy";
import { CaregiverDashboard } from "./pages/caregiver/Dashboard";
import { Login } from "./pages/Login";
import { ComingSoon } from "./pages/patient/ComingSoon";
import { PatientHome } from "./pages/patient/Home";
import { Register } from "./pages/Register";

const patient = (element: ReactNode) => <RequireRole role="patient">{element}</RequireRole>;
const caregiver = (element: ReactNode) => <RequireRole role="caregiver">{element}</RequireRole>;

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/patient" element={patient(<PatientHome />)} />
      <Route
        path="/patient/games"
        element={patient(<ComingSoon title={copy.games.title} message={copy.games.comingSoon} />)}
      />
      <Route
        path="/patient/reminders"
        element={patient(<ComingSoon title={copy.reminders.title} message={copy.reminders.comingSoon} />)}
      />
      <Route
        path="/patient/who-is-this"
        element={patient(<ComingSoon title={copy.whoIsThis.title} message={copy.whoIsThis.comingSoon} />)}
      />
      <Route
        path="/patient/voice"
        element={patient(<ComingSoon title={copy.voiceTask.title} message={copy.voiceTask.comingSoon} />)}
      />

      <Route path="/caregiver" element={caregiver(<CaregiverDashboard />)} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
