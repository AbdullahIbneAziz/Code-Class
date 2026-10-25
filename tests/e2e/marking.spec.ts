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
  trackObject,
  type TestUser,
} from "../api/helpers";
import { expectPath, loginVia } from "./helpers";

const HOUR = 3_600_000;
const REVISION_COPY = "This student uploaded a new version. Please download it again.";
let teacher: TestUser;

test.beforeAll(async () => {
  teacher = await makeTestUser("teacher");
});
test.afterAll(cleanupTestUsers);

const hex = () => randomBytes(3).toString("hex");

/** A student with a recognisable name, assigned to a fresh homework (cleanup registered first). */
async function seed(partial: Parameters<typeof adminSeedAssignment>[0] = {}) {
  const title = `t_hw_${hex()}`;
  trackAssignmentTitle(title);
  const id = await adminSeedAssignment({ ...partial, title });
  trackFolder("submissions", id);
  const name = `t_name_${hex()}`;
  const student = await makeTestUser("student", { displayName: name });
  await adminAssign(id, student.id);
  return { id, title, name, student };
}

async function openQueue(page: Page) {
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto("/teacher/marking");
  await expect(page.getByRole("heading", { name: "Marking", exact: true })).toBeVisible();
}

const row = (page: Page, title: string, name: string) => page.getByRole("listitem", { name: `${title}, ${name}` });
const dbRow = async (id: string) => {
  const { data, error } = await adminClient().from("submissions").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
};

test("queue lists a submitted homework with the late flag, and the heading count equals the rows listed", async ({ page }) => {
  const onTime = await seed();
  const late = await seed({
    visible_from: new Date(Date.now() - 6 * HOUR).toISOString(),
    opens_at: new Date(Date.now() - 5 * HOUR).toISOString(),
    due_at: new Date(Date.now() - 2 * HOUR).toISOString(),
  });
  await adminSeedSubmission(onTime.id, onTime.student.id);
  await adminSeedSubmission(late.id, late.student.id, { submittedAt: new Date(Date.now() - HOUR).toISOString() });
  await openQueue(page);
  const a = row(page, onTime.title, onTime.name);
  const b = row(page, late.title, late.name);
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  await expect(a).not.toContainText("(late)");
  await expect(b).toContainText(`${late.title}, ${late.name} (late)`);
  const heading = await page.getByRole("heading", { name: /^Needs marking \(\d+\)$/ }).textContent();
  const n = Number(/\((\d+)\)/.exec(heading ?? "")![1]);
  expect(await page.locator("main ul > li").count()).toBe(n);
});

test("teacher downloads, marks 7.5 with a comment, and the row leaves the queue", async ({ page }) => {
  const s = await seed();
  const sub = await adminSeedSubmission(s.id, s.student.id);
  await openQueue(page);
  const r = row(page, s.title, s.name);
  await expect(r.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 20_000 }); // hydrated
  const [download] = await Promise.all([page.waitForEvent("download"), r.getByRole("button", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe("t_work.ipynb");
  await r.getByLabel(`Mark for ${s.name} out of 10`).fill("7.5");
  await r.getByLabel(`Comment for ${s.name}`).fill("Good work, t_comment");
  await r.getByRole("button", { name: "Save" }).click();
  await expect(r).toHaveCount(0, { timeout: 20_000 });
  const d = await dbRow(sub.id);
  expect(Number(d.mark)).toBe(7.5);
  expect(d.feedback).toBe("Good work, t_comment");
  expect(d.marked_at).not.toBeNull();
});

test("bad marks are refused and the typed comment stays", async ({ page }) => {
  const s = await seed();
  const sub = await adminSeedSubmission(s.id, s.student.id);
  await openQueue(page);
  const r = row(page, s.title, s.name);
  await expect(r.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 20_000 });
  const comment = r.getByLabel(`Comment for ${s.name}`);
  await comment.fill("t_keep this comment");
  const mark = r.getByLabel(`Mark for ${s.name} out of 10`);
  const alert = r.locator("p[role=alert]");
  for (const [value, message] of [
    ["11", "The mark must be between 0 and 10."],
    ["", "Please enter a mark."],
    ["-1", "The mark must be between 0 and 10."],
  ] as const) {
    await mark.fill(value);
    await r.getByRole("button", { name: "Save" }).click();
    await expect(alert).toHaveText(message, { timeout: 20_000 });
    await expect(comment).toHaveValue("t_keep this comment");
  }
  expect((await dbRow(sub.id)).mark).toBeNull();
});

test("a new upload after the page loaded is refused with the new-version message until the teacher downloads again", async ({
  page,
}) => {
  const s = await seed();
  const sub = await adminSeedSubmission(s.id, s.student.id);
  await openQueue(page);
  const r = row(page, s.title, s.name);
  await expect(r.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 20_000 });

  // The student uploads a new version while the page is open.
  const newPath = `${s.id}/${s.student.id}/${hex()}-new.ipynb`;
  trackObject("submissions", newPath);
  const up = await adminClient()
    .storage.from("submissions")
    .upload(newPath, new Blob(['{"cells":[1]}'], { type: "application/json" }));
  expect(up.error).toBeNull();
  const upd = await adminClient().from("submissions").update({ revision: 2, object_path: newPath }).eq("id", sub.id);
  expect(upd.error).toBeNull();

  const alert = r.locator("p[role=alert]");
  await r.getByLabel(`Mark for ${s.name} out of 10`).fill("8");
  await r.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText(REVISION_COPY, { timeout: 20_000 });
  expect((await dbRow(sub.id)).mark).toBeNull();

  await r.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText(REVISION_COPY, { timeout: 20_000 });
  expect((await dbRow(sub.id)).mark).toBeNull();

  const [download] = await Promise.all([page.waitForEvent("download"), r.getByRole("button", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe("t_work.ipynb");
  await r.getByRole("button", { name: "Save" }).click();
  // The row leaves the queue after the refresh, so the database is the proof of the save.
  await expect.poll(async () => Number((await dbRow(sub.id)).mark), { timeout: 20_000 }).toBe(8);
});

test("excused and deactivated students' submissions are not in the queue", async ({ page }) => {
  const excused = await seed();
  const gone = await seed();
  const shown = await seed();
  await adminSeedSubmission(excused.id, excused.student.id);
  await adminSeedSubmission(gone.id, gone.student.id);
  await adminSeedSubmission(shown.id, shown.student.id);
  const admin = adminClient();
  const e = await admin
    .from("assignment_students")
    .update({ excused: true })
    .eq("assignment_id", excused.id)
    .eq("student_id", excused.student.id);
  expect(e.error).toBeNull();
  const g = await admin.from("profiles").update({ is_active: false }).eq("id", gone.student.id);
  expect(g.error).toBeNull();
  await openQueue(page);
  await expect(row(page, shown.title, shown.name)).toBeVisible();
  await expect(row(page, excused.title, excused.name)).toHaveCount(0);
  await expect(row(page, gone.title, gone.name)).toHaveCount(0);
});

test("a student visiting /teacher/marking is sent to /", async ({ page }) => {
  const student = await makeTestUser("student");
  await loginVia(page, student.username, student.password);
  await expectPath(page, "/");
  await page.goto("/teacher/marking");
  await expectPath(page, "/");
});
