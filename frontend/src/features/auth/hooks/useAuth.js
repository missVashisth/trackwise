// Hooks layer: glues the API layer to the state layer and exposes
// simple actions (login, register) for the UI to call.

import { useCallback, useContext } from "react";
import { useLocation, useNavigate } from "react-router";
import { AuthContext } from "../services/auth.context.jsx";
import { loginUser, logoutUser, registerUser } from "../services/auth.api.js";
import { errorMessage } from "../../../lib/errors.js";

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }

  const { user, setUser, initializing, loading, setLoading, error, setError, errorField, setErrorField, notice, setNotice } =
    context;
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from?.pathname ?? "/";

  const runAuthAction = useCallback(
    async (apiCall, payload) => {
      setLoading(true);
      setError(null);
      setErrorField(null);
      setNotice(null);
      try {
        const data = await apiCall(payload);
        setUser(data.user);
        navigate(redirectTo, { replace: true });
        return data;
      } catch (err) {
        setError(errorMessage(err));
        setErrorField(err?.field ?? null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [navigate, redirectTo, setError, setErrorField, setLoading, setUser, setNotice],
  );

  const login = useCallback(
    (credentials) => runAuthAction(loginUser, credentials),
    [runAuthAction],
  );

  const register = useCallback(
    (details) => runAuthAction(registerUser, details),
    [runAuthAction],
  );

  const clearError = useCallback(() => {
    setError(null);
    setErrorField(null);
  }, [setError, setErrorField]);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      setUser(null);
      navigate("/login", { replace: true });
    }
  }, [navigate, setUser]);

  return { user, initializing, loading, error, errorField, notice, login, register, logout, clearError };
}
