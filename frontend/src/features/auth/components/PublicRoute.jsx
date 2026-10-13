import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth.js";
import AuthLoader from "./AuthLoader.jsx";

// Login/register stay reachable for guests; once authenticated the user is sent
// to the page they originally asked for. This also runs right after login, so it
// must honour `from` too.
function PublicRoute() {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <AuthLoader />;
  if (user) return <Navigate to={location.state?.from?.pathname ?? "/"} replace />;

  return <Outlet />;
}

export default PublicRoute;
