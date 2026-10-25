import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import { gateTeacher } from "@/lib/accounts/teacher-client";

function fake(user: { id: string } | null, rpc: { data: unknown; error: { message: string } | null }) {
  return { auth: { getUser: async () => ({ data: { user } }) }, rpc: async () => rpc } as unknown as SupabaseClient;
}

describe("gateTeacher", () => {
  it("a non-teacher gets the permission message", async () => {
    expect(await gateTeacher(fake({ id: "u" }, { data: false, error: null }))).toEqual({
      ok: false,
      message: "You don't have permission to do that.",
    });
  });
  it("any other failure gets the generic message", async () => {
    expect(await gateTeacher(fake({ id: "u" }, { data: null, error: { message: "boom" } }))).toEqual({
      ok: false,
      message: "Something went wrong. Please try again.",
    });
  });
  it("a teacher passes", async () => {
    const c = fake({ id: "u" }, { data: true, error: null });
    expect(await gateTeacher(c)).toEqual({ ok: true, client: c });
  });
});
