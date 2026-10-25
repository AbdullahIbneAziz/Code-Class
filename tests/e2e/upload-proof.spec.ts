import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  adminAssign,
  adminClient,
  adminSeedAssignment,
  cleanupTestUsers,
  makeTestUser,
  trackAssignmentTitle,
  trackFolder,
  trackLectureTitle,
} from "../api/helpers";
import { loginVia, expectPath } from "./helpers";

const BYTES = 25 * 1024 * 1024 - 1024;
const FILE = "test-results/t_big.pdf";

const NB_BYTES = 5 * 1024 * 1024 - 1024;
const NB_FILE = "test-results/t_hw.ipynb";

test.afterAll(async () => {
  rmSync(FILE, { force: true });
  rmSync(NB_FILE, { force: true });
  await cleanupTestUsers();
});

test("teacher uploads a ~25 MB lecture file through the site (resumable)", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync("test-results", { recursive: true });
  writeFileSync(FILE, Buffer.alloc(BYTES, 7));

  const teacher = await makeTestUser("teacher");
  const t = `t_big_${randomBytes(3).toString("hex")}`;
  trackLectureTitle(t); // before clicking, so a failure still cleans up
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto("/teacher/lectures");
  await page.getByLabel("Title", { exact: true }).fill(t);
  await page.getByLabel("Files", { exact: true }).setInputFiles(FILE);

  const resumable = page.waitForRequest((r) => r.url().includes("/storage/v1/upload/resumable"), { timeout: 120_000 });
  await page.getByRole("button", { name: "Upload lecture" }).click();
  await resumable;

  const { data: lec } = await adminClient().from("lectures").select("id").eq("title", t).single();
  const id = lec!.id as string;

  await expect(page.getByRole("article", { name: t }).getByText("t_big.pdf")).toBeVisible({ timeout: 150_000 });

  const { data: list, error } = await adminClient().storage.from("lectures").list(id);
  expect(error).toBeNull();
  expect(list).toHaveLength(1);
  expect(list![0].metadata!.size).toBe(BYTES);
  const { data: rows } = await adminClient().from("lecture_files").select("size_bytes").eq("lecture_id", id);
  expect(Number(rows![0].size_bytes)).toBe(BYTES);
});

test("student uploads a ~5 MB notebook through the site and it is finalized", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync("test-results", { recursive: true });
  writeFileSync(NB_FILE, Buffer.alloc(NB_BYTES, 7));

  const student = await makeTestUser("student");
  const title = `t_hw_${randomBytes(3).toString("hex")}`;
  trackAssignmentTitle(title);
  const id = await adminSeedAssignment({ title });
  trackFolder("questions", id);
  trackFolder("submissions", id);
  await adminAssign(id, student.id);

  await loginVia(page, student.username, student.password);
  await expectPath(page, "/");
  await page.goto(`/homework/${id}`);
  await page.getByLabel("Choose your notebook (.ipynb or .py)").setInputFiles(NB_FILE);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.locator("main p", { hasText: /^Submitted · On time$/ }).first()).toBeVisible({ timeout: 90_000 });

  const { data: rows } = await adminClient().from("submissions").select("revision,size_bytes").eq("assignment_id", id);
  expect(rows).toHaveLength(1);
  expect(rows![0].revision).toBe(1);
  expect(Number(rows![0].size_bytes)).toBe(NB_BYTES);
});
