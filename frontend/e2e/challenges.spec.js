import { test, expect, signUp, api, todayKey, expectNoTechnicalText } from "./fixtures.js";

const shift = (key, days) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const catalogue = async (page) => (await api(page, "GET", "/challenges")).body.challenges;
const byTitle = async (page, title) => (await catalogue(page)).find((c) => c.title === title);
const card = (page, title) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

async function joinViaUi(page, title) {
  await page.goto("/challenges");
  await card(page, title).getByRole("link", { name: /View details/ }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Join challenge" }).click();
  await expect(page).toHaveURL(/\/challenges\/my\/[a-f0-9]{24}$/);
  return page.url().match(/my\/([a-f0-9]{24})/)[1];
}

test.describe("Challenges", () => {
  test("discover: cards show real participant counts, filters work, joined state is shown", async ({ page, browser }) => {
    await signUp(page);
    await page.goto("/challenges");
    await expect(page.getByRole("heading", { name: "Challenges", level: 1 })).toBeVisible();
    await expect(card(page, "75 Hard")).toContainText("75 days");
    await expect(card(page, "75 Hard")).toContainText("4 daily activities");
    await expect(card(page, "Reading Challenge")).toContainText("0 participants");

    // Someone else joins: the count comes from real enrollments.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);
    const reading = await byTitle(otherPage, "Reading Challenge");
    expect((await api(otherPage, "POST", `/challenges/templates/${reading.id}/join`, {})).status).toBe(201);
    await other.close();
    await page.reload();
    await expect(card(page, "Reading Challenge")).toContainText("1 participant");

    await page.getByRole("button", { name: "Fitness" }).click();
    await expect(page).toHaveURL(/category=fitness/);
    await expect(card(page, "75 Hard")).toBeVisible();
    await expect(card(page, "Reading Challenge")).toHaveCount(0);
    await page.getByRole("button", { name: "All", exact: true }).click();

    await joinViaUi(page, "Reading Challenge");
    await page.goto("/challenges");
    await expect(card(page, "Reading Challenge")).toContainText("Joined");
    await expect(card(page, "Reading Challenge").getByRole("link", { name: "Open my challenge" })).toBeVisible();
    await expect(card(page, "Reading Challenge")).toContainText("2 participants");
    await expectNoTechnicalText(page);
  });

  test("daily tracking: numeric and checkbox activities update the same day's record", async ({ page }) => {
    await signUp(page);
    const id = await joinViaUi(page, "30 Days No Sugar");
    await expect(page.getByText("Today: 0 of 1 required done")).toBeVisible();
    await expect(page.getByText(/You're the only one taking it right now/)).toBeVisible();

    await page.getByRole("checkbox", { name: "Mark “No added sugar” as done" }).click();
    await expect(page.getByRole("checkbox", { name: "Mark “No added sugar” as not done" })).toBeChecked();
    await page.getByLabel("Drink water (litres)").fill("1");
    await page.getByRole("listitem").filter({ hasText: "Drink water" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("progressbar", { name: "Drink water progress" })).toHaveAttribute("aria-valuenow", "50");
    await page.getByLabel("Drink water (litres)").fill("2.5");
    await page.getByRole("listitem").filter({ hasText: "Drink water" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("progressbar", { name: "Drink water progress" })).toHaveAttribute("aria-valuenow", "100");
    await expect(page.getByText("Today: 1 of 1 required done")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Drink water (litres)")).toHaveValue("2.5");
    const day = (await api(page, "GET", `/challenges/enrollments/${id}/days/${todayKey()}`)).body.day;
    expect(day.activities.map((a) => [a.key, a.status, a.value])).toEqual([["no-sugar", "done", null], ["water", "done", 2.5]]);
    // Can't step into the future.
    await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled();
  });

  test("strict challenges explain the rule and need consent before joining", async ({ page }) => {
    await signUp(page);
    await page.goto("/challenges");
    await card(page, "75 Hard").getByRole("link", { name: /View details/ }).click();
    await expect(page.getByText(/Strict rule: every required activity must be done every day/)).toBeVisible();
    await expect(page.getByText("Required · adjustable target").first()).toBeVisible();
    const join = page.getByRole("button", { name: "Join challenge" });
    await expect(join).toBeDisabled();
    await page.getByRole("checkbox", { name: "I understand the strict rule" }).check();
    await join.click();
    await expect(page).toHaveURL(/\/challenges\/my\//);

    // Already joined: the details page says so instead of offering a second enrollment.
    const hard = await byTitle(page, "75 Hard");
    await page.goto(`/challenges/t/${hard.id}`);
    await expect(page.getByText("You're taking this challenge.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Join challenge" })).toHaveCount(0);
  });

  test("progress report from real history: misses, adherence and today in progress", async ({ page, control }) => {
    await signUp(page);
    const id = await joinViaUi(page, "Reading Challenge");
    const { startDate } = await control.backdateChallenge(id, 4); // today is day 5
    for (const offset of [0, 1, 3]) {
      const res = await api(page, "PUT", `/challenges/enrollments/${id}/days/${shift(startDate, offset)}/activities/read`, { value: 20 });
      expect(res.status).toBe(200);
    }
    await page.goto(`/challenges/my/${id}?view=progress`);
    await expect(page.getByRole("tab", { name: "Progress", selected: true })).toBeVisible();
    const panel = page.getByRole("tabpanel");
    await expect(panel).toContainText("75%");
    await expect(panel).toContainText("3 of 4 on finished days · 1 missed");
    await expect(panel).toContainText("Longest: 2 days");
    await expect(page.getByText("Day 5 of 30").first()).toBeVisible();
    await expect(page.getByRole("img", { name: /Calendar:/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /1 today, in progress/ })).toBeVisible();

    // The checklist can go back to fill in an earlier day of the run.
    await page.getByRole("tab", { name: "Daily checklist" }).click();
    await page.getByRole("button", { name: "Previous day" }).click();
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByText("Day 3 of 30")).toBeVisible();
    await expect(page.getByText("Missed")).toBeVisible();
  });

  test("personal settings change only allowed rules; leaving and restarting keep history", async ({ page }) => {
    await signUp(page);
    const id = await joinViaUi(page, "Winter Arc");
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByLabel("Train target (minutes)").fill("45");
    await page.getByRole("switch", { name: "Track “Journal”" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "No junk food" })).toContainText("Fixed");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Your settings were saved.")).toBeVisible();
    const saved = (await api(page, "GET", `/challenges/enrollments/${id}`)).body.enrollment;
    expect(saved.activities.find((a) => a.key === "train").target).toBe(45);
    expect(saved.activities.find((a) => a.key === "journal").enabled).toBe(false);
    const template = (await api(page, "GET", `/challenges/templates/${saved.templateId}`)).body.challenge;
    expect(template.activities.find((a) => a.key === "train").target).toBe(30);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Restart from day 1" }).click();
    await expect(page).not.toHaveURL(new RegExp(id));
    await expect(page.getByText("Attempt 2")).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Leave challenge" }).click();
    await expect(page.getByRole("button", { name: "Leave challenge" })).toHaveCount(0);
    await page.goto("/challenges?tab=mine");
    await expect(page.getByRole("region", { name: "Past challenges" })).toContainText("Winter Arc");
    await expect(page.getByRole("region", { name: "Past challenges" }).getByRole("listitem")).toHaveCount(2);
  });

  test("custom challenges are private to their creator", async ({ page, browser }) => {
    await signUp(page);
    await page.goto("/challenges");
    await page.getByRole("link", { name: "Create a challenge" }).click();
    await page.getByRole("button", { name: "Create challenge" }).click();
    await expect(page.getByText("Give it a title of at least 3 characters.")).toBeVisible();
    await page.getByLabel("Title").fill("Guitar practice");
    await page.getByLabel("Duration (days)").fill("21");
    await page.getByLabel("Activity 1 name").fill("Practise chords");
    await page.getByLabel("Activity 1 type").selectOption("numeric");
    await page.getByLabel("Activity 1 target").fill("15");
    await page.getByLabel("Activity 1 unit").fill("minutes");
    await page.getByRole("button", { name: "Create challenge" }).click();
    await expect(page.getByRole("heading", { name: "Guitar practice", level: 1 })).toBeVisible();
    const url = page.url();

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    otherPage.expectApiErrors?.({ status: 404, path: /^\/challenges\/templates\/.+/ });
    await signUp(otherPage);
    await otherPage.goto(url.replace(/^https?:\/\/[^/]+/, "http://127.0.0.1:5181"));
    await expect(otherPage.getByRole("heading", { name: "Challenge not found" })).toBeVisible();
    expect((await catalogue(otherPage)).some((c) => c.title === "Guitar practice")).toBe(false);
    await other.close();

    await page.goto("/challenges?category=custom");
    await expect(card(page, "Guitar practice")).toContainText("Your challenge · private");
  });

  test("another user's enrollment is not found; Insights shows challenge results separately", async ({ page, browser, control }) => {
    page.expectApiErrors({ status: 404, path: /^\/challenges\/enrollments\/.+/ });
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signUp(otherPage);
    const reading = await byTitle(otherPage, "Reading Challenge");
    const theirs = (await api(otherPage, "POST", `/challenges/templates/${reading.id}/join`, {})).body.enrollment;
    await other.close();

    await signUp(page);
    await page.goto(`/challenges/my/${theirs.id}`);
    await expect(page.getByRole("heading", { name: "Challenge not found" })).toBeVisible();
    await expectNoTechnicalText(page);

    const id = await joinViaUi(page, "Reading Challenge");
    const { startDate } = await control.backdateChallenge(id, 6);
    for (const offset of [0, 2, 4]) await api(page, "PUT", `/challenges/enrollments/${id}/days/${shift(startDate, offset)}/activities/read`, { value: 25 });
    await page.goto(`/insights/challenges?period=custom&from=${startDate}&to=${shift(todayKey(), -1)}`);
    await expect(page.getByRole("link", { name: "Challenges", exact: true }).last()).toHaveAttribute("aria-current", "page");
    const block = page.getByRole("region", { name: "Reading Challenge" });
    await expect(block).toContainText("50%");
    await expect(block).toContainText("3 done, 3 missed on finished days");
  });
});
