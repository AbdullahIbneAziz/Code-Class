import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { withCommitted, session, uploadObject, waitUntilBlocked, type Committed } from "./committed";
import { actAs, assign, closePool, seedAssignment, seedObject, seedUser, withTx } from "./helpers";

afterAll(closePool);

type Tx = Parameters<Parameters<typeof withTx>[0]>[0];

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(Date.now() + ms);
const iso = (ms: number) => at(ms).toISOString();

const MSG = {
  revision: "This student uploaded a new version. Please download it again.",
  nomark: "Please enter a mark.",
  feedback: "The comment is too long (2000 characters at most).",
  testopen: "This test is still running. Mark it after it ends.",
  gone: "That item no longer exists.",
  teacher: "Teacher access required.",
  marked: "This has already been marked, so it can't be replaced.",
  maxlock: "The maximum mark is locked because marking has started.",
};
const range = (n: string) => `The mark must be between 0 and ${n}.`;

const SAVE = "select public.save_mark($1,$2,$3,$4)";
const FIN = "select public.finalize_submission($1,$2,$3) as id";
const UNLOCK = "select public.unlock_solution_for_all($1)";

async function refused(c: Tx, sql: string, params: unknown[] = []): Promise<{ code?: string; message?: string } | undefined> {
  await c.query("savepoint sp");
  try {
    await c.query(sql, params);
    await c.query("release savepoint sp");
    return undefined;
  } catch (e) {
    await c.query("rollback to savepoint sp");
    return e as { code?: string; message?: string };
  }
}

async function as(c: Tx, id: string | null) {
  await c.query("reset role");
  await actAs(c, id);
}

async function submission(c: Tx, a: string, s: string): Promise<string> {
  await c.query("reset role");
  const r = await c.query(
    `insert into public.submissions (assignment_id, student_id, original_name, object_path, size_bytes, submitted_at, revision)
     values ($1, $2, 't.py', $3, 10, now() - interval '1 hour', 1)
     returning id`,
    [a, s, `${a}/${s}/${randomUUID()}.py`],
  );
  return r.rows[0].id as string;
}

/** Teacher, student, assignment and a revision-1 submission (seeded as postgres). */
async function setup(
  c: Tx,
  seed: Parameters<typeof seedAssignment>[1] = {},
  o: { excused?: boolean; due_at_override?: string | null } = {},
) {
  await c.query("reset role");
  const t = await seedUser(c, { role: "teacher", username: "t_mk_teacher" });
  const s = await seedUser(c, { role: "student", username: "t_mk_student" });
  const a = await seedAssignment(c, { title: "t_mk_a", ...seed });
  await assign(c, a, s, o);
  const sub = await submission(c, a, s);
  return { t, s, a, sub };
}

async function row(c: Tx, id: string) {
  await c.query("reset role");
  return (await c.query("select * from public.submissions where id = $1", [id])).rows[0];
}

async function save(c: Tx, t: string, id: string, rev: number | null, mark: number | null, fb: string | null = null) {
  await as(c, t);
  return c.query(SAVE, [id, rev, mark, fb]);
}

