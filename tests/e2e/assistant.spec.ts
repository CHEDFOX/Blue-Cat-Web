// Research assistant, mock mode (ULIS_RESEARCH_MOCK=1): no backend or LLM needed.
import { readFile, rm } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

const CODE = "e2e-code";
const shots = process.env.E2E_SCREENSHOT_DIR;

async function login(page: Page, code = CODE, next = "/research") {
  await page.goto(`/access?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Invite code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
}

async function ready(page: Page) {
  await login(page);
  await page.getByRole("button", { name: "I understand" }).click();
}

test("research pages are gated by an invite code and the session cookie is HttpOnly", async ({ page, request }) => {
  expect((await request.post("/api/research", { data: { question: "q" } })).status()).toBe(401);
  expect((await request.get("/api/research/mock-1760000000000-o")).status()).toBe(401);

  await page.goto("/research");
  await expect(page.getByRole("heading", { level: 1, name: "Early access" })).toBeVisible();
  await expect(page.locator('input[name="next"]')).toHaveValue("/research");
  await page.getByLabel("Invite code").fill("wrong-code");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("form .error")).toContainText("not recognised");
  expect((await page.context().cookies()).some((c) => c.name === "ulis_session")).toBe(false);

  await page.getByLabel("Invite code").fill(CODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByRole("heading", { level: 1, name: "Research assistant" })).toBeVisible();
  const cookie = (await page.context().cookies()).find((c) => c.name === "ulis_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain("ulis_session");
});

test("nav offers the research assistant first and the search page points to it", async ({ page }) => {
  await page.goto("/access");
  const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
  await expect(links.first()).toHaveText("Research assistant");
  await page.goto("/"); // renders (with an error notice) even when the backend is down
  await expect(page.getByRole("link", { name: "Open the research assistant" })).toHaveAttribute("href", "/research");
});

test("first-visit notice must be acknowledged before a run, and is remembered", async ({ page }) => {
  await login(page);
  const notice = page.getByTestId("first-visit-notice");
  await expect(notice).toContainText("not legal advice");
  await expect(notice).toContainText("processed by an AI provider");
  await expect(notice).toContainText("deleted");
  await expect(page.getByRole("button", { name: "Run research" })).toBeDisabled();
  await page.getByRole("button", { name: "I understand" }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run research" })).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId("first-visit-notice")).toHaveCount(0);
});

test("full flow: question + case file -> progress -> result with citation chips, copy and print", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed += 1;
    };
  });
  await ready(page);

  // Jurisdictions are grouped by coverage status and the status is shown.
  const select = page.getByLabel("Jurisdiction (optional)");
  await expect(select.locator("optgroup")).toHaveCount(4);
  await expect(select.locator("option", { hasText: "XA — Xandria (fictional) (sample)" })).toHaveCount(1);
  await select.selectOption("XA");
  await expect(page.getByTestId("coverage-hint")).toContainText("fictional test data");

  await page.getByLabel("Question (required)").fill("How long may the company keep customer records?");
  await page.locator('input[type="file"]').setInputFiles({
    name: "facts.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Facts\nThe last transaction ended in 2021."),
  });
  await expect(page.getByLabel("Case file (optional)")).toHaveValue(/last transaction ended in 2021/);
  await expect(page.getByText("Loaded facts.md")).toBeVisible();
  await page.getByLabel("Law as of (optional)").fill("2024-01-01");
  await page.getByLabel("Depth").selectOption("deep");
  await page.getByRole("button", { name: "Run research" }).click();

  // Progress stages and messages are shown while the job runs.
  const progress = page.getByTestId("progress");
  await expect(progress).toBeVisible();
  await expect(progress.locator('[data-stage="understanding"]')).toBeVisible();
  await expect(page.getByTestId("progress-messages")).toContainText(/Searching the XA corpus/);
  if (shots) await page.screenshot({ path: `${shots}/assistant-progress.png` });

  // Result.
  const result = page.getByTestId("result");
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(progress).toHaveCount(0);
  await expect(page).toHaveURL(/\/research\?job=mock-/);
  await expect(page.getByTestId("disclaimer")).toContainText("not legal advice");
  await expect(page.getByTestId("removed-claims")).toContainText("2 statements were removed because they could not be verified");
  await expect(page.getByTestId("coverage-notes")).toContainText("XB is not covered");
  await expect(page.getByTestId("jurisdictions").locator('[data-covered="false"]')).toContainText("Coverage warning");
  const badges = page.getByTestId("confidence");
  await expect(badges).toHaveText(["Confidence: medium", "Confidence: low"]);
  await expect(page.getByTestId("uncertainties").first()).toContainText("tax record-keeping");
  await expect(page.getByTestId("next-steps")).toContainText("Check whether tax");
  await expect(page.locator('[data-code="MOCK_MODE"]')).toBeVisible();

  // Citation chip opens the authority inline: exact text, hash, source, limitations, validity, provision link.
  const chip = page.getByTestId("citation-chip").first();
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByTestId("authority-panel");
  await expect(panel).toContainText("Personal Data Act 2015 (XA) s 12(1)");
  await expect(panel.getByTestId("authority-text")).toContainText("five years after the end of the transaction");
  await expect(panel.getByTestId("authority-hash")).toHaveText(/^[0-9a-f]{64}$/);
  await expect(panel.locator('[data-code="FICTIONAL_DATA"]')).toBeVisible();
  await expect(panel).toContainText("2022-01-01 → open");
  await expect(panel.getByRole("link", { name: /ULIS fictional sample corpus/ })).toHaveAttribute("href", "https://example.org/ulis/mock-corpus");
  await expect(panel.getByRole("link", { name: "Open in the point-in-time view" })).toHaveAttribute(
    "href",
    /^\/provision\?uri=%2Fakn%2Fxa%2Fact%2F2015%2F12%2F%7Esec_12__subsec_1&as_of=2024-01-01$/,
  );
  if (shots) await page.screenshot({ path: `${shots}/assistant-result.png`, fullPage: true });
  await chip.click();
  await expect(panel).toHaveCount(0);

  // Copy as Markdown / text, Print.
  await page.getByRole("button", { name: "Copy as Markdown" }).click();
  await expect(page.getByTestId("copy-status")).toHaveText("Copied as Markdown.");
  const md = await page.evaluate(() => navigator.clipboard.readText());
  expect(md).toContain("# Legal research memo");
  expect(md).toContain("### [1] Personal Data Act 2015 (XA) s 12(1)");
  expect(md).toContain("2 statements were removed because they could not be verified");
  await page.getByRole("button", { name: "Copy as text" }).click();
  await expect(page.getByTestId("copy-status")).toHaveText("Copied as text.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain("# Legal research memo");
  await page.getByRole("button", { name: "Print" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

  // Reloading the address resumes the same job; "New question" returns to the form.
  await page.reload();
  await expect(page.getByTestId("result")).toBeVisible();
  await page.getByRole("button", { name: "New question" }).click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByLabel("Question (required)")).toBeVisible();
});

test("failed and refused jobs are reported honestly without a result", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Question (required)").fill("Will we win? [mock:fail]");
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByTestId("job-ended")).toContainText("could not be completed", { timeout: 15_000 });
  await expect(page.getByTestId("job-ended")).toContainText("language model service did not respond");
  await expect(page.getByTestId("result")).toHaveCount(0);

  await page.getByRole("button", { name: "New question" }).click();
  await page.getByLabel("Question (required)").fill("Draft my pleading [mock:refuse]");
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByTestId("job-ended")).toContainText("declined", { timeout: 15_000 });
});

test("empty question and an over-long case file are rejected before submitting", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.locator("#err-question")).toHaveText("Enter a question.");
  await page.getByLabel("Question (required)").fill("q");
  await page.getByLabel("Case file (optional)").fill("x".repeat(60_001));
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.locator(".field-error")).toContainText("too long");
});

test("per-code daily limit returns a clear message", async ({ page }) => {
  await login(page, "e2e-limit-code");
  await page.getByRole("button", { name: "I understand" }).click();
  for (let i = 0; i < 6; i++) {
    expect((await page.request.post("/api/research", { data: { question: "q" } })).status()).toBe(202);
  }
  await page.getByLabel("Question (required)").fill("one too many");
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByTestId("form-error")).toContainText("used its 6 research runs for today");
});

test("feedback is saved as a JSON line without case text", async ({ page }) => {
  const file = process.env.FEEDBACK_FILE!;
  await rm(file, { force: true });
  await ready(page);
  await page.getByText("Give feedback on this page").click();
  await page.getByLabel("4").check();
  await page.getByLabel("Comment (optional)").fill("Clear layout");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thank you. Your feedback was saved.")).toBeVisible();
  const line = JSON.parse((await readFile(file, "utf8")).trim().split("\n").pop()!);
  expect(line).toMatchObject({ page: "/research", rating: 4, comment: "Clear layout" });
  expect(Object.keys(line).sort()).toEqual(["client", "comment", "page", "rating", "ts"]);
});

test("works on a phone: no horizontal scrolling on the form or the result", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await ready(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByLabel("Question (required)").fill("Mobile check");
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByTestId("result")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("citation-chip").first().click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  if (shots) await page.screenshot({ path: `${shots}/assistant-mobile.png`, fullPage: true });
});
