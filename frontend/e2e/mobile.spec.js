// Runs in the "mobile" project (Pixel 7 viewport, touch).
import { test, expect, signUp, api, createGoal } from "./fixtures.js";

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("public pages fit a phone screen", async ({ page }) => {
  for (const path of ["/login", "/register", "/forgot-password", "/reset-password"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(0);
  }
});

test("every main page fits a phone screen and the navigation works", async ({ page }) => {
  await signUp(page);
  const { goal } = await createGoal(page, { title: "Mobile goal", tasks: ["Tap me"] });
  const habit = (await api(page, "POST", "/habits", { title: "Mobile habit", schedule: { type: "daily" }, trackingMethod: "percentage" })).body.habit;
  const reading = (await api(page, "GET", "/challenges")).body.challenges.find((c) => c.title === "Reading Challenge");
  const enrollment = (await api(page, "POST", `/challenges/templates/${reading.id}/join`, {})).body.enrollment;

  for (const path of ["/goals", `/goals/${goal._id}`, `/goals/${goal._id}?tab=tasks`, "/today", "/upcoming", "/habits", `/habits/${habit._id}`, "/habits/new", "/insights", "/insights/goals", `/insights/goals/${goal._id}`, "/insights/patterns", "/insights/challenges", "/challenges", "/challenges?tab=mine", "/challenges/new", `/challenges/t/${reading.id}`, `/challenges/my/${enrollment.id}`, `/challenges/my/${enrollment.id}?view=progress`, `/challenges/my/${enrollment.id}?view=settings`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(0);
  }

  // The sidebar is off-canvas on phones: open it and navigate.
  await page.goto("/goals");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Habits" }).click();
  await expect(page).toHaveURL(/\/habits$/);
  await expect(page.getByRole("link", { name: "Mobile habit" })).toBeVisible();

  // Ticking a task works by touch.
  await page.goto("/today");
  await page.getByRole("checkbox", { name: /Tap me/ }).tap();
  await expect(page.getByText("1 of 1 done today")).toBeVisible();
});

test("dialogs (new goal, AI roadmap) fit and can be completed on a phone", async ({ page }) => {
  await signUp(page);
  await page.goto("/goals");
  await page.getByRole("button", { name: "AI roadmap" }).click();
  const dialog = page.getByRole("dialog", { name: "New goal with an AI roadmap" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  await dialog.getByLabel("Goal", { exact: true }).fill("Mobile roadmap");
  await dialog.getByLabel("Custom number of days").fill("3");
  await dialog.getByRole("button", { name: "Generate roadmap" }).click();
  await dialog.getByRole("button", { name: "No, use this roadmap" }).click();
  await dialog.getByRole("button", { name: /Confirm/ }).click();
  await expect(page).toHaveURL(/\?tab=roadmap$/);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
