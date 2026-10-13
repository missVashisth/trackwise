// Shared Playwright fixtures for the isolated e2e stack (see playwright.config.js).
//
// Every test automatically fails on: uncaught page exceptions, console errors (React warnings
// included), and API responses >= 400 that the test did not declare with `expectApiErrors`.

import { test as base, expect } from "@playwright/test";

export const API = "http://127.0.0.1:3100/api";
const CONTROL = "http://127.0.0.1:3100/__e2e";

// Console noise that is not an application error.
const IGNORED_CONSOLE = [
  /Download the React DevTools/,
  /\[vite\]/,
  // The browser logs every failed fetch; failed API calls are checked separately below.
  /Failed to load resource/,
];

let counter = 0;
export const uniqueName = (prefix = "user") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`.slice(0, 30);

export const test = base.extend({
  // [{ status, path: RegExp }] — API failures this test provokes on purpose.
  expectedApiErrors: [[], { option: true }],

  page: async ({ page }, use, testInfo) => {
    const problems = [];
    // Visiting while signed out: the session check answers 401, which is how the app learns it.
    const allowed = [{ status: 401, path: /^\/auth\/get-me$/ }];
    page.expectApiErrors = (...rules) => allowed.push(...rules);

    page.on("pageerror", (err) => problems.push(`Uncaught exception: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
      problems.push(`Console error: ${text.slice(0, 500)}`);
    });
    page.on("response", (response) => {
      const url = response.url();
      if (!url.startsWith(API) || response.status() < 400) return;
      const path = url.slice(API.length).split("?")[0];
      const ok = allowed.some((rule) => rule.status === response.status() && rule.path.test(path));
      if (!ok) problems.push(`Unexpected API ${response.status()} ${response.request().method()} ${path}`);
    });

    await use(page);

    if (problems.length) {
      await testInfo.attach("browser-problems", { body: problems.join("\n"), contentType: "text/plain" });
      expect(problems, "browser console / uncaught errors / unexpected API failures").toEqual([]);
    }
  },

  /** Test-only controls of the e2e server (fake AI, captured emails...). */
  control: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({ baseURL: `${CONTROL}/` });
    await use({
      setAi: (mode, { times, delayMs } = {}) => ctx.post("ai", { data: { mode, times: times ?? null, delayMs: delayMs ?? 0 } }),
      resetAi: () => ctx.post("ai", { data: { mode: "ok", times: null } }),
      aiCalls: async () => (await (await ctx.get("ai/calls")).json()).calls,
      emails: async () => (await (await ctx.get("emails")).json()).deliveries,
      resetRateLimits: () => ctx.post("rate-limits/reset"),
      expiredToken: async (email) => (await (await ctx.post("expired-token", { data: { email } })).json()).token,
      expireResetToken: (email) => ctx.post("reset-token/expire", { data: { email } }),
      backdateChallenge: async (enrollmentId, daysAgo) => (await ctx.post("challenges/backdate", { data: { enrollmentId, daysAgo } })).json(),
    });
    await ctx.post("ai", { data: { mode: "ok", times: null } });
    await ctx.dispose();
  },
});

export { expect };

/** Creates an account through the API; the session cookie lands in the page's browser context. */
export async function signUp(page, { username = uniqueName(), password = "secret12", timezone = "America/New_York" } = {}) {
  const email = `${username}@example.com`;
  const res = await page.request.post(`${API}/auth/register`, { data: { username, email, password, timezone } });
  expect(res.status(), await res.text()).toBe(201);
  return { username, email, password, user: (await res.json()).user };
}

/** API call as the signed-in user of `page` (shares its cookies). */
export async function api(page, method, path, data) {
  const res = await page.request.fetch(`${API}${path}`, { method, data });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

/** Today's date (YYYY-MM-DD) in the test browser's zone (America/New_York, see config). */
export function todayKey(timeZone = "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function createGoal(page, { title = "Run every day", startDate = todayKey(), totalDays = 30, tasks = [] } = {}) {
  const { status, body } = await api(page, "POST", "/goals", { title, startDate, totalDays, metric: { type: "tasks", target: 100 } });
  expect(status, JSON.stringify(body)).toBe(201);
  const goal = body.goal;
  const created = [];
  for (const task of tasks) {
    const res = await api(page, "POST", `/goals/${goal._id}/tasks`, { title: task, weightage: 1 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    created.push(res.body.task);
  }
  return { goal, tasks: created };
}

/** Asserts no raw technical text is visible anywhere on the page. */
export async function expectNoTechnicalText(page) {
  const text = await page.locator("body").innerText();
  for (const pattern of [/Cast to ObjectId/i, /E11000/, /MongoServer/i, /ValidationError/, /TypeError/, /undefined/, /\bnull\b/, /stack/i, /OPENROUTER/i, /api key/i, /goalId/, /Request failed with status/i, /Internal server error/i, /Failed to fetch/i, /status code \d{3}/i]) {
    expect(text, `page shows technical text matching ${pattern}`).not.toMatch(pattern);
  }
}
