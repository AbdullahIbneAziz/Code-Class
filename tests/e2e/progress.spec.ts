import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import {
  adminAssign,
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
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
const ahead = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

test.afterAll(cleanupTestUsers);

async function seed(partial: Parameters<typeof adminSeedAssignment>[0], who: TestUser): Promise<{ id: string; title: string }> {
  const title = `t_hw_${randomBytes(3).toString("hex")}`;
  trackAssignmentTitle(title); // before anything is created
  const id = await adminSeedAssignment({ ...partial, title });
  trackFolder("submissions", id);
  trackFolder("solutions", id);
  await adminAssign(id, who.id);
  return { id, title };
}

async function login(page: Page, u: TestUser) {
  await loginVia(page, u.username, u.password);
  await expectPath(page, "/");
}

/** The Task 6 shape: A late and marked 8/10, B missed, C submitted early. */
async function seedMix(u: TestUser) {
  const a = await seed({ visible_from: ago(6), opens_at: ago(5), due_at: ago(2) }, u);
  await adminSeedSubmission(a.id, u.id, { submittedAt: ago(1), mark: 8, markedAt: ago(0.5) });
  const b = await seed({ visible_from: ago(6), opens_at: ago(5), due_at: ago(1) }, u);
  const c = await seed({ due_at: ahead(24) }, u);
  await adminSeedSubmission(c.id, u.id);
  return { a, b, c };
}

async function expectTiles(scope: ReturnType<Page["locator"]>, t: string[]) {
  for (const x of t) await expect(scope.getByText(x, { exact: true })).toBeVisible();
}

test("home shows My progress tiles from the view", async ({ page }) => {
  const u = await makeTestUser("student");
  await seedMix(u);
  await login(page, u);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "My progress" }) });
  await expectTiles(section, ["2 Submitted", "1 Late", "1 Missed", "40% HW avg", "— Test avg"]);
  await expect(section.getByRole("link", { name: "See full history" })).toHaveAttribute("href", "/progress");
});

test("recently marked shows mark and feedback, and View solution only when the solution is open", async ({ page }) => {
  const u = await makeTestUser("student");
  const open = await seed({ visible_from: ago(6), opens_at: ago(5), due_at: ago(2) }, u);
  await adminSeedSubmission(open.id, u.id, { submittedAt: ago(3), mark: 9, markedAt: ago(1), feedback: "Nice\nwork" });
  await adminSeedSolution(open.id, "t_solution.ipynb");
  const closed = await seed({ due_at: ahead(24) }, u);
  await adminSeedSubmission(closed.id, u.id, { mark: 4, markedAt: ago(2) });
  await adminSeedSolution(closed.id, "t_solution.ipynb");
  await login(page, u);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Recently marked" }) });
  await expect(section).toContainText(`${open.title}, 9/10`);
  await expect(section).toContainText(`${closed.title}, 4/10`);
  await expect(section.locator("p.whitespace-pre-wrap")).toContainText("Nice\nwork");
  const links = section.getByRole("link", { name: "View solution" });
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute("href", `/homework/${open.id}#solution`);
});

test("/progress shows the tiles and one history row per item with status and mark", async ({ page }) => {
  const u = await makeTestUser("student");
  const { a, b } = await seedMix(u);
  await login(page, u);
  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "My progress" })).toBeVisible();
  await expectTiles(page.locator("main"), ["2 Submitted", "1 Late", "1 Missed", "40% HW avg", "— Test avg"]);
  await expect(
    page.getByText("Missed work counts as 0%. Excused work and work not yet marked don't count in the averages."),
  ).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveText(["Item", "Type", "Due", "Status", "Mark"]);
  const rowA = page.getByRole("row", { name: new RegExp(a.title) });
  await expect(rowA).toContainText("Homework");
  await expect(rowA).toContainText("Submitted · Late");
  await expect(rowA).toContainText("8/10");
  await expect(rowA.getByRole("link", { name: a.title })).toHaveAttribute("href", `/homework/${a.id}`);
  const rowB = page.getByRole("row", { name: new RegExp(b.title) });
  await expect(rowB.getByRole("cell").nth(3)).toHaveText("Missed");
  await expect(rowB.getByRole("cell").nth(4)).toHaveText("—");
  await expect(page.getByRole("row")).toHaveCount(4); // header + 3
});

test("a student with no items sees zeros and dashes on home and /progress", async ({ page }) => {
  const u = await makeTestUser("student");
  await login(page, u);
  const home = page.locator("section", { has: page.getByRole("heading", { name: "My progress" }) });
  await expectTiles(home, ["0 Submitted", "0 Late", "0 Missed", "— HW avg", "— Test avg"]);
  await expect(page.getByText("Nothing marked yet.")).toBeVisible();
  await page.goto("/progress");
  await expectTiles(page.locator("main"), ["0 Submitted", "0 Late", "0 Missed", "— HW avg", "— Test avg"]);
  await expect(page.getByRole("row")).toHaveCount(1); // header only
});

test("nav has My Progress", async ({ page }) => {
  const u = await makeTestUser("student");
  await login(page, u);
  const link = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My Progress" });
  await expect(link).toHaveAttribute("href", "/progress");
  await link.click();
  await expectPath(page, "/progress");
});
