import { test, expect, signUp, api, createGoal, todayKey, API } from "./fixtures.js";

const shift = (key, days) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const todo = (page, title, dueDate, extra = {}) => api(page, "POST", "/tasks", { title, dueDate, ...extra });

const dayList = (page) => page.getByRole("region", { name: /^Tasks for / });
const heading = (page) => page.getByRole("heading", { level: 2 }).first();

test.describe("Upcoming: one date at a time", () => {
  test("opens on today and lists only today's tasks; overdue ones are a separate small group", async ({ page }) => {
    await signUp(page);
    const today = todayKey();
    await todo(page, "Late report", shift(today, -2));
    await todo(page, "Buy milk", today);
    await todo(page, "Dentist", shift(today, 1), { priority: "high" });
    await todo(page, "Renew passport", shift(today, 12));

    await page.goto("/upcoming");
    await expect(heading(page)).toContainText("Today ·");
    await expect(page.getByLabel("Pick a date")).toHaveValue(today);
    await expect(dayList(page)).toContainText("Buy milk");
    await expect(dayList(page)).not.toContainText("Late report");
    await expect(page.getByRole("region", { name: "Overdue" })).toContainText("Late report");
    // Nothing from other days, and no empty placeholder dates.
    await expect(page.getByText("Dentist")).toHaveCount(0);
    await expect(page.getByText("Renew passport")).toHaveCount(0);
    await expect(page.getByText("Late report")).toHaveCount(1);
    await expect(page.getByText("Nothing scheduled", { exact: true })).toHaveCount(0);
  });

  test("previous/next day, the date picker and Today move the single view; the URL keeps it", async ({ page }) => {
    await signUp(page);
    const today = todayKey();
    await todo(page, "Late report", shift(today, -2));
    await todo(page, "Dentist", shift(today, 1));
    await todo(page, "Renew passport", shift(today, 12));
    await page.goto("/upcoming");

    await page.getByRole("button", { name: "Next day" }).click();
    await expect(heading(page)).toContainText("Tomorrow ·");
    await expect(page).toHaveURL(new RegExp(`date=${shift(today, 1)}`));
    await expect(dayList(page)).toContainText("Dentist");
    await expect(page.getByRole("region", { name: "Overdue" })).toHaveCount(0, { timeout: 1000 });
    await expect(page.getByText("Late report")).toHaveCount(0);

    await page.getByLabel("Pick a date").fill(shift(today, 12));
    await expect(page.getByLabel("Pick a date")).toHaveValue(shift(today, 12));
    await expect(dayList(page)).toContainText("Renew passport");
    await page.reload();
    await expect(dayList(page)).toContainText("Renew passport");

    // A past date shows what was planned for it — here still open — and nothing from other days.
    await page.getByLabel("Pick a date").fill(shift(today, -2));
    await expect(dayList(page)).toContainText("Late report");
    await expect(page.getByRole("region", { name: "Overdue" })).toHaveCount(0);
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByText("No tasks scheduled for this date")).toBeVisible();

    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page).toHaveURL(/\/upcoming$/);
    await expect(heading(page)).toContainText("Today ·");
  });

  test("Add task uses the selected date and the task appears at once, never twice", async ({ page }) => {
    await signUp(page);
    const target = shift(todayKey(), 7);
    await page.goto(`/upcoming?date=${target}`);
    await expect(page.getByText("No tasks scheduled for this date")).toBeVisible();
    await page.getByRole("button", { name: "Add task" }).first().click();
    const form = page.getByRole("form", { name: "Add task" });
    await expect(form.getByLabel("Day")).toHaveValue(target);
    await form.getByRole("button", { name: "Add task" }).click();
    await expect(form.getByText("Give the task a name.")).toBeVisible();
    await form.getByLabel("Task name").fill("Book train tickets");
    await form.getByLabel("Priority").selectOption("high");
    await form.getByRole("button", { name: "Add task" }).dblclick();
    await expect(dayList(page)).toContainText("Book train tickets");
    await expect(dayList(page)).toContainText("High");
    await page.waitForLoadState("networkidle");
    const { body } = await api(page, "GET", "/tasks");
    expect(body.Tasks.filter((t) => t.title === "Book train tickets").map((t) => t.dueDate)).toEqual([target]);

    // Changing the day in the form saves it there and says so.
    await form.getByLabel("Task name").fill("Pack bags");
    await form.getByLabel("Day").fill(shift(target, 1));
    await form.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByRole("status")).toContainText("Task added for");
    await expect(dayList(page)).not.toContainText("Pack bags");
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(dayList(page)).toContainText("Pack bags");
  });

  test("a failed save keeps what was typed and explains the problem once", async ({ page }) => {
    page.expectApiErrors({ status: 500, path: /^\/tasks$/ });
    await signUp(page);
    await page.goto("/upcoming");
    await page.getByRole("button", { name: "Add task" }).first().click();
    const form = page.getByRole("form", { name: "Add task" });
    let failed = false;
    await page.route(`${API}/tasks`, (route) => {
      if (route.request().method() === "POST" && !failed) {
        failed = true;
        return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, code: "INTERNAL_ERROR", message: "boom" }) });
      }
      return route.continue();
    });
    await form.getByLabel("Task name").fill("Water plants");
    await form.getByRole("button", { name: "Add task" }).click();
    await expect(form.getByRole("alert")).toContainText("Something went wrong on our side");
    await expect(form.getByLabel("Task name")).toHaveValue("Water plants");
    await expect(page.getByRole("alert")).toHaveCount(1);
    await form.getByRole("button", { name: "Add task" }).click();
    await expect(dayList(page)).toContainText("Water plants");
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("form", { name: "Add task" })).toHaveCount(0);
  });

  test("goal tasks: roadmap tasks on their date, daily ones tickable today and read-only later", async ({ page }) => {
    await signUp(page);
    const today = todayKey();
    await createGoal(page, { title: "Fitness", tasks: ["Stretch"] });
    const { goal: planned } = await createGoal(page, { title: "Planned goal" });
    expect((await api(page, "POST", `/goals/${planned._id}/tasks`, { kind: "roadmap", title: "Outline", scheduledDate: shift(today, 2) })).status).toBe(201);

    await page.goto("/upcoming");
    const daily = page.getByRole("region", { name: "Repeats daily" });
    await daily.getByRole("checkbox", { name: "Mark “Stretch” as done" }).click();
    await expect(daily.getByRole("checkbox", { name: "Mark “Stretch” as not done" })).toBeChecked();

    await page.getByLabel("Pick a date").fill(shift(today, 2));
    await expect(dayList(page)).toContainText("Outline");
    await expect(dayList(page).getByRole("link", { name: "Planned goal" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Repeats daily" })).toContainText("Stretch");
    await expect(page.getByRole("region", { name: "Repeats daily" }).getByRole("checkbox")).toHaveCount(0);

    // Add a dated task to the roadmap goal from here.
    await page.getByRole("button", { name: "Add task" }).first().click();
    const form = page.getByRole("form", { name: "Add task" });
    await expect(form.getByLabel("Goal").locator("option")).toHaveText(["No goal (to-do)", "Roadmap: Planned goal"]);
    await form.getByLabel("Task name").fill("Draft chapter 1");
    await form.getByLabel("Goal").selectOption({ label: "Roadmap: Planned goal" });
    await form.getByRole("button", { name: "Add task" }).click();
    await expect(dayList(page)).toContainText("Draft chapter 1");
  });

  test("complete a task and move it to another day", async ({ page }) => {
    await signUp(page);
    const today = todayKey();
    await todo(page, "Send invoice", today);
    await todo(page, "Order filters", today);
    await page.goto("/upcoming");
    await page.getByRole("checkbox", { name: "Mark “Send invoice” as done" }).click();
    await expect(page.getByRole("checkbox", { name: "Mark “Send invoice” as not done" })).toBeChecked();
    await expect(heading(page).locator("xpath=following-sibling::p")).toHaveText("1 open · 1 done");

    await page.getByRole("button", { name: "Order filters" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Day").fill(shift(today, 1));
    await modal.getByRole("button", { name: /Save/ }).click();
    await expect(dayList(page)).not.toContainText("Order filters");
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(dayList(page)).toContainText("Order filters");
  });

  test("dates follow the user's own day (India, ahead of UTC)", async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: "Asia/Kolkata" });
    const page = await context.newPage();
    await signUp(page, { timezone: "Asia/Kolkata" });
    const kolkataToday = todayKey("Asia/Kolkata");
    await todo(page, "Morning walk", shift(kolkataToday, 1));
    await page.goto("/upcoming");
    await expect(page.getByLabel("Pick a date")).toHaveValue(kolkataToday);
    await expect(page.getByText("Morning walk")).toHaveCount(0);
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(dayList(page)).toContainText("Morning walk");
    await context.close();
  });
});

