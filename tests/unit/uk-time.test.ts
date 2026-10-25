import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UkDateTimeField } from "@/components/UkDateTimeField";
import {
  dueLabel,
  formatBd,
  formatUk,
  formatUkWithZone,
  parseUkLocal,
  toUkInputParts,
  ukZoneAt,
} from "@/lib/time/uk";
import { readUkField } from "@/lib/time/form";

const iso = (r: ReturnType<typeof parseUkLocal>) => (r.ok ? r.instant.toISOString() : r);
const NONEXISTENT = "This time doesn't exist in the UK on this day (clocks go forward). Please choose another time.";
const AMBIGUOUS = "This time happens twice in the UK on this day (clocks go back). BST (first time) or GMT (second time)?";

function parseCases() {
  const a = parseUkLocal("2026-10-21", "20:00");
  expect(a).toMatchObject({ ok: true, zone: "BST" });
  expect(iso(a)).toBe("2026-10-21T19:00:00.000Z");
  const b = parseUkLocal("2026-12-01", "20:00");
  expect(b).toMatchObject({ ok: true, zone: "GMT" });
  expect(iso(b)).toBe("2026-12-01T20:00:00.000Z");
  expect(formatUkWithZone(new Date("2027-10-31T01:30:00Z"))).toBe("Sun 31 Oct 2027, 1:30 AM GMT");
  expect(formatUkWithZone(new Date("2027-10-31T00:30:00Z"))).toBe("Sun 31 Oct 2027, 1:30 AM BST");
}

describe("parseUkLocal", () => {
  it("normal BST and GMT days", parseCases);

  it("spring forward 2027-03-28", () => {
    expect(parseUkLocal("2027-03-28", "01:30")).toEqual({ ok: false, reason: "nonexistent", message: NONEXISTENT });
    expect(parseUkLocal("2027-03-28", "00:59")).toMatchObject({ ok: true, zone: "GMT" });
    expect(iso(parseUkLocal("2027-03-28", "00:59"))).toBe("2027-03-28T00:59:00.000Z");
    expect(parseUkLocal("2027-03-28", "02:00")).toMatchObject({ ok: true, zone: "BST" });
    expect(iso(parseUkLocal("2027-03-28", "02:00"))).toBe("2027-03-28T01:00:00.000Z");
  });

  it("fall back 2027-10-31", () => {
    expect(parseUkLocal("2027-10-31", "01:30")).toEqual({ ok: false, reason: "ambiguous", message: AMBIGUOUS });
    expect(iso(parseUkLocal("2027-10-31", "01:30", "BST"))).toBe("2027-10-31T00:30:00.000Z");
    expect(iso(parseUkLocal("2027-10-31", "01:30", "GMT"))).toBe("2027-10-31T01:30:00.000Z");
    const before = parseUkLocal("2027-10-31", "00:59");
    expect(before).toMatchObject({ ok: true, zone: "BST" });
    expect(iso(before)).toBe("2027-10-30T23:59:00.000Z");
    const after = parseUkLocal("2027-10-31", "02:00");
    expect(after).toMatchObject({ ok: true, zone: "GMT" });
    expect(iso(after)).toBe("2027-10-31T02:00:00.000Z");
  });

  it("invalid input", () => {
    for (const [d, t] of [["2026-02-30", "10:00"], ["2026-10-21", "25:00"], ["", "10:00"], ["2026-10-21", "9:00"]]) {
      expect(parseUkLocal(d, t)).toEqual({ ok: false, reason: "invalid", message: "Please enter a valid date and time." });
    }
  });
});

