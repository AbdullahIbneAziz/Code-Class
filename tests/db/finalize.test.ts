import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { withCommitted, session, uploadObject, type Committed } from "./committed";
import { actAs, assign, closePool, seedAssignment, seedObject, seedUser, withTx } from "./helpers";

afterAll(closePool);

type Tx = Parameters<Parameters<typeof withTx>[0]>[0];

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(Date.now() + ms);

const MSG = {
  acct: "Your account is not active.",
  notyours: "This isn't assigned to you.",
  notopen: "This isn't open yet.",
  closed: "The test has closed. Uploads that finish after the end time are not accepted.",
  marked: "This has already been marked, so it can't be replaced.",
  ontime: "Your on-time submission can't be replaced after the deadline.",
  late: "This was uploaded after the deadline, so it can't be replaced.",
  upload: "That upload wasn't found. Please try again.",
  gone: "That item no longer exists.",
  delete: "This homework can't be deleted because someone has submitted.",
};

const FIN = "select public.finalize_submission($1,$2,$3) as id";

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

const path = (a: string, s: string, ext = "ipynb") => `${a}/${s}/${randomUUID()}.${ext}`;

/** Seeds an object owned by the student and returns its path. */
async function obj(c: Tx, a: string, s: string, o: { ext?: string; size?: number } = {}) {
  await c.query("reset role");
  const p = path(a, s, o.ext ?? "ipynb");
  await seedObject(c, "submissions", p, o.size ?? 1234, s);
  return p;
}

async function fin(c: Tx, a: string, p: string, name = "hw.ipynb") {
  return (await c.query(FIN, [a, p, name])).rows[0].id as string;
}

/** A teacher-free setup: one active student assigned to one assignment. */
async function setup(c: Tx, seed: Parameters<typeof seedAssignment>[1] = {}) {
  const s = await seedUser(c, { role: "student", username: "t_fin_s" });
  const a = await seedAssignment(c, { title: "t_fin_a", ...seed });
  await assign(c, a, s);
  return { s, a };
}

/** Moves the deadline to clock + interval (as postgres) so remote round trips don't eat the margin. */
async function dueIn(c: Tx, a: string, interval: string) {
  await c.query("reset role");
  await c.query(`update public.assignments set due_at = clock_timestamp() + interval '${interval}' where id = $1`, [a]);
}

async function subRow(c: Tx, a: string, s: string) {
  await c.query("reset role");
  return (await c.query("select * from public.submissions where assignment_id = $1 and student_id = $2", [a, s])).rows[0];
}

async function isLate(c: Tx, a: string, s: string) {
  await c.query("reset role");
  return (await c.query("select is_late from public.student_assignment_facts where assignment_id=$1 and student_id=$2", [a, s]))
    .rows[0].is_late as boolean;
}

