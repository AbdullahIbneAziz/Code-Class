import type { Progress, ProgressRow } from "./types";

export const EMPTY_PROGRESS: Progress = {
  submitted: 0,
  late: 0,
  missed: 0,
  pending: 0,
  hwAvgPct: null,
  testAvgPct: null,
};

const num = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v));

/** The view has no row for a student with no items; that means zeros and null averages. */
export function toProgress(row: ProgressRow | null): Progress {
  if (!row) return { ...EMPTY_PROGRESS };
  return {
    submitted: row.submitted,
    late: row.late,
    missed: row.missed,
    pending: row.pending,
    hwAvgPct: num(row.hw_avg_pct),
    testAvgPct: num(row.test_avg_pct),
  };
}

export function formatPct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n)}%`;
}
