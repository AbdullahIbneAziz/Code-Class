import { test, expect } from "@playwright/test";
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

let teacher: TestUser;
let student: TestUser;

test.beforeAll(async () => {
  teacher = await makeTestUser("teacher");
  student = await makeTestUser("student");
});
test.afterAll(cleanupTestUsers);

/** Registers cleanup first, then seeds a visible homework (future deadline) assigned to the test student. */
async function seed(): Promise<string> {
  const t = `t_hw_${randomBytes(3).toString("hex")}`;
  trackAssignmentTitle(t);
  const id = await adminSeedAssignment({ title: t });
  trackFolder("solutions", id);
  trackFolder("submissions", id);
  await adminAssign(id, student.id);
  return id;
}

async function open(page: import("@playwright/test").Page, id: string) {
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto(`/teacher/homework/${id}`);
  await expect(page.getByRole("button", { name: "Upload solution" })).toBeEnabled({ timeout: 20_000 }); // hydrated
}

const solutionRows = async (id: string) => {
  const { data, error } = await adminClient()
    .from("assignment_files")
    .select("id, original_name, object_path")
    .eq("assignment_id", id)
    .eq("purpose", "solution");
  if (error) throw new Error(error.message);
  return data ?? [];
};

test("teacher uploads a solution and replaces it", async ({ page }) => {
  const id = await seed();
  await open(page, id);
  await expect(page.getByText("No solution uploaded yet.")).toBeVisible();
  const input = page.locator('input[type="file"][aria-label="Upload solution"]');
  await input.setInputFiles({ name: "t_sol.ipynb", mimeType: "application/json", buffer: Buffer.alloc(2048, 1) });
  await expect(page.getByText("t_sol.ipynb")).toBeVisible({ timeout: 30_000 });
  const first = await solutionRows(id);
  expect(first).toHaveLength(1);
  expect(first[0].original_name).toBe("t_sol.ipynb");

  await page
    .locator('input[type="file"][aria-label="Replace solution"]')
    .setInputFiles({ name: "t_sol2.py", mimeType: "text/x-python", buffer: Buffer.alloc(2048, 2) });
  await expect(page.getByText("t_sol2.py")).toBeVisible({ timeout: 30_000 });
  const second = await solutionRows(id);
  expect(second).toHaveLength(1);
  expect(second[0].original_name).toBe("t_sol2.py");
  const { data: rep } = await adminClient()
    .from("replaced_files")
    .select("object_path")
    .eq("bucket", "solutions")
    .eq("object_path", first[0].object_path);
  expect(rep).toHaveLength(1);
});

test("unlock for everyone needs confirmation", async ({ page }) => {
  const id = await seed();
  await open(page, id);
  const flag = async () => {
    const { data } = await adminClient().from("assignments").select("solution_unlocked_for_all").eq("id", id).single();
    return data?.solution_unlocked_for_all;
  };
  await page.getByRole("button", { name: "Unlock solution for everyone" }).click();
  await expect(
    page.getByText("Students who didn't submit will also see the solution, but only after their own deadline. This can't be undone."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await flag()).toBe(false);
  await page.getByRole("button", { name: "Unlock solution for everyone" }).click();
  await page.getByRole("button", { name: "Confirm unlock" }).click();
  await expect(page.getByText("Unlocked for everyone. Each student still waits for their own deadline.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Unlock solution for everyone" })).toHaveCount(0);
  expect(await flag()).toBe(true);
});

test("a .exe solution is refused in the page before any upload", async ({ page }) => {
  const id = await seed();
  await open(page, id);
  await page
    .locator('input[type="file"][aria-label="Upload solution"]')
    .setInputFiles({ name: "t_bad.exe", mimeType: "application/octet-stream", buffer: Buffer.alloc(1024, 1) });
  await expect(page.locator("p[role=alert]")).toContainText(".ipynb, .py, .pdf, .txt, .zip");
  expect(await solutionRows(id)).toHaveLength(0);
});

test("before the deadline a student can't sign the solution, even after unlock", async ({ page }) => {
  const id = await seed();
  await open(page, id);
  await page
    .locator('input[type="file"][aria-label="Upload solution"]')
    .setInputFiles({ name: "t_sol.txt", mimeType: "text/plain", buffer: Buffer.alloc(512, 1) });
  await expect(page.getByText("t_sol.txt")).toBeVisible({ timeout: 30_000 });
  const rows = await solutionRows(id);
  await page.getByRole("button", { name: "Unlock solution for everyone" }).click();
  await page.getByRole("button", { name: "Confirm unlock" }).click();
  await expect(page.getByText(/^Unlocked for everyone/)).toBeVisible({ timeout: 20_000 });
  const { data, error } = await student.client.storage.from("solutions").createSignedUrl(rows[0].object_path, 60);
  expect(error).not.toBeNull();
  expect(data).toBeNull();
});
