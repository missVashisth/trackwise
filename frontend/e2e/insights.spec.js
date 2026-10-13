import { test, expect, signUp, api, todayKey, createGoal, expectNoTechnicalText } from "./fixtures.js";

const shift = (key, days) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** A daily checkbox habit started 10 days ago and done on exactly 6 of those 10 finished days. */
async function seedKnownHabit(page) {
  const today = todayKey();
  const start = shift(today, -10);
  const res = await api(page, "POST", "/habits", { title: "Stretching", schedule: { type: "daily" }, trackingMethod: "checkbox", startDate: start });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const habit = res.body.habit;
  const doneDays = [0, 1, 2, 4, 6, 8].map((i) => shift(start, i));
  for (const day of doneDays) {
    const log = await api(page, "PUT", `/habits/${habit._id}/logs/${day}`, { completed: true });
    expect(log.status, JSON.stringify(log.body)).toBeLessThan(300);
  }
  return { habit, from: start, to: shift(today, -1) };
}

test.describe("insights", () => {
  test("a new account sees honest empty states, not invented insights", async ({ page }) => {
    await signUp(page);
    await page.goto("/insights");
    await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
    await expect(page.getByText("Nothing is flagged in this period.")).toBeVisible();
    await expect(page.getByText(/Not enough data yet|Not enough history yet/).first()).toBeVisible();
    await page.getByRole("link", { name: "My Patterns" }).click();
    await expect(page.getByText(/Not enough data/i).first()).toBeVisible();
    await expectNoTechnicalText(page);
  });

  test("habit completion matches known records for a custom range", async ({ page }) => {
    await signUp(page);
    const { from, to } = await seedKnownHabit(page);
    await page.goto(`/insights?period=custom&from=${from}&to=${to}`);
    // 6 done of 10 scheduled (finished) days = 60%.
    const habitsCard = page.getByText("Habits", { exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(habitsCard).toContainText("60%");
    await expect(habitsCard).toContainText("6 of 10 scheduled days done");

    const api10 = await api(page, "GET", `/insights/overview?period=custom&from=${from}&to=${to}`);
    expect(api10.status).toBe(200);
    expect(api10.body.summary.habits.completionRate).toBe(60);

    await page.getByRole("link", { name: "Habits" }).last().click();
    await expect(page.getByRole("link", { name: /Stretching/ }).first()).toBeVisible();
    await page.getByRole("link", { name: /Stretching/ }).first().click();
    await expect(page).toHaveURL(/\/insights\/habits\/[a-f0-9]{24}\?period=custom/);
    await expect(page.getByText("60%").first()).toBeVisible();
  });

  test("week, month and custom periods; previous/next navigation keeps the URL in sync", async ({ page }) => {
    await signUp(page);
    await createGoal(page, { title: "Write daily", tasks: ["Write 200 words"] });
    await page.goto("/insights");
    await expect(page.getByRole("button", { name: "Next period" })).toBeDisabled();
    await page.getByRole("button", { name: "Month" }).click();
    await expect(page).toHaveURL(/period=month/);
    await expect(page.getByRole("heading", { name: "Completion over the last 6 months" })).toBeVisible();
    await page.getByRole("button", { name: "Previous period" }).click();
    await expect(page).toHaveURL(/period=month&date=/);
    await expect(page.getByRole("button", { name: "Next period" })).toBeEnabled();
    await page.getByRole("button", { name: "Next period" }).click();
    await expect(page.getByRole("button", { name: "Next period" })).toBeDisabled();

    await page.getByRole("button", { name: "Week" }).click();
    await expect(page.getByRole("heading", { name: "Completion over the last 8 weeks" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("link", { name: "Goals" }).last().click();
    await expect(page.getByText("Write daily").first()).toBeVisible();
  });

  test("invalid custom ranges are refused with an explanation", async ({ page }) => {
    page.expectApiErrors({ status: 400, path: /^\/insights\/overview$/ });
    await signUp(page);
    const today = todayKey();
    await page.goto("/insights");
    await page.getByRole("button", { name: "Custom" }).click();
    await page.getByLabel("From", { exact: true }).fill(today);
    await page.getByLabel("To", { exact: true }).fill(shift(today, -5));
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("The start must be before the end.")).toBeVisible();
    // A hand-edited URL with an impossible range explains itself too.
    await page.goto(`/insights?period=custom&from=${today}&to=${shift(today, -5)}`);
    await expect(page.getByRole("alert")).toBeVisible();
    await expectNoTechnicalText(page);
  });

  test("goal and habit insights: malformed IDs and other users' data are 'not found'", async ({ page, browser }) => {
    page.expectApiErrors({ status: 404, path: /^\/insights\/(goals|habits)\/.+$/ }, { status: 400, path: /^\/insights\/(goals|habits)\/.+$/ });
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);
    const { goal } = await createGoal(otherPage, { title: "Their goal" });
    await other.close();

    await signUp(page);
    for (const path of [`/insights/goals/${goal._id}`, "/insights/goals/not-an-id", "/insights/habits/aaaaaaaaaaaaaaaaaaaaaaaa", "/insights/habits/xyz"]) {
      await page.goto(path);
      await expect(page.getByText(/was not found|not found/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
      await expect(page.getByText("Their goal")).toHaveCount(0);
      await expectNoTechnicalText(page);
    }
  });

  test("charts render with tooltips", async ({ page }) => {
    await signUp(page);
    const { from, to } = await seedKnownHabit(page);
    await page.goto(`/insights?period=custom&from=${from}&to=${to}`);
    await page.getByRole("tab", { name: "Completion" }).click();
    const chart = page.locator(".recharts-wrapper").last();
    await expect(chart).toBeVisible();
    const box = await chart.boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(page.locator(".recharts-tooltip-wrapper").last()).toBeVisible();
  });
});
