import { describe, expect, it } from "vitest";
import { pendingBanner } from "@/lib/homework/pending";
import type { StudentItem } from "@/lib/homework/types";

const base: StudentItem = {
  assignmentId: "a",
  studentId: "s",
  studentName: "t_student",
  kind: "homework",
  title: "t_hw",
  instructions: null,
  maxMarks: 10,
  visibleFrom: "2027-01-01T00:00:00Z",
  effectiveOpensAt: "2027-01-01T00:00:00Z",
  effectiveDueAt: "2027-01-12T20:00:00Z",
  actionState: "pending",
  isExcused: false,
  hasSubmission: false,
  isLate: false,
  isMarked: false,
  submittedAt: null,
  submissionName: null,
  submissionPath: null,
  revision: null,
};
const item = (id: string, over: Partial<StudentItem>): StudentItem => ({ ...base, assignmentId: id, ...over });

describe("pendingBanner", () => {
  it("counts pending and missed homework only", () => {
    const r = pendingBanner([
      item("p", {}),
      item("m", { actionState: "missed" }),
      item("d", { actionState: "done" }),
      item("e", { actionState: "excused" }),
      item("h", { actionState: "hidden" }),
      item("u", { actionState: "upcoming" }),
      item("t", { kind: "test" }),
    ]);
    expect(r.count).toBe(2);
    expect(r.items.map((i) => i.assignmentId).sort()).toEqual(["m", "p"]);
  });

  it("orders pending soonest first, then missed most recent first", () => {
    const r = pendingBanner([
      item("m1", { actionState: "missed", effectiveDueAt: "2027-01-02T00:00:00Z" }),
      item("p2", { effectiveDueAt: "2027-02-02T00:00:00Z" }),
      item("m2", { actionState: "missed", effectiveDueAt: "2027-01-05T00:00:00Z" }),
      item("p1", { effectiveDueAt: "2027-01-20T00:00:00Z" }),
    ]);
    expect(r.items.map((i) => i.assignmentId)).toEqual(["p1", "p2", "m2", "m1"]);
  });

  it("uses the exact text for 0, 1 and N", () => {
    expect(pendingBanner([]).text).toBe("✓ You're all caught up.");
    expect(pendingBanner([item("a", {})]).text).toBe("⚠ You have 1 pending homework");
    expect(pendingBanner([item("a", {}), item("b", { actionState: "missed" })]).text).toBe("⚠ You have 2 pending homeworks");
  });
});