describe("finalize_submission: stores the submission", () => {
  it("first submission: revision 1, size from storage, cleaned name, submitted_at >= transaction start", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const p = await obj(c, a, s, { size: 4321 });
      await as(c, s);
      const id = await fin(c, a, p, "../../My HW (final).IPYNB");
      const row = await subRow(c, a, s);
      expect(row.id).toBe(id);
      expect(row.revision).toBe(1);
      expect(row.object_path).toBe(p);
      expect(Number(row.size_bytes)).toBe(4321);
      expect(row.original_name).toBe("My HW (final).IPYNB");
      expect(row.mark).toBeNull();
      const ok = (await c.query("select $1::timestamptz >= now() as ok", [row.submitted_at])).rows[0].ok;
      expect(ok).toBe(true);
    }));

  it("one second before the deadline is on time", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const p = await obj(c, a, s);
      await dueIn(c, a, "1 second");
      await as(c, s);
      await fin(c, a, p);
      expect(await isLate(c, a, s)).toBe(false);
    }));

  it("after the deadline is late", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const p = await obj(c, a, s);
      await dueIn(c, a, "1 second");
      await c.query("select pg_sleep(1.2)");
      await as(c, s);
      await fin(c, a, p);
      expect(await isLate(c, a, s)).toBe(true);
    }));

  it("a missed homework becomes late once submitted", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c, { due_at: at(-HOUR).toISOString() });
      const p = await obj(c, a, s);
      await as(c, s);
      await fin(c, a, p);
      expect(await isLate(c, a, s)).toBe(true);
    }));

  it("re-upload before the deadline gives revision 2 and queues the old path", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const p1 = await obj(c, a, s);
      const p2 = await obj(c, a, s, { size: 99 });
      await as(c, s);
      const id1 = await fin(c, a, p1);
      const id2 = await fin(c, a, p2);
      expect(id2).toBe(id1);
      const row = await subRow(c, a, s);
      expect(row.revision).toBe(2);
      expect(row.object_path).toBe(p2);
      expect(Number(row.size_bytes)).toBe(99);
      const q = (await c.query("select bucket, object_path from public.replaced_files where object_path in ($1,$2)", [p1, p2])).rows;
      expect(q).toEqual([{ bucket: "submissions", object_path: p1 }]);
    }));

  it("same path twice returns the same id and keeps the revision", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const p = await obj(c, a, s);
      await as(c, s);
      const id1 = await fin(c, a, p);
      const id2 = await fin(c, a, p);
      expect(id2).toBe(id1);
      expect((await subRow(c, a, s)).revision).toBe(1);
    }));

  it("late submission can't be replaced after the deadline (new copy)", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c, { due_at: at(-HOUR).toISOString() });
      const p1 = await obj(c, a, s);
      const p2 = await obj(c, a, s);
      await as(c, s);
      await fin(c, a, p1);
      const e = await refused(c, FIN, [a, p2, "hw.ipynb"]);
      expect(e?.code).toBe("P0001");
      expect(e?.message).toBe(MSG.late);
      const row = await subRow(c, a, s);
      expect(row.revision).toBe(1);
      expect(row.object_path).toBe(p1);
    }));

  it("on-time submission after the deadline still gets the on-time copy", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c, { due_at: at(DAY).toISOString() });
      const p1 = await obj(c, a, s);
      const p2 = await obj(c, a, s);
      await as(c, s);
      await fin(c, a, p1);
      await c.query("reset role");
      await c.query("update public.assignments set due_at = now() - interval '1 hour' where id = $1", [a]);
      await as(c, s);
      const e = await refused(c, FIN, [a, p2, "hw.ipynb"]);
      expect(e?.message).toBe(MSG.ontime);
      expect((await subRow(c, a, s)).revision).toBe(1);
    }));

  it("before the deadline a submission can still be replaced", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c, { due_at: at(DAY).toISOString() });
      const p1 = await obj(c, a, s);
      const p2 = await obj(c, a, s);
      await as(c, s);
      await fin(c, a, p1);
      await fin(c, a, p2);
      const row = await subRow(c, a, s);
      expect(row.revision).toBe(2);
      expect(row.object_path).toBe(p2);
    }));

  it("a first upload after the deadline is still accepted and late", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c, { due_at: at(-HOUR).toISOString() });
      const p = await obj(c, a, s);
      await as(c, s);
      await fin(c, a, p);
      expect((await subRow(c, a, s)).revision).toBe(1);
      expect(await isLate(c, a, s)).toBe(true);
    }));

  it("a due_at_override in the future reopens replacing of a late submission", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c, { due_at: at(-HOUR).toISOString() });
      const p1 = await obj(c, a, s);
      const p2 = await obj(c, a, s);
      await as(c, s);
      await fin(c, a, p1);
      await c.query("reset role");
      await c.query("update public.assignment_students set due_at_override = $3 where assignment_id=$1 and student_id=$2", [
        a,
        s,
        at(DAY).toISOString(),
      ]);
      await as(c, s);
      await fin(c, a, p2);
      const row = await subRow(c, a, s);
      expect(row.revision).toBe(2);
      expect(row.object_path).toBe(p2);
    }));

  it("marked still wins over the late lock", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c, { due_at: at(-HOUR).toISOString() });
      const p1 = await obj(c, a, s);
      const p2 = await obj(c, a, s);
      await as(c, s);
      await fin(c, a, p1);
      await c.query("reset role");
      await c.query("update public.submissions set mark = 5, marked_at = now() where assignment_id=$1 and student_id=$2", [a, s]);
      await as(c, s);
      const e = await refused(c, FIN, [a, p2, "hw.ipynb"]);
      expect(e?.message).toBe(MSG.marked);
    }));

  it("replacing clears nothing it should keep: a per-student deadline override is honoured", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_fin_ovr" });
      const a = await seedAssignment(c, { due_at: at(-HOUR).toISOString() });
      await assign(c, a, s, { due_at_override: at(DAY).toISOString() });
      const p = await obj(c, a, s);
      await as(c, s);
      await fin(c, a, p);
      expect(await isLate(c, a, s)).toBe(false);
    }));
});

