import { test, expect } from "@playwright/test";
import { adminClient, cleanupTestUsers, makeTestUser } from "../api/helpers";
import { expectPath, loginVia } from "./helpers";

test.afterAll(async () => {
  await cleanupTestUsers();
});

test("logged-out visitor is sent to /login", async ({ page }) => {
  for (const p of ["/", "/teacher", "/account"]) {
    await page.goto(p);
    await expectPath(page, "/login");
  }
});

test("user with must_change_password is sent to /account/new-password from /, /teacher/students and /account", async ({ page }) => {
  const u = await makeTestUser("student", { mustChangePassword: true });
  await loginVia(page, u.username, u.password);
  await expectPath(page, "/account/new-password");
  for (const p of ["/", "/teacher/students", "/account"]) {
    await page.goto(p);
    await expectPath(page, "/account/new-password");
  }
});

test("student visiting /teacher is sent to /", async ({ page }) => {
  const u = await makeTestUser("student");
  await loginVia(page, u.username, u.password);
  await expectPath(page, "/");
  await page.goto("/teacher");
  await expectPath(page, "/");
  await expect(page.getByText("Your homework will appear here.")).toBeVisible();
});

test("teacher visiting / is sent to /teacher", async ({ page }) => {
  const u = await makeTestUser("teacher");
  await loginVia(page, u.username, u.password);
  await expectPath(page, "/teacher");
  await page.goto("/");
  await expectPath(page, "/teacher");
  await expect(page.getByText("Teacher dashboard")).toBeVisible();
  await expect(page.getByRole("link", { name: /students/i }).first()).toHaveAttribute("href", "/teacher/students");
});

test("deactivated user is signed out and sent to /login", async ({ page }) => {
  const u = await makeTestUser("student");
  await loginVia(page, u.username, u.password);
  await expectPath(page, "/");
  const { error } = await adminClient().from("profiles").update({ is_active: false }).eq("id", u.id);
  expect(error).toBeNull();
  // The signing-out redirect clears auth cookies, so it must not be cacheable.
  const raw = await page.context().request.get("/", { maxRedirects: 0 });
  expect(raw.status()).toBe(307);
  expect(raw.headers()["cache-control"]).toContain("no-store");
  await page.goto("/");
  await expectPath(page, "/login");
  await page.goto("/");
  await expectPath(page, "/login");
});

test("first login forces new password, then lands on home; the next login goes straight to home", async ({ page, browser }) => {
  const u = await makeTestUser("student", { mustChangePassword: true });
  const next = `Fresh-${u.password}`;
  await loginVia(page, u.username, u.password);
  await expectPath(page, "/account/new-password");
  await expect(page.getByRole("heading", { name: "Choose your new password" })).toBeVisible();
  await expect(page.getByText("This is a temporary password from your teacher. Please choose your own.")).toBeVisible();

  await page.getByLabel("Current password").fill(u.password);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill("something-else-1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("The two new passwords don't match.");

  // The form resets after each submit, so fill every field again.
  await page.getByLabel("Current password").fill(u.password);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password").fill(next);
  await page.getByRole("button", { name: "Change password" }).click();
  await expectPath(page, "/");
  await expect(page.getByText("Your homework will appear here.")).toBeVisible();

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await loginVia(p2, u.username, next);
  await expectPath(p2, "/");
  await ctx.close();

  // Voluntary change on /account
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
  await expect(page.getByText(u.username)).toBeVisible();
});

test("after teacher reset, next login forces new password again", async ({ page, browser }) => {
  const teacher = await makeTestUser("teacher");
  const student = await makeTestUser("student");
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto("/teacher/students");
  const row = page.getByRole("row", { name: new RegExp(student.username) });
  await expect(row).toBeVisible();
  const temp = `Temp-${student.password.slice(-8)}`;
  await row.getByLabel(`Reset password for ${student.username}`).fill(temp);
  await row.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByTestId("temp-password")).toHaveText(temp);

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await loginVia(p2, student.username, temp);
  await expectPath(p2, "/account/new-password");
  await ctx.close();
});
