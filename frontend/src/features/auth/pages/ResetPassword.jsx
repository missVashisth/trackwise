import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import AuthLayout from "../components/AuthLayout.jsx";
import AuthInput from "../components/AuthInput.jsx";
import AuthButton from "../components/AuthButton.jsx";
import { resetPassword } from "../services/auth.api.js";
import { errorMessage } from "../../../lib/errors.js";

const MIN_PASSWORD_LENGTH = 6;

// The emailed link is /reset-password#token=…; the fragment never reaches any server.
function readTokenFromHash(hash) {
  return new URLSearchParams(hash.replace(/^#/, "")).get("token") ?? "";
}

function ResetPassword() {
  const location = useLocation();
  const [token] = useState(() => readTokenFromHash(location.hash));
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  // Drop the token from the address bar so it isn't left in history or shared by copy-paste.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (form.password !== form.confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPassword({ token, password: form.password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset link missing" subtitle="Open the link from your email again, or request a new one." footerText="Need a new link?" footerLinkText="Reset password" footerTo="/forgot-password">
        <p className="text-sm text-slate-600">This page only works from the link in a password reset email.</p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You can now sign in with your new password.">
        <Link
          to="/login"
          className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Your other signed-in sessions will be signed out."
      error={error}
      footerText="Link expired?"
      footerLinkText="Request a new one"
      footerTo="/forgot-password"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthInput
          label="New password"
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <AuthInput
          label="Confirm new password"
          type="password"
          name="confirm"
          value={form.confirm}
          onChange={handleChange}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <AuthButton loading={loading}>{loading ? "Saving..." : "Set new password"}</AuthButton>
      </form>
    </AuthLayout>
  );
}

export default ResetPassword;
