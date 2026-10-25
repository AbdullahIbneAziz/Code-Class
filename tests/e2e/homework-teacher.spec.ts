import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
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

// The fixed 2027 dates must stay in the future: move them on if this suite is run after Oct 2027.
let teacher: TestUser;
let studentA: TestUser;
let studentB: TestUser;

test.beforeAll(async () => {
  teacher = await makeTestUser("teacher");
  studentA = await makeTestUser("student");
  studentB = await makeTestUser("student");
});
test.afterAll(cleanupTestUsers);

const title = () => {
  const t = `t_hw_${randomBytes(3).toString("hex")}`;
  trackAssignmentTitle(t); // registered before the UI creates it
  return t;
};
const pdf = (name = "t_q.pdf", n = 2048) => ({ name, mimeType: "application/pdf", buffer: Buffer.alloc(n, 1) });
const HW_PATH = /^\/teacher\/homework\/[0-9a-f-]{36}$/;

async function idByTitle(t: string): Promise<string> {
  const { data, error } = await adminClient().from("assignments").select("id").eq("title", t).single();
  if (error) throw new Error(error.message);
  trackFolder("questions", data.id);
  return data.id;
}

async function asTeacher(page: Page) {
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
}

async function fillNew(page: Page, t: string, due: [string, string], from?: [string, string]) {
  await page.goto("/teacher/homework/new");
  await page.getByLabel("Title", { exact: true }).fill(t);
  if (from) {
    await page.getByLabel(/^Show from.* date$/).fill(from[0]);
    await page.getByLabel(/^Show from.* time$/).fill(from[1]);
  }
  await page.getByLabel("Deadline date").fill(due[0]);
  await page.getByLabel("Deadline time").fill(due[1]);
}

async function seedWithStudents(t: string, students: TestUser[]): Promise<string> {
  trackAssignmentTitle(t);
  const id = await adminSeedAssignment({ title: t, due_at: "2027-01-12T20:00:00Z" });
  trackFolder("questions", id);
  for (const s of students) await adminAssign(id, s.id);
  return id;
}

async function seedSubmission(assignmentId: string, studentId: string) {
  const { error } = await adminClient().from("submissions").insert({
    assignment_id: assignmentId,
    student_id: studentId,
    original_name: "t_work.py",
    object_path: `${assignmentId}/${studentId}/t_none.py`,
    size_bytes: 10,
    submitted_at: new Date(Date.now() - 3_600_000).toISOString(),
  });
  if (error) throw new Error(error.message);
}