describe("finalize_submission: refusals", () => {
  it("refused finalize leaves the previous submission and its revision unchanged (Review Focus 3)", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const p1 = await obj(c, a, s);
      const p2 = await obj(c, a, s);
      await dueIn(c, a, "5 seconds");
      await as(c, s);
      await fin(c, a, p1);
      const before = await subRow(c, a, s);
      expect(before.revision).toBe(1);
      await c.query("reset role");
      // The deadline passes: the on-time submission (made 2 h ago) now sits before a deadline 1 h ago.
      await c.query("update public.assignments set due_at = now() - interval '1 hour' where id = $1", [a]);
      await c.query("update public.submissions set submitted_at = now() - interval '2 hours' where assignment_id = $1", [a]);
      before.submitted_at = (await subRow(c, a, s)).submitted_at;
      await as(c, s);
      const e = await refused(c, FIN, [a, p2, "hw.ipynb"]);
      expect(e?.code).toBe("P0001");
      expect(e?.message).toBe(MSG.ontime);
      const after = await subRow(c, a, s);
      expect(after.object_path).toBe(p1);
      expect(after.revision).toBe(1);
      expect(after.submitted_at.getTime()).toBe(before.submitted_at.getTime());
      expect(after.original_name).toBe(before.original_name);
      const q = (await c.query("select 1 from public.replaced_files where object_path in ($1,$2)", [p1, p2])).rows;
      expect(q).toEqual([]);
    }));

  it("marked submission cannot be replaced", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const p1 = await obj(c, a, s);
      const p2 = await obj(c, a, s);
      await as(c, s);
      await fin(c, a, p1);
      await c.query("reset role");
      await c.query("update public.submissions set mark = 5, marked_at = now() where assignment_id=$1 and student_id=$2", [a, s]);
      await as(c, s);
      const e = await refused(c, FIN, [a, p2, "hw.ipynb"]);
      expect(e?.message).toBe(MSG.marked);
      const row = await subRow(c, a, s);
      expect(row.object_path).toBe(p1);
      expect(row.revision).toBe(1);
      expect(Number(row.mark)).toBe(5);
    }));

  it("excused or unassigned student: notyours", () =>
    withTx(async (c) => {
      const ex = await seedUser(c, { role: "student", username: "t_fin_ex" });
      const un = await seedUser(c, { role: "student", username: "t_fin_un" });
      const a = await seedAssignment(c, {});
      await assign(c, a, ex, { excused: true });
      const pe = await obj(c, a, ex);
      const pu = await obj(c, a, un);
      await as(c, ex);
      expect((await refused(c, FIN, [a, pe, "x.ipynb"]))?.message).toBe(MSG.notyours);
      await as(c, un);
      expect((await refused(c, FIN, [a, pu, "x.ipynb"]))?.message).toBe(MSG.notyours);
      expect((await subRow(c, a, ex)) ?? null).toBeNull();
    }));

  it("deactivated student and teacher: acct", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const t = await seedUser(c, { role: "teacher", username: "t_fin_t" });
      const p = await obj(c, a, s);
      await c.query("update public.profiles set is_active = false where id = $1", [s]);
      await as(c, s);
      expect((await refused(c, FIN, [a, p, "x.ipynb"]))?.message).toBe(MSG.acct);
      await as(c, t);
      expect((await refused(c, FIN, [a, p, "x.ipynb"]))?.message).toBe(MSG.acct);
    }));

  it("anon cannot execute it (42501)", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const p = await obj(c, a, s);
      await as(c, null);
      expect((await refused(c, FIN, [a, p, "x.ipynb"]))?.code).toBe("42501");
    }));

  it("path checks: all refused with 'upload'", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const other = await seedUser(c, { role: "student", username: "t_fin_o" });
      const a2 = await seedAssignment(c, {});
      await assign(c, a2, s);
      const bad: Record<string, string> = {};
      bad.otherFolder = await obj(c, a, other);
      // object lives in the other student's folder but is owned by s
      await seedObject(c, "submissions", `${a}/${other}/${randomUUID()}.py`, 5, s);
      bad.otherFolder2 = (await c.query("select name from storage.objects where owner_id=$1 and name like $2", [s, `${a}/${other}/%`])).rows[0].name;
      bad.otherAssignment = await obj(c, a2, s);
      bad.txt = await obj(c, a, s, { ext: "txt" });
      bad.missing = path(a, s);
      const notMine = path(a, s);
      await seedObject(c, "submissions", notMine, 5, other);
      bad.notOwner = notMine;
      const replaced = await obj(c, a, s);
      await c.query("insert into public.replaced_files (bucket, object_path) values ('submissions', $1)", [replaced]);
      bad.replaced = replaced;
      bad.upperExt = await obj(c, a, s, { ext: "PY" });
      bad.junk = `${a}/${s}/not-a-uuid.py`;
      await as(c, s);
      for (const [k, p] of Object.entries(bad)) {
        const e = await refused(c, FIN, [a, p, "x.ipynb"]);
        expect(e?.message, k).toBe(MSG.upload);
      }
      expect((await subRow(c, a, s)) ?? null).toBeNull();
    }));

  it("an object in the wrong bucket is not found", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const p = path(a, s);
      await seedObject(c, "questions", p, 5, s);
      await as(c, s);
      expect((await refused(c, FIN, [a, p, "x.ipynb"]))?.message).toBe(MSG.upload);
    }));
});

