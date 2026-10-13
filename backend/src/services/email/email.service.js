// The only entry point the rest of the app uses to send email: emailService.send(...).
// Which provider actually sends it (Resend today) is an implementation detail behind this file.

class EmailDeliveryError extends Error {
  /** permanent: retrying cannot help (bad address, bad credentials, provider not configured). */
  constructor(message, { permanent = false, code = "unknown" } = {}) {
    super(message);
    this.name = "EmailDeliveryError";
    this.permanent = permanent;
    this.code = code;
  }
}

const notConfiguredProvider = {
  name: "not-configured",
  async send() {
    throw new EmailDeliveryError("Email provider is not configured (RESEND_API_KEY / EMAIL_FROM missing)", {
      permanent: true,
      code: "not_configured",
    });
  },
};

function createDefaultProvider() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return notConfiguredProvider;
  const { createResendProvider } = require("./resend.provider");
  return createResendProvider({ apiKey, from });
}

let provider = null;

/**
 * @param {{ to: string, subject: string, html: string, text: string, idempotencyKey?: string }} email
 * @returns {Promise<{ id: string|null }>} provider message id
 * @throws {EmailDeliveryError}
 */
async function send(email) {
  if (!email?.to || !email?.subject) {
    throw new EmailDeliveryError("Email needs a recipient and a subject", { permanent: true, code: "invalid_email" });
  }
  provider = provider ?? createDefaultProvider();
  return provider.send(email);
}

module.exports = {
  send,
  EmailDeliveryError,
  /** Tests (or a future provider switch) can swap the provider without touching callers. */
  setEmailProvider: (next) => {
    provider = next;
  },
  resetEmailProvider: () => {
    provider = null;
  },
};
