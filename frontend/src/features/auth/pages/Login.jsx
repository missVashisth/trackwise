import { useEffect, useState } from "react";
import { Link } from "react-router";
import AuthLayout from "../components/AuthLayout.jsx";
import AuthInput from "../components/AuthInput.jsx";
import AuthButton from "../components/AuthButton.jsx";
import { useAuth } from "../hooks/useAuth.js";

function Login() {
  const { login, loading, error, notice, clearError } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });

  useEffect(() => {
    clearError();
  }, [clearError]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    login(form);
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep tracking your goals."
      error={error}
      notice={notice}
      footerText="Don't have an account?"
      footerLinkText="Create one"
      footerTo="/register"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthInput
          label="Email"
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <AuthInput
          label="Password"
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
        <Link to="/forgot-password" className="-mt-2 self-end text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline">
          Forgot password?
        </Link>
        <AuthButton loading={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </AuthButton>
      </form>
    </AuthLayout>
  );
}

export default Login;
