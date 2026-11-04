import { Navigate, Route, Routes } from "react-router-dom";
import { copy } from "./copy";
import { CaregiverDashboard } from "./pages/caregiver/Dashboard";
import { ComingSoon } from "./pages/patient/ComingSoon";
import { PatientHome } from "./pages/patient/Home";
import { Start } from "./pages/Start";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Start />} />

      <Route path="/patient" element={<PatientHome />} />
      <Route path="/patient/games" element={<ComingSoon title={copy.games.title} message={copy.games.comingSoon} />} />
      <Route
        path="/patient/reminders"
        element={<ComingSoon title={copy.reminders.title} message={copy.reminders.comingSoon} />}
      />
      <Route
        path="/patient/who-is-this"
        element={<ComingSoon title={copy.whoIsThis.title} message={copy.whoIsThis.comingSoon} />}
      />
      <Route path="/patient/voice" element={<ComingSoon title={copy.voiceTask.title} message={copy.voiceTask.comingSoon} />} />

      <Route path="/caregiver" element={<CaregiverDashboard />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
