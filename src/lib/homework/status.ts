import type { StudentItem } from "./types";

/** Derived from the DB's action_state / is_late only, never from the app clock. */
export function statusLabel(
  item: StudentItem,
): "Pending" | "Missed" | "Submitted · On time" | "Submitted · Late" | "Excused" {
  switch (item.actionState) {
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
