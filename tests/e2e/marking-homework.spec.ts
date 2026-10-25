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
let teacher: TestUser;

test.beforeAll(async () => {
  teacher = await makeTestUser("teacher");
});
test.afterAll(cleanupTestUsers);

const hex = () => randomBytes(3).toString("hex");

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

async function openHomework(page: Page, id: string) {
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto(`/teacher/homework/${id}`);
  await expect(page.getByRole("heading", { name: "Student status" })).toBeVisible();
}

const li = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });
const dbRow = async (id: string) => {
  const { data, error } = await adminClient().from("submissions").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
};

test("homework page shows each student's submission with mark entry and saves a mark", async ({ page }) => {
  const s = await seed();
  const otherName = `t_name_${hex()}`;
  const other = await makeTestUser("student", { displayName: otherName });
  await adminAssign(s.id, other.id);
  const sub = await adminSeedSubmission(s.id, s.student.id);
  await openHomework(page, s.id);
  const mine = li(page, s.name);
  await expect(mine).toContainText(`${s.name}: Submitted · On time`);
  await expect(li(page, otherName)).toContainText(`${otherName}: Pending`);
  await expect(li(page, otherName).locator("form")).toHaveCount(0);
  await expect(mine.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 20_000 });
  await mine.getByLabel(`Mark for ${s.name} out of 10`).fill("9");
  await mine.getByRole("button", { name: "Save" }).click();
  await expect(mine).toContainText(`${s.name}: Submitted · On time · Marked 9/10`, { timeout: 20_000 });
  expect(Number((await dbRow(sub.id)).mark)).toBe(9);
});

test("a marked submission can be corrected with Update mark", async ({ page }) => {
  const s = await seed();
  const seeded = new Date(Date.now() - HOUR).toISOString();
  const sub = await adminSeedSubmission(s.id, s.student.id, { mark: 6, feedback: "t_first", markedAt: seeded });
  await openHomework(page, s.id);
  const mine = li(page, s.name);
  const input = mine.getByLabel(`Mark for ${s.name} out of 10`);
  await expect(input).toHaveValue("6");
  await expect(mine.getByRole("button", { name: "Update mark" })).toBeEnabled({ timeout: 20_000 });
  await input.fill("8");
  await mine.getByRole("button", { name: "Update mark" }).click();
  await expect(mine).toContainText("Marked 8/10", { timeout: 20_000 });
  const d = await dbRow(sub.id);
  expect(Number(d.mark)).toBe(8);
  expect(new Date(d.marked_at).getTime()).toBeGreaterThan(new Date(seeded).getTime());
});

test("an excused student's submission can be marked here", async ({ page }) => {
  const s = await seed();
  const sub = await adminSeedSubmission(s.id, s.student.id);
  const e = await adminClient()
    .from("assignment_students")
    .update({ excused: true })
    .eq("assignment_id", s.id)
    .eq("student_id", s.student.id);
  expect(e.error).toBeNull();
  await openHomework(page, s.id);
  const mine = li(page, s.name);
  await expect(mine).toContainText(`${s.name}: Excused`);
  await expect(mine.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 20_000 });
  await mine.getByLabel(`Mark for ${s.name} out of 10`).fill("5");
  await mine.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => Number((await dbRow(sub.id)).mark), { timeout: 20_000 }).toBe(5);
});

test("scheduled homework lists its students as Scheduled", async ({ page }) => {
  const s = await seed({
    visible_from: new Date(Date.now() + 5 * HOUR).toISOString(),
    opens_at: new Date(Date.now() + 6 * HOUR).toISOString(),
    due_at: new Date(Date.now() + 24 * HOUR).toISOString(),
  });
  await openHomework(page, s.id);
  await expect(li(page, s.name)).toContainText(`${s.name}: Scheduled`);
});