describe("finalize_submission: class tests", () => {
  it("before the start is refused (notopen); at or after the end is refused (closed); inside the window is accepted", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_fin_test" });
      const future = await seedAssignment(c, { kind: "test", opens_at: at(HOUR).toISOString(), due_at: at(2 * HOUR).toISOString() });
      const running = await seedAssignment(c, { kind: "test", opens_at: at(-HOUR).toISOString(), due_at: at(HOUR).toISOString() });
      const ending = await seedAssignment(c, { kind: "test", opens_at: at(-HOUR).toISOString(), due_at: at(HOUR).toISOString() });
      for (const x of [future, running, ending]) await assign(c, x, s);
      const pf = await obj(c, future, s);
      const pr = await obj(c, running, s);
      const pe = await obj(c, ending, s);
      await dueIn(c, ending, "1 second");
      await c.query("select pg_sleep(1.2)");
      await as(c, s);
      expect((await refused(c, FIN, [future, pf, "x.ipynb"]))?.message).toBe(MSG.notopen);
      expect((await refused(c, FIN, [ending, pe, "x.ipynb"]))?.message).toBe(MSG.closed);
      await fin(c, running, pr);
      expect((await subRow(c, running, s)).revision).toBe(1);
      expect((await subRow(c, ending, s)) ?? null).toBeNull();
    }));
});

describe("clean_file_name hardening and extension forcing", () => {
  it("strips C1 controls and bidi/format controls, keeps the earlier cases", () =>
    withTx(async (c) => {
      const f = async (name: string) =>
        (await c.query("select public.clean_file_name($1) as n", [name])).rows[0].n as string;
      expect(await f("../../My HW (final).IPYNB")).toBe("My HW (final).IPYNB");
      expect(await f("a\u0085b\u009fc.py")).toBe("abc.py");
      expect(await f("evil‮gnp.py")).toBe("evilgnp.py");
      expect(await f("x‎‏‪‫‬‭⁦⁧⁨⁩y.py")).toBe("xy.py");
      expect(await f("‮⁦")).toBe("file");
    }));

  it("finalize forces the stored name to end with the object path extension", () =>
    withTx(async (c) => {
      const { s, a } = await setup(c);
      const names: Array<[string, string]> = [
        ["homework.exe", "homework.exe.py"],
        ["HOMEWORK.PY", "HOMEWORK.PY"],
        ["notes", "notes.py"],
        ["", "file.py"],
        ["a.py‮exe.", "a.pyexe..py"],
        ["report.ipynb", "report.ipynb.py"],
      ];
      for (const [input, want] of names) {
        const p = await obj(c, a, s, { ext: "py" });
        await as(c, s);
        await fin(c, a, p, input);
        expect((await subRow(c, a, s)).original_name, input).toBe(want);
      }
      // 200-character names stay within 120 characters and keep the forced extension
      const p = await obj(c, a, s, { ext: "py" });
      await as(c, s);
      await fin(c, a, p, "b".repeat(200) + ".exe");
      const n = (await subRow(c, a, s)).original_name as string;
      expect(n.length).toBeLessThanOrEqual(120);
      expect(n.endsWith(".py")).toBe(true);
    }));
});