test.describe("Navigation", () => {
  test("Inbox, Timeline and Life Areas are gone; their old addresses lead somewhere useful", async ({ page }) => {
    await signUp(page);
    await page.goto("/today");
    const nav = page.getByRole("complementary", { name: "Primary" }).getByRole("navigation");
    for (const name of ["Inbox", "Timeline", "Life Areas"]) await expect(nav.getByRole("link", { name })).toHaveCount(0);
    for (const name of ["Today", "Completed", "Upcoming", "Goals", "Habits", "Challenges", "Insights"]) await expect(nav.getByRole("link", { name })).toBeVisible();

    for (const [from, to] of [["/inbox", /\/today$/], ["/timeline", /\/upcoming$/], ["/life-areas", /\/goals$/]]) {
      await page.goto(from);
      await expect(page).toHaveURL(to);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
    // The remaining links all open real pages.
    for (const name of ["Upcoming", "Challenges", "Insights", "Today"]) {
      await nav.getByRole("link", { name }).click();
      await expect(nav.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    }
    // Life areas as goal data are untouched.
    await page.goto("/goals");
    await page.getByRole("button", { name: "New goal" }).click();
    await expect(page.getByRole("dialog").getByRole("combobox", { name: "Contributes to" }).locator("option")).not.toHaveCount(1);
  });
});

test.describe("Today: collapsible goal groups", () => {
  test("each group collapses on its own, keeps its summary, and remembers the choice", async ({ page }) => {
    await signUp(page);
    await createGoal(page, { title: "Writing", tasks: ["Write 300 words", "Edit yesterday's page"] });
    await createGoal(page, { title: "Health", tasks: ["Walk", "Stretch"] });
    await todo(page, "Buy stamps", todayKey());
    await page.goto("/today");

    const writing = page.getByRole("button", { name: /^Writing/ }).first();
    const health = page.getByRole("button", { name: /^Health/ }).first();
    await expect(writing).toHaveAttribute("aria-expanded", "true");
    await expect(health).toHaveAttribute("aria-expanded", "true");
    await expect(writing).toContainText("0 of 2 done");

    await writing.click();
    await expect(writing).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("checkbox", { name: /Write 300 words/ })).toBeHidden();
    await expect(page.getByRole("checkbox", { name: /Walk/ })).toBeVisible();
    await expect(writing).toContainText("0 of 2 done");

    // Completing in an open group updates its summary.
    await page.getByRole("checkbox", { name: "Mark “Walk” as done" }).click();
    await expect(health).toContainText("1 of 2 done");
    await page.getByRole("checkbox", { name: "Mark “Stretch” as done" }).click();
    await expect(health).toContainText("2 of 2 done");
    await expect(health).toHaveAttribute("aria-expanded", "true"); // doesn't snap shut while in use

    // Keyboard: Enter toggles.
    await writing.focus();
    await page.keyboard.press("Enter");
    await expect(writing).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(writing).toHaveAttribute("aria-expanded", "false");

    await page.reload();
    await expect(page.getByRole("button", { name: /^Writing/ }).first()).toHaveAttribute("aria-expanded", "false");
    await page.goto("/goals");
    await page.goto("/today");
    await expect(page.getByRole("button", { name: /^Writing/ }).first()).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: /^To-do/ }).first()).toContainText("0 of 1 done");
    await expect(page.getByRole("heading", { name: /^All goals/i })).toHaveCount(0);
  });

  test("expand all / collapse all", async ({ page }) => {
    await signUp(page);
    await createGoal(page, { title: "Alpha", tasks: ["A1"] });
    await createGoal(page, { title: "Beta", tasks: ["B1"] });
    await page.goto("/today");
    await page.getByRole("button", { name: "Collapse all groups" }).click();
    await expect(page.getByRole("checkbox")).toHaveCount(0); // hidden rows leave the accessibility tree
    for (const name of [/^Alpha/, /^Beta/]) await expect(page.getByRole("button", { name }).first()).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Expand all groups" }).click();
    await expect(page.getByRole("checkbox", { name: /A1/ })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /B1/ })).toBeVisible();
  });
});