describe("save_mark", () => {
  it("teacher marks a submission: mark, trimmed feedback and marked_at >= transaction start; revision, submitted_at and object_path unchanged", () =>
    withTx(async (c) => {
      const { t, sub } = await setup(c);
      const before = await row(c, sub);
      await save(c, t, sub, 1, 7.5, "  Nice work  ");
      const r = await row(c, sub);
      expect(Number(r.mark)).toBe(7.5);
      expect(r.feedback).toBe("Nice work");
      const ok = (await c.query("select $1::timestamptz >= now() as ok", [r.marked_at])).rows[0].ok;
      expect(ok).toBe(true);
      expect(r.revision).toBe(before.revision);
      expect(r.submitted_at).toEqual(before.submitted_at);
      expect(r.object_path).toBe(before.object_path);
    }));

  it("empty or whitespace feedback is stored as null", () =>
    withTx(async (c) => {
      const { t, sub } = await setup(c);
      await save(c, t, sub, 1, 5, "   ");
      expect((await row(c, sub)).feedback).toBeNull();
      await save(c, t, sub, 1, 5, "");
      expect((await row(c, sub)).feedback).toBeNull();
      await save(c, t, sub, 1, 5, null);
      expect((await row(c, sub)).feedback).toBeNull();
    }));

  it("mark bounds", () =>
    withTx(async (c) => {
      const { t, sub } = await setup(c, { max_marks: 10 });
      for (const m of [0, 10, 7.5]) {
        await as(c, t);
        expect(await refused(c, SAVE, [sub, 1, m, null]), String(m)).toBeUndefined();
      }
      for (const m of [10.5, -1]) {
        await as(c, t);
        const e = await refused(c, SAVE, [sub, 1, m, null]);
        expect(e?.code).toBe("P0001");
        expect(e?.message).toBe(range("10"));
      }
      await as(c, t);
      expect((await refused(c, SAVE, [sub, 1, null, null]))?.message).toBe(MSG.nomark);
      const x = await setup(c, { max_marks: 7.5 });
      await as(c, x.t);
      expect((await refused(c, SAVE, [x.sub, 1, 8, null]))?.message).toBe(range("7.5"));
    }));

  it("feedback of 2001 characters is refused; 2000 is accepted", () =>
    withTx(async (c) => {
      const { t, sub } = await setup(c);
      await as(c, t);
      expect(await refused(c, SAVE, [sub, 1, 5, "x".repeat(2000)])).toBeUndefined();
      const e = await refused(c, SAVE, [sub, 1, 5, "x".repeat(2001)]);
      expect(e?.message).toBe(MSG.feedback);
    }));

  it("wrong or null expected revision is refused with the new-version copy and changes nothing", () =>
    withTx(async (c) => {
      const { t, sub } = await setup(c);
      for (const rev of [2, 0, null]) {
        await as(c, t);
        const e = await refused(c, SAVE, [sub, rev, 5, "hi"]);
        expect(e?.code).toBe("P0001");
        expect(e?.message).toBe(MSG.revision);
      }
      const r = await row(c, sub);
      expect(r.mark).toBeNull();
      expect(r.feedback).toBeNull();
      expect(r.marked_at).toBeNull();
    }));

  it("re-upload between download and mark is refused", () =>
    withTx(async (c) => {
      const { t, s, a, sub } = await setup(c);
      const p = `${a}/${s}/${randomUUID()}.py`;
      await c.query("reset role");
      await seedObject(c, "submissions", p, 100, s);
      await as(c, s);
      await c.query(FIN, [a, p, "hw.py"]);
      await as(c, t);
      expect((await refused(c, SAVE, [sub, 1, 5, null]))?.message).toBe(MSG.revision);
      expect(await refused(c, SAVE, [sub, 2, 5, null])).toBeUndefined();
      expect(Number((await row(c, sub)).mark)).toBe(5);
    }));

  it("re-marking keeps the revision check and moves marked_at", () =>
    withTx(async (c) => {
      const { t, sub } = await setup(c);
      await save(c, t, sub, 1, 6);
      const first = await row(c, sub);
      await c.query("select pg_sleep(0.05)");
      await save(c, t, sub, 1, 8);
      const second = await row(c, sub);
      expect(Number(second.mark)).toBe(8);
      expect(second.marked_at.getTime()).toBeGreaterThanOrEqual(first.marked_at.getTime());
      await as(c, t);
      expect((await refused(c, SAVE, [sub, 2, 9, null]))?.message).toBe(MSG.revision);
    }));

  it("a marked submission can't be replaced; update_assignment changing max_marks after save_mark -> maxlock", () =>
    withTx(async (c) => {
      const { t, s, a, sub } = await setup(c);
      await save(c, t, sub, 1, 6);
      const p = `${a}/${s}/${randomUUID()}.py`;
      await c.query("reset role");
      await seedObject(c, "submissions", p, 100, s);
      await as(c, s);
      expect((await refused(c, FIN, [a, p, "hw.py"]))?.message).toBe(MSG.marked);
      await as(c, t);
      const e = await refused(c, "select public.update_assignment($1,'t_mk_a',null,20,null,null,null)", [a]);
      expect(e?.message).toBe(MSG.maxlock);
    }));

  it("test: marking before the student's own end time is refused (testopen); after it, or with a past due_at_override for that student, it is accepted", () =>
    withTx(async (c) => {
      const open = await setup(c, { kind: "test", opens_at: iso(-HOUR), due_at: iso(HOUR) });
      await as(c, open.t);
      expect((await refused(c, SAVE, [open.sub, 1, 3, null]))?.message).toBe(MSG.testopen);

      const done = await setup(c, {
        kind: "test",
        visible_from: iso(-3 * HOUR),
        opens_at: iso(-2 * HOUR),
        due_at: iso(-HOUR),
      });
      await as(c, done.t);
      expect(await refused(c, SAVE, [done.sub, 1, 3, null])).toBeUndefined();

      const ovr = await setup(
        c,
        { kind: "test", opens_at: iso(-HOUR), due_at: iso(HOUR) },
        { due_at_override: iso(-60_000) },
      );
      await as(c, ovr.t);
      expect(await refused(c, SAVE, [ovr.sub, 1, 3, null])).toBeUndefined();
    }));

  it("excused student's submission can be marked and is ignored in hw_avg_pct", () =>
    withTx(async (c) => {
      const ex = await setup(c, { max_marks: 10 }, { excused: true });
      await c.query("reset role");
      const other = await seedAssignment(c, { title: "t_mk_b", max_marks: 10 });
      await assign(c, other, ex.s);
      const sub2 = await submission(c, other, ex.s);
      await save(c, ex.t, ex.sub, 1, 2);
      await save(c, ex.t, sub2, 1, 8);
      await as(c, ex.t);
      const p = (await c.query("select hw_avg_pct from public.student_progress where student_id = $1", [ex.s])).rows[0];
      expect(Number(p.hw_avg_pct)).toBe(80);
      expect(Number((await row(c, ex.sub)).mark)).toBe(2);
    }));

  it("save_mark feeds student_progress", () =>
    withTx(async (c) => {
      const hw = await setup(c, { max_marks: 10 });
      await c.query("reset role");
      const tst = await seedAssignment(c, {
        kind: "test",
        title: "t_mk_test",
        max_marks: 5,
        visible_from: iso(-3 * HOUR),
        opens_at: iso(-2 * HOUR),
        due_at: iso(-HOUR),
      });
      await assign(c, tst, hw.s);
      const tsub = await submission(c, tst, hw.s);
      await save(c, hw.t, hw.sub, 1, 8);
      await save(c, hw.t, tsub, 1, 3);
      await as(c, hw.t);
      const p = (await c.query("select hw_avg_pct, test_avg_pct from public.student_progress where student_id = $1", [hw.s])).rows[0];
      expect(Number(p.hw_avg_pct)).toBe(80);
      expect(Number(p.test_avg_pct)).toBe(60);
      expect(p.hw_avg_pct).toBe("80.00");
      expect(p.test_avg_pct).toBe("60.00");
    }));

  it("student, deactivated teacher -> 42501; anon cannot execute save_mark or unlock_solution_for_all; unknown submission -> gone", () =>
    withTx(async (c) => {
      const { t, s, a, sub } = await setup(c);
      await c.query("reset role");
      const off = await seedUser(c, { role: "teacher", username: "t_mk_off", isActive: false });
      for (const who of [s, off]) {
        await as(c, who);
        const e = await refused(c, SAVE, [sub, 1, 5, null]);
        expect(e?.code).toBe("42501");
        expect(e?.message).toBe(MSG.teacher);
        const u = await refused(c, UNLOCK, [a]);
        expect(u?.code).toBe("42501");
        expect(u?.message).toBe(MSG.teacher);
      }
      await as(c, null);
      expect((await refused(c, SAVE, [sub, 1, 5, null]))?.code).toBe("42501");
      expect((await refused(c, UNLOCK, [a]))?.code).toBe("42501");
      await as(c, t);
      const g = await refused(c, SAVE, [randomUUID(), 1, 5, null]);
      expect(g?.code).toBe("P0001");
      expect(g?.message).toBe(MSG.gone);
      expect((await row(c, sub)).mark).toBeNull();
    }));
});

