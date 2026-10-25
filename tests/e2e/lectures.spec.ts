import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { adminClient, cleanupTestUsers, makeTestUser, trackFolder, trackLecture } from "../api/helpers";
import { loginVia, expectPath } from "./helpers";

test.afterAll(cleanupTestUsers);

async function trackByTitle(title: string): Promise<string> {
  const { data, error } = await adminClient().from("lectures").select("id").eq("title", title).single();
  if (error) throw new Error(error.message);
  trackLecture(data.id);
  trackFolder("lectures", data.id);
  return data.id;
}

const title = () => `t_lecture_${randomBytes(3).toString("hex")}`;
const pdf = (n: number) => ({ name: "t_notes.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(n, 1) });
const nb = { name: "t_demo.ipynb", mimeType: "application/json", buffer: Buffer.alloc(2 * 1024, 2) };

test("teacher uploads a lecture with two files and a student downloads one with its original name", async ({ page, browser }) => {
  const teacher = await makeTestUser("teacher");
  const student = await makeTestUser("student");
  const t = title();
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto("/teacher/lectures");
  await expect(page.getByRole("heading", { name: "Lectures", level: 1 })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill(t);
  await page.getByLabel("Description (optional)").fill("t_ description");
  await page.getByLabel("Files", { exact: true }).setInputFiles([pdf(10 * 1024), nb]);
  await page.getByRole("button", { name: "Upload lecture" }).click();
  const card = page.getByRole("article", { name: t });
  await expect(card.getByText("t_notes.pdf")).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("t_demo.ipynb")).toBeVisible();
  await trackByTitle(t);

  const ctx = await browser.newContext();
  const sp = await ctx.newPage();
  await loginVia(sp, student.username, student.password);
  await expectPath(sp, "/");
  await sp.goto("/lectures");
  const sc = sp.getByRole("article", { name: t });
  await expect(sc.getByText("t_ description")).toBeVisible();
  await expect(sc.getByText("UK time")).toBeVisible();
  const row = sc.getByRole("listitem").filter({ hasText: "t_notes.pdf" });
  const [download] = await Promise.all([sp.waitForEvent("download"), row.getByRole("button", { name: "Download" }).click()]);
  expect(download.suggestedFilename()).toBe("t_notes.pdf");
  await ctx.close();
});

test("teacher replaces a lecture file and deletes a lecture after confirming", async ({ page }) => {
  const teacher = await makeTestUser("teacher");
  const t = title();
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto("/teacher/lectures");
  await page.getByLabel("Title", { exact: true }).fill(t);
  await page.getByLabel("Files", { exact: true }).setInputFiles([pdf(1024)]);
  await page.getByRole("button", { name: "Upload lecture" }).click();
  const card = page.getByRole("article", { name: t });
  await expect(card.getByText("t_notes.pdf")).toBeVisible({ timeout: 30_000 });
  const id = await trackByTitle(t);

  await card.locator('input[aria-label^="Replacement for"]').setInputFiles({
    name: "t_new.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(2048, 3),
  });
  await expect(card.getByText("t_new.pdf")).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("t_notes.pdf")).toHaveCount(0);
  const { data: rep } = await adminClient()
    .from("replaced_files")
    .select("object_path")
    .eq("bucket", "lectures")
    .like("object_path", `${id}/%`);
  expect(rep).toHaveLength(1);

  await card.getByRole("button", { name: "Delete lecture" }).click();
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByRole("button", { name: "Delete lecture" })).toBeVisible();
  await card.getByRole("button", { name: "Delete lecture" }).click();
  await card.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("article", { name: t })).toHaveCount(0, { timeout: 15_000 });
  const { data: gone } = await adminClient().from("lectures").select("id").eq("id", id);
  expect(gone).toHaveLength(0);
});

test("a .exe is refused in the page before any upload", async ({ page }) => {
  const teacher = await makeTestUser("teacher");
  const t = title();
  await loginVia(page, teacher.username, teacher.password);
  await expectPath(page, "/teacher");
  await page.goto("/teacher/lectures");
  await page.getByLabel("Title", { exact: true }).fill(t);
  await page
    .getByLabel("Files", { exact: true })
    .setInputFiles({ name: "t_bad.exe", mimeType: "application/octet-stream", buffer: Buffer.alloc(10) });
  await page.getByRole("button", { name: "Upload lecture" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "t_bad.exe" })).toContainText(
    "This file type isn't allowed here. Allowed: .ipynb, .py, .pdf, .pptx, .png, .jpg",
  );
  const { data } = await adminClient().from("lectures").select("id").eq("title", t);
  expect(data).toHaveLength(0);
});

test("a student has no teacher controls on /lectures", async ({ browser }) => {
  const student = await makeTestUser("student");
  const ctx = await browser.newContext();
  const sp = await ctx.newPage();
  await loginVia(sp, student.username, student.password);
  await expectPath(sp, "/");
  await sp.goto("/lectures");
  await expect(sp.getByRole("heading", { name: "Lectures", level: 1 })).toBeVisible();
  for (const name of ["Upload lecture", "Replace", "Add file", "Edit", "Delete lecture"]) {
    await expect(sp.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(sp.locator('input[type="file"]')).toHaveCount(0);
  await ctx.close();
});
