import { describe, expect, it } from "vitest";
import { rpcErrorMessage } from "@/lib/db/errors";
import { MAX_BYTES, newObjectPath, validateFile } from "@/lib/files/rules";

describe("validateFile", () => {
  it("accepts and lowercases the extension", () => {
    expect(validateFile({ name: "My HW.IPYNB", size: 10 }, "submission")).toEqual({ ok: true, ext: "ipynb" });
  });
  it("refuses a disallowed type with the allowed list", () => {
    expect(validateFile({ name: "a.exe", size: 10 }, "submission")).toEqual({
      ok: false,
      message: "This file type isn't allowed here. Allowed: .ipynb, .py",
    });
  });
  it("refuses a file over the limit", () => {
    expect(validateFile({ name: "a.py", size: 5242881 }, "submission")).toEqual({
      ok: false,
      message: "This file is too big. The limit is 5 MB.",
    });
    expect(validateFile({ name: "a.pdf", size: 26214401 }, "lecture")).toEqual({
      ok: false,
      message: "This file is too big. The limit is 25 MB.",
    });
    expect(MAX_BYTES.submission).toBe(5242880);
  });
  it("allows .pptx for lectures but not questions", () => {
    expect(validateFile({ name: "s.pptx", size: 10 }, "lecture").ok).toBe(true);
    expect(validateFile({ name: "s.pptx", size: 10 }, "question").ok).toBe(false);
  });
  it("refuses an empty file", () => {
    expect(validateFile({ name: "a.py", size: 0 }, "submission")).toEqual({ ok: false, message: "This file is empty." });
  });
});

describe("newObjectPath", () => {
  it("is folder/uuid.ext", () => {
    expect(newObjectPath("L1", "ipynb")).toMatch(/^L1\/[0-9a-f-]{36}\.ipynb$/);
  });
});

describe("rpcErrorMessage", () => {
  it("maps codes", () => {
    expect(rpcErrorMessage({ code: "P0001", message: "X" })).toBe("X");
    expect(rpcErrorMessage({ code: "42501", message: "Teacher access required." })).toBe(
      "You don't have permission to do that.",
    );
    expect(rpcErrorMessage({ code: "XX000", message: "boom" })).toBe("Something went wrong. Please try again.");
    expect(rpcErrorMessage(null)).toBe("Something went wrong. Please try again.");
  });
});