describe("unlock_solution_for_all", () => {
  it("sets the flag, a second call is a no-op; unknown id -> gone; student -> 42501", () =>
    withTx(async (c) => {
      const { t, s, a } = await setup(c);
      await as(c, t);
      await c.query(UNLOCK, [a]);
      await c.query(UNLOCK, [a]);
      await c.query("reset role");
      expect((await c.query("select solution_unlocked_for_all as v from public.assignments where id = $1", [a])).rows[0].v).toBe(true);
      await as(c, t);
      expect((await refused(c, UNLOCK, [randomUUID()]))?.message).toBe(MSG.gone);
      await as(c, s);
      expect((await refused(c, UNLOCK, [a]))?.code).toBe("42501");
    }));

  it("after unlock, a student who didn't submit reads the solution only once their own deadline has passed", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_mk_teacher" });
      const s = await seedUser(c, { role: "student", username: "t_mk_student" });
      const a = await seedAssignment(c, { title: "t_mk_a" });
      await assign(c, a, s, { due_at_override: iso(DAY) });
      await c.query(
        `insert into public.assignment_files (assignment_id, purpose, original_name, object_path, size_bytes)
         values ($1, 'solution', 's.py', $2, 1)`,
        [a, `${a}/${randomUUID()}.py`],
      );
      await as(c, t);
      await c.query(UNLOCK, [a]);
      const can = async () => {
        await as(c, s);
        return (await c.query("select public.can_read_solution($1) as v", [a])).rows[0].v as boolean;
      };
      expect(await can()).toBe(false);
      await c.query("reset role");
      await c.query(
        "update public.assignment_students set due_at_override = now() - interval '1 hour' where assignment_id = $1 and student_id = $2",
        [a, s],
      );
      expect(await can()).toBe(true);
    }));
});

