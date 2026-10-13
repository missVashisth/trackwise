import { test, expect, signUp, api, todayKey, expectNoTechnicalText } from "./fixtures.js";

const READING = { title: "Reading", schedule: { type: "daily" }, trackingMethod: "percentage" };
const MEDITATION = { title: "Meditation", schedule: { type: "daily" }, trackingMethod: "measurable", targetValue: 30, unit: "minutes" };
const GYM = { title: "Gym", schedule: { type: "timesPerWeek", timesPerPeriod: 3 }, trackingMethod: "checkbox" };

async function createHabit(page, body) {
  const res = await api(page, "POST", "/habits", body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.habit;
}

async function logsFor(page, habitId) {
  const { body } = await api(page, "GET", `/habits/${habitId}/logs`);
  return body.days.filter((d) => d.progressPercent !== null && d.progressPercent !== undefined);
}

test.describe("habits", () => {
  test("create a habit with the step-by-step wizard", async ({ page }) => {
    await signUp(page);
    await page.goto("/habits/new");
    // A name is required before moving on.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "What habit do you want to build?" })).toBeVisible();

    await page.getByLabel("Habit name").fill("Evening walk");
    for (let step = 0; step < 6; step++) {
      if (await page.getByRole("button", { name: "Start tracking" }).count()) break;
      await page.getByRole("button", { name: "Continue" }).click();
    }
    await expect(page.getByRole("heading", { name: "Ready to start?" })).toBeVisible();
    await page.getByRole("button", { name: "Start tracking" }).click();
    await expect(page).toHaveURL(/\/habits(\/[a-f0-9]{24})?$/);
    await page.goto("/habits");
    await expect(page.getByRole("link", { name: "Evening walk" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: "Evening walk" })).toBeVisible();
  });

  test("percentage progress: logging again replaces today's value instead of adding", async ({ page }) => {
    await signUp(page);
    const habit = await createHabit(page, READING);
    await page.goto("/habits");
    const card = page.getByRole("article").filter({ hasText: "Reading" });
    await card.getByRole("spinbutton", { name: "Progress in percent" }).fill("40");
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText(/40%|Partly done/).first()).toBeVisible();

    await card.getByRole("spinbutton", { name: "Progress in percent" }).fill("100");
    await card.getByRole("button", { name: "Update" }).click();
    await expect(page.getByText("3 active · 1 done today").or(page.getByText(/1 done today/))).toBeVisible();

    const logs = await logsFor(page, habit._id);
    expect(logs).toHaveLength(1);
    expect(logs[0].dateKey).toBe(todayKey());
    expect(logs[0].progressPercent).toBe(100);

    await page.reload();
    await expect(page.getByText(/1 done today/)).toBeVisible();
  });

  test("numeric progress against a target, and checkbox progress against a weekly target", async ({ page }) => {
    await signUp(page);
    const meditation = await createHabit(page, MEDITATION);
    await createHabit(page, GYM);
    await page.goto("/habits");

    const med = page.getByRole("article").filter({ hasText: "Meditation" });
    await med.getByRole("spinbutton", { name: "Amount done (minutes)" }).fill("15");
    await med.getByRole("button", { name: "Save" }).click();
    await expect.poll(async () => (await logsFor(page, meditation._id))[0]?.progressPercent).toBe(50);

    const gym = page.getByRole("article").filter({ hasText: "Gym" });
    await expect(gym.getByText("0 of 3 this week")).toBeVisible();
    await gym.getByRole("button", { name: "Mark done" }).click();
    await expect(gym.getByText("1 of 3 this week")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("article").filter({ hasText: "Gym" }).getByText("1 of 3 this week")).toBeVisible();
  });

  test("invalid amounts are rejected without saving", async ({ page }) => {
    page.expectApiErrors({ status: 400, path: /^\/habits\/[a-f0-9]{24}\/logs\/.+$/ });
    await signUp(page);
    const habit = await createHabit(page, READING);
    await page.goto("/habits");
    const input = page.getByRole("article").filter({ hasText: "Reading" }).getByRole("spinbutton", { name: "Progress in percent" });
    await input.fill("150");
    const save = page.getByRole("article").filter({ hasText: "Reading" }).getByRole("button", { name: "Save" });
    if (await save.isEnabled()) await save.click();
    expect(await logsFor(page, habit._id)).toHaveLength(0);
    await expectNoTechnicalText(page);
  });

  test("archive and restore from the detail page", async ({ page }) => {
    await signUp(page);
    const habit = await createHabit(page, READING);
    await page.goto(`/habits/${habit._id}`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("button", { name: /Restore/ })).toBeVisible();
    await page.goto("/habits");
    await expect(page.getByRole("link", { name: "Reading" })).toHaveCount(0);
    await page.getByRole("button", { name: "archived" }).click();
    await expect(page.getByRole("link", { name: "Reading" })).toBeVisible();

    await page.goto(`/habits/${habit._id}`);
    await page.getByRole("button", { name: /Restore/ }).click();
    await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  });

  test("missing, malformed and other users' habits show 'not found'", async ({ page, browser }) => {
    page.expectApiErrors({ status: 404, path: /^\/habits\/.+/ }, { status: 400, path: /^\/habits\/.+/ });
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);
    const foreign = await createHabit(otherPage, { ...READING, title: "Secret habit" });
    await other.close();

    await signUp(page);
    for (const id of [foreign._id, "aaaaaaaaaaaaaaaaaaaaaaaa", "not-an-id"]) {
      await page.goto(`/habits/${id}`);
      await expect(page.getByRole("heading", { name: "Habit not found" })).toBeVisible();
      await expect(page.getByText("Secret habit")).toHaveCount(0);
      await expectNoTechnicalText(page);
    }
    expect((await api(page, "PUT", `/habits/${foreign._id}/logs/${todayKey()}`, { progressPercent: 50 })).status).toBe(404);
  });
});
