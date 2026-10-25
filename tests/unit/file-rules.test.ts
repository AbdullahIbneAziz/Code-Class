import { describe, expect, it } from "vitest";
import { rpcErrorMessage } from "@/lib/db/errors";
import { tusOptions } from "@/lib/files/upload";
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

describe("nasty file names", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  it("takes only the extension from a traversal-style name; the path never contains the name", () => {
    const v = validateFile({ name: "../../My HW (final).IPYNB", size: 10 }, "submission");
    expect(v).toEqual({ ok: true, ext: "ipynb" });
    if (!v.ok) return;
    const p = newObjectPath(uuid, v.ext);
    expect(p).toMatch(new RegExp(`^${uuid}/[0-9a-f-]{36}\\.ipynb$`));
    expect(p).not.toContain("..");
    expect(p).not.toContain("My HW");
    expect(p.split("/")).toHaveLength(2);
  });
  it("accepts a 200-character base name", () => {
    expect(validateFile({ name: "a".repeat(200) + ".ipynb", size: 10 }, "submission")).toEqual({ ok: true, ext: "ipynb" });
  });
  it("handles control characters", () => {
    expect(validateFile({ name: "hw\n1.ipynb", size: 10 }, "submission")).toEqual({ ok: true, ext: "ipynb" });
    expect(validateFile({ name: "a\u0000.py", size: 10 }, "submission")).toEqual({ ok: true, ext: "py" });
  });
});

describe("tusOptions", () => {
  it("has no static authorization header and sets it per request", async () => {
    let token = "tok1";
    const client = { auth: { getSession: async () => ({ data: { session: { access_token: token } } }) } };
    const o = tusOptions(client as never, "lectures", "x/y.pdf", "application/pdf", {
      onProgress: () => {},
      onSuccess: () => {},
      onError: () => {},
    });
    expect(Object.keys(o.headers ?? {}).map((k) => k.toLowerCase())).not.toContain("authorization");
    expect(o.headers).toMatchObject({ "x-upsert": "false" });
    const set: Record<string, string> = {};
    await o.onBeforeRequest!({ setHeader: (k: string, v: string) => (set[k] = v) } as never);
    expect(set.authorization).toBe("Bearer tok1");
    token = "tok2";
    await o.onBeforeRequest!({ setHeader: (k: string, v: string) => (set[k] = v) } as never);
    expect(set.authorization).toBe("Bearer tok2");
  });
});
