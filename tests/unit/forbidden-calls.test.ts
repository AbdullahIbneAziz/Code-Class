import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const EXCLUDED = ["scripts/phase0-login-proof.ts"];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("forbidden auth calls", () => {
  it("no sign-up, email-reset, OTP, or email-change calls in src/ or scripts/", () => {
    const patterns = [
      /\.(signUp|resetPasswordForEmail|signInWithOtp)\s*\(/,
      /updateUser\(\s*\{[^}]*\bemail\b/,
    ];
    const hits: string[] = [];
    for (const file of [
      ...walk(path.join(ROOT, "src")),
      ...walk(path.join(ROOT, "scripts")),
    ]) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (EXCLUDED.includes(rel)) continue;
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(rel)) continue;
      const src = fs.readFileSync(file, "utf8");
      if (patterns.some((p) => p.test(src))) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });
});