describe("formatting", () => {
  it("formatBd", () => {
    expect(formatBd(new Date("2026-10-21T19:00:00Z"))).toBe("Thu 22 Oct, 1:00 AM");
  });
  it("formatUk and ukZoneAt", () => {
    expect(formatUk(new Date("2026-10-21T19:00:00Z"))).toBe("Wed 21 Oct 2026, 8:00 PM");
    expect(ukZoneAt(new Date("2026-10-21T19:00:00Z"))).toBe("BST");
    expect(ukZoneAt(new Date("2026-12-01T19:00:00Z"))).toBe("GMT");
  });
  it("toUkInputParts", () => {
    expect(toUkInputParts(new Date("2026-10-21T19:00:00Z"))).toEqual({ date: "2026-10-21", time: "20:00", zone: "BST" });
  });
});

describe("dueLabel", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("future and past", () => {
    expect(dueLabel(new Date("2026-10-21T19:00:00Z"), now)).toBe("Due today, 8:00 PM");
    expect(dueLabel(new Date("2026-10-22T19:00:00Z"), now)).toBe("Due tomorrow, 8:00 PM");
    expect(dueLabel(new Date("2026-10-25T19:00:00Z"), now)).toBe("Due Sun 25 Oct, 7:00 PM");
    expect(dueLabel(new Date("2026-10-20T19:00:00Z"), now)).toBe("was due yesterday");
    expect(dueLabel(new Date("2026-10-21T08:00:00Z"), now)).toBe("was due today, 9:00 AM");
    expect(dueLabel(new Date("2026-10-18T19:00:00Z"), now)).toBe("was due Sun 18 Oct");
  });
  it("uses UK calendar days", () => {
    expect(dueLabel(new Date("2026-10-22T19:00:00Z"), new Date("2026-10-21T23:30:00Z"))).toBe("Due today, 8:00 PM");
  });
});

describe("process time zone independence", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });
  for (const tz of ["Asia/Dhaka", "Europe/London", "America/Los_Angeles"]) {
    it(`same output under TZ=${tz}`, () => {
      process.env.TZ = tz;
      expect(new Date("2026-10-21T19:00:00Z").getTimezoneOffset()).toBe(
        { "Asia/Dhaka": -360, "Europe/London": -60, "America/Los_Angeles": 420 }[tz],
      );
      parseCases();
      expect(parseUkLocal("2027-03-28", "01:30")).toMatchObject({ ok: false, reason: "nonexistent" });
      expect(parseUkLocal("2027-10-31", "01:30")).toMatchObject({ ok: false, reason: "ambiguous" });
      expect(iso(parseUkLocal("2027-10-31", "01:30", "GMT"))).toBe("2027-10-31T01:30:00.000Z");
      expect(toUkInputParts(new Date("2026-10-21T19:00:00Z"))).toEqual({ date: "2026-10-21", time: "20:00", zone: "BST" });
      expect(dueLabel(new Date("2026-10-22T19:00:00Z"), new Date("2026-10-21T23:30:00Z"))).toBe("Due today, 8:00 PM");
    });
  }
});

describe("readUkField", () => {
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  it("empty optional is null", () => {
    expect(readUkField(fd({ visibleFromDate: "", visibleFromTime: "" }), "visibleFrom", { optional: true })).toEqual({ ok: true, instant: null });
    expect(readUkField(fd({}), "visibleFrom", { optional: true })).toEqual({ ok: true, instant: null });
  });
  it("empty required is invalid", () => {
    expect(readUkField(fd({}), "due", { optional: false })).toEqual({ ok: false, message: "Please enter a valid date and time." });
  });
  it("half-filled optional is invalid", () => {
    expect(readUkField(fd({ visibleFromDate: "2026-10-21", visibleFromTime: "" }), "visibleFrom", { optional: true })).toMatchObject({ ok: false });
  });
  it("ambiguous needs zone choice, then resolves", () => {
    const base = { dueDate: "2027-10-31", dueTime: "01:30" };
    expect(readUkField(fd(base), "due", { optional: false })).toEqual({ ok: false, message: AMBIGUOUS, needsZoneChoice: true });
    const r = readUkField(fd({ ...base, dueZone: "GMT" }), "due", { optional: false });
    expect(r.ok && r.instant?.toISOString()).toBe("2027-10-31T01:30:00.000Z");
  });
  it("nonexistent has no zone choice", () => {
    expect(readUkField(fd({ dueDate: "2027-03-28", dueTime: "01:30" }), "due", { optional: false })).toEqual({ ok: false, message: NONEXISTENT });
  });
});

