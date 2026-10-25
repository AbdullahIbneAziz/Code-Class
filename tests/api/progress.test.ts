import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminAssign, adminClient, adminSeedAssignment, adminSeedSubmission, cleanupTestUsers, makeTestUser, trackAssignmentTitle, type TestUser } from "./helpers";
import { EMPTY_PROGRESS } from "@/lib/progress/format";
import { getMyProgress, listMyHistory, listRecentlyMarked, listStudentsAtAGlance } from "@/lib/progress/queries";

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
const ahead = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

let teacher: TestUser;
let zero: TestUser;
let gone: TestUser;
let stu: TestUser;
let other: TestUser;
const tag = Math.random().toString(16).slice(2, 8);

async function hw(name: string, due: string, extra: Record<string, unknown> = {}) {
  const title = `t_progress_${tag}_${name}`;
  trackAssignmentTitle(title);
  return adminSeedAssignment({ title, visible_from: ago(6), opens_at: ago(5), due_at: due, ...extra });
}

beforeAll(async () => {
  teacher = await makeTestUser("teacher");
  zero = await makeTestUser("student", { displayName: "t_zero" });
  gone = await makeTestUser("student", { displayName: "t_gone", isActive: false });
  stu = await makeTestUser("student", { displayName: "t_stu" });
  other = await makeTestUser("student", { displayName: "t_other" });

  const a = await hw("a", ago(2));
  const b = await hw("b", ago(1));
  const c = await hw("c", ahead(24));
  for (const x of [a, b, c]) await adminAssign(x, stu.id);
  await adminSeedSubmission(a, stu.id, { submittedAt: ago(1), mark: 8, markedAt: ago(0.5) });
  await adminSeedSubmission(c, stu.id, { submittedAt: ago(0.2) });
  // other student: four marked items, plus one that must not leak to stu
  for (let i = 0; i < 4; i++) {
    const x = await hw(`o${i}`, ahead(24));
    await adminAssign(x, other.id);
    await adminSeedSubmission(x, other.id, { submittedAt: ago(3), mark: 5, markedAt: ago(i + 1) });
  }
}, 120_000);

afterAll(async () => {
  await cleanupTestUsers();
}, 60_000);

describe("progress queries", () => {
  it("zero-item student: getMyProgress returns zeros and null averages, and listStudentsAtAGlance includes them with EMPTY_PROGRESS", async () => {
    expect(await getMyProgress(zero.client, zero.id)).toEqual(EMPTY_PROGRESS);
    const rows = await listStudentsAtAGlance(teacher.client);
    const row = rows.find((r) => r.studentId === zero.id);
    expect(row).toBeDefined();
    expect(row!.progress).toEqual(EMPTY_PROGRESS);
    expect(row!.username).toBe(zero.username);
    expect(row!.displayName).toBe("t_zero");
    expect(row!.lastSeenAt === null || typeof row!.lastSeenAt === "string").toBe(true);
  });

  it("listStudentsAtAGlance excludes a deactivated student", async () => {
    const rows = await listStudentsAtAGlance(teacher.client);
    expect(rows.some((r) => r.studentId === gone.id)).toBe(false);
    expect(rows.some((r) => r.studentId === stu.id)).toBe(true);
  });

  it("numbers come from the view", async () => {
    const expected = { submitted: 2, late: 1, missed: 1, pending: 0, hwAvgPct: 40, testAvgPct: null };
    expect(await getMyProgress(stu.client, stu.id)).toEqual(expected);
    const row = (await listStudentsAtAGlance(teacher.client)).find((r) => r.studentId === stu.id);
    expect(row!.progress).toEqual(expected);
  });

  it("listRecentlyMarked returns only the student's own marked items, newest first, at most 3", async () => {
    const mine = await listRecentlyMarked(other.client);
    expect(mine).toHaveLength(3);
    expect(mine.every((i) => i.studentId === other.id && i.isMarked)).toBe(true);
    const times = mine.map((i) => Date.parse(i.markedAt!));
    expect(times).toEqual([...times].sort((x, y) => y - x));
    const s = await listRecentlyMarked(stu.client);
    expect(s).toHaveLength(1);
    expect(s[0].studentId).toBe(stu.id);
  });

  it("listMyHistory returns own items by due date descending", async () => {
    const h = await listMyHistory(stu.client);
    expect(h).toHaveLength(3);
    expect(h.every((i) => i.studentId === stu.id)).toBe(true);
    const due = h.map((i) => Date.parse(i.effectiveDueAt));
    expect(due).toEqual([...due].sort((x, y) => y - x));
    void adminClient;
  });
});