describe("student_items", () => {
  it("mark and feedback are visible only on the student's own rows; teacher sees student_is_active", () =>
    withTx(async (c) => {
      const x = await setup(c);
      await c.query("reset role");
      const s2 = await seedUser(c, { role: "student", username: "t_mk_student2", isActive: false });
      await assign(c, x.a, s2);
      const sub2 = await submission(c, x.a, s2);
      await save(c, x.t, x.sub, 1, 9, "mine");
      await save(c, x.t, sub2, 1, 4, "theirs");
      await as(c, x.s);
      const mine = (await c.query("select * from public.student_items")).rows;
      expect(mine).toHaveLength(1);
      expect(mine[0].student_id).toBe(x.s);
      expect(mine[0].submission_id).toBe(x.sub);
      expect(Number(mine[0].mark)).toBe(9);
      expect(mine[0].feedback).toBe("mine");
      expect(mine[0].marked_at).not.toBeNull();
      expect(Number(mine[0].score_pct)).toBeCloseTo(0.9);
      expect(mine[0].solution_unlocked_for_all).toBe(false);
      await as(c, x.t);
      const all = (await c.query("select student_id, student_is_active, mark from public.student_items where assignment_id = $1", [x.a])).rows;
      expect(all).toHaveLength(2);
      expect(all.find((r) => r.student_id === x.s).student_is_active).toBe(true);
      expect(all.find((r) => r.student_id === s2).student_is_active).toBe(false);
    }));
});

