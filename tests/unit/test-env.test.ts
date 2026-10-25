import { describe, expect, it } from "vitest";
import { assertTestTarget, LIVE_PROJECT_REF, resolveEnvFile } from "../env";

const MSG = "Tests must run against the test database (.env.test.local), never the live project.";
const ok = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  DATABASE_URL: "postgresql://postgres.abcdefghijklmnop:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
};

describe("assertTestTarget", () => {
  it("accepts a non-live project", () => {
    expect(() => assertTestTarget(ok)).not.toThrow();
  });
  it("rejects the live ref in the URL", () => {
    expect(() =>
      assertTestTarget({ ...ok, NEXT_PUBLIC_SUPABASE_URL: `https://${LIVE_PROJECT_REF}.supabase.co` }),
    ).toThrow(MSG);
  });
  it("rejects the live ref in DATABASE_URL", () => {
    expect(() =>
      assertTestTarget({ ...ok, DATABASE_URL: `postgresql://postgres.${LIVE_PROJECT_REF}:pw@host/postgres` }),
    ).toThrow(MSG);
  });
  it("rejects an empty or missing URL", () => {
    expect(() => assertTestTarget({ ...ok, NEXT_PUBLIC_SUPABASE_URL: "" })).toThrow(MSG);
    expect(() => assertTestTarget({ DATABASE_URL: ok.DATABASE_URL })).toThrow(MSG);
  });
});

describe("resolveEnvFile", () => {
  it("uses the test file by default", () => {
    expect(resolveEnvFile({})).toEqual({ file: ".env.test.local", live: false });
  });
  it("refuses a BASE_URL run without ALLOW_LIVE_DB=1", () => {
    expect(() => resolveEnvFile({ BASE_URL: "https://x.example" })).toThrow(
      "Live-site e2e needs ALLOW_LIVE_DB=1 (it writes t_ test data to the live database).",
    );
  });
  it("ignores the BASE_URL=/ that vitest sets itself", () => {
    expect(resolveEnvFile({ BASE_URL: "/" })).toEqual({ file: ".env.test.local", live: false });
  });
  it("allows live only with BASE_URL and ALLOW_LIVE_DB=1", () => {
    expect(resolveEnvFile({ BASE_URL: "https://x.example", ALLOW_LIVE_DB: "1" })).toEqual({
      file: ".env.local",
      live: true,
    });
    expect(resolveEnvFile({ ALLOW_LIVE_DB: "1" })).toEqual({ file: ".env.test.local", live: false });
  });
});
