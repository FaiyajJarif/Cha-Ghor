import { Routes, Route } from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import ProtectedRoute from "./components/ProtectedRoute";
import PublicLayout from "./components/PublicLayout";
import Landing from "./pages/Landing";
import Features from "./pages/Features";
import Services from "./pages/Services";
import RoleSelect from "./pages/RoleSelect";
import Login from "./pages/Login";
import Register from "./pages/Register";
import TrackDriver from "./pages/TrackDriver";
import Dashboard from "./pages/dashboards/Dashboard";
import AdminLayout from "./components/admin/AdminLayout";
import SupervisorLayout from "./components/supervisor/SupervisorLayout";
import SupervisorDashboard from "./pages/supervisor/SupervisorDashboard";
import SupervisorAttendance from "./pages/supervisor/SupervisorAttendance";
import SupervisorLeaf from "./pages/supervisor/SupervisorLeaf";
import SupervisorFields from "./pages/supervisor/SupervisorFields";
import SupervisorWeather from "./pages/supervisor/SupervisorWeather";
import SupervisorBroadcast from "./pages/supervisor/SupervisorBroadcast";
import SupervisorSettings from "./pages/supervisor/SupervisorSettings";
import WorkerLayout from "./components/worker/WorkerLayout";
import WorkerProfile from "./pages/worker/WorkerProfile";
import WorkerNotices from "./pages/worker/WorkerNotices";
import WorkerWages from "./pages/worker/WorkerWages";
import WorkerReport from "./pages/worker/WorkerReport";
import WorkerSettings from "./pages/worker/WorkerSettings";
import Overview from "./pages/admin/Overview";
import Workforce from "./pages/admin/Workforce";
import Payroll from "./pages/admin/Payroll";
import Finance from "./pages/admin/Finance";
import Inventory from "./pages/admin/Inventory";
import Loans from "./pages/admin/Loans";
import Reports from "./pages/admin/Reports";
import Complaints from "./pages/admin/Complaints";
import Supply from "./pages/admin/Supply";
import Settings from "./pages/admin/Settings";

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Public marketing pages share the navbar + footer */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/features" element={<Features />} />
          <Route path="/services" element={<Services />} />
        </Route>
        {/* Full-screen pages (no navbar/footer) */}
        <Route path="/role" element={<RoleSelect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* Public driver tracking — no login required; the per-shipment token
            in the URL is the authorization, so this lives OUTSIDE ProtectedRoute */}
        <Route path="/track/:token" element={<TrackDriver />} />
        {/* Protected app — role-aware dashboard for admin / supervisor / worker */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        {/* Admin console — full estate control, admin only */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Overview />} />
          <Route path="workforce" element={<Workforce />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="finance" element={<Finance />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="loans" element={<Loans />} />
          <Route path="reports" element={<Reports />} />
          <Route path="complaints" element={<Complaints />} />
          <Route path="supply" element={<Supply />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Supervisor console — field operations. Admins can open it too, since
            every endpoint it uses already allows both roles and it is useful to
            see what a supervisor sees. */}
        <Route
          path="/supervisor"
          element={
            <ProtectedRoute roles={["supervisor", "admin"]}>
              <SupervisorLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<SupervisorDashboard />} />
          <Route path="attendance" element={<SupervisorAttendance />} />
          <Route path="leaf" element={<SupervisorLeaf />} />
          <Route path="fields" element={<SupervisorFields />} />
          <Route path="weather" element={<SupervisorWeather />} />
          <Route path="broadcast" element={<SupervisorBroadcast />} />
          <Route path="settings" element={<SupervisorSettings />} />
        </Route>

        {/* Worker console — a worker's own data only. Bangla throughout.
            Admin and supervisor may open it, but every endpoint underneath
            resolves the worker from the JWT, so they see their OWN record or a
            clear "not linked to a worker" message — never someone else's. */}
        <Route
          path="/worker"
          element={
            <ProtectedRoute roles={["worker", "supervisor", "admin"]}>
              <WorkerLayout />
            </ProtectedRoute>
          }
        >
          {/* An index route, or /worker renders the shell around an empty
              middle — which is exactly what it did at first. */}
          <Route index element={<WorkerProfile />} />
          <Route path="notices" element={<WorkerNotices />} />
          <Route path="wages" element={<WorkerWages />} />
          <Route path="report" element={<WorkerReport />} />
          <Route path="settings" element={<WorkerSettings />} />
        </Route>
      </Routes>
    </>
  );
}
