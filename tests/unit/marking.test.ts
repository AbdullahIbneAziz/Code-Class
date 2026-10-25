import { describe, expect, it } from "vitest";
import { formatMark, markText, parseMarkInput } from "@/lib/marking/format";

describe("formatMark", () => {
  it("drops trailing zeros and rounds to 2 decimals", () => {
    expect(formatMark(8)).toBe("8");
    expect(formatMark(7.5)).toBe("7.5");
    expect(formatMark(7.25)).toBe("7.25");
    expect(formatMark(7.256)).toBe("7.26");
  });
});

describe("markText", () => {
  it("joins mark and max", () => expect(markText(7.5, 10)).toBe("7.5/10"));
});

describe("parseMarkInput", () => {
  it("parses a trimmed number", () => expect(parseMarkInput(" 7.5 ")).toEqual({ ok: true, mark: 7.5 }));
  it("refuses empty", () => expect(parseMarkInput("")).toEqual({ ok: false, message: "Please enter a mark." }));
  it("refuses text", () =>
    expect(parseMarkInput("abc")).toEqual({ ok: false, message: "Please enter a mark as a number." }));
  it("leaves the range to the database", () => expect(parseMarkInput("-1")).toEqual({ ok: true, mark: -1 }));
});
