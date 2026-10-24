import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { adminClient, cleanupTestUsers, makeTestUser } from "../api/helpers";
import { expectPath, loginVia } from "./helpers";

let createdId: string | undefined;

test.afterAll(async () => {
  if (createdId) await adminClient().auth.admin.deleteUser(createdId);
  await cleanupTestUsers();
});

test("teacher adds a student, sees the temp password once, and the student can log in", async ({ page, browser }) => {
  const teacher = await makeTestUser("teacher");
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto("/teacher/students");

  const username = `t_e2e_${randomBytes(3).toString("hex")}`;
  const temp = `Temp-${randomBytes(4).toString("hex")}`;
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Display name").fill("E2E Student");
  await page.getByLabel("Temporary password").fill(temp);
  await page.getByRole("button", { name: "Add student" }).click();

  await expect(page.getByTestId("temp-password")).toHaveText(temp);
  await expect(page.getByText("Send this to the family on WhatsApp.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(username) })).toBeVisible();

  const { data } = await adminClient().from("profiles").select("id").eq("username", username).single();
  createdId = data!.id;

  // Shown once: gone after a reload.
  await page.reload();
  await expect(page.getByTestId("temp-password")).toHaveCount(0);

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await loginVia(p2, username, temp);
  await expectPath(p2, "/account/new-password");
  await ctx.close();

  // Deactivate needs an inline confirmation; Cancel backs out.
  const row = page.getByRole("row", { name: new RegExp(username) });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await row.getByRole("button", { name: "Cancel" }).click();
  await expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();
  await row.getByRole("button", { name: "Deactivate" }).click();
  await row.getByRole("button", { name: "Confirm deactivate" }).click();
  await expect(row.getByRole("button", { name: "Reactivate" })).toBeVisible();
});