// ---------------------------------------------------------------- committed, two sessions

type Fix = { student: string; teacher: string; a: string; sub: string; paths: string[] };

async function fixture(track: Committed, c: pg.PoolClient, fix: Fix, seed: Parameters<typeof seedAssignment>[1], nObjects = 1) {
  fix.teacher = await seedUser(c, { role: "teacher", username: "t_mk_c_teacher" });
  track.userIds.push(fix.teacher);
  fix.student = await seedUser(c, { role: "student", username: "t_mk_c_student" });
  track.userIds.push(fix.student);
  fix.a = await seedAssignment(c, { title: "t_mk_committed", ...seed });
  track.assignmentIds.push(fix.a);
  await assign(c, fix.a, fix.student);
  const seeded = `${fix.a}/${fix.student}/${randomUUID()}.py`;
  // Tracked so cleanup also removes the replaced_files row finalize_submission queues for it.
  track.objects.push({ bucket: "submissions", name: seeded });
  fix.sub = (
    await c.query(
      `insert into public.submissions (assignment_id, student_id, original_name, object_path, size_bytes, submitted_at, revision)
       values ($1, $2, 't.py', $3, 10, now() - interval '1 hour', 1) returning id`,
      [fix.a, fix.student, seeded],
    )
  ).rows[0].id;
  for (let i = 0; i < nObjects; i++) {
    const p = `${fix.a}/${fix.student}/${randomUUID()}.py`;
    fix.paths.push(p);
    await uploadObject(track, "submissions", p);
    await c.query("update storage.objects set owner_id = $1 where bucket_id = 'submissions' and name = $2", [fix.student, p]);
  }
}

const newFix = (): Fix => ({ student: "", teacher: "", a: "", sub: "", paths: [] });
const pidOf = async (cl: pg.PoolClient) => (await cl.query("select pg_backend_pid() as p")).rows[0].p as number;
const settle = (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: Error) => e,
  );

async function both(fn: (A: pg.PoolClient, B: pg.PoolClient) => Promise<void>) {
  const A = await session();
  const B = await session();
  try {
    await fn(A, B);
  } finally {
    await A.query("rollback").catch(() => {});
    await B.query("rollback").catch(() => {});
    A.release();
    B.release();
  }
}

