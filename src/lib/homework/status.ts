import { markText } from "@/lib/marking/format";
import type { StudentItem } from "./types";

/** Derived from the DB's action_state / is_late only, never from the app clock. */
export function statusLabel(
  item: StudentItem,
): "Scheduled" | "Upcoming" | "Pending" | "Missed" | "Submitted · On time" | "Submitted · Late" | "Excused" {
  switch (item.actionState) {
    case "hidden":
      return "Scheduled";
    case "upcoming":
      return "Upcoming";
    case "excused":
      return "Excused";
    case "done":
      return item.isLate ? "Submitted · Late" : "Submitted · On time";
    case "missed":
      return "Missed";
    default:
      return "Pending";
  }
}

/** Request-time clock check for display only; the database enforces the real deadline. */
export function hasPassed(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

/** The status, plus the mark once marked. */
export function itemLabel(item: StudentItem): string {
  const base = statusLabel(item);
  return item.isMarked && item.mark !== null ? `${base} · Marked ${markText(item.mark, item.maxMarks)}` : base;
}

/** Which tab a homework item belongs to; not-yet-open items (hidden/upcoming) belong to none. */
export function homeworkTab(item: StudentItem): "pending" | "submitted" | "marked" | null {
  if (item.actionState === "hidden" || item.actionState === "upcoming") return null;
  if (item.isMarked) return "marked";
  if (item.actionState === "done" || item.actionState === "excused") return "submitted";
  return "pending";
}

/** The sentence shown in place of the solution download; null when the solution is available. */
export function solutionNotice(i: {
  available: boolean;
  hasSubmission: boolean;
  isExcused: boolean;
  unlockedForAll: boolean;
  deadlinePassed: boolean;
}): string | null {
  if (i.available) return null;
  if (!i.hasSubmission && !i.isExcused && !i.unlockedForAll) return "Submit your homework to unlock the solution.";
  if (!i.deadlinePassed) return "The solution will be available after your deadline.";
  return "No solution has been shared yet.";
}
