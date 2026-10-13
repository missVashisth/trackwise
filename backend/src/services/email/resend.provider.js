const { Resend } = require("resend");

// Resend error names where retrying the same request cannot succeed.
const TRANSIENT_ERRORS = new Set([
  "rate_limit_exceeded",
  "concurrent_idempotent_requests",
  "application_error",
  "internal_server_error",
]);

function createResendProvider({ apiKey, from, client = new Resend(apiKey) }) {
  const { EmailDeliveryError } = require("./email.service");

  return {
    name: "resend",
    async send({ to, subject, html, text, idempotencyKey }) {
      let result;
      try {
        result = await client.emails.send({ from, to, subject, html, text }, idempotencyKey ? { idempotencyKey } : undefined);
      } catch (err) {
        // Network errors, timeouts: the request may never have reached Resend.
        throw new EmailDeliveryError(`Resend request failed: ${err.message}`, { permanent: false, code: "network_error" });
      }

      if (result.error) {
        const { name, message, statusCode } = result.error;
        const transient = TRANSIENT_ERRORS.has(name) || statusCode == null || statusCode >= 500;
        throw new EmailDeliveryError(`Resend ${name}: ${message}`, { permanent: !transient, code: name });
      }

      return { id: result.data?.id ?? null };
    },
  };
}

module.exports = { createResendProvider, TRANSIENT_ERRORS };
