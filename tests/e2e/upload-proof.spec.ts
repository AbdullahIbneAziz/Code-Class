import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { adminClient, cleanupTestUsers, makeTestUser, trackFolder, trackLecture } from "../api/helpers";
import { loginVia, expectPath } from "./helpers";

const BYTES = 25 * 1024 * 1024 - 1024;
const FILE = "test-results/t_big.pdf";

test.afterAll(async () => {
  rmSync(FILE, { force: true });
  await cleanupTestUsers();
});

test("teacher uploads a ~25 MB lecture file through the site (resumable)", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync("test-results", { recursive: true });
  writeFileSync(FILE, Buffer.alloc(BYTES, 7));

  const teacher = await makeTestUser("teacher");
  const t = `t_big_${randomBytes(3).toString("hex")}`;
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto("/teacher/lectures");
  await page.getByLabel("Title", { exact: true }).fill(t);
  await page.getByLabel("Files", { exact: true }).setInputFiles(FILE);

  const resumable = page.waitForRequest((r) => r.url().includes("/storage/v1/upload/resumable"), { timeout: 120_000 });
  await page.getByRole("button", { name: "Upload lecture" }).click();
  await resumable;

  // Track as soon as the lecture row exists so cleanup removes objects even if an assertion fails.
  let id = "";
  await expect
    .poll(
      async () => {
        const { data } = await adminClient().from("lectures").select("id").eq("title", t);
        id = data?.[0]?.id ?? "";
        return id;
      },
      { timeout: 30_000 },
    )
    .not.toBe("");
  trackLecture(id);
  trackFolder("lectures", id);

  await expect(page.getByRole("article", { name: t }).getByText("t_big.pdf")).toBeVisible({ timeout: 150_000 });

  const { data: list, error } = await adminClient().storage.from("lectures").list(id);
  expect(error).toBeNull();
  expect(list).toHaveLength(1);
  expect(list![0].metadata!.size).toBe(BYTES);
  const { data: rows } = await adminClient().from("lecture_files").select("size_bytes").eq("lecture_id", id);
  expect(Number(rows![0].size_bytes)).toBe(BYTES);
});
