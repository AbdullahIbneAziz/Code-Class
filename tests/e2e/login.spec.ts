import { test, expect } from "@playwright/test";
import { cleanupTestUsers, makeTestUser } from "../api/helpers";
import { expectPath, loginVia } from "./helpers";

const GENERIC = "Username or password is incorrect";

test.afterAll(async () => {
  await cleanupTestUsers();
});

test("student logs in with username and lands on home showing Welcome", async ({ page }) => {
  const u = await makeTestUser("student");
  await loginVia(page, u.username, u.password);
  await expectPath(page, "/");
  await expect(page.getByRole("heading", { name: "Welcome, Test student" })).toBeVisible();
});

test("username with capitals and spaces works", async ({ page }) => {
  const u = await makeTestUser("student");
  await loginVia(page, ` ${u.username.toUpperCase()} `, u.password);
  await expectPath(page, "/");
  await expect(page.getByRole("heading", { name: "Welcome, Test student" })).toBeVisible();
});

test("wrong password shows the generic message", async ({ page }) => {
  const u = await makeTestUser("student");
  await loginVia(page, u.username, "definitely-wrong");
  await expect(page.getByText(GENERIC, { exact: true })).toBeVisible();
  await expectPath(page, "/login");
});

test("unknown username shows the same generic message", async ({ page }) => {
  await loginVia(page, "t_nobody_zzz", "whatever-pass");
  await expect(page.getByText(GENERIC, { exact: true })).toBeVisible();
});

test("page has no sign-up or forgot-password link", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByText("Forgot your password? Ask your teacher on WhatsApp.")).toBeVisible();
  await expect(page.getByText(/sign up/i)).toHaveCount(0);
});

test("sign out returns to /login and / redirects to /login again", async ({ page }) => {
  const u = await makeTestUser("student");
  await loginVia(page, u.username, u.password);
  await expectPath(page, "/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expectPath(page, "/login");
  await page.goto("/");
  await expectPath(page, "/login");
});
