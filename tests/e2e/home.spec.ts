import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import {
  adminAssign,
  adminClient,
  adminSeedAssignment,
  cleanupTestUsers,
  makeTestUser,
  trackAssignmentTitle,
  trackFolder,
  type TestUser,
} from "../api/helpers";
import { expectPath, loginVia } from "./helpers";

const HOUR = 3_600_000;
let student: TestUser;
let lonely: TestUser;

test.beforeAll(async () => {
  student = await makeTestUser("student");
  lonely = await makeTestUser("student");
});
test.afterAll(cleanupTestUsers);

async function seed(partial: Parameters<typeof adminSeedAssignment>[0], who: TestUser, withFile?: string) {
  const title = `t_hw_${randomBytes(3).toString("hex")}`;
  trackAssignmentTitle(title); // before anything is created
  const id = await adminSeedAssignment({ ...partial, title });
  trackFolder("questions", id);
  trackFolder("submissions", id);
  await adminAssign(id, who.id);
  if (withFile) {
    const path = `${id}/${randomUUID()}.pdf`;
    const a = adminClient();
    const up = await a.storage.from("questions").upload(path, Buffer.alloc(512, 1), { contentType: "application/pdf", upsert: false });
    if (up.error) throw new Error(up.error.message);
    const ins = await a
      .from("assignment_files")
      .insert({ assignment_id: id, purpose: "question", original_name: withFile, object_path: path, size_bytes: 512 });
    if (ins.error) throw new Error(ins.error.message);
  }
  return { id, title };
}

async function login(page: import("@playwright/test").Page, u: TestUser) {
  await loginVia(page, u.username, u.password);
  await expectPath(page, "/");
}

test("home shows the banner first with the count and the list", async ({ page }) => {
  const pending = await seed({ due_at: new Date(Date.now() + 3 * 24 * HOUR).toISOString() }, student, "t_q.pdf");
  const missed = await seed({ due_at: new Date(Date.now() - HOUR).toISOString() }, student);
  const sub = await seed({ due_at: new Date(Date.now() + 5 * 24 * HOUR).toISOString() }, student);
  const ins = await adminClient()
    .from("submissions")
    .insert({
      assignment_id: sub.id,
      student_id: student.id,
      object_path: `${sub.id}/${student.id}/${randomUUID()}.py`,
      original_name: "t_done.py",
      size_bytes: 1,
      submitted_at: new Date().toISOString(),
    });
  expect(ins.error).toBeNull();

  await login(page, student);
  const banner = page.getByRole("status");
  await expect(banner).toHaveText("⚠ You have 2 pending homeworks");
  // banner is the first element of main after the welcome line
  await expect(page.locator("main > *").nth(0)).toContainText("Welcome,");
  await expect(page.locator("main > *").nth(1)).toHaveAttribute("role", "status");
  await expect(page.getByRole("heading", { name: "Pending", level: 2 })).toBeVisible();
  await expect(page.getByText(sub.title)).toHaveCount(0);
  const cards = page.locator("main li");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText(pending.title);
  await expect(cards.nth(1)).toContainText(missed.title);
  await expect(cards.nth(1)).toContainText("LATE, ");
  for (const i of [0, 1]) await expect(cards.nth(i).getByRole("link", { name: "Upload" })).toBeVisible();
  await expect(cards.nth(0).getByRole("link", { name: "Upload" })).toHaveAttribute("href", `/homework/${pending.id}#your-work`);
  await expect(cards.nth(0).getByRole("button", { name: "Download" })).toBeVisible();
  await expect(cards.nth(1).getByRole("button", { name: "Download" })).toHaveCount(0);
});

test("submitting removes it from the banner", async ({ page }) => {
  const a = await seed({ due_at: new Date(Date.now() + 2 * 24 * HOUR).toISOString() }, student);
  await login(page, student);
  const before = Number((await page.getByRole("status").textContent())!.match(/\d+/)![0]);
  await page.goto(`/homework/${a.id}`);
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "t_s.py", mimeType: "text/x-python", buffer: Buffer.from("1") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.locator("main p", { hasText: /^Submitted · On time$/ }).first()).toBeVisible({ timeout: 30_000 });
  await page.goto("/");
  await expect(page.getByText(a.title)).toHaveCount(0);
  const n = before - 1;
  await expect(page.getByRole("status")).toHaveText(
    n === 0 ? "✓ You're all caught up." : n === 1 ? "⚠ You have 1 pending homework" : `⚠ You have ${n} pending homeworks`,
  );
});

test('a student with nothing to do sees "✓ You\'re all caught up."', async ({ page }) => {
  await login(page, lonely);
  await expect(page.getByRole("status")).toHaveText("✓ You're all caught up.");
  await expect(page.getByRole("heading", { name: "Pending", level: 2 })).toHaveCount(0);
});
