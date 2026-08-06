import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import SupervisorDashboard from "./SupervisorDashboard";
import WorkerDashboard from "./WorkerDashboard";

// Renders the right dashboard for the signed-in user's role.
// Admins get the full admin console at /admin; supervisor/worker keep their
// existing dashboards here.
export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  if (user?.role === "supervisor") return <SupervisorDashboard />;
  return <WorkerDashboard />;
}
