import { useEffect, useState } from "react";
import AuthLayout from "../components/AuthLayout.jsx";
import AuthInput from "../components/AuthInput.jsx";
import AuthButton from "../components/AuthButton.jsx";
import { useAuth } from "../hooks/useAuth.js";

function Register() {
  const { register, loading, error, errorField, clearError } = useAuth();
  // A message about one field is shown under that field instead of above the form.
  const fieldError = (name) => (errorField === name ? error : null);
  const [form, setForm] = useState({ username: "", email: "", password: "" });

  useEffect(() => {
    clearError();
  }, [clearError]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    register(form);
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start turning goals into progress."
      error={errorField ? null : error}
      footerText="Already have an account?"
      footerLinkText="Sign in"
      footerTo="/login"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthInput
          label="Username"
          type="text"
          name="username"
          value={form.username}
          error={fieldError("username")}
          onChange={handleChange}
          placeholder="anshu_sharma"
          autoComplete="username"
          minLength={3}
          required
        />
        <AuthInput
          label="Email"
          type="email"
          name="email"
          value={form.email}
          error={fieldError("email")}
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
          error={fieldError("password")}
          onChange={handleChange}
          placeholder="At least 6 characters"
          autoComplete="new-password"
          minLength={6}
          required
        />
        <AuthButton loading={loading}>
          {loading ? "Creating account..." : "Create account"}
        </AuthButton>
      </form>
    </AuthLayout>
  );
}

export default Register;
