import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth.js";
import AuthLoader from "./AuthLoader.jsx";

function ProtectedRoute() {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <AuthLoader />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
