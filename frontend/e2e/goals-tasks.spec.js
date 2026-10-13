import { test, expect, signUp, api, createGoal, expectNoTechnicalText, todayKey } from "./fixtures.js";

test.describe("goals and tasks", () => {
  test("create a goal with a daily task in the form; it persists after a refresh", async ({ page }) => {
    await signUp(page);
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "No goals yet" })).toBeVisible();
    await page.getByRole("button", { name: "New goal" }).click();
    const form = page.getByRole("dialog");
    await form.getByRole("textbox", { name: "Goal name" }).fill("Learn to cook");
    await form.getByRole("spinbutton", { name: "Duration" }).fill("14");
    await form.getByRole("spinbutton", { name: "Target value" }).fill("10");
    await form.getByRole("textbox", { name: "New task title" }).fill("Cook one new recipe");
    await form.getByRole("button", { name: "Add task" }).click();
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Learn to cook")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Learn to cook")).toBeVisible();
    const { body } = await api(page, "GET", "/goals");
    expect(body.Count).toBe(1);
    const goal = body.Data[0];
    expect(goal.totalDays).toBe(14);
    const tasks = await api(page, "GET", `/goals/${goal._id}/tasks`);
    expect(JSON.stringify(tasks.body)).toContain("Cook one new recipe");
  });

  test("the goal form explains missing and inconsistent values before saving", async ({ page }) => {
    await signUp(page);
    await page.goto("/goals");
    await page.getByRole("button", { name: "New goal" }).click();
    const form = page.getByRole("dialog");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Give your goal a name.")).toBeVisible();
    await expect(form.getByText("Enter a whole number of days, at least 1.")).toBeVisible();
    await expect(form.getByText("Set a target above 0.")).toBeVisible();

    // Out-of-range numbers are stopped by the inputs' own limits before anything is sent.
    await form.getByRole("textbox", { name: "Goal name" }).fill("Boundary goal");
    await form.getByRole("spinbutton", { name: "Duration" }).fill("0");
    await form.getByRole("spinbutton", { name: "Target value" }).fill("-5");
    await form.getByRole("button", { name: "Save" }).click();
    expect(await form.getByRole("spinbutton", { name: "Duration" }).evaluate((el) => el.validity.valid)).toBe(false);
    await expect(page.getByRole("dialog")).toBeVisible();
    expect((await api(page, "GET", "/goals")).body.Count).toBe(0);
    await expectNoTechnicalText(page);
  });

  test("edit and delete a goal from its dashboard", async ({ page }) => {
    await signUp(page);
    const { goal } = await createGoal(page, { title: "Old title", tasks: ["Stretch"] });
    await page.goto(`/goals/${goal._id}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByRole("textbox", { name: "Goal name" }).fill("New title");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "New title", level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "New title", level: 1 })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "More goal actions" }).click();
    await page.getByRole("menuitem", { name: /Delete/ }).or(page.getByRole("button", { name: /Delete goal/ })).first().click();
    await expect(page).toHaveURL(/\/goals$/);
    expect((await api(page, "GET", "/goals")).body.Count).toBe(0);
    expect((await api(page, "GET", `/goals/${goal._id}/tasks`)).status).toBe(404);

    // The deleted goal's old link explains itself.
    page.expectApiErrors({ status: 404, path: /^\/goals\/[a-f0-9]{24}\/(insights|roadmap)$/ });
    await page.goto(`/goals/${goal._id}`);
    await expect(page.getByRole("heading", { name: "Goal not found" })).toBeVisible();
  });

  test("completing tasks updates progress everywhere and survives a refresh; undo works", async ({ page }) => {
    await signUp(page);
    const { goal } = await createGoal(page, { title: "Run daily", totalDays: 10, tasks: ["Stretch", "Run 5k"] });
    await page.goto("/today");
    await expect(page.getByText("0 of 2 done today")).toBeVisible();
    await page.getByRole("checkbox", { name: "Mark “Stretch” as done" }).click();
    await expect(page.getByText("1 of 2 done today")).toBeVisible();

    // 1 of 2 equal-weight tasks on day 1 of 10 => half of one day's 10% => 5 points, today and overall.
    const { body } = await api(page, "GET", `/goals/${goal._id}`);
    expect(body.goal.progress.today).toBeCloseTo(5, 1);
    expect(body.goal.progress.overall).toBeCloseTo(5, 1);

    await page.reload();
    await expect(page.getByText("1 of 2 done today")).toBeVisible();
    await page.goto(`/goals/${goal._id}`);
    await expect(page.getByText("5% overall")).toBeVisible();

    await page.goto("/today");
    await page.getByRole("checkbox", { name: /Stretch/ }).click();
    await expect(page.getByText("0 of 2 done today")).toBeVisible();
    expect((await api(page, "GET", `/goals/${goal._id}`)).body.goal.progress.overall).toBe(0);
  });

  test("a task can only be completed once per day, and rapid clicks leave UI and server in step", async ({ page }) => {
    page.expectApiErrors({ status: 409, path: /\/complete$/ });
    await signUp(page);
    const { goal, tasks } = await createGoal(page, { tasks: ["Stretch"] });
    await page.goto("/today");
    const box = page.getByRole("checkbox", { name: /Stretch/ });
    await box.click();
    await expect(page.getByText("1 of 1 done today")).toBeVisible();

    // A second completion for the same day is refused with a specific code (and the UI explains it).
    const again = await api(page, "POST", `/goals/${goal._id}/tasks/${tasks[0]._id}/complete`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("TASK_ALREADY_COMPLETED");

    // Hammering the checkbox: whatever the final state, the UI matches the server after a refresh.
    for (let i = 0; i < 5; i++) await box.click({ force: true }).catch(() => {});
    await page.waitForLoadState("networkidle");
    const shown = await page.getByText(/\d of 1 done today/).innerText();
    const today = (await api(page, "GET", `/goals/${goal._id}`)).body.goal.progress.today;
    await page.reload();
    await expect(page.getByText(/\d of 1 done today/)).toHaveText(shown);
    expect(today > 0).toBe(shown.startsWith("1"));
  });

  test("tasks can be added, renamed and removed on the goal's Tasks tab", async ({ page }) => {
    await signUp(page);
    const { goal } = await createGoal(page, { tasks: ["Stretch"] });
    await page.goto(`/goals/${goal._id}?tab=tasks`);
    await page.getByRole("button", { name: "Add task" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByRole("textbox").first().fill("Drink water");
    await modal.getByRole("button", { name: /Save|Add/ }).last().click();
    await expect(page.getByRole("button", { name: "Drink water" })).toBeVisible();

    await page.getByRole("listitem").filter({ hasText: "Drink water" }).getByRole("button", { name: "Edit task" }).click();
    await page.getByRole("dialog").getByRole("textbox").first().fill("Drink 2L water");
    await page.getByRole("dialog").getByRole("button", { name: /Save/ }).click();
    await expect(page.getByRole("button", { name: "Drink 2L water" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("listitem").filter({ hasText: "Drink 2L water" }).getByRole("button", { name: "Delete task" }).click();
    await expect(page.getByRole("button", { name: "Drink 2L water" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Stretch" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Drink 2L water" })).toHaveCount(0);
  });

  test("missing, malformed and other users' goals show 'not found', never raw errors", async ({ page, browser }) => {
    page.expectApiErrors({ status: 404, path: /^\/goals\/[a-f0-9]{24}.*/ }, { status: 400, path: /^\/goals\/.*/ });
    const owner = await browser.newContext();
    const ownerPage = await owner.newPage();
    await signUp(ownerPage);
    const { goal } = await createGoal(ownerPage, { title: "Private goal" });
    await owner.close();

    await signUp(page);
    for (const id of [goal._id, "aaaaaaaaaaaaaaaaaaaaaaaa", "not-an-id", "undefined"]) {
      await page.goto(`/goals/${id}`);
      await expect(page.getByRole("heading", { name: "Goal not found" })).toBeVisible();
      await expect(page.getByText("Private goal")).toHaveCount(0);
      await expectNoTechnicalText(page);
    }
    const res = await api(page, "GET", `/goals/${goal._id}`);
    expect(res.status).toBe(404);
    const write = await api(page, "PATCH", `/goals/${goal._id}`, { title: "hijacked" });
    expect(write.status).toBe(404);
    const task = await api(page, "POST", `/goals/${goal._id}/tasks`, { title: "x", weightage: 1 });
    expect(task.status).toBe(404);
  });

  test("goal list and to-dos start empty and offer a next step", async ({ page }) => {
    await signUp(page);
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "No goals yet" })).toBeVisible();
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Nothing to do today" })).toBeVisible();
    await page.goto("/upcoming");
    await expect(page.getByText("No tasks scheduled for this date")).toBeVisible();
    // The old All Tasks address now leads to Upcoming.
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/upcoming$/);
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