describe("function privileges", () => {
  it("finalize_submission: authenticated only, search_path empty, security definer", () =>
    withTx(async (c) => {
      const sig = "public.finalize_submission(uuid, text, text)";
      const r = await c.query(
        `select has_function_privilege('anon', '${sig}', 'execute') as anon,
                has_function_privilege('authenticated', '${sig}', 'execute') as auth,
                p.prosecdef, p.proconfig
         from pg_proc p where p.oid = '${sig}'::regprocedure`,
      );
      expect(r.rows[0].anon).toBe(false);
      expect(r.rows[0].auth).toBe(true);
      expect(r.rows[0].prosecdef).toBe(true);
      expect(r.rows[0].proconfig).toContain("search_path=\"\"");
    }));
});

// ---------------------------------------------------------------- committed, two sessions

type Fix = { student: string; teacher: string; a: string; paths: string[] };

/** Seeds a committed student (+ teacher), an assignment, and uploaded submission objects owned by the student. */
async function fixture(
  track: Committed,
  c: pg.PoolClient,
  fix: Fix,
  seed: Parameters<typeof seedAssignment>[1],
  nObjects: number,
) {
  fix.teacher = await seedUser(c, { role: "teacher", username: "t_fin_teacher" });
  track.userIds.push(fix.teacher);
  fix.student = await seedUser(c, { role: "student", username: "t_fin_student" });
  track.userIds.push(fix.student);
  fix.a = await seedAssignment(c, { title: "t_fin_committed", ...seed });
  track.assignmentIds.push(fix.a);
  await assign(c, fix.a, fix.student);
  for (let i = 0; i < nObjects; i++) {
    const p = path(fix.a, fix.student, "py");
    fix.paths.push(p);
    await uploadObject(track, "submissions", p);
    await c.query("update storage.objects set owner_id = $1 where bucket_id = 'submissions' and name = $2", [fix.student, p]);
  }
}

