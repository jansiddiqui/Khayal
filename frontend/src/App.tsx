import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { RequireRole, RootRedirect } from "./auth/RequireRole";
import { DemoBanner } from "./components/DemoBanner";
import { RouteSkeleton } from "./ui/PageSkeleton";

/**
 * Every page is its own chunk (React.lazy): a signed-out visitor downloads the app shell and
 * the landing page only, never the games or the caregiver charts.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const Login = page(() => import("./pages/Login"), "Login");
const PairDevice = page(() => import("./pages/PairDevice"), "PairDevice");
const Demo = page(() => import("./pages/Demo"), "Demo");
const JoinPage = page(() => import("./pages/Join"), "JoinPage");
const ResetPasswordPage = page(() => import("./pages/Join"), "ResetPasswordPage");
const InviteOnlyPage = page(() => import("./pages/Join"), "InviteOnlyPage");
const AdminSetupPage = page(() => import("./pages/Join"), "AdminSetupPage");
const Legal = lazy(() => import("./pages/landing/Legal"));

const PatientHome = page(() => import("./pages/patient/Home"), "PatientHome");
const Games = page(() => import("./pages/patient/Games"), "Games");
const MoreGames = page(() => import("./pages/patient/MoreGames"), "MoreGames");
const PlayGame = page(() => import("./pages/patient/PlayGame"), "PlayGame");
const Reminders = page(() => import("./pages/patient/Reminders"), "Reminders");
const WhoIsThis = page(() => import("./pages/patient/WhoIsThis"), "WhoIsThis");
const VoiceTask = page(() => import("./pages/patient/VoiceTask"), "VoiceTask");

const CaregiverDashboard = page(() => import("./pages/caregiver/Dashboard"), "CaregiverDashboard");
const PatientDetail = page(() => import("./pages/caregiver/PatientDetail"), "PatientDetail");
const CaregiverReminders = page(() => import("./pages/caregiver/Reminders"), "CaregiverReminders");
const CaregiverFamily = page(() => import("./pages/caregiver/Family"), "CaregiverFamily");
const CaregiverAccount = page(() => import("./pages/caregiver/Account"), "CaregiverAccount");
const AdminPage = page(() => import("./pages/admin/Admin"), "AdminPage");

const patient = (element: ReactNode) => <RequireRole role="patient">{element}</RequireRole>;
const caregiver = (element: ReactNode) => <RequireRole role="caregiver">{element}</RequireRole>;

export function App() {
  return (
    <>
      <DemoBanner />
      <Suspense fallback={<RouteSkeleton />}>
        <AppRoutes />
      </Suspense>
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/pair" element={<PairDevice />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<InviteOnlyPage />} />
      <Route path="/setup" element={<AdminSetupPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
      <Route path="/share/:token" element={<JoinPage />} />
      <Route path="/reset/:token" element={<ResetPasswordPage />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/privacy" element={<Legal kind="privacy" />} />
      <Route path="/terms" element={<Legal kind="terms" />} />

      <Route path="/patient" element={patient(<PatientHome />)} />
      <Route path="/patient/games" element={patient(<Games />)} />
      <Route path="/patient/games/more" element={patient(<MoreGames />)} />
      <Route path="/patient/games/:gameType" element={patient(<PlayGame />)} />
      <Route path="/patient/reminders" element={patient(<Reminders />)} />
      <Route path="/patient/who-is-this" element={patient(<WhoIsThis />)} />
      <Route path="/patient/voice" element={patient(<VoiceTask />)} />

      <Route path="/caregiver" element={caregiver(<CaregiverDashboard />)} />
      <Route path="/caregiver/account" element={caregiver(<CaregiverAccount />)} />
      <Route path="/caregiver/patients/:patientId" element={caregiver(<PatientDetail />)} />
      <Route path="/caregiver/patients/:patientId/reminders" element={caregiver(<CaregiverReminders />)} />
      <Route path="/caregiver/patients/:patientId/family" element={caregiver(<CaregiverFamily />)} />
      <Route path="/admin" element={caregiver(<AdminPage />)} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
