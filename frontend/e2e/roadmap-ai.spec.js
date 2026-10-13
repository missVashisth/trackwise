// AI roadmap generation against the e2e server's fake OpenRouter (never the real provider).
import { test, expect, signUp, api, expectNoTechnicalText } from "./fixtures.js";

const GENERATE = /^\/roadmaps\/generate$/;

async function openWizard(page) {
  await page.goto("/goals");
  await page.getByRole("button", { name: "AI roadmap" }).click();
  const dialog = page.getByRole("dialog", { name: "New goal with an AI roadmap" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillDetails(dialog, { title = "Learn Spanish basics", days = "7" } = {}) {
  await dialog.getByLabel("Goal", { exact: true }).fill(title);
  await dialog.getByLabel("Description").fill("Hold a simple conversation");
  await dialog.getByLabel("Custom number of days").fill(days);
}

async function goalCount(page) {
  const { status, body } = await api(page, "GET", "/goals");
  expect(status).toBe(200);
  return body.Count;
}

test.describe("AI roadmap", () => {
  test("generate, review and save: the roadmap becomes scheduled tasks", async ({ page, control }) => {
    await signUp(page);
    const dialog = await openWizard(page);
    await fillDetails(dialog);
    await dialog.getByRole("button", { name: "Generate roadmap" }).click();
    await expect(dialog.getByText("Would you like to tailor this roadmap")).toBeVisible();
    await dialog.getByRole("button", { name: "No, use this roadmap" }).click();
    await dialog.getByRole("button", { name: /Confirm/ }).click();

    await expect(page).toHaveURL(/\/goals\/[a-f0-9]{24}\?tab=roadmap$/);
    const goalId = page.url().match(/goals\/([a-f0-9]{24})/)[1];
    const { body } = await api(page, "GET", `/goals/${goalId}/roadmap`);
    expect(body.tasks).toHaveLength(14); // 7 days x 2 tasks from the fake planner
    expect(body.tasks.every((t) => t.scheduledDate)).toBe(true);
    expect(await goalCount(page)).toBe(1);
    expect(await control.aiCalls()).toBeGreaterThan(0);

    // The roadmap survives a refresh and its first task can be completed with the normal tracking.
    await page.reload();
    await expect(page.getByText("Day 1: study Learn Spanish basics").first()).toBeVisible();
  });

  const failures = [
    // [fake mode, expected message, retry offered?, manual fallback offered?]
    ["timeout", "Roadmap generation is taking longer than expected. Please try again.", true, false],
    ["rate_limit", "The AI planner is busy right now. Please wait a little and try again.", true, false],
    ["outage", "Our AI planner is temporarily unavailable. Please try again shortly.", true, true],
    ["auth", "Our AI planner is unavailable right now. Please try again later.", false, true],
    ["credits", "Our AI planner is unavailable right now. Please try again later.", false, true],
    ["model_missing", "Our AI planner is unavailable right now. Please try again later.", false, true],
    ["malformed", "We couldn't create a usable roadmap for this request. Try making your goal more specific, or try again.", true, false],
    ["invalid_schema", "We couldn't create a usable roadmap for this request. Try making your goal more specific, or try again.", true, false],
    ["truncated", "That roadmap was too long to create in one go. Try a shorter duration.", false, false],
    ["refused", "We couldn't generate a roadmap from that request. Try describing your goal, timeframe, and desired outcome more clearly.", false, false],
  ];

  for (const [mode, message, retry, manual] of failures) {
    test(`provider failure "${mode}" is explained, keeps the form and saves nothing`, async ({ page, control }) => {
      page.expectApiErrors({ status: 504, path: GENERATE }, { status: 503, path: GENERATE }, { status: 502, path: GENERATE }, { status: 422, path: GENERATE });
      await signUp(page);
      await control.setAi(mode);
      const dialog = await openWizard(page);
      await fillDetails(dialog, { title: `Plan for ${mode}` });
      await dialog.getByRole("button", { name: "Generate roadmap" }).click();

      const alert = dialog.getByRole("alert");
      await expect(alert).toContainText(message);
      await expect(alert).toContainText("Nothing has been saved yet, and your details are still here.");
      await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(retry ? 1 : 0);
      await expect(alert.getByRole("button", { name: "Create the goal without a roadmap" })).toHaveCount(manual ? 1 : 0);
      // The form keeps what the user typed, and the button is usable again.
      await expect(dialog.getByLabel("Goal", { exact: true })).toHaveValue(`Plan for ${mode}`);
      await expect(dialog.getByRole("button", { name: "Generate roadmap" })).toBeEnabled();
      await expectNoTechnicalText(page);
      expect(await goalCount(page)).toBe(0);
    });
  }

  test("a transient failure can be retried without re-entering anything", async ({ page, control }) => {
    page.expectApiErrors({ status: 504, path: GENERATE });
    await signUp(page);
    // The server's AI client retries once by itself, so two timeouts produce one visible failure.
    await control.setAi("timeout", { times: 2 });
    const dialog = await openWizard(page);
    await fillDetails(dialog);
    await dialog.getByRole("button", { name: "Generate roadmap" }).click();
    await expect(dialog.getByRole("alert")).toContainText("taking longer than expected");
    await dialog.getByRole("button", { name: "Try again" }).click();
    await expect(dialog.getByText("Would you like to tailor this roadmap")).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  });

  test("when the planner is unavailable, the goal can be created without a roadmap", async ({ page, control }) => {
    page.expectApiErrors({ status: 503, path: GENERATE });
    await signUp(page);
    await control.setAi("credits");
    const dialog = await openWizard(page);
    await fillDetails(dialog, { title: "Read 12 books" });
    await dialog.getByRole("button", { name: "Generate roadmap" }).click();
    await dialog.getByRole("button", { name: "Create the goal without a roadmap" }).click();

    // The regular goal form opens with the details already filled in.
    const form = page.getByRole("dialog");
    await expect(form.getByRole("textbox", { name: "Goal name" })).toHaveValue("Read 12 books");
    await expect(form.getByRole("spinbutton", { name: "Duration" })).toHaveValue("7");
    await form.getByRole("spinbutton", { name: "Target value" }).fill("12");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Read 12 books/ }).or(page.getByText("Read 12 books")).first()).toBeVisible();
    expect(await goalCount(page)).toBe(1);
  });

  test("generating shows progress and cannot be submitted twice", async ({ page, control }) => {
    await signUp(page);
    await control.setAi("ok", { delayMs: 1500 });
    const callsBefore = await control.aiCalls();
    const dialog = await openWizard(page);
    await fillDetails(dialog);
    const generate = dialog.getByRole("button", { name: /Generate roadmap|Generating/ });
    await generate.click();
    await expect(dialog.getByRole("status")).toContainText("Generating your roadmap");
    await expect(generate).toBeDisabled();
    await generate.click({ force: true }).catch(() => {});
    await expect(dialog.getByText("Would you like to tailor this roadmap")).toBeVisible();
    expect(await control.aiCalls()).toBe(callsBefore + 1);
  });

  test("if the save succeeds but the answer is lost, trying again does not duplicate anything", async ({ page }) => {
    await signUp(page);
    const dialog = await openWizard(page);
    await fillDetails(dialog);
    await dialog.getByRole("button", { name: "Generate roadmap" }).click();
    await dialog.getByRole("button", { name: "No, use this roadmap" }).click();

    // First confirmation reaches the server and is saved, but the browser never gets the answer.
    let dropped = false;
    await page.route("**/api/roadmaps/confirm", async (route) => {
      if (dropped) return route.continue();
      dropped = true;
      await route.fetch(); // the server saves the goal...
      await route.abort("connectionreset"); // ...and the response is lost on the way back
    });
    await dialog.getByRole("button", { name: /Confirm/ }).click();
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText("We couldn't connect to the server.");
    await expect(alert).toContainText("Your roadmap is still here — it is safe to try again.");
    await alert.getByRole("button", { name: "Try again" }).click();

    await expect(page).toHaveURL(/\/goals\/[a-f0-9]{24}\?tab=roadmap$/);
    expect(await goalCount(page)).toBe(1);
    const goalId = page.url().match(/goals\/([a-f0-9]{24})/)[1];
    const { body } = await api(page, "GET", `/goals/${goalId}/roadmap`);
    expect(body.tasks).toHaveLength(14);
  });

  test("invalid details are caught before any AI call, and server rules show on the field", async ({ page, control }) => {
    page.expectApiErrors({ status: 400, path: GENERATE });
    await signUp(page);
    const callsBefore = await control.aiCalls();
    const dialog = await openWizard(page);

    await dialog.getByRole("button", { name: "Generate roadmap" }).click();
    await expect(dialog.getByText("Give the goal a name.")).toBeVisible();

    await dialog.getByLabel("Goal", { exact: true }).fill("x");
    for (const days of ["0", "121", "2.5"]) {
      await dialog.getByLabel("Custom number of days").fill(days);
      await dialog.getByRole("button", { name: "Generate roadmap" }).click();
      await expect(dialog.getByText("Choose 1–120 days.")).toBeVisible();
    }
    expect(await control.aiCalls()).toBe(callsBefore);

    // Too long for the server: explained on the Goal field, not as a generic failure.
    await dialog.getByLabel("Custom number of days").fill("7");
    await dialog.getByLabel("Goal", { exact: true }).fill("Learn ".repeat(50));
    await dialog.getByRole("button", { name: "Generate roadmap" }).click();
    await expect(dialog.getByText("Give the goal a title (up to 200 characters)")).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    expect(await control.aiCalls()).toBe(callsBefore);
    await expectNoTechnicalText(page);
  });
});
