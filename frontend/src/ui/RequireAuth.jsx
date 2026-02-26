import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

export default function RequireAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