test("new homework has every active student ticked and saves with a question file", async ({ page }) => {
  const t = title();
  await asTeacher(page);
  await page.goto("/teacher/homework");
  await page.getByRole("link", { name: "+ New homework" }).click();
  await expect(page.getByRole("heading", { name: "New homework", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Maximum mark")).toHaveValue("10");
  await expect(page.getByLabel(studentA.username)).toBeChecked();
  await expect(page.getByLabel(studentB.username)).toBeChecked();
  await page.getByLabel("Title", { exact: true }).fill(t);
  await page.getByLabel("Instructions").fill("t_ do it");
  await page.getByLabel("Deadline date").fill("2027-01-12");
  await page.getByLabel("Deadline time").fill("20:00");
  await page.getByLabel("Question files").setInputFiles([pdf()]);
  await page.getByRole("button", { name: "Create homework" }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toMatch(HW_PATH);
  const id = await idByTitle(t);
  const a = adminClient();
  const { data: rows } = await a.from("assignment_students").select("student_id").eq("assignment_id", id);
  expect(rows).toHaveLength(2);
  const { data: files } = await a.from("assignment_files").select("purpose").eq("assignment_id", id);
  expect(files).toEqual([{ purpose: "question" }]);
  await expect(page.getByText("t_q.pdf")).toBeVisible();
});

test.describe("Bangladesh-time computer", () => {
  test.use({ timezoneId: "Asia/Dhaka" });
  test("teacher on a Bangladesh-time computer: 8:00 PM is saved as 8:00 PM UK", async ({ page }) => {
    const t = title();
    await asTeacher(page);
    await fillNew(page, t, ["2027-01-12", "20:00"]);
    await page.getByRole("button", { name: "Create homework" }).click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toMatch(HW_PATH);
    const id = await idByTitle(t);
    const { data } = await adminClient().from("assignments").select("due_at").eq("id", id).single();
    expect(new Date(data!.due_at).toISOString()).toBe("2027-01-12T20:00:00.000Z");
    await page.goto("/teacher/homework");
    const row = page.getByRole("listitem").filter({ hasText: t });
    await expect(row).toContainText("Tue 12 Jan 2027, 8:00 PM GMT");
    await expect(row).toContainText("Wed 13 Jan, 2:00 AM BD");
    await page.goto(`/teacher/homework/${id}`);
    await expect(page.getByLabel("Deadline time")).toHaveValue("20:00");
    await expect(page.getByLabel("Deadline date")).toHaveValue("2027-01-12");
  });
});

test("ambiguous time asks for BST or GMT and keeps the typed values", async ({ page }) => {
  const t = title();
  await asTeacher(page);
  await fillNew(page, t, ["2027-10-31", "01:30"]);
  await page.getByLabel("Question files").setInputFiles([pdf()]);
  await page.getByRole("button", { name: "Create homework" }).click();
  await expect(page.getByText("BST (first time) or GMT (second time)?", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(t);
  await expect(page.getByLabel("Deadline date")).toHaveValue("2027-10-31");
  expect(await page.getByLabel("Question files").evaluate((el) => (el as HTMLInputElement).files?.length)).toBe(1);
  const { data: none } = await adminClient().from("assignments").select("id").eq("title", t);
  expect(none).toHaveLength(0);
  await page.getByLabel("GMT (second time)").check();
  await page.getByRole("button", { name: "Create homework" }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toMatch(HW_PATH);
  const id = await idByTitle(t);
  const { data } = await adminClient().from("assignments").select("due_at").eq("id", id).single();
  expect(new Date(data!.due_at).toISOString()).toBe("2027-10-31T01:30:00.000Z");
  await expect(page.getByText("1:30 AM GMT").first()).toBeVisible();
  await expect(page.getByText("t_q.pdf")).toBeVisible();
});

test("nonexistent time is refused", async ({ page }) => {
  const t = title();
  await asTeacher(page);
  await fillNew(page, t, ["2027-03-28", "01:30"]);
  await page.getByRole("button", { name: "Create homework" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This time doesn't exist in the UK on this day (clocks go forward). Please choose another time." })).toBeVisible();
  const { data } = await adminClient().from("assignments").select("id").eq("title", t);
  expect(data).toHaveLength(0);
});

test("scheduled homework is listed as Scheduled and its show-from can be changed", async ({ page }) => {
  const t = title();
  await asTeacher(page);
  await fillNew(page, t, ["2027-01-12", "20:00"], ["2027-01-10", "09:00"]);
  await page.getByRole("button", { name: "Create homework" }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toMatch(HW_PATH);
  const id = await idByTitle(t);
  await page.goto("/teacher/homework");
  const row = page.getByRole("listitem").filter({ hasText: t });
  await expect(row).toContainText("Scheduled");
  await expect(row).toContainText("Shows from Sun 10 Jan 2027, 9:00 AM GMT");
  await page.goto(`/teacher/homework/${id}`);
  await expect(page.getByLabel(/^Show from.* date$/)).toBeEnabled();
  await page.getByLabel(/^Show from.* date$/).fill("2027-01-11");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  const { data } = await adminClient().from("assignments").select("visible_from").eq("id", id).single();
  expect(new Date(data!.visible_from).toISOString()).toBe("2027-01-11T09:00:00.000Z");
});

test("after a submission: an earlier deadline is refused with the DB message and Replace shows the warning", async ({ page }) => {
  const t = `t_hw_${randomBytes(3).toString("hex")}`;
  const id = await seedWithStudents(t, [studentA, studentB]);
  await seedSubmission(id, studentA.id);
  await asTeacher(page);
  await page.goto(`/teacher/homework/${id}`);
  await expect(page.getByText("Test student: Submitted · On time")).toBeVisible();
  await expect(page.getByText("Test student: Pending")).toBeVisible();
  await page.getByLabel("Deadline date").fill("2027-01-11");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "You can't move the deadline earlier after someone has submitted. Use a per-student exception instead." })).toBeVisible();
  await expect(page.getByLabel("Deadline date")).toHaveValue("2027-01-11");
  await page.getByLabel("Add question file").setInputFiles(pdf("t_a.pdf"));
  const li = page.getByRole("listitem").filter({ hasText: "t_a.pdf" });
  await expect(li).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Students who already downloaded the old file won't see the change. Tell them in class.")).toBeVisible();
  await li.locator('input[aria-label^="Replacement for"]').setInputFiles(pdf("t_b.pdf", 4096));
  await expect(page.getByRole("listitem").filter({ hasText: "t_b.pdf" })).toBeVisible({ timeout: 30_000 });
  const { data: rep } = await adminClient()
    .from("replaced_files")
    .select("object_path")
    .eq("bucket", "questions")
    .like("object_path", `${id}/%`);
  expect(rep).toHaveLength(1);
});

test("unticking a student removes them; delete needs confirmation and is blocked after a submission", async ({ page }) => {
  const t = `t_hw_${randomBytes(3).toString("hex")}`;
  const id = await seedWithStudents(t, [studentA, studentB]);
  await seedSubmission(id, studentA.id);
  await asTeacher(page);
  await page.goto(`/teacher/homework/${id}`);
  // A has submitted: cannot be removed.
  await page.getByLabel(studentA.username).uncheck();
  await page.getByRole("button", { name: "Save students" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Test student has submitted, so they can't be removed. Excuse them instead." })).toBeVisible();
  await page.getByLabel(studentA.username).check();
  await page.getByLabel(studentB.username).uncheck();
  await page.getByRole("button", { name: "Save students" }).click();
  await expect(page.getByText("Students saved.")).toBeVisible();
  const { data: rows } = await adminClient().from("assignment_students").select("student_id").eq("assignment_id", id);
  expect(rows).toEqual([{ student_id: studentA.id }]);

  await page.getByRole("button", { name: "Delete homework" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Confirm delete" })).toHaveCount(0);
  await page.getByRole("button", { name: "Delete homework" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This homework can't be deleted because someone has submitted." })).toBeVisible();

  await adminClient().from("submissions").delete().eq("assignment_id", id);
  await page.getByRole("button", { name: "Delete homework" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expectPath(page, "/teacher/homework");
  const { data: gone } = await adminClient().from("assignments").select("id").eq("id", id);
  expect(gone).toHaveLength(0);
});
