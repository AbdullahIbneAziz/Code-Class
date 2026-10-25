import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import {
  adminAssign,
  adminClient,
  adminSeedAssignment,
  adminSeedSolution,
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
  student = await makeTestUser("student", { displayName: "t_student_marks" });
});
test.afterAll(cleanupTestUsers);

async function seed(partial: Parameters<typeof adminSeedAssignment>[0] = {}): Promise<{ id: string; title: string }> {
  const title = `t_hw_${randomBytes(3).toString("hex")}`;
  trackAssignmentTitle(title); // before anything is created
  const id = await adminSeedAssignment({ ...partial, title });
  trackFolder("submissions", id);
  trackFolder("solutions", id);
  await adminAssign(id, student.id);
  return { id, title };
}

async function login(page: Page) {
  await loginVia(page, student.username, student.password);
  await expectPath(page, "/");
}

async function open(page: Page, id: string) {
  await login(page);
  await page.goto(`/homework/${id}`);
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
}

const markedNow = () => ({ mark: 8, markedAt: new Date().toISOString() });

test("Marked tab lists marked homework with its mark; Submitted no longer does", async ({ page }) => {
  const hw = await seed();
  await adminSeedSubmission(hw.id, student.id, markedNow());
  await login(page);
  await page.goto("/homework?tab=marked");
  const card = page.getByRole("link", { name: new RegExp(hw.title) });
  await expect(card).toContainText("Submitted · On time · Marked 8/10");
  await page.goto("/homework?tab=submitted");
  await expect(page.getByRole("heading", { name: "Homework" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(hw.title) })).toHaveCount(0);
});

test("excused homework appears under Submitted as Excused and its page has no upload form", async ({ page }) => {
  const hw = await seed();
  const { error } = await adminClient()
    .from("assignment_students")
    .update({ excused: true })
    .eq("assignment_id", hw.id)
    .eq("student_id", student.id);
  expect(error).toBeNull();
  await login(page);
  await page.goto("/homework?tab=submitted");
  await expect(page.getByRole("link", { name: new RegExp(hw.title) })).toContainText("Excused");
  await page.getByRole("link", { name: new RegExp(hw.title) }).click();
  await expect(page.getByText("You've been excused from this homework. It doesn't count.")).toBeVisible();
  await expect(page.getByLabel(LABEL)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(0);
});

test("detail page shows mark, multi-line feedback as plain text, and the locked note", async ({ page }) => {
  const hw = await seed();
  const feedback = "Good work.\nQ7 fails on <b>empty</b> lists.";
  await adminSeedSubmission(hw.id, student.id, { ...markedNow(), feedback });
  await open(page, hw.id);
  const section = page.locator("#your-mark");
  await expect(section).toContainText("8/10");
  const para = section.locator("p.whitespace-pre-wrap");
  const text = await para.evaluate((el) => (el as HTMLElement).innerText);
  expect(text).toContain("Good work.\nQ7 fails on <b>empty</b> lists.");
  await expect(para.locator("b")).toHaveCount(0);
  await expect(page.getByText("Marked. Your file is locked.")).toBeVisible();
});

test("submitted and past the deadline: Download solution gets the original name", async ({ page }) => {
  const hw = await seed({ due_at: new Date(Date.now() - HOUR).toISOString() });
  await adminSeedSubmission(hw.id, student.id, { submittedAt: new Date(Date.now() - 2 * HOUR).toISOString() });
  await adminSeedSolution(hw.id, "t_solution.ipynb");
  await open(page, hw.id);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#solution").getByRole("button", { name: "Download solution" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("t_solution.ipynb");
});

test('not submitted, not unlocked, past the deadline: "Submit your homework to unlock the solution."', async ({ page }) => {
  const hw = await seed({ due_at: new Date(Date.now() - HOUR).toISOString() });
  await adminSeedSolution(hw.id, "t_solution.ipynb");
  await open(page, hw.id);
  await expect(page.locator("#solution")).toContainText("Submit your homework to unlock the solution.");
  await expect(page.getByRole("button", { name: "Download solution" })).toHaveCount(0);
});

test("solution stays hidden before the student's own deadline even when unlocked for everyone", async ({ page }) => {
  const hw = await seed({ due_at: new Date(Date.now() - HOUR).toISOString() });
  const admin = adminClient();
  const { error } = await admin
    .from("assignment_students")
    .update({ due_at_override: new Date(Date.now() + HOUR).toISOString() })
    .eq("assignment_id", hw.id)
    .eq("student_id", student.id);
  expect(error).toBeNull();
  const { error: uErr } = await admin.from("assignments").update({ solution_unlocked_for_all: true }).eq("id", hw.id);
  expect(uErr).toBeNull();
  const sol = await adminSeedSolution(hw.id, "t_solution.ipynb");
  await open(page, hw.id);
  await expect(page.locator("#solution")).toContainText("The solution will be available after your deadline.");
  await expect(page.getByRole("button", { name: "Download solution" })).toHaveCount(0);
  const signed = await student.client.storage.from("solutions").createSignedUrl(sol.objectPath, 60);
  expect(signed.error).not.toBeNull();
});

test("after the teacher marks, an open page's upload is refused with the marked copy and the page shows the locked state", async ({
  page,
}) => {
  const hw = await seed();
  const sub = await adminSeedSubmission(hw.id, student.id);
  await open(page, hw.id);
  await expect(page.getByRole("button", { name: "Upload" })).toBeEnabled({ timeout: 20_000 }); // hydrated
  const { error } = await adminClient()
    .from("submissions")
    .update({ mark: 5, marked_at: new Date().toISOString() })
    .eq("id", sub.id);
  expect(error).toBeNull();
  await page.getByLabel(LABEL).setInputFiles({ name: "t_new.ipynb", mimeType: "application/json", buffer: Buffer.from("{}") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("This has already been marked, so it can't be replaced.", {
    timeout: 30_000,
  });
  await expect(page.getByText("Marked. Your file is locked.")).toBeVisible({ timeout: 20_000 });
});