describe("marking races (committed, two sessions)", () => {
  it("upload wins the race: save_mark waits for finalize, then refuses the old revision", async () => {
    const fix = newFix();
    await withCommitted(
      (c, track) => fixture(track, c, fix, {}, 1),
      () =>
        both(async (A, B) => {
          await A.query("begin");
          await actAs(A, fix.student);
          await A.query(FIN, [fix.a, fix.paths[0], "hw.py"]);
          await B.query("begin");
          await actAs(B, fix.teacher);
          const pidB = await pidOf(B);
          const pending = settle(B.query(SAVE, [fix.sub, 1, 5, null]));
          await waitUntilBlocked(pidB);
          await A.query("commit");
          const e = await pending;
          expect(e?.message).toBe(MSG.revision);
          await B.query("rollback");
          const r = (await A.query("select revision, mark from public.submissions where id = $1", [fix.sub])).rows[0];
          expect(r.revision).toBe(2);
          expect(r.mark).toBeNull();
        }),
    );
  }, 30000);

  it('marking wins the race: finalize waits, then gets "already marked"', async () => {
    const fix = newFix();
    await withCommitted(
      (c, track) => fixture(track, c, fix, {}, 1),
      () =>
        both(async (A, B) => {
          await B.query("begin");
          await actAs(B, fix.teacher);
          await B.query(SAVE, [fix.sub, 1, 5, null]);
          await A.query("begin");
          await actAs(A, fix.student);
          const pidA = await pidOf(A);
          const pending = settle(A.query(FIN, [fix.a, fix.paths[0], "hw.py"]));
          await waitUntilBlocked(pidA);
          await B.query("commit");
          const e = await pending;
          expect(e?.message).toBe(MSG.marked);
          await A.query("rollback");
          const r = (await B.query("select revision, mark from public.submissions where id = $1", [fix.sub])).rows[0];
          expect(r.revision).toBe(1);
          expect(Number(r.mark)).toBe(5);
        }),
    );
  }, 30000);

  it("save_mark waits for update_assignment lowering max_marks, then refuses 8 out of 5", async () => {
    const fix = newFix();
    await withCommitted(
      (c, track) => fixture(track, c, fix, { max_marks: 10 }, 0),
      () =>
        both(async (A, B) => {
          await A.query("begin");
          await actAs(A, fix.teacher);
          await A.query("select public.update_assignment($1,'t_mk_committed',null,5,null,null,null)", [fix.a]);
          await B.query("begin");
          await actAs(B, fix.teacher);
          const pidB = await pidOf(B);
          const pending = settle(B.query(SAVE, [fix.sub, 1, 8, null]));
          await waitUntilBlocked(pidB);
          await A.query("commit");
          const e = await pending;
          expect(e?.message).toBe(range("5"));
          await B.query("rollback");
        }),
    );
  }, 30000);

  it("update_assignment waits for save_mark, then refuses the max change (maxlock)", async () => {
    const fix = newFix();
    await withCommitted(
      (c, track) => fixture(track, c, fix, { max_marks: 10 }, 0),
      () =>
        both(async (A, B) => {
          await B.query("begin");
          await actAs(B, fix.teacher);
          await B.query(SAVE, [fix.sub, 1, 8, null]);
          await A.query("begin");
          await actAs(A, fix.teacher);
          const pidA = await pidOf(A);
          const pending = settle(A.query("select public.update_assignment($1,'t_mk_committed',null,5,null,null,null)", [fix.a]));
          await waitUntilBlocked(pidA);
          await B.query("commit");
          const e = await pending;
          expect(e?.message).toBe(MSG.maxlock);
          await A.query("rollback");
          const r = (await B.query("select max_marks from public.assignments where id = $1", [fix.a])).rows[0];
          expect(Number(r.max_marks)).toBe(10);
        }),
    );
  }, 30000);

  it("save_mark held across a test's end time is accepted and marked_at is after the end", async () => {
    const fix = newFix();
    await withCommitted(
      (c, track) => fixture(track, c, fix, { kind: "test", opens_at: iso(-HOUR), due_at: iso(DAY) }, 0),
      () =>
        both(async (A, B) => {
          const due = (await A.query("select clock_timestamp() + interval '2 seconds' as d")).rows[0].d as Date;
          await A.query("update public.assignments set due_at = $2 where id = $1", [fix.a, due]);
          await A.query("begin");
          await A.query("select 1 from public.assignment_students where assignment_id = $1 for update", [fix.a]);
          await B.query("begin");
          await actAs(B, fix.teacher);
          const pre = (await B.query("select clock_timestamp() < $1::timestamptz as c", [due])).rows[0].c;
          expect(pre, "B must start before the end time").toBe(true);
          const pidB = await pidOf(B);
          const pending = settle(B.query(SAVE, [fix.sub, 1, 3, null]));
          await waitUntilBlocked(pidB);
          await A.query("select pg_sleep(3)");
          await A.query("commit");
          const e = await pending;
          expect(e).toBeUndefined();
          await B.query("commit");
          const r = (await A.query("select mark, marked_at from public.submissions where id = $1", [fix.sub])).rows[0];
          expect(Number(r.mark)).toBe(3);
          expect(r.marked_at.getTime()).toBeGreaterThanOrEqual(due.getTime());
        }),
    );
  }, 30000);
});
