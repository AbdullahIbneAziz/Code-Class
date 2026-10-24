import { expect, type Page } from "@playwright/test";

export async function loginVia(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

export async function expectPath(page: Page, path: string) {
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).toBe(path);
}
