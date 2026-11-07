import { expect, test } from "@playwright/test";
import { mailCount, signIn } from "./helpers.js";

test("unknown email gets the same message and no link", async ({ page }) => {
  const before = mailCount();
  await page.goto("/login");
  await page.getByLabel("Email").fill("stranger@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  await page.waitForTimeout(300);
  expect(mailCount()).toBe(before);
});

test("sign in, import a recipe, build a day and make a shopping list", async ({ page }) => {
  await signIn(page);

  // Import a recipe through the (stubbed) AI and save it after review.
  await page.getByRole("link", { name: "+ Add" }).click();
  await page.getByLabel("Paste a recipe").fill("Halloumi, butter beans and capsicum tray bake for two...");
  await page.getByRole("button", { name: "Estimate nutrition" }).click();
  await expect(page.getByRole("heading", { name: "Check the meal" })).toBeVisible();
  await expect(page.getByText("Assumed 2 medium capsicums.")).toBeVisible();
  await expect(page.getByText("estimate", { exact: false }).first()).toBeVisible();
  await page.locator("#protein").fill("29");
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page.getByRole("heading", { name: "Halloumi and white bean tray bake" })).toBeVisible();
  await expect(page.getByText("Edited estimate")).toBeVisible();

  // Build a day: add the new meal, then a breakfast from the picker.
  await page.getByRole("link", { name: "Add to a day" }).click();
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("493 kcal").first()).toBeVisible();
  await page.getByRole("link", { name: "Add to Breakfast" }).click();
  await page.getByRole("button", { name: /^Overnight oats/ }).click();
  await expect(page.getByText("Energy 884 / 1,500 kcal")).toBeVisible();
  await expect(page.getByText("616 kcal left")).toBeVisible();

  // Shopping list from the day.
  await page.getByText("Name, date, duplicate or delete").click();
  await page.getByRole("link", { name: "Shopping list" }).click();
  await page.getByRole("button", { name: "Make shopping list" }).click();
  await expect(page.getByRole("heading", { name: "Dairy" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Halloumi\s*200 g/ })).toBeVisible(); // recipe serves 2, 1 serve each for 2 people: 180 g -> 200 g
  await expect(page.getByText("Show pantry staples")).toBeVisible();
  const oats = page.getByRole("checkbox", { name: /Rolled oats/ });
  await oats.click();
  await expect(oats).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Rolled oats/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#list-text")).toContainText("Halloumi, 200 g");
});

test("find a high-protein dinner in two taps", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Dinner", exact: true }).click();
  await page.getByRole("link", { name: "Most protein" }).click();
  await expect(page.locator(".meal-card h3").first()).toHaveText("Tandoori chicken and dal");
});
