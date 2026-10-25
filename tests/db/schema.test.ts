import { afterAll, describe, expect, it } from "vitest";
import { assign, closePool, seedAssignment, seedUser, withTx } from "./helpers";

afterAll(closePool);

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

async function submit(c: Parameters<Parameters<typeof withTx>[0]>[0], a: string, s: string, mark: number | null = null) {
  return c.query(
    `insert into public.submissions (assignment_id, student_id, original_name, object_path, size_bytes, submitted_at, mark)
     values ($1, $2, 't.py', $3, 10, now(), $4)`,
    [a, s, `p/${a}/${s}/${Math.random()}`, mark],
  );
}

describe("schema constraints", () => {
  it("rejects max_marks of 0", () =>
    withTx(async (c) => {
      expect(await pgCode(seedAssignment(c, { max_marks: 0 }))).toBe("23514");
    }));

  it("rejects opens_at after due_at", () =>
    withTx(async (c) => {
      const code = await pgCode(
        seedAssignment(c, {
          visible_from: "2030-01-01T00:00:00Z",
          opens_at: "2030-01-03T00:00:00Z",
          due_at: "2030-01-02T00:00:00Z",
        }),
      );
      expect(code).toBe("23514");
    }));

  it("rejects mark above max_marks", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_s1" });
      const a = await seedAssignment(c, { max_marks: 10 });
      await assign(c, a, s);
      await expect(submit(c, a, s, 11)).rejects.toThrow(/mark exceeds max_marks/);
    }));

  it("accepts mark equal to max_marks", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_s2" });
      const a = await seedAssignment(c, { max_marks: 10 });
      await assign(c, a, s);
      await submit(c, a, s, 10);
      const r = await c.query("select mark from public.submissions where assignment_id=$1", [a]);
      expect(Number(r.rows[0].mark)).toBe(10);
    }));

  it("rejects override window in wrong order", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_s3" });
      const a = await seedAssignment(c);
      const code = await pgCode(
        assign(c, a, s, {
          opens_at_override: "2030-01-02T00:00:00Z",
          due_at_override: "2030-01-01T00:00:00Z",
        }),
      );
      expect(code).toBe("23514");
    }));

  it("rejects duplicate submission for same student and item", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_s4" });
      const a = await seedAssignment(c);
      await assign(c, a, s);
      await submit(c, a, s);
      expect(await pgCode(submit(c, a, s))).toBe("23505");
    }));

  it("rejects duplicate username", () =>
    withTx(async (c) => {
      await seedUser(c, { role: "student", username: "t_dup", exact: true });
      expect(await pgCode(seedUser(c, { role: "student", username: "t_dup", exact: true }))).toBe("23505");
    }));
});
