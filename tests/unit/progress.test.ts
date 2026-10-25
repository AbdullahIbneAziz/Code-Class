import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS, formatPct, toProgress } from "@/lib/progress/format";

describe("toProgress", () => {
  it("null row is zeros and null averages", () => {
    expect(toProgress(null)).toEqual(EMPTY_PROGRESS);
    expect(EMPTY_PROGRESS).toEqual({ submitted: 0, late: 0, missed: 0, pending: 0, hwAvgPct: null, testAvgPct: null });
  });
  it("converts numeric strings and keeps null", () => {
    expect(
      toProgress({ student_id: "x", submitted: 3, late: 1, missed: 0, pending: 2, hw_avg_pct: "82.50", test_avg_pct: null }),
    ).toEqual({ submitted: 3, late: 1, missed: 0, pending: 2, hwAvgPct: 82.5, testAvgPct: null });
  });
});

describe("formatPct", () => {
  it("rounds, keeps zero, dashes null", () => {
    expect(formatPct(82.5)).toBe("83%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(null)).toBe("—");
  });
});
