import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Guards a route. Redirects to /login when signed out, or back to /dashboard
// when the signed-in user's role is not allowed here.
export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
