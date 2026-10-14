import { expect, test } from "@playwright/test";

const shots = process.env.E2E_SCREENSHOT_DIR;

test("returns the version in force on the requested date, with exact text and limitations", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Question or keywords").fill("retain personal data");
  await page.getByLabel("Jurisdiction").selectOption("XA");
  await page.getByLabel("Law as of").fill("2020-06-01");
  await page.getByRole("button", { name: "Search" }).click();

  const first = page.getByTestId("result").first();
  await expect(first.locator(".citation")).toContainText("Personal Data Act 2015 (XA) s 12(1)");
  await expect(first.getByTestId("exact-text")).toContainText("seven years");
  await expect(first.getByTestId("authority")).toHaveText("Binding: legislation in force");
  await expect(first.locator('[data-code="FICTIONAL_DATA"]')).toBeVisible();
  await expect(first.locator('[data-code="LATER_VERSION_EXISTS"]')).toContainText("2022-01-01");
  if (shots) await page.screenshot({ path: `${shots}/search-2020.png`, fullPage: false });

  await page.getByLabel("Law as of").fill("2024-01-01");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("result").first().getByTestId("exact-text")).toContainText("five years");
});

test("point-in-time provision view shows the full timeline", async ({ page }) => {
  const uri = "/akn/xa/act/2015/12/~sec_12__subsec_1";
  await page.goto(`/provision?uri=${encodeURIComponent(uri)}&as_of=2019-01-01`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Personal Data Act 2015 (XA) s 12(1)");
  await expect(page.getByTestId("status-on-date")).toHaveText("in force");
  await expect(page.getByTestId("exact-text")).toContainText("seven years");
  await expect(page.getByTestId("timeline").locator("li")).toHaveCount(2);
  if (shots) await page.screenshot({ path: `${shots}/provision-timeline.png`, fullPage: true });
});

test("a jurisdiction without a corpus says so instead of answering", async ({ page }) => {
  await page.goto("/?q=retention+of+personal+data&jurisdiction=IN");
  await expect(page.getByTestId("result")).toHaveCount(0);
  await expect(page.locator('[data-code="NO_CORPUS"]').first()).toBeVisible();
  await expect(page.locator('[data-code="PROFILE_UNVERIFIED"]').first()).toBeVisible();
  await expect(page.getByText("This is not evidence that no law applies")).toBeVisible();
});

test("cross-lingual search groups equally authentic language versions", async ({ page }) => {
  await page.goto("/?q=erasure&jurisdiction=XB&as_of=2024-01-01");
  const card = page.getByTestId("result").filter({ hasText: "al. 3" }).first();
  await expect(card).toBeVisible();
  await expect(card.locator("summary", { hasText: "Other language versions" })).toBeVisible();
});

test("coverage page lists gaps and licence status", async ({ page }) => {
  await page.goto("/coverage");
  await expect(page.locator('tr[data-jurisdiction="IN"]')).toContainText("none");
  await expect(page.locator('tr[data-source="in-india-code"]')).toContainText("pending review");
  await expect(page.locator('tr[data-source="ulis-fictional-sample"]')).toContainText("approved");
  if (shots) await page.screenshot({ path: `${shots}/coverage.png`, fullPage: true });
});
