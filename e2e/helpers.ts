import { expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

function mails(): { to: string; text: string }[] {
  const file = process.env.MAIL_LOG_FILE!;
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export async function signIn(page: Page, email = "robin@example.com") {
  const before = mails().length;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  await expect.poll(() => mails().length).toBeGreaterThan(before);
  const link = mails().at(-1)!.text.match(/https?:\/\/\S+/)![0];
  await page.goto(link);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/meals/);
}

export function mailCount() {
  return mails().length;
}
