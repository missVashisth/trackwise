import { useState } from "react";
import AuthLayout from "../components/AuthLayout.jsx";
import AuthInput from "../components/AuthInput.jsx";
import AuthButton from "../components/AuthButton.jsx";
import { requestPasswordReset } from "../services/auth.api.js";
import { errorMessage } from "../../../lib/errors.js";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sentMessage, setSentMessage] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { message } = await requestPasswordReset(email);
      setSentMessage(message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to reset it."
      error={error}
      footerText="Remembered it?"
      footerLinkText="Back to sign in"
      footerTo="/login"
    >
      {sentMessage ? (
        <div role="status" className="flex flex-col gap-2 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Check your inbox</p>
          <p>{sentMessage}</p>
          <p>The link expires soon and can be used once. If it doesn't arrive, check your spam folder.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <AuthInput
            label="Email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <AuthButton loading={loading}>{loading ? "Sending..." : "Send reset link"}</AuthButton>
        </form>
      )}
    </AuthLayout>
  );
}

export default ForgotPassword;
