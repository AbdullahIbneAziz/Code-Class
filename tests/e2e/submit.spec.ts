import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import {
  adminAssign,
  adminClient,
  adminSeedAssignment,
  adminSeedSubmission,
  cleanupTestUsers,
  makeTestUser,
  trackAssignmentTitle,
  trackFolder,
  type TestUser,
} from "../api/helpers";
import { expectPath, loginVia } from "./helpers";

const HOUR = 3_600_000;
const LABEL = "Choose your notebook (.ipynb or .py)";
let student: TestUser;

test.beforeAll(async () => {
  student = await makeTestUser("student");
});
test.afterAll(cleanupTestUsers);

async function seed(partial: Parameters<typeof adminSeedAssignment>[0]): Promise<{ id: string; title: string }> {
  const title = `t_hw_${randomBytes(3).toString("hex")}`;
  trackAssignmentTitle(title); // before anything is created
  const id = await adminSeedAssignment({ ...partial, title });
  trackFolder("questions", id);
  trackFolder("submissions", id);
  await adminAssign(id, student.id);
  return { id, title };
}

async function open(page: Page, id: string) {
  await loginVia(page, student.username, student.password);
  await expectPath(page, "/");
  await page.goto(`/homework/${id}`);
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
}

const nb = (name: string, text = "{}") => ({ name, mimeType: "application/json", buffer: Buffer.from(text) });
const status = (page: Page, s: string) => page.locator("main p", { hasText: new RegExp(`^${s}$`) }).first();

async function submission(id: string) {
  const { data } = await adminClient().from("submissions").select("*").eq("assignment_id", id).eq("student_id", student.id);
  return data ?? [];
}

test('student submits on time, sees "Submitted · On time" and downloads own file', async ({ page }) => {
  const hw = await seed({});
  await open(page, hw.id);
  await page.getByLabel(LABEL).setInputFiles(nb("t_mine.ipynb", '{"a":1}'));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(status(page, "Submitted · On time")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("You can replace your file until your teacher marks it.")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("region", { name: "Your work" }).getByRole("button", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("t_mine.ipynb");
  const rows = await submission(hw.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].revision).toBe(1);
});

test('student submits after the deadline and sees "Submitted · Late"', async ({ page }) => {
  const hw = await seed({ due_at: new Date(Date.now() - HOUR).toISOString() });
  await open(page, hw.id);
  await page.getByLabel(LABEL).setInputFiles(nb("t_late.py", "print(1)"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(status(page, "Submitted · Late")).toBeVisible({ timeout: 30_000 });
});

test("replacing before the deadline keeps one row at revision 2", async ({ page }) => {
  const hw = await seed({});
  await open(page, hw.id);
  const input = page.getByLabel(LABEL);
  await input.setInputFiles(nb("t_one.ipynb", "1"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(status(page, "Submitted · On time")).toBeVisible({ timeout: 30_000 });
  await input.setInputFiles(nb("t_two.ipynb", "22"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect.poll(async () => (await submission(hw.id))[0]?.revision, { timeout: 30_000 }).toBe(2);
  const rows = await submission(hw.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].original_name).toBe("t_two.ipynb");
});

test("wrong type and over-size files are refused in the page", async ({ page }) => {
  const hw = await seed({});
  await open(page, hw.id);
  const input = page.getByLabel(LABEL);
  await input.setInputFiles({ name: "t_notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("This file type isn't allowed here. Allowed: .ipynb, .py");
  await input.setInputFiles({ name: "t_big.py", mimeType: "text/x-python", buffer: Buffer.alloc(5242881, 1) });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("limit is 5 MB.");
  expect(await submission(hw.id)).toHaveLength(0);
});

test("deadline passes while the page is open: the upload is refused with the on-time message and the first submission is unchanged", async ({ page }) => {
  test.setTimeout(120_000);
  const hw = await seed({ due_at: new Date(Date.now() + 40_000).toISOString() });
  await open(page, hw.id);
  const input = page.getByLabel(LABEL);
  await input.setInputFiles(nb("t_first.ipynb", "first"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(status(page, "Submitted · On time")).toBeVisible({ timeout: 30_000 });
  const first = (await submission(hw.id))[0];
  expect(first.revision).toBe(1);

  // The deadline passes while the page stays open (no reload): it falls just after the first submission.
  const due = new Date(new Date(first.submitted_at).getTime() + 1000);
  const { error } = await adminClient().from("assignments").update({ due_at: due.toISOString() }).eq("id", hw.id);
  expect(error).toBeNull();
  await page.waitForTimeout(Math.max(0, due.getTime() - Date.now()) + 1500);
  await input.setInputFiles(nb("t_second.ipynb", "second"));
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("Your on-time submission can't be replaced after the deadline.", {
    timeout: 30_000,
  });

  const rows = await submission(hw.id);
  expect(rows).toHaveLength(1);
  expect(rows[0].revision).toBe(1);
  expect(rows[0].object_path).toBe(first.object_path);
  expect(rows[0].submitted_at).toBe(first.submitted_at);
  // The refused file is still chosen, so the student can retry or pick another.
  await expect.poll(() => input.evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe("t_second.ipynb");
  expect(rows[0].original_name).toBe("t_first.ipynb");
});

test("late submission shows the late lock note and no upload form", async ({ page }) => {
  const hw = await seed({
    visible_from: new Date(Date.now() - 6 * HOUR).toISOString(),
    opens_at: new Date(Date.now() - 5 * HOUR).toISOString(),
    due_at: new Date(Date.now() - 2 * HOUR).toISOString(),
  });
  await adminSeedSubmission(hw.id, student.id, { submittedAt: new Date(Date.now() - HOUR).toISOString() });
  await open(page, hw.id);
  await expect(page.getByText("Your late submission is locked because the deadline has passed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(0);
  await expect(page.getByLabel(LABEL)).toHaveCount(0);
});
