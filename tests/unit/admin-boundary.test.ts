import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const ADMIN_FILE = path.join(ROOT, "src/lib/supabase/admin.ts");
const ALLOWED = [
  /^src\/lib\/accounts\/[^/]+\.ts$/,
  /^src\/actions\/account\.ts$/,
  /^scripts\/[^/]+\.ts$/,
  /^tests\/.+/,
];

function importsAdmin(file: string, source: string): boolean {
  const specs = [
    ...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
  ].map((m) => m[1]);
  return specs.some((spec) => {
    if (spec === "@/lib/supabase/admin") return true;
    if (spec.startsWith(".")) {
      const resolved = path.resolve(path.dirname(file), spec);
      return resolved === ADMIN_FILE.replace(/\.ts$/, "");
    }
    return false;
  });
}

describe("admin client import boundary", () => {
  it("is imported only from allowlisted files", () => {
    const violations = walk(path.join(ROOT, "src"), [".ts", ".tsx"])
      .filter((f) => importsAdmin(f, fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
      .filter((rel) => !ALLOWED.some((re) => re.test(rel)));
    expect(violations).toEqual([]);
  });

  it("admin.ts is server-only", () => {
    const src = fs.readFileSync(ADMIN_FILE, "utf8");
    expect(src).toContain("import 'server-only'");
  });

  it("admin-client.ts is imported only by src/actions/teacher-students.ts", () => {
    const target = path.join(ROOT, "src/lib/accounts/admin-client");
    const importers = [...walk(path.join(ROOT, "src"), [".ts", ".tsx"]), ...walk(path.join(ROOT, "scripts"), [".ts"])]
      .filter((f) => {
        const specs = [...fs.readFileSync(f, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
        return specs.some(
          (spec) =>
            spec === "@/lib/accounts/admin-client" ||
            (spec.startsWith(".") && path.resolve(path.dirname(f), spec) === target),
        );
      })
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
    expect(importers).toEqual(["src/actions/teacher-students.ts"]);
  });

  it("admin-client.ts is server-only", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/lib/accounts/admin-client.ts"), "utf8");
    expect(src).toContain("import 'server-only'");
  });
});
