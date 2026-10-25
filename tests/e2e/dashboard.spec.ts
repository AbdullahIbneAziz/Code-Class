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
let teacher: TestUser;

test.beforeAll(async () => {
  teacher = await makeTestUser("teacher");
});
test.afterAll(cleanupTestUsers);

const hex = () => randomBytes(3).toString("hex");
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

async function seed(partial: Parameters<typeof adminSeedAssignment>[0] = {}, student?: { id: string; name: string }) {
  const title = `t_hw_${hex()}`;
  trackAssignmentTitle(title);
  const id = await adminSeedAssignment({ ...partial, title });
  trackFolder("submissions", id);
  trackFolder("solutions", id);
  const name = student?.name ?? `t_name_${hex()}`;
  const s = student ? { id: student.id } : await makeTestUser("student", { displayName: name });
  await adminAssign(id, s.id);
  return { id, title, name, studentId: s.id };
}

async function openDashboard(page: Page) {
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await expect(page.getByRole("heading", { name: "Teacher dashboard" })).toBeVisible();
}

const queueSection = (page: Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: /^Needs marking \(\d+\)$/ }) });
const countOf = async (page: Page) => {
  const t = await page.getByRole("heading", { name: /^Needs marking \(\d+\)$/ }).textContent();
  return Number(/\((\d+)\)/.exec(t ?? "")![1]);
};

test("Needs marking shows the seeded row and N equals the rows listed", async ({ page }) => {
  const s = await seed();
  await adminSeedSubmission(s.id, s.studentId);
  await openDashboard(page);
  await expect(queueSection(page).getByRole("listitem", { name: `${s.title}, ${s.name}` })).toBeVisible();
  expect(await queueSection(page).locator("ul > li").count()).toBe(await countOf(page));
  await expect(page.getByRole("link", { name: "Open marking queue" })).toHaveAttribute("href", "/teacher/marking");
  await expect(page.getByText("More coming soon.")).toHaveCount(0);
});

test("marking from the dashboard removes the row and lowers N by one", async ({ page }) => {
  const s = await seed();
  const sub = await adminSeedSubmission(s.id, s.studentId);
  await openDashboard(page);
  const r = queueSection(page).getByRole("listitem", { name: `${s.title}, ${s.name}` });
  await expect(r.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 20_000 });
  const before = await countOf(page);
  await r.getByLabel(`Mark for ${s.name} out of 10`).fill("7");
  await r.getByRole("button", { name: "Save" }).click();
  await expect(r).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => countOf(page).catch(() => 0), { timeout: 20_000 }).toBe(before - 1);
  const { data } = await adminClient().from("submissions").select("mark").eq("id", sub.id).single();
  expect(Number(data?.mark)).toBe(7);
});

test("students at a glance shows the view's numbers", async ({ page, browser }) => {
  const name = `t_name_${hex()}`;
  const student = await makeTestUser("student", { displayName: name });
  const who = { id: student.id, name };
  const a = await seed({ visible_from: ago(6), opens_at: ago(5), due_at: ago(2) }, who);
  await adminSeedSubmission(a.id, student.id, { submittedAt: ago(1), mark: 8, markedAt: ago(0.5) });
  await seed({ visible_from: ago(6), opens_at: ago(5), due_at: ago(1) }, who);
  const c = await seed({}, who);
  await adminSeedSubmission(c.id, student.id);

  const other = await browser.newContext();
  const sp = await other.newPage();
  await loginVia(sp, student.username, student.password);
  await expect.poll(() => new URL(sp.url()).pathname, { timeout: 20_000 }).not.toBe("/login");
  await sp.goto("/");
  await other.close();

  await openDashboard(page);
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toBeVisible();
  const cells = row.getByRole("cell");
  await expect(cells.nth(0)).toHaveText("2");
  await expect(cells.nth(1)).toHaveText("1");
  await expect(cells.nth(2)).toHaveText("1");
  await expect(cells.nth(3)).toHaveText("40%");
  await expect(cells.nth(4)).toHaveText("—");
  await expect(cells.nth(5)).toHaveText(/^Today/);
});

test("a new student with no items shows zeros and dashes", async ({ page }) => {
  const name = `t_name_${hex()}`;
  await makeTestUser("student", { displayName: name });
  await openDashboard(page);
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toBeVisible();
  const cells = row.getByRole("cell");
  const texts = await cells.allTextContents();
  expect(texts).toEqual(["0", "0", "0", "—", "—", "Never"]);
  for (const h of ["Student", "Submitted", "Late", "Missed", "HW avg", "Test avg", "Last login"]) {
    await expect(page.getByRole("columnheader", { name: h, exact: true })).toBeVisible();
  }
});

test("homework status lists the seeded homework with each student's status and the solution state, and Unlock works there", async ({
  page,
}) => {
  const s = await seed();
  await adminSeedSolution(s.id, "t_sol.ipynb");
  await openDashboard(page);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Homework status" }) });
  const item = section.getByRole("listitem").filter({ has: page.getByRole("link", { name: s.title }) });
  await expect(item).toBeVisible();
  await expect(item.getByRole("link", { name: s.title })).toHaveAttribute("href", `/teacher/homework/${s.id}`);
  await expect(item).toContainText(`${s.name}: `);
  await expect(item).toContainText("Solution: uploaded");
  const unlock = item.getByRole("button", { name: "Unlock solution for everyone" });
  await expect(unlock).toBeEnabled({ timeout: 20_000 });
  await unlock.click();
  await item.getByRole("button", { name: "Confirm unlock" }).click();
  await expect(item.getByText(/^Unlocked for everyone/)).toBeVisible({ timeout: 20_000 });
  const { data } = await adminClient().from("assignments").select("solution_unlocked_for_all").eq("id", s.id).single();
  expect(data?.solution_unlocked_for_all).toBe(true);
});
