import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.js";

const PAGES = ["/meals", "/meals?slot=dinner&sort=protein", "/meals/1", "/meals/1/edit", "/import", "/foods", "/days", "/shopping", "/shopping/new", "/settings"];

test("no serious accessibility problems and no sideways scrolling at 320 px", async ({ page }) => {
  await page.goto("/login");
  const loginAxe = await new AxeBuilder({ page }).analyze();
  expect(loginAxe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await signIn(page);
  // Make a day so the day pages exist.
  await page.goto("/days");
  await page.getByRole("button", { name: "+ New day" }).click();
  const dayPath = new URL(page.url()).pathname;
  const pages = [...PAGES, dayPath, `${dayPath}/add?slot=dinner`];

  for (const path of pages) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${path}: ${v.id} – ${v.help} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`);
    expect(bad, bad.join("\n")).toEqual([]);

    await page.setViewportSize({ width: 320, height: 640 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls sideways by ${overflow}px at 320px`).toBeLessThanOrEqual(0);
  }
});

test("unknown pages get a friendly 404", async ({ page }) => {
  await signIn(page);
  const res = await page.goto("/meals/99999");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to meals" })).toBeVisible();
});

test("dark mode has enough contrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page);
  for (const path of ["/meals", "/meals/1", "/import", "/days", "/shopping/new", "/settings"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    const bad = results.violations.map((v) => `${path}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
    expect(bad, bad.join("\n")).toEqual([]);
  }
});
