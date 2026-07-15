import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

export default function RequireAdmin() {
  const { user } = useAuth();
  if (!user?.is_admin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
