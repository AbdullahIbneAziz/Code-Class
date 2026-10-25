import { describe, expect, it } from "vitest";
import { homeworkTab, itemLabel, solutionNotice, statusLabel } from "@/lib/homework/status";
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
  submissionId: null,
  mark: null,
  feedback: null,
  markedAt: null,
  scorePct: null,
  solutionUnlockedForAll: false,
  studentIsActive: true,
};

describe("statusLabel", () => {
  it("pending", () => expect(statusLabel(base)).toBe("Pending"));
  it("missed", () => expect(statusLabel({ ...base, actionState: "missed" })).toBe("Missed"));
  it("done on time", () => expect(statusLabel({ ...base, actionState: "done", hasSubmission: true })).toBe("Submitted · On time"));
  it("done late", () =>
    expect(statusLabel({ ...base, actionState: "done", hasSubmission: true, isLate: true })).toBe("Submitted · Late"));
  it("excused", () => expect(statusLabel({ ...base, actionState: "excused", isExcused: true })).toBe("Excused"));
});

describe("statusLabel (not yet open)", () => {
  it("hidden is Scheduled", () => expect(statusLabel({ ...base, actionState: "hidden" })).toBe("Scheduled"));
  it("upcoming is Upcoming", () => expect(statusLabel({ ...base, actionState: "upcoming" })).toBe("Upcoming"));
});

describe("itemLabel", () => {
  const done = { ...base, actionState: "done" as const, hasSubmission: true, isLate: true };
  it("marked late item", () =>
    expect(itemLabel({ ...done, isMarked: true, mark: 7 })).toBe("Submitted · Late · Marked 7/10"));
  it("unmarked equals statusLabel", () => expect(itemLabel(done)).toBe(statusLabel(done)));
});

describe("homeworkTab", () => {
  it("pending", () => expect(homeworkTab(base)).toBe("pending"));
  it("missed", () => expect(homeworkTab({ ...base, actionState: "missed" })).toBe("pending"));
  it("done", () => expect(homeworkTab({ ...base, actionState: "done", hasSubmission: true })).toBe("submitted"));
  it("done + marked", () =>
    expect(homeworkTab({ ...base, actionState: "done", hasSubmission: true, isMarked: true })).toBe("marked"));
  it("excused", () => expect(homeworkTab({ ...base, actionState: "excused", isExcused: true })).toBe("submitted"));
  it("excused + marked", () =>
    expect(homeworkTab({ ...base, actionState: "excused", isExcused: true, isMarked: true })).toBe("marked"));
  it("hidden and upcoming", () => {
    expect(homeworkTab({ ...base, actionState: "hidden" })).toBeNull();
    expect(homeworkTab({ ...base, actionState: "upcoming" })).toBeNull();
  });
});

describe("solutionNotice", () => {
  const i = { available: false, hasSubmission: true, isExcused: false, unlockedForAll: false, deadlinePassed: true };
  it("available shows no notice", () => expect(solutionNotice({ ...i, available: true })).toBeNull());
  it("not submitted, not excused, not unlocked", () =>
    expect(solutionNotice({ ...i, hasSubmission: false })).toBe("Submit your homework to unlock the solution."));
  it("deadline not passed", () =>
    expect(solutionNotice({ ...i, deadlinePassed: false })).toBe("The solution will be available after your deadline."));
  it("nothing shared yet", () => expect(solutionNotice(i)).toBe("No solution has been shared yet."));
  it("unlocked for all but before deadline", () =>
    expect(solutionNotice({ ...i, hasSubmission: false, unlockedForAll: true, deadlinePassed: false })).toBe(
      "The solution will be available after your deadline.",
    ));
});
