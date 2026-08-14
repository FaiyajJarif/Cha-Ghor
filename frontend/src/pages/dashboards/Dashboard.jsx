import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// Sends the signed-in user to their own console. This component renders no UI
// of its own any more — it is purely the fork after login.
//
//   Admin      -> /admin
//   Supervisor -> /supervisor
//   Worker     -> /worker
//
// The stubs that used to live in this folder (SupervisorDashboard,
// WorkerDashboard) are no longer rendered by anything. The real screens are
// under pages/supervisor/ and pages/worker/.
export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  if (user?.role === "supervisor") return <Navigate to="/supervisor" replace />;
  // Workers now have a real console at /worker. Until this line changed, the
  // whole thing was unreachable: a worker signing in still landed on the old
  // placeholder below, so building the screens made no visible difference.
  return <Navigate to="/worker" replace />;
}
