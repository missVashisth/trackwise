// What users see when things go wrong, and cross-feature regressions.
import { test, expect, signUp, api, createGoal, expectNoTechnicalText, uniqueName } from "./fixtures.js";

test.describe("errors users can see", () => {
  test("offline: a friendly message with a way to retry once the connection is back", async ({ page, context }) => {
    await signUp(page);
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "My Goals" })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("link", { name: "Habits" }).click();
    await expect(page.getByText("We couldn't connect to the server. Check your internet connection and try again.").first()).toBeVisible();
    await expectNoTechnicalText(page);

    await context.setOffline(false);
    await page.getByRole("button", { name: "Retry" }).first().click();
    await expect(page.getByRole("heading", { name: "No habits yet" })).toBeVisible();
  });

  test("a proxy error page (HTML 502) and a leaky server error body are never shown raw", async ({ page }) => {
    page.expectApiErrors({ status: 502, path: /^\/habits$/ }, { status: 500, path: /^\/insights\/overview$/ });
    await signUp(page);
    await page.route("**/api/habits?*", (route) =>
      route.fulfill({ status: 502, contentType: "text/html", body: "<html><body><h1>502 Bad Gateway</h1>nginx/1.25</body></html>" }),
    );
    await page.goto("/habits");
    await expect(page.getByText("Something went wrong on our side. Please try again in a moment.").first()).toBeVisible();
    await expect(page.getByText(/nginx|Bad Gateway/)).toHaveCount(0);

    // A server that (wrongly) puts internals into its error body: the UI still shows its own words.
    await page.route("**/api/insights/overview*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "MongoServerError: E11000 duplicate key at Object.<anonymous> (/srv/app/insights.js:12)" }) }),
    );
    await page.goto("/insights");
    await expect(page.getByText("Something went wrong on our side. Please try again in a moment.").first()).toBeVisible();
    await expectNoTechnicalText(page);
  });

  test("too many sign-in attempts are explained without revealing anything", async ({ page, control }) => {
    page.expectApiErrors({ status: 400, path: /^\/auth\/login$/ }, { status: 429, path: /^\/auth\/login$/ });
    await control.resetRateLimits();
    const { email } = await signUp(page);
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    for (let i = 0; i < 10; i++) {
      await page.getByLabel("Password").fill(`wrong-${i}`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
    }
    await page.getByLabel("Password").fill("secret12");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("Too many sign-in attempts. Please wait a few minutes and try again.");
    await control.resetRateLimits();
  });

  test("a slow server shows loading states, not errors", async ({ page }) => {
    await signUp(page);
    await page.route("**/api/goals", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/goals");
    await expect(page.getByText("Loading your goals…")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No goals yet" })).toBeVisible();
  });
});

test.describe("cross-feature regressions", () => {
  test("goals, habits, tasks and insights work together; direct links and refresh work everywhere", async ({ page }) => {
    await signUp(page);
    const { goal } = await createGoal(page, { title: "Write a novel", totalDays: 10, tasks: ["Write 500 words"] });
    const habit = (await api(page, "POST", "/habits", { title: "Read", schedule: { type: "daily" }, trackingMethod: "checkbox" })).body.habit;

    await page.goto("/today");
    await page.getByRole("checkbox", { name: /Write 500 words/ }).click();
    await expect(page.getByText("1 of 1 done today")).toBeVisible();

    const overview = await api(page, "GET", "/insights/overview?period=week");
    expect(overview.status).toBe(200);
    expect(overview.body.summary.goals.averageProgressActive).toBeGreaterThan(0);

    for (const [path, check] of [
      ["/goals", page.getByText("Write a novel").first()],
      [`/goals/${goal._id}`, page.getByRole("heading", { name: "Write a novel", level: 1 })],
      [`/goals/${goal._id}?tab=progress`, page.getByRole("tab", { name: "Progress", selected: true })],
      ["/habits", page.getByRole("link", { name: "Read" })],
      [`/habits/${habit._id}`, page.getByRole("heading", { name: "Read", level: 1 })],
      ["/insights?period=month", page.getByRole("button", { name: "Month", pressed: true })],
      [`/insights/goals/${goal._id}?period=week`, page.getByRole("heading", { name: "Write a novel" })],
      [`/insights/habits/${habit._id}?period=week`, page.getByRole("heading", { name: "Read" })],
      ["/insights/patterns", page.getByRole("link", { name: "My Patterns" })],
      ["/today", page.getByText("1 of 1 done today")],
      ["/completed", page.getByRole("heading", { level: 1 })],
    ]) {
      await page.goto(path);
      await expect(check, path).toBeVisible();
      await page.reload();
      await expect(check, `${path} after refresh`).toBeVisible();
    }
    await expectNoTechnicalText(page);
  });

  test("logging out and signing in as someone else never shows the previous account's data", async ({ page }) => {
    const alice = await signUp(page, { username: uniqueName("alice") });
    await createGoal(page, { title: "Alice private goal", tasks: ["Alice task"] });
    await api(page, "POST", "/habits", { title: "Alice habit", schedule: { type: "daily" }, trackingMethod: "checkbox" });
    await page.goto("/today");
    await expect(page.getByRole("button", { name: "Alice task" })).toBeVisible(); // collapsed "All goals" copies are hidden

    await page.getByRole("button", { name: new RegExp(alice.username) }).click();
    await page.getByRole("menuitem", { name: "Log out" }).or(page.getByRole("button", { name: "Log out" })).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/Alice/)).toHaveCount(0);

    const bob = { username: uniqueName("bob") };
    await page.goto("/register");
    await page.getByLabel("Username").fill(bob.username);
    await page.getByLabel("Email").fill(`${bob.username}@example.com`);
    await page.getByLabel("Password").fill("secret12");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/goals$/);
    for (const path of ["/goals", "/today", "/habits", "/insights"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(/Alice/)).toHaveCount(0);
    }
  });

  test("an AI roadmap's tasks work with the normal task tracking", async ({ page }) => {
    await signUp(page);
    await page.goto("/goals");
    await page.getByRole("button", { name: "AI roadmap" }).click();
    const dialog = page.getByRole("dialog", { name: "New goal with an AI roadmap" });
    await dialog.getByLabel("Goal", { exact: true }).fill("Learn guitar");
    await dialog.getByLabel("Custom number of days").fill("5");
    await dialog.getByRole("button", { name: "Generate roadmap" }).click();
    await dialog.getByRole("button", { name: "No, use this roadmap" }).click();
    await dialog.getByRole("button", { name: /Confirm/ }).click();
    await expect(page).toHaveURL(/\?tab=roadmap$/);
    const goalId = page.url().match(/goals\/([a-f0-9]{24})/)[1];

    await page.goto("/today");
    const first = page.getByRole("checkbox", { name: /Day 1: study Learn guitar/ });
    await first.click();
    await expect.poll(async () => (await api(page, "GET", `/goals/${goalId}/roadmap`)).body.progress.roadmap.completed).toBe(1);
    const progress = (await api(page, "GET", `/goals/${goalId}`)).body.goal.progress.overall;
    expect(progress).toBeCloseTo(10, 0); // 1 of 10 roadmap tasks
  });
});