describe("lock then clock (committed, two sessions)", () => {
  it("finalize held across a test's end time is rejected and stores nothing", async () => {
    const fix: Fix = { student: "", teacher: "", a: "", paths: [] };
    await withCommitted(
      (c, track) =>
        fixture(track, c, fix, { kind: "test", opens_at: at(-HOUR).toISOString(), due_at: at(DAY).toISOString() }, 1),
      async () => {
        const A = await session();
        const B = await session();
        try {
          await A.query("select 1");
          await B.query("select 1");
          const due = (await A.query("select clock_timestamp() + interval '2 seconds' as d")).rows[0].d as Date;
          await A.query("update public.assignments set due_at = $2 where id = $1", [fix.a, due]);
          await A.query("begin");
          await A.query("select 1 from public.assignment_students where assignment_id = $1 for update", [fix.a]);
          await B.query("begin");
          await actAs(B, fix.student);
          const pre = (await B.query("select clock_timestamp() < $1::timestamptz as c", [due])).rows[0].c;
          expect(pre, "B must start before the end time").toBe(true);
          const pending = B.query(FIN, [fix.a, fix.paths[0], "hw.py"]).then(
            () => undefined,
            (e: Error) => e,
          );
          await new Promise((r) => setTimeout(r, 300));
          await A.query("select pg_sleep(3)");
          await A.query("commit");
          const e = await pending;
          expect(e?.message).toBe(MSG.closed);
          await B.query("rollback");
          const n = (await A.query("select count(*)::int as n from public.submissions where assignment_id = $1", [fix.a])).rows[0].n;
          expect(n).toBe(0);
        } finally {
          await A.query("rollback").catch(() => {});
          await B.query("rollback").catch(() => {});
          A.release();
          B.release();
        }
      },
    );
  }, 30000);

  it("finalize held across a homework deadline stores a submitted_at after the deadline", async () => {
    const fix: Fix = { student: "", teacher: "", a: "", paths: [] };
    await withCommitted(
      (c, track) => fixture(track, c, fix, { due_at: at(DAY).toISOString() }, 1),
      async () => {
        const A = await session();
        const B = await session();
        try {
          await A.query("select 1");
          await B.query("select 1");
          const due = (await A.query("select clock_timestamp() + interval '2 seconds' as d")).rows[0].d as Date;
          await A.query("update public.assignments set due_at = $2 where id = $1", [fix.a, due]);
          await A.query("begin");
          await A.query("select 1 from public.assignment_students where assignment_id = $1 for update", [fix.a]);
          await B.query("begin");
          await actAs(B, fix.student);
          const pending = B.query(FIN, [fix.a, fix.paths[0], "hw.py"]);
          pending.catch(() => {});
          await new Promise((r) => setTimeout(r, 300));
          await A.query("select pg_sleep(3)");
          const readClock = (await A.query("select clock_timestamp() as c")).rows[0].c as Date;
          await A.query("commit");
          await pending;
          await B.query("commit");
          const row = (await A.query("select submitted_at from public.submissions where assignment_id = $1", [fix.a])).rows[0];
          expect(row.submitted_at.getTime()).toBeGreaterThanOrEqual(due.getTime());
          expect(row.submitted_at.getTime()).toBeGreaterThanOrEqual(readClock.getTime());
        } finally {
          await A.query("rollback").catch(() => {});
          await B.query("rollback").catch(() => {});
          A.release();
          B.release();
        }
      },
    );
  }, 30000);

  it("two finalize calls racing are applied one after the other", async () => {
    const fix: Fix = { student: "", teacher: "", a: "", paths: [] };
    await withCommitted(
      (c, track) => fixture(track, c, fix, {}, 2),
      async () => {
        const A = await session();
        const B = await session();
        try {
          const run = async (cl: typeof A, p: string) => {
            await cl.query("begin");
            await actAs(cl, fix.student);
            await cl.query(FIN, [fix.a, p, "hw.py"]);
            await cl.query("commit");
          };
          await Promise.all([run(A, fix.paths[0]), run(B, fix.paths[1])]);
          const row = (await A.query("select revision, object_path from public.submissions where assignment_id = $1", [fix.a])).rows[0];
          expect(row.revision).toBe(2);
          const other = fix.paths.find((p) => p !== row.object_path)!;
          const q = (await A.query("select bucket from public.replaced_files where object_path = $1", [other])).rows;
          expect(q).toEqual([{ bucket: "submissions" }]);
        } finally {
          await A.query("rollback").catch(() => {});
          await B.query("rollback").catch(() => {});
          A.release();
          B.release();
        }
      },
    );
  }, 30000);

  const UPD = "select public.update_assignment($1,$2,$3,$4,$5,$6,$7)";

  it("finalize and update_assignment extending a running test do not deadlock, in either order", async () => {
    const fix: Fix = { student: "", teacher: "", a: "", paths: [] };
    await withCommitted(
      (c, track) =>
        fixture(track, c, fix, { kind: "test", opens_at: at(-HOUR).toISOString(), due_at: at(HOUR).toISOString() }, 2),
      async () => {
        const A = await session(); // teacher extending the end
        const B = await session(); // student finalizing
        const waits = async (p: Promise<unknown>) => {
          let done = false;
          p.then(
            () => (done = true),
            () => (done = true),
          );
          await new Promise((r) => setTimeout(r, 1200));
          return !done;
        };
        try {
          const cur = (await A.query("select * from public.assignments where id = $1", [fix.a])).rows[0];
          const ext = (d: Date) => new Date(d.getTime() + HOUR);
          // Order 1: the teacher is mid-update (holds assignment + student rows); finalize waits, then sees the new end.
          await A.query("begin");
          await actAs(A, fix.teacher);
          await A.query(UPD, [fix.a, cur.title, null, cur.max_marks, cur.visible_from, cur.opens_at, ext(cur.due_at)]);
          await B.query("begin");
          await actAs(B, fix.student);
          const p1 = B.query(FIN, [fix.a, fix.paths[0], "hw.py"]);
          expect(await waits(p1), "finalize must wait on the student row").toBe(true);
          await A.query("commit");
          await p1;
          await B.query("commit");
          // Order 2: finalize is mid-flight (holds key share + student row); update_assignment waits, then completes.
          const cur2 = (await A.query("select * from public.assignments where id = $1", [fix.a])).rows[0];
          await B.query("begin");
          await actAs(B, fix.student);
          await B.query(FIN, [fix.a, fix.paths[1], "hw.py"]);
          await A.query("begin");
          await actAs(A, fix.teacher);
          const p2 = A.query(UPD, [fix.a, cur2.title, null, cur2.max_marks, cur2.visible_from, cur2.opens_at, ext(cur2.due_at)]);
          expect(await waits(p2), "update_assignment must wait on the student row").toBe(true);
          await B.query("commit");
          await p2;
          await A.query("commit");
          const row = (await A.query("select revision from public.submissions where assignment_id = $1", [fix.a])).rows[0];
          expect(row.revision).toBe(2);
          const due = (await A.query("select due_at from public.assignments where id = $1", [fix.a])).rows[0].due_at as Date;
          expect(due.getTime()).toBe(cur.due_at.getTime() + 2 * HOUR);
        } finally {
          await A.query("rollback").catch(() => {});
          await B.query("rollback").catch(() => {});
          A.release();
          B.release();
        }
      },
    );
  }, 30000);

  it("finalize waits for a concurrent delete_assignment and then fails cleanly", async () => {
    const fix: Fix = { student: "", teacher: "", a: "", paths: [] };
    await withCommitted(
      (c, track) => fixture(track, c, fix, {}, 1),
      async () => {
        const A = await session(); // teacher deleting
        const B = await session(); // student finalizing
        try {
          await A.query("begin");
          await actAs(A, fix.teacher);
          await A.query("select public.delete_assignment($1)", [fix.a]);
          await B.query("begin");
          await actAs(B, fix.student);
          let done = false;
          const pending = B.query(FIN, [fix.a, fix.paths[0], "hw.py"]).then(
            () => undefined,
            (e: Error) => e,
          );
          pending.then(() => (done = true));
          await new Promise((r) => setTimeout(r, 1200));
          expect(done, "finalize must wait for delete_assignment").toBe(false);
          await A.query("commit");
          const e = await pending;
          expect(e?.message).toBe(MSG.gone);
          await B.query("rollback");
          const n = (await A.query("select count(*)::int as n from public.submissions where student_id = $1", [fix.student])).rows[0].n;
          expect(n).toBe(0);
        } finally {
          await A.query("rollback").catch(() => {});
          await B.query("rollback").catch(() => {});
          A.release();
          B.release();
        }
      },
    );
  }, 30000);

  it("delete_assignment waiting on a mid-flight finalize is then refused, without deadlock", async () => {
    const fix: Fix = { student: "", teacher: "", a: "", paths: [] };
    await withCommitted(
      (c, track) => fixture(track, c, fix, {}, 1),
      async () => {
        const A = await session();
        const B = await session();
        try {
          await B.query("begin");
          await actAs(B, fix.student);
          await B.query(FIN, [fix.a, fix.paths[0], "hw.py"]);
          await A.query("begin");
          await actAs(A, fix.teacher);
          let done = false;
          const pending = A.query("select public.delete_assignment($1)", [fix.a]).then(
            () => undefined,
            (e: Error) => e,
          );
          pending.then(() => (done = true));
          await new Promise((r) => setTimeout(r, 1200));
          expect(done, "delete_assignment must wait for finalize").toBe(false);
          await B.query("commit");
          const e = await pending;
          expect(e?.message).toBe(MSG.delete);
          await A.query("rollback");
        } finally {
          await A.query("rollback").catch(() => {});
          await B.query("rollback").catch(() => {});
          A.release();
          B.release();
        }
      },
    );
  }, 30000);
});
