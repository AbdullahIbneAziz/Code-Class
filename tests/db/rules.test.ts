import { afterAll, describe, expect, it } from "vitest";
import { actAs, assign, closePool, seedAssignment, seedUser, withTx } from "./helpers";

afterAll(closePool);

type Tx = Parameters<Parameters<typeof withTx>[0]>[0];

const H = (n: number) => `now() + interval '${n} hours'`;

/** Evaluate an SQL timestamp expression inside the (frozen-now) transaction. */
async function ts(c: Tx, expr: string): Promise<string> {
  const r = await c.query(`select (${expr})::text as t`);
  return r.rows[0].t as string;
}

async function submit(c: Tx, a: string, s: string, atExpr: string, mark: number | null = null) {
  await c.query(
    `insert into public.submissions (assignment_id, student_id, original_name, object_path, size_bytes, submitted_at, mark)
     values ($1, $2, 't.py', $3, 10, ${atExpr}, $4)`,
    [a, s, `p/${a}/${s}`, mark],
  );
}

async function addSolution(c: Tx, a: string) {
  await c.query(
    `insert into public.assignment_files (assignment_id, purpose, original_name, object_path, size_bytes)
     values ($1, 'solution', 's.py', $2, 1)`,
    [a, `sol/${a}`],
  );
}

async function fn(c: Tx, name: string, a: string): Promise<boolean> {
  const r = await c.query(`select public.${name}($1) as v`, [a]);
  return r.rows[0].v as boolean;
}

async function facts(c: Tx, a: string, s: string) {
  const r = await c.query(
    "select * from public.student_assignment_facts where assignment_id = $1 and student_id = $2",
    [a, s],
  );
  return r.rows[0];
}

async function progress(c: Tx, s: string) {
  const r = await c.query("select * from public.student_progress where student_id = $1", [s]);
  return r.rows[0];
}

