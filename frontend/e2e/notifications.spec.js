import { test, expect, signUp, api, createGoal } from "./fixtures.js";

async function notifications(page) {
  const { body } = await api(page, "GET", "/notifications");
  return body.notifications ?? body.items ?? [];
}

async function unreadCount(page) {
  const { body } = await api(page, "GET", "/notifications/unread-count");
  return body.count ?? body.unreadCount;
}

test.describe("notifications", () => {
  test("milestones and goal completion appear once; read one, then read all", async ({ page }) => {
    await signUp(page);
    // A 1-day goal with one task reaches 100% with a single tick.
    const { goal } = await createGoal(page, { title: "One-day sprint", totalDays: 1, tasks: ["Ship it"] });
    await page.goto("/today");
    const box = page.getByRole("checkbox", { name: /Ship it/ });
    await box.click();
    await expect(page.getByText("1 of 1 done today")).toBeVisible();
    // Untick and tick again: the milestone must not be announced twice.
    await box.click();
    await expect(page.getByText("0 of 1 done today")).toBeVisible();
    await box.click();
    await expect(page.getByText("1 of 1 done today")).toBeVisible();

    await page.goto(`/goals/${goal._id}`);
    await page.getByRole("button", { name: "Mark complete" }).click();
    await expect(page.getByRole("button", { name: /Reopen|Mark incomplete|Mark active/ }).or(page.getByText("Completed").first())).toBeVisible();

    await expect.poll(async () => (await notifications(page)).length).toBe(2);
    const list = await notifications(page);
    const types = list.map((n) => n.type).sort();
    expect(types).toEqual(["GOAL_COMPLETED", "PROGRESS_MILESTONE"]);
    expect(await unreadCount(page)).toBe(2);

    // The bell shows the unread count and the list.
    await page.reload();
    const bell = page.getByRole("button", { name: /Notifications/ });
    await expect(bell).toBeVisible();
    await bell.click();
    const items = page.getByRole("button", { name: /click to mark as read/ });
    await expect(items.first()).toBeVisible();
    await items.first().click();
    await expect.poll(() => unreadCount(page)).toBe(1);

    if (!(await page.getByRole("button", { name: "Mark all read" }).isVisible())) await bell.click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect.poll(() => unreadCount(page)).toBe(0);
    await page.reload();
    expect(await unreadCount(page)).toBe(0);
  });

  test("one user's notifications are invisible to another and cannot be marked by them", async ({ page, browser }) => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);
    const { goal } = await createGoal(otherPage, { title: "Private sprint", totalDays: 1, tasks: ["Task"] });
    await api(otherPage, "PATCH", `/goals/${goal._id}`, { completedAt: new Date().toISOString() });
    await expect.poll(async () => (await notifications(otherPage)).length).toBeGreaterThan(0);
    const theirs = (await notifications(otherPage))[0];
    await other.close();

    await signUp(page);
    expect(await notifications(page)).toEqual([]);
    const res = await api(page, "PATCH", `/notifications/${theirs._id ?? theirs.id}/read`);
    expect(res.status).toBe(404);
  });
});
