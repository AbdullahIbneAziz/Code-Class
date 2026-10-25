import { describe, expect, it } from "vitest";
import { statusLabel } from "@/lib/homework/status";
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

describe("statusLabel", () => {
  it("pending", () => expect(statusLabel(base)).toBe("Pending"));
  it("missed", () => expect(statusLabel({ ...base, actionState: "missed" })).toBe("Missed"));
  it("done on time", () => expect(statusLabel({ ...base, actionState: "done", hasSubmission: true })).toBe("Submitted · On time"));
  it("done late", () =>
    expect(statusLabel({ ...base, actionState: "done", hasSubmission: true, isLate: true })).toBe("Submitted · Late"));
  it("excused", () => expect(statusLabel({ ...base, actionState: "excused", isExcused: true })).toBe("Excused"));
});
