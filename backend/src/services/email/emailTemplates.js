// Transactional email content. Receives structured data (the stored notification text plus
// a few extras), returns { subject, html, text }. No provider code here.

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const appUrl = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

function layout({ heading, paragraphs, action, footer }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155">${escapeHtml(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">${escapeHtml(action.label)}</a></p>`
    : "";
  const foot = footer ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#64748b">${escapeHtml(footer)}</p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">
<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${escapeHtml(heading)}</h1>${body}${button}${foot}
</div><p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:16px">Goal Tracker</p></div></body></html>`;

  const text = [heading, "", ...paragraphs, ...(action ? ["", `${action.label}: ${action.url}`] : []), ...(footer ? ["", footer] : [])].join("\n");
  return { html, text };
}

const greeting = (username) => (username ? `Hi ${username},` : "Hi,");

const EMAIL_TEMPLATES = {
  PASSWORD_RESET: ({ username, resetUrl, expiresInMinutes }) => ({
    subject: "Reset your Goal Tracker password",
    ...layout({
      heading: "Reset your password",
      paragraphs: [
        greeting(username),
        `We received a request to reset the password for your Goal Tracker account. This link expires in ${expiresInMinutes} minutes and can be used once.`,
      ],
      action: { label: "Choose a new password", url: resetUrl },
      footer: "If you didn't ask for this, you can ignore this email — your password stays the same.",
    }),
  }),

  TASK_REMINDER: ({ username, message }) => ({
    subject: "You still have tasks for today",
    ...layout({
      heading: "Tasks waiting for you",
      paragraphs: [greeting(username), message],
      action: { label: "Open today's tasks", url: `${appUrl()}/today` },
    }),
  }),

  GOAL_COMPLETED: ({ username, title, message }) => ({
    subject: title,
    ...layout({
      heading: title,
      paragraphs: [greeting(username), message],
      action: { label: "See your completed goals", url: `${appUrl()}/completed` },
    }),
  }),
};

/** Falls back to a generic layout around the stored title/message for types without a custom email. */
function renderEmail(type, context) {
  const template = EMAIL_TEMPLATES[type];
  if (template) return template(context);
  return {
    subject: context.title,
    ...layout({ heading: context.title, paragraphs: [greeting(context.username), context.message], action: { label: "Open Goal Tracker", url: appUrl() } }),
  };
}

module.exports = { renderEmail, escapeHtml, appUrl };
