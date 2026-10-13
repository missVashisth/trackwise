import { test, expect, signUp, uniqueName, API, expectNoTechnicalText } from "./fixtures.js";

test.describe("authentication", () => {
  test("register with valid details lands on the goals page and survives a refresh", async ({ page }) => {
    const username = uniqueName("reg");
    await page.goto("/register");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Email").fill(`${username}@example.com`);
    await page.getByLabel("Password").fill("secret12");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByRole("heading", { name: "My Goals" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "My Goals" })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(username) })).toBeVisible();
  });

  test("registration problems are explained next to the right field", async ({ page }) => {
    page.expectApiErrors({ status: 400, path: /^\/auth\/register$/ });
    await page.goto("/register");
    // The browser's own checks stop obviously short values before any request is sent.
    let requests = 0;
    page.on("request", (r) => r.url().endsWith("/auth/register") && requests++);
    await page.getByLabel("Username").fill("ab");
    await page.getByLabel("Email").fill(`${uniqueName("short")}@example.com`);
    await page.getByLabel("Password").fill("123");
    await page.getByRole("button", { name: "Create account" }).click();
    expect(await page.getByLabel("Username").evaluate((el) => el.validity.tooShort)).toBe(true);
    expect(await page.getByLabel("Password").evaluate((el) => el.validity.tooShort)).toBe(true);
    expect(requests).toBe(0);

    // The server's rule (trimmed username) is shown under the field it is about.
    await page.getByLabel("Username").fill(" ab ");
    await page.getByLabel("Password").fill("secret12");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Username must be at least 3 characters.")).toBeVisible();
    await expect(page.getByLabel("Username")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert")).toHaveCount(0); // not repeated above the form
    await expect(page).toHaveURL(/\/register$/);
    await expectNoTechnicalText(page);
  });

  test("a duplicate email is refused with a clear message", async ({ page }) => {
    page.expectApiErrors({ status: 400, path: /^\/auth\/register$/ });
    const { username, email } = await signUp(page);
    await page.context().clearCookies();
    await page.goto("/register");
    await page.getByLabel("Username").fill(`${username}x`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("secret12");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert")).toHaveText(/already exists/i);
    await expect(page).toHaveURL(/\/register$/);
  });

  test("wrong credentials get one friendly message, the same for unknown accounts", async ({ page }) => {
    page.expectApiErrors({ status: 400, path: /^\/auth\/login$/ });
    const { email } = await signUp(page);
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("The email or password is incorrect.");

    await page.getByLabel("Email").fill(`${uniqueName("ghost")}@example.com`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("The email or password is incorrect.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("login, then logout invalidates the session for the UI and the API", async ({ page }) => {
    page.expectApiErrors({ status: 401, path: /^\/(auth\/get-me|goals|notifications.*)$/ });
    const { email, password } = await signUp(page);
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/goals$/);

    const cookie = (await page.context().cookies()).find((c) => c.name === "token");
    expect(cookie?.httpOnly).toBe(true);

    await page.getByRole("button", { name: new RegExp(email.split("@")[0]) }).click();
    await page.getByRole("menuitem", { name: "Log out" }).or(page.getByRole("button", { name: "Log out" })).click();
    await expect(page).toHaveURL(/\/login$/);

    // The old token no longer works, even if replayed.
    const replay = await page.request.get(`${API}/goals`, { headers: { Cookie: `token=${cookie.value}` } });
    expect(replay.status()).toBe(401);

    await page.goto("/goals");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("protected pages redirect to login and come back after signing in", async ({ page }) => {
    page.expectApiErrors({ status: 401, path: /^\/auth\/get-me$/ });
    const { email, password } = await signUp(page);
    await page.context().clearCookies();
    for (const path of ["/goals", "/habits", "/insights", "/today"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    await page.goto("/habits");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/habits$/);
  });

  test("protected APIs refuse requests without a valid session", async ({ request }) => {
    for (const path of ["/goals", "/habits", "/insights/overview", "/notifications", "/tasks"]) {
      const res = await request.get(`${API}${path}`);
      expect(res.status(), path).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("UNAUTHENTICATED");
      expect(JSON.stringify(body)).not.toMatch(/jwt|signature|stack/i);
    }
    const forged = await request.get(`${API}/goals`, { headers: { Cookie: "token=not.a.jwt" } });
    expect(forged.status()).toBe(401);
  });

  test("an expired session sends the user to sign in with an explanation", async ({ page, control }) => {
    page.expectApiErrors({ status: 401, path: /^\/(goals|life-areas|tasks|habits|notifications.*)$/ });
    const { email } = await signUp(page);
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "My Goals" })).toBeVisible();

    // Swap the cookie for a correctly signed but expired session, then trigger a data request.
    const token = await control.expiredToken(email);
    await page.context().addCookies([{ name: "token", value: token, url: "http://127.0.0.1:3100" }]);
    await page.getByRole("link", { name: "Habits" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("status")).toHaveText("Your session has expired. Please sign in again.");
    await expectNoTechnicalText(page);
  });

  test("password reset: request, use the link once, then sign in with the new password", async ({ page, control }) => {
    page.expectApiErrors({ status: 400, path: /^\/auth\/(reset-password|login)$/ });
    const { email } = await signUp(page);
    await page.context().clearCookies();

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /send|reset/i }).click();
    await expect(page.getByText(/If an account exists/)).toBeVisible();

    await expect.poll(async () => (await control.emails()).filter((d) => d.type === "PASSWORD_RESET").length).toBeGreaterThan(0);
    const resetUrl = (await control.emails()).filter((d) => d.type === "PASSWORD_RESET").at(-1).resetUrl;
    const link = new URL(resetUrl);
    expect(link.hash).toMatch(/^#token=[a-f0-9]{64}$/);

    await page.goto(`/reset-password${link.hash}`);
    await expect(page).toHaveURL(/\/reset-password$/); // token removed from the address bar
    await page.getByLabel("New password", { exact: true }).fill("newpass123");
    await page.getByLabel("Confirm new password").fill("newpass123");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    // The same link cannot be used twice (fresh page load, as when the email link is clicked again).
    await page.goto("about:blank");
    await page.goto(`/reset-password${link.hash}`);
    await page.getByLabel("New password", { exact: true }).fill("another123");
    await page.getByLabel("Confirm new password").fill("another123");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("alert")).toHaveText(/invalid or has expired/i);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("secret12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("The email or password is incorrect.");
    await page.getByLabel("Password").fill("newpass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/goals$/);
  });

  test("expired and malformed reset links are explained, and a missing token is handled", async ({ page, control }) => {
    page.expectApiErrors({ status: 400, path: /^\/auth\/reset-password$/ });
    const { email } = await signUp(page);
    await page.context().clearCookies();
    await page.request.post(`${API}/auth/forgot-password`, { data: { email } });
    await expect.poll(async () => (await control.emails()).filter((d) => d.type === "PASSWORD_RESET" && d.resetUrl).length).toBeGreaterThan(0);
    const all = (await control.emails()).filter((d) => d.type === "PASSWORD_RESET");
    const hash = new URL(all.at(-1).resetUrl).hash;
    await control.expireResetToken(email);

    await page.goto(`/reset-password${hash}`);
    await page.getByLabel("New password", { exact: true }).fill("newpass123");
    await page.getByLabel("Confirm new password").fill("newpass123");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("alert")).toHaveText(/invalid or has expired/i);

    await page.goto("about:blank");
    await page.goto("/reset-password#token=not-a-real-token");
    await page.getByLabel("New password", { exact: true }).fill("newpass123");
    await page.getByLabel("Confirm new password").fill("newpass123");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("alert")).toHaveText(/invalid or has expired/i);

    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Reset link missing" })).toBeVisible();
    await expectNoTechnicalText(page);
  });
});
