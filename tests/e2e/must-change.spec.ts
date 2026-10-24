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
  await page.goto("/");
  await expectPath(page, "/login");
  await page.goto("/");
  await expectPath(page, "/login");
});