describe("host time zone gaps (host DST must not affect UK results)", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });
  it("Los Angeles host, UK 2027-03-14 02:30 is a valid GMT time", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(new Date("2027-01-01T00:00:00Z").getTimezoneOffset()).toBe(480);
    const r = parseUkLocal("2027-03-14", "02:30");
    expect(r).toMatchObject({ ok: true, zone: "GMT" });
    expect(iso(r)).toBe("2027-03-14T02:30:00.000Z");
    expect(formatUk(new Date("2027-03-14T02:30:00Z"))).toBe("Sun 14 Mar 2027, 2:30 AM");
    expect(toUkInputParts(new Date("2027-03-14T02:30:00Z"))).toEqual({ date: "2027-03-14", time: "02:30", zone: "GMT" });
    expect(formatBd(new Date("2027-03-14T02:30:00Z"))).toBe("Sun 14 Mar, 8:30 AM");
    expect(dueLabel(new Date("2027-03-14T02:30:00Z"), new Date("2027-03-13T12:00:00Z"))).toBe("Due tomorrow, 2:30 AM");
  });
  it("Paris host, UK 2027-03-28 02:00 and 02:30 are valid BST times", () => {
    process.env.TZ = "Europe/Paris";
    expect(new Date("2027-01-01T00:00:00Z").getTimezoneOffset()).toBe(-60);
    const r = parseUkLocal("2027-03-28", "02:30");
    expect(r).toMatchObject({ ok: true, zone: "BST" });
    expect(iso(r)).toBe("2027-03-28T01:30:00.000Z");
    expect(iso(parseUkLocal("2027-03-28", "02:00"))).toBe("2027-03-28T01:00:00.000Z");
    expect(parseUkLocal("2027-03-28", "01:30")).toMatchObject({ ok: false, reason: "nonexistent" });
    expect(formatUk(new Date("2027-03-28T01:30:00Z"))).toBe("Sun 28 Mar 2027, 2:30 AM");
    expect(toUkInputParts(new Date("2027-03-28T01:30:00Z"))).toEqual({ date: "2027-03-28", time: "02:30", zone: "BST" });
    expect(formatBd(new Date("2027-03-28T01:30:00Z"))).toBe("Sun 28 Mar, 7:30 AM");
  });
});

describe("UkDateTimeField default zone", () => {
  const submitted = (zone: "GMT" | "BST") => {
    const html = renderToStaticMarkup(
      createElement(UkDateTimeField, { name: "due", label: "Deadline", defaultValue: { date: "2027-10-31", time: "01:30", zone } }),
    );
    const fd = new FormData();
    fd.set("dueDate", "2027-10-31");
    fd.set("dueTime", "01:30");
    for (const tag of html.match(/<input[^>]*>/g) ?? []) {
      if (/name="dueZone"/.test(tag) && /checked/.test(tag)) fd.set("dueZone", /value="(\w+)"/.exec(tag)![1]);
    }
    return fd;
  };
  it("re-saving keeps the original instant", () => {
    const g = readUkField(submitted("GMT"), "due", { optional: false });
    expect(g.ok && g.instant?.toISOString()).toBe("2027-10-31T01:30:00.000Z");
    const b = readUkField(submitted("BST"), "due", { optional: false });
    expect(b.ok && b.instant?.toISOString()).toBe("2027-10-31T00:30:00.000Z");
  });
  it("no radios for an unambiguous default", () => {
    const html = renderToStaticMarkup(
      createElement(UkDateTimeField, { name: "due", label: "D", defaultValue: { date: "2026-10-21", time: "20:00", zone: "BST" } }),
    );
    expect(html).not.toContain("dueZone");
  });
});
