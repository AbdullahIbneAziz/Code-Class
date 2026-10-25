import { test, expect, type Page } from "@playwright/test";
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
let teacher: TestUser;
let studentA: TestUser;
let studentB: TestUser;

test.beforeAll(async () => {
  teacher = await makeTestUser("teacher");
  studentA = await makeTestUser("student");
  studentB = await makeTestUser("student");
});
test.afterAll(cleanupTestUsers);

async function seed(
  partial: Parameters<typeof adminSeedAssignment>[0],
  students: TestUser[],
  withFile?: string,
): Promise<{ id: string; title: string; path?: string }> {
  const title = `t_hw_${randomBytes(3).toString("hex")}`;
  trackAssignmentTitle(title); // registered before anything is created
  const id = await adminSeedAssignment({ ...partial, title });
  trackFolder("questions", id);
  for (const s of students) await adminAssign(id, s.id);
  let path: string | undefined;
  if (withFile) {
    path = `${id}/${randomUUID()}.pdf`;
    const a = adminClient();
    const up = await a.storage.from("questions").upload(path, Buffer.alloc(1024, 1), { contentType: "application/pdf", upsert: false });
    if (up.error) throw new Error(up.error.message);
    const ins = await a
      .from("assignment_files")
      .insert({ assignment_id: id, purpose: "question", original_name: withFile, object_path: path, size_bytes: 1024 });
    if (ins.error) throw new Error(ins.error.message);
  }
  return { id, title, path };
}

/** notFound() after streaming starts keeps status 200 (Next adds noindex), so assert the 404 page itself. */
async function expectNotFound(page: Page) {
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.locator('meta[name="robots"][content="noindex"]')).not.toHaveCount(0);
}

async function asStudent(page: Page, s: TestUser) {
  await loginVia(page, s.username, s.password);
  await expectPath(page, "/");
}

test("student sees a visible homework and downloads the question file with its original name", async ({ page }) => {
  const hw = await seed({ due_at: new Date(Date.now() + 30 * 24 * HOUR).toISOString() }, [studentA], "t_questions.pdf");
  await asStudent(page, studentA);
  await page.goto("/homework");
  await expect(page.getByRole("heading", { name: "Homework", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(hw.title) }).click();
  await expectPath(page, `/homework/${hw.id}`);
  await expect(page.getByRole("heading", { name: hw.title })).toBeVisible();
  await expect(page.locator("main p", { hasText: /^Pending$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Questions" })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("t_questions.pdf");
});

test("scheduled homework is not listed and its URL shows 404 without the title", async ({ page }) => {
  const hw = await seed(
    { visible_from: new Date(Date.now() + 2 * 24 * HOUR).toISOString(), opens_at: new Date(Date.now() + 2 * 24 * HOUR).toISOString(), due_at: new Date(Date.now() + 5 * 24 * HOUR).toISOString() },
    [studentA],
    "t_secret.pdf",
  );
  await asStudent(page, studentA);
  await page.goto("/homework");
  await expect(page.getByRole("heading", { name: "Homework", level: 1 })).toBeVisible();
  await expect(page.getByText(hw.title)).toHaveCount(0);
  await page.goto(`/homework/${hw.id}`);
  await expectNotFound(page);
  await expect(page.getByText(hw.title)).toHaveCount(0);
  await expect(page.getByText("t_secret.pdf")).toHaveCount(0);
  const signed = await studentA.client.storage.from("questions").createSignedUrl(hw.path!, 60);
  expect(signed.error).not.toBeNull();
});

test("homework assigned only to the other student is 404 and its question file cannot be signed", async ({ page }) => {
  const hw = await seed({}, [studentB], "t_other.pdf");
  await asStudent(page, studentA);
  await page.goto(`/homework/${hw.id}`);
  await expectNotFound(page);
  await expect(page.getByText(hw.title)).toHaveCount(0);
  const signed = await studentA.client.storage.from("questions").createSignedUrl(hw.path!, 60);
  expect(signed.error).not.toBeNull();
  const ok = await studentB.client.storage.from("questions").createSignedUrl(hw.path!, 60);
  expect(ok.error).toBeNull();
});

test('missed homework is under Pending as "LATE, was due …"', async ({ page }) => {
  const hw = await seed({ due_at: new Date(Date.now() - HOUR).toISOString() }, [studentA]);
  await asStudent(page, studentA);
  await page.goto("/homework");
  const card = page.getByRole("link", { name: new RegExp(hw.title) });
  await expect(card).toContainText(/LATE, was due/);
  await expect(card).toContainText("Missed");
  await page.goto("/homework?tab=submitted");
  await expect(page.getByText(hw.title)).toHaveCount(0);
});

test("a teacher visiting /homework is sent to /teacher", async ({ page }) => {
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto("/homework");
  await expectPath(page, "/teacher");
});