describe("rule functions and views", () => {
  it("homework hidden before visible_from", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const a = await seedAssignment(c, {
        visible_from: await ts(c, H(1)),
        opens_at: await ts(c, H(2)),
        due_at: await ts(c, H(5)),
      });
      await assign(c, a, s);
      await actAs(c, s);
      expect(await fn(c, "can_see_assignment", a)).toBe(false);
      // The student cannot even see the facts row (RLS on assignments, security_invoker).
      expect(await facts(c, a, s)).toBeUndefined();
      await actAs(c, t);
      expect((await facts(c, a, s)).action_state).toBe("hidden");
      expect(await fn(c, "can_see_assignment", a)).toBe(true);
    }));

  it("columns of student_assignment_facts match section 9.2", () =>
    withTx(async (c) => {
      const r = await c.query(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'student_assignment_facts' order by ordinal_position`,
      );
      expect(r.rows.map((x) => x.column_name)).toEqual([
        "assignment_id",
        "student_id",
        "kind",
        "effective_opens_at",
        "effective_due_at",
        "is_visible",
        "is_excused",
        "has_submission",
        "is_late",
        "is_marked",
        "score_pct",
        "action_state",
      ]);
    }));

  it("pending then missed", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const a1 = await seedAssignment(c, { due_at: await ts(c, H(1)) });
      const a2 = await seedAssignment(c, {
        visible_from: await ts(c, H(-5)),
        opens_at: await ts(c, H(-3)),
        due_at: await ts(c, H(-1)),
      });
      await assign(c, a1, s);
      await assign(c, a2, s);
      await actAs(c, s);
      expect((await facts(c, a1, s)).action_state).toBe("pending");
      expect((await facts(c, a2, s)).action_state).toBe("missed");
      const p = await progress(c, s);
      expect(p).toMatchObject({ submitted: 0, late: 0, missed: 1, pending: 1 });
    }));

  it("upcoming test and done", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const up = await seedAssignment(c, {
        kind: "test",
        visible_from: await ts(c, H(-1)),
        opens_at: await ts(c, H(1)),
        due_at: await ts(c, H(2)),
      });
      const done = await seedAssignment(c);
      await assign(c, up, s);
      await assign(c, done, s);
      await submit(c, done, s, H(-1));
      await actAs(c, s);
      expect((await facts(c, up, s)).action_state).toBe("upcoming");
      expect((await facts(c, done, s)).action_state).toBe("done");
    }));

  it("late submission counts in submitted and late, and stays after marking", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const a = await seedAssignment(c, {
        visible_from: await ts(c, H(-10)),
        opens_at: await ts(c, H(-9)),
        due_at: await ts(c, H(-2)),
      });
      await assign(c, a, s);
      await submit(c, a, s, H(-1));
      await actAs(c, s);
      expect(await progress(c, s)).toMatchObject({ submitted: 1, late: 1, missed: 0, pending: 0 });
      await c.query("reset role");
      await c.query("update public.submissions set mark = 7 where assignment_id = $1", [a]);
      await actAs(c, s);
      const f = await facts(c, a, s);
      expect(f).toMatchObject({ is_late: true, is_marked: true, has_submission: true });
      expect(Number(f.score_pct)).toBeCloseTo(0.7);
      expect(await progress(c, s)).toMatchObject({ submitted: 1, late: 1 });
    }));

  it("extension turns late into on time", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const a = await seedAssignment(c, {
        visible_from: await ts(c, H(-10)),
        opens_at: await ts(c, H(-9)),
        due_at: await ts(c, H(-2)),
      });
      await assign(c, a, s, { due_at_override: await ts(c, H(3)) });
      await submit(c, a, s, H(-1));
      await actAs(c, s);
      const f = await facts(c, a, s);
      expect(f.is_late).toBe(false);
      expect(f.action_state).toBe("done");
    }));

  it("excused item excluded from counts and averages", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const missedExcused = await seedAssignment(c, {
        visible_from: await ts(c, H(-10)),
        opens_at: await ts(c, H(-9)),
        due_at: await ts(c, H(-2)),
      });
      const submittedExcused = await seedAssignment(c);
      const pendingExcused = await seedAssignment(c);
      await assign(c, missedExcused, s, { excused: true });
      await assign(c, submittedExcused, s, { excused: true });
      await assign(c, pendingExcused, s, { excused: true });
      await submit(c, submittedExcused, s, H(-1), 10);
      await actAs(c, s);
      expect((await facts(c, missedExcused, s)).action_state).toBe("excused");
      expect(await progress(c, s)).toBeUndefined();
    }));

  it("missed counts as 0 in hw average", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const marked = await seedAssignment(c, { max_marks: 10 });
      const missed = await seedAssignment(c, {
        visible_from: await ts(c, H(-10)),
        opens_at: await ts(c, H(-9)),
        due_at: await ts(c, H(-2)),
      });
      const unmarked = await seedAssignment(c);
      await assign(c, marked, s);
      await assign(c, missed, s);
      await assign(c, unmarked, s);
      await submit(c, marked, s, H(-1), 8);
      await submit(c, unmarked, s, H(-1));
      await actAs(c, s);
      const p = await progress(c, s);
      expect(Number(p.hw_avg_pct)).toBe(40);
      expect(p.test_avg_pct).toBeNull();
      expect(p).toMatchObject({ submitted: 2, missed: 1 });
    }));

  it("test average uses tests only", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const test = await seedAssignment(c, {
        kind: "test",
        max_marks: 20,
        visible_from: await ts(c, H(-10)),
        opens_at: await ts(c, H(-9)),
        due_at: await ts(c, H(-2)),
      });
      await assign(c, test, s);
      await submit(c, test, s, H(-3), 5);
      await actAs(c, s);
      const p = await progress(c, s);
      expect(Number(p.test_avg_pct)).toBe(25);
      expect(p.hw_avg_pct).toBeNull();
    }));

  it("test questions locked before start, open during", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const before = await seedAssignment(c, {
        kind: "test",
        visible_from: await ts(c, H(-1)),
        opens_at: await ts(c, H(1)),
        due_at: await ts(c, H(2)),
      });
      const during = await seedAssignment(c, {
        kind: "test",
        visible_from: await ts(c, H(-2)),
        opens_at: await ts(c, H(-1)),
        due_at: await ts(c, H(1)),
      });
      await assign(c, before, s);
      await assign(c, during, s);
      await actAs(c, s);
      expect(await fn(c, "can_read_question", before)).toBe(false);
      expect(await fn(c, "can_read_question", during)).toBe(true);
    }));

  it("can_upload_now false after test end, true for homework after due", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const times = {
        visible_from: await ts(c, H(-10)),
        opens_at: await ts(c, H(-9)),
        due_at: await ts(c, H(-2)),
      };
      const test = await seedAssignment(c, { kind: "test", ...times });
      const hw = await seedAssignment(c, { kind: "homework", ...times });
      const open = await seedAssignment(c, {
        kind: "test",
        visible_from: await ts(c, H(-2)),
        opens_at: await ts(c, H(-1)),
        due_at: await ts(c, H(1)),
      });
      const notYet = await seedAssignment(c, {
        kind: "test",
        visible_from: await ts(c, H(-1)),
        opens_at: await ts(c, H(1)),
        due_at: await ts(c, H(2)),
      });
      const excused = await seedAssignment(c);
      for (const a of [test, hw, open, notYet]) await assign(c, a, s);
      await assign(c, excused, s, { excused: true });
      await actAs(c, s);
      expect(await fn(c, "can_upload_now", test)).toBe(false);
      expect(await fn(c, "can_upload_now", hw)).toBe(true);
      expect(await fn(c, "can_upload_now", open)).toBe(true);
      expect(await fn(c, "can_upload_now", notYet)).toBe(false);
      expect(await fn(c, "can_upload_now", excused)).toBe(false);
    }));

  it("can_upload_now false for unassigned or inactive student", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const inactive = await seedUser(c, { role: "student", username: "t_b", isActive: false });
      const a = await seedAssignment(c);
      await assign(c, a, inactive);
      await actAs(c, s);
      expect(await fn(c, "can_upload_now", a)).toBe(false);
      await actAs(c, inactive);
      expect(await fn(c, "can_upload_now", a)).toBe(false);
      expect(await fn(c, "can_see_assignment", a)).toBe(false);
    }));

  it("solution rule matrix (section 4.4)", () =>
    withTx(async (c) => {
      const teacher = await seedUser(c, { role: "teacher", username: "t_teacher" });
      const times = {
        past: { visible_from: await ts(c, H(-10)), opens_at: await ts(c, H(-9)), due_at: await ts(c, H(-1)) },
        future: { visible_from: await ts(c, H(-10)), opens_at: await ts(c, H(-9)), due_at: await ts(c, H(1)) },
      };
      const cases: { a: string; s: string; expected: boolean; label: string }[] = [];
      let n = 0;
      for (const afterDue of [false, true])
        for (const submitted of [false, true])
          for (const unlocked of [false, true])
            for (const excused of [false, true]) {
              const s = await seedUser(c, { role: "student", username: `t_m${n++}` });
              const a = await seedAssignment(c, afterDue ? times.past : times.future);
              await addSolution(c, a);
              if (unlocked) await c.query("update public.assignments set solution_unlocked_for_all = true where id = $1", [a]);
              await assign(c, a, s, { excused });
              if (submitted) await submit(c, a, s, H(-5));
              cases.push({
                a,
                s,
                expected: afterDue && (submitted || unlocked || excused),
                label: `afterDue=${afterDue} submitted=${submitted} unlocked=${unlocked} excused=${excused}`,
              });
            }
      for (const k of cases) {
        await actAs(c, k.s);
        expect(await fn(c, "can_read_solution", k.a), k.label).toBe(k.expected);
      }
      await actAs(c, teacher);
      for (const k of cases) expect(await fn(c, "can_read_solution", k.a), `teacher ${k.label}`).toBe(true);
    }), 120000);

  it("solution: unlocked_for_all does not skip an extended deadline", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const a = await seedAssignment(c, {
        visible_from: await ts(c, H(-10)),
        opens_at: await ts(c, H(-9)),
        due_at: await ts(c, H(-2)),
      });
      await addSolution(c, a);
      await c.query("update public.assignments set solution_unlocked_for_all = true where id = $1", [a]);
      await assign(c, a, s, { due_at_override: await ts(c, H(2)) });
      await actAs(c, s);
      expect(await fn(c, "can_read_solution", a)).toBe(false);
    }));

  it("solution: no solution file means no access, even for the teacher-unlocked case", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const a = await seedAssignment(c, {
        visible_from: await ts(c, H(-10)),
        opens_at: await ts(c, H(-9)),
        due_at: await ts(c, H(-2)),
      });
      await c.query("update public.assignments set solution_unlocked_for_all = true where id = $1", [a]);
      await assign(c, a, s);
      await submit(c, a, s, H(-3));
      await actAs(c, s);
      expect(await fn(c, "can_read_solution", a)).toBe(false);
    }));

  it("can_read_solution drives the assignment_files policy", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const a = await seedAssignment(c, {
        visible_from: await ts(c, H(-10)),
        opens_at: await ts(c, H(-9)),
        due_at: await ts(c, H(-2)),
      });
      await addSolution(c, a);
      await assign(c, a, s);
      await actAs(c, s);
      expect((await c.query("select 1 from public.assignment_files")).rows).toHaveLength(0);
      await c.query("reset role");
      await submit(c, a, s, H(-3));
      await actAs(c, s);
      expect((await c.query("select 1 from public.assignment_files")).rows).toHaveLength(1);
    }));

  it("student cannot read another student's facts or progress", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      const a = await seedUser(c, { role: "student", username: "t_a" });
      const b = await seedUser(c, { role: "student", username: "t_b" });
      const as = await seedAssignment(c);
      await assign(c, as, a);
      await assign(c, as, b);
      await actAs(c, a);
      expect((await c.query("select student_id from public.student_assignment_facts")).rows.map((r) => r.student_id)).toEqual([a]);
      expect((await c.query("select student_id from public.student_progress")).rows.map((r) => r.student_id)).toEqual([a]);
      await actAs(c, t);
      const ids = (await c.query("select student_id from public.student_progress")).rows.map((r) => r.student_id);
      expect(ids).toEqual(expect.arrayContaining([a, b]));
    }));

  it("anon cannot read the views", () =>
    withTx(async (c) => {
      await actAs(c, null);
      for (const v of ["student_assignment_facts", "student_progress"]) {
        await c.query("savepoint sp");
        let code: string | undefined;
        try {
          await c.query(`select 1 from public.${v}`);
        } catch (e) {
          code = (e as { code?: string }).code;
        }
        expect(code, v).toBe("42501");
        await c.query("rollback to savepoint sp");
      }
    }));

  it("touch_last_seen updates at most every 5 minutes", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      await actAs(c, s);
      const get = async () => {
        await c.query("reset role");
        const r = await c.query("select last_seen_at::text as t from public.profiles where id = $1", [s]);
        await actAs(c, s);
        return r.rows[0].t as string | null;
      };
      expect(await get()).toBeNull();
      await c.query("select public.touch_last_seen()");
      const first = await get();
      expect(first).not.toBeNull();
      // Within 5 minutes: unchanged.
      await c.query("reset role");
      await c.query("update public.profiles set last_seen_at = now() - interval '2 minutes' where id = $1", [s]);
      const recent = await get();
      await c.query("select public.touch_last_seen()");
      expect(await get()).toBe(recent);
      // Older than 5 minutes: updated.
      await c.query("reset role");
      await c.query("update public.profiles set last_seen_at = now() - interval '6 minutes' where id = $1", [s]);
      await actAs(c, s);
      await c.query("select public.touch_last_seen()");
      expect(await get()).toBe(first);
    }));

  it("anon cannot execute touch_last_seen or can_upload_now", () =>
    withTx(async (c) => {
      const r = await c.query(
        `select has_function_privilege('anon', 'public.touch_last_seen()', 'execute') as a1,
                has_function_privilege('anon', 'public.can_upload_now(uuid)', 'execute') as a2,
                has_function_privilege('authenticated', 'public.touch_last_seen()', 'execute') as u1,
                has_function_privilege('authenticated', 'public.can_upload_now(uuid)', 'execute') as u2`,
      );
      expect(r.rows[0]).toEqual({ a1: false, a2: false, u1: true, u2: true });
    }));
});
