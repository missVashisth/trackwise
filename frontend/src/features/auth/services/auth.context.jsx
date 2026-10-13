// State layer: holds auth state and exposes raw setters. The only API call
// here is the one-time session check on mount, so routes know who is logged in.

import { createContext, useEffect, useMemo, useRef, useState } from "react";
import { getMe, updateTimezone } from "./auth.api.js";
import { browserTimeZone } from "../../../lib/date.js";
import { setUnauthorizedHandler } from "../../../lib/http.js";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // The form field the error is about (e.g. "username"), when the API named one.
  const [errorField, setErrorField] = useState(null);
  // Why the user was signed out (shown once on the login page), e.g. an expired session.
  const [notice, setNotice] = useState(null);
  const userRef = useRef(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Dropping the user lets ProtectedRoute send them to /login (and back here after signing in).
  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      if (userRef.current) {
        setNotice(reason === "expired" ? "Your session has expired. Please sign in again." : "You've been signed out. Please sign in again.");
      }
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        // A restored session keeps the zone saved at last login; sync it if this device differs.
        const zone = browserTimeZone();
        if (zone && data.user?.timezone && zone !== data.user.timezone) {
          updateTimezone(zone)
            .then(() => !cancelled && setUser((u) => (u ? { ...u, timezone: zone } : u)))
            .catch(() => {});
        }
      })
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setInitializing(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      initializing,
      loading,
      setLoading,
      error,
      setError,
      errorField,
      setErrorField,
      notice,
      setNotice,
    }),
    [user, initializing, loading, error, errorField, notice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
