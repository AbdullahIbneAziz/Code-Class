import type { StudentItem } from "./types";

export type PendingBanner = { count: number; text: string; items: StudentItem[] };

/**
 * Homework the student still owes: action_state `pending` or `missed` (a late, unsubmitted homework stays pending).
 * Order (§6.1): pending by due date ascending, then missed by due date descending.
 */
export function pendingBanner(items: StudentItem[]): PendingBanner {
  const due = (i: StudentItem) => new Date(i.effectiveDueAt).getTime();
  const homework = items.filter((i) => i.kind === "homework");
  const pending = homework.filter((i) => i.actionState === "pending").sort((a, b) => due(a) - due(b));
  const missed = homework.filter((i) => i.actionState === "missed").sort((a, b) => due(b) - due(a));
  const list = [...pending, ...missed];
  const count = list.length;
  const text =
    count === 0
      ? "✓ You're all caught up."
      : count === 1
        ? "⚠ You have 1 pending homework"
        : `⚠ You have ${count} pending homeworks`;
  return { count, text, items: list };
}
