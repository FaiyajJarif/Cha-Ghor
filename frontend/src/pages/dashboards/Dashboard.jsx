import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import WorkerDashboard from "./WorkerDashboard";

// Renders the right dashboard for the signed-in user's role.
//
// Admin  -> the admin console at /admin
// Supervisor -> the supervisor console at /supervisor
// Worker -> the placeholder dashboard here, until the worker screens are built
//
// The old 30-line SupervisorDashboard stub in this folder is no longer
// rendered; the real one lives at pages/supervisor/SupervisorDashboard.jsx.
export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  if (user?.role === "supervisor") return <Navigate to="/supervisor" replace />;
  return <WorkerDashboard />;
}
