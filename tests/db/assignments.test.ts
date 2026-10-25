import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { withCommitted, session, uploadObject } from "./committed";
import { actAs, assign, closePool, seedAssignment, seedUser, withTx } from "./helpers";

afterAll(closePool);

type Tx = Parameters<Parameters<typeof withTx>[0]>[0];

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(Date.now() + ms);

const MSG = {
  titleEmpty: "Please enter a title.",
  titleLong: "The title is too long (200 characters at most).",
  max: "The maximum mark must be more than 0.",
  order: "The deadline must be after the 'show from' time.",
  past: "The deadline must be in the future.",
  none: "Choose at least one student.",
  inactive: "Only active students can be given work.",
  shown: "The 'show from' time is locked because students can already see this.",
  earlier: "You can't move the deadline earlier after someone has submitted. Use a per-student exception instead.",
  pastnew: "The new deadline can't be in the past.",
  maxlock: "The maximum mark is locked because marking has started.",
  running: "Only the end time can be extended while the test is running.",
  ended: "This test has finished, so its times are locked.",
  delete: "This homework can't be deleted because someone has submitted.",
  gone: "That item no longer exists.",
};

/** Returns the error (code + message) a statement raises, rolling back to a savepoint so the tx survives. */
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

/** Switch identity from any current role. */
async function as(c: Tx, id: string | null) {
  await c.query("reset role");
  await actAs(c, id);
}

type CreateArgs = {
  kind?: string;
  title?: string;
  instructions?: string | null;
  max?: number | null;
  visible?: Date | null;
  opens?: Date | null;
  due?: Date | null;
  ids?: string[] | null;
};
const CREATE_SQL = "select public.create_assignment($1,$2,$3,$4,$5,$6,$7,$8::uuid[]) as id";
function createParams(a: CreateArgs) {
  return [
    a.kind ?? "homework",
    a.title ?? "t_hw",
    a.instructions ?? null,
    a.max === undefined ? 10 : a.max,
    a.visible ?? null,
    a.opens ?? null,
    a.due === undefined ? at(7 * DAY) : a.due,
    a.ids ?? null,
  ];
}
async function create(c: Tx, a: CreateArgs): Promise<string> {
  return (await c.query(CREATE_SQL, createParams(a))).rows[0].id as string;
}

/** Calls update_assignment passing the current values for everything not overridden. */
type Upd = { title?: string; instructions?: string | null; max?: string | number; visible?: Date; opens?: Date; due?: Date };
const UPD_SQL = "select public.update_assignment($1,$2,$3,$4,$5,$6,$7)";
async function updParams(c: Tx, id: string, o: Upd) {
  const cur = (await c.query("select * from public.assignments where id = $1", [id])).rows[0];
  return [
    id,
    o.title ?? cur.title,
    o.instructions === undefined ? cur.instructions : o.instructions,
    o.max ?? cur.max_marks,
    o.visible ?? cur.visible_from,
    o.opens ?? cur.opens_at,
    o.due ?? cur.due_at,
  ];
}
const upd = async (c: Tx, id: string, o: Upd) => c.query(UPD_SQL, await updParams(c, id, o));
const updRefused = async (c: Tx, id: string, o: Upd) => refused(c, UPD_SQL, await updParams(c, id, o));

async function submit(c: Tx, a: string, s: string, o: { at?: Date; mark?: number | null } = {}) {
  await c.query("reset role");
  await c.query(
    `insert into public.submissions (assignment_id, student_id, original_name, object_path, size_bytes, submitted_at, mark)
     values ($1,$2,'hw.ipynb',$3,10,$4,$5)`,
    [a, s, `${a}/${s}/${randomUUID()}.ipynb`, o.at ?? new Date(), o.mark ?? null],
  );
}

async function people(c: Tx) {
  const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
  const s1 = await seedUser(c, { role: "student", username: "t_s1" });
  const s2 = await seedUser(c, { role: "student", username: "t_s2" });
  return { t, s1, s2 };
}

describe("create_assignment", () => {
  it("makes a homework with opens_at = visible_from and one row per ticked student", () =>
    withTx(async (c) => {
      const { t, s1, s2 } = await people(c);
      await actAs(c, t);
      const id = await create(c, { visible: at(DAY), opens: at(3 * DAY), due: at(5 * DAY), ids: [s1, s2, s1], instructions: "do it" });
      const a = (await c.query("select * from public.assignments where id = $1", [id])).rows[0];
      expect(a.kind).toBe("homework");
      expect(a.opens_at.getTime()).toBe(a.visible_from.getTime());
      expect(a.instructions).toBe("do it");
      const rows = (await c.query("select * from public.assignment_students where assignment_id = $1", [id])).rows;
      expect(rows.map((r) => r.student_id).sort()).toEqual([s1, s2].sort());
      for (const r of rows) {
        expect(r.opens_at_override).toBeNull();
        expect(r.due_at_override).toBeNull();
        expect(r.excused).toBe(false);
      }
    }));

  it("null visible_from publishes now", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      await actAs(c, t);
      const before = Date.now();
      const id = await create(c, { ids: [s1] });
      const a = (await c.query("select visible_from, opens_at from public.assignments where id = $1", [id])).rows[0];
      expect(Math.abs(a.visible_from.getTime() - before)).toBeLessThan(10_000);
      expect(a.opens_at.getTime()).toBe(a.visible_from.getTime());
    }));

  it("makes a test with its own opens_at", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      await actAs(c, t);
      const id = await create(c, { kind: "test", visible: at(HOUR), opens: at(2 * HOUR), due: at(3 * HOUR), ids: [s1] });
      const a = (await c.query("select visible_from, opens_at, due_at from public.assignments where id = $1", [id])).rows[0];
      expect(a.opens_at.getTime()).toBeGreaterThan(a.visible_from.getTime());
      expect(a.due_at.getTime()).toBeGreaterThan(a.opens_at.getTime());
    }));

  it("refusals", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      const teacher2 = await seedUser(c, { role: "teacher", username: "t_teacher2" });
      const inactive = await seedUser(c, { role: "student", username: "t_off", isActive: false });
      await actAs(c, t);
      const msg = async (a: CreateArgs) => (await refused(c, CREATE_SQL, createParams({ ids: [s1], ...a })))?.message;
      expect(await msg({ title: "   " })).toBe(MSG.titleEmpty);
      expect(await msg({ title: "x".repeat(201) })).toBe(MSG.titleLong);
      expect(await msg({ title: "x".repeat(200) })).toBeUndefined();
      expect(await msg({ max: 0 })).toBe(MSG.max);
      expect(await msg({ max: null })).toBe(MSG.max);
      expect(await msg({ visible: at(2 * DAY), due: at(DAY) })).toBe(MSG.order);
      expect(await msg({ kind: "test", visible: at(3 * HOUR), opens: at(HOUR), due: at(5 * HOUR) })).toBe(MSG.order);
      expect(await msg({ kind: "test", visible: at(HOUR), opens: at(4 * HOUR), due: at(2 * HOUR) })).toBe(MSG.order);
      expect(await msg({ visible: at(-2 * DAY), due: at(-DAY) })).toBe(MSG.past);
      expect(await msg({ ids: [] })).toBe(MSG.none);
      expect(await msg({ ids: null })).toBe(MSG.none);
      expect(await msg({ ids: [inactive] })).toBe(MSG.inactive);
      expect(await msg({ ids: [s1, teacher2] })).toBe(MSG.inactive);
      expect(await msg({ ids: [randomUUID()] })).toBe(MSG.inactive);
      const e = await refused(c, CREATE_SQL, createParams({ title: "", ids: [s1] }));
      expect(e?.code).toBe("P0001");
    }));
});

describe("students who join later (4.7)", () => {
  it("get no row for older homework, and set_assignment_students can add them by hand", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      await actAs(c, t);
      const hw = await create(c, { ids: [s1] });
      await c.query("reset role");
      const late = await seedUser(c, { role: "student", username: "t_late" });
      expect((await c.query("select 1 from public.assignment_students where student_id = $1", [late])).rows).toHaveLength(0);
      await as(c, t);
      await c.query("select public.set_assignment_students($1, $2::uuid[])", [hw, [s1, late]]);
      expect((await c.query("select 1 from public.assignment_students where student_id = $1", [late])).rows).toHaveLength(1);
    }));
});

describe("permissions", () => {
  it("student and anon cannot call any of the four functions (42501)", () =>
    withTx(async (c) => {
      const { s1 } = await people(c);
      const a = await seedAssignment(c);
      const calls: [string, unknown[]][] = [
        [CREATE_SQL, createParams({ ids: [s1] })],
        [UPD_SQL, [a, "x", null, 10, at(-DAY), at(-DAY), at(DAY)]],
        ["select public.delete_assignment($1)", [a]],
        ["select public.set_assignment_students($1, $2::uuid[])", [a, [s1]]],
      ];
      for (const who of [s1, null]) {
        await as(c, who);
        for (const [sql, params] of calls) {
          expect((await refused(c, sql, params))?.code, sql).toBe("42501");
        }
      }
    }));
});

describe("update_assignment: homework (4.8)", () => {
  it("title and instructions change after a submission", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      const a = await seedAssignment(c);
      await assign(c, a, s1);
      await submit(c, a, s1);
      await as(c, t);
      await upd(c, a, { title: "  t_new  ", instructions: "new text" });
      const r = (await c.query("select title, instructions from public.assignments where id = $1", [a])).rows[0];
      expect(r).toEqual({ title: "t_new", instructions: "new text" });
      expect((await updRefused(c, a, { title: "" }))?.message).toBe(MSG.titleEmpty);
    }));

  it("show-from changes before visible, refused once visible", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      await as(c, t);
      const hidden = await create(c, { visible: at(HOUR), due: at(5 * DAY), ids: [s1] });
      const nv = at(2 * HOUR);
      await upd(c, hidden, { visible: nv });
      const r = (await c.query("select visible_from, opens_at from public.assignments where id = $1", [hidden])).rows[0];
      expect(r.visible_from.getTime()).toBe(nv.getTime());
      expect(r.opens_at.getTime()).toBe(nv.getTime());
      await c.query("reset role");
      const shown = await seedAssignment(c);
      await as(c, t);
      expect((await updRefused(c, shown, { visible: at(-DAY) }))?.message).toBe(MSG.shown);
      expect(await updRefused(c, shown, { title: "t_same_times" })).toBeUndefined();
    }));

  it("deadline later after a late submission turns it on time", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      const a = await seedAssignment(c, { visible_from: at(-3 * DAY).toISOString(), opens_at: at(-3 * DAY).toISOString(), due_at: at(-HOUR).toISOString() });
      await assign(c, a, s1);
      await submit(c, a, s1, { at: at(-30 * 60e3) });
      const late = async () =>
        (await c.query("select is_late from public.student_assignment_facts where assignment_id = $1", [a])).rows[0].is_late;
      await as(c, t);
      expect(await late()).toBe(true);
      await upd(c, a, { due: at(DAY) });
      expect(await late()).toBe(false);
    }));

  it("deadline earlier with no submission is ok but not before now", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      const a = await seedAssignment(c);
      await assign(c, a, s1);
      await as(c, t);
      const d = at(2 * DAY);
      await upd(c, a, { due: d });
      expect((await c.query("select due_at from public.assignments where id = $1", [a])).rows[0].due_at.getTime()).toBe(d.getTime());
      expect((await updRefused(c, a, { due: at(-HOUR) }))?.message).toBe(MSG.pastnew);
    }));

  it("deadline earlier after a submission is refused", () =>
    withTx(async (c) => {
      const { t, s1, s2 } = await people(c);
      const a = await seedAssignment(c);
      await assign(c, a, s1);
      await assign(c, a, s2);
      await submit(c, a, s1);
      await as(c, t);
      expect((await updRefused(c, a, { due: at(2 * DAY) }))?.message).toBe(MSG.earlier);
      expect(await updRefused(c, a, { due: at(9 * DAY) })).toBeUndefined();
    }));

  it("max_marks changes before marking, refused once a mark exists", () =>
    withTx(async (c) => {
      const { t, s1, s2 } = await people(c);
      const a = await seedAssignment(c);
      await assign(c, a, s1);
      await assign(c, a, s2);
      await submit(c, a, s1);
      await as(c, t);
      await upd(c, a, { max: 20 });
      expect((await c.query("select max_marks from public.assignments where id = $1", [a])).rows[0].max_marks).toBe("20");
      expect((await updRefused(c, a, { max: 0 }))?.message).toBe(MSG.max);
      await submit(c, a, s2, { mark: 5 });
      await as(c, t);
      expect((await updRefused(c, a, { max: 30 }))?.message).toBe(MSG.maxlock);
      expect(await updRefused(c, a, { max: 20, title: "t_x" })).toBeUndefined();
    }));

  it("update_assignment on a missing id says it is gone", () =>
    withTx(async (c) => {
      const { t } = await people(c);
      await as(c, t);
      const e = await refused(c, UPD_SQL, [randomUUID(), "x", null, 10, at(0), at(0), at(DAY)]);
      expect(e?.message).toBe(MSG.gone);
    }));
});

describe("update_assignment: test kind (4.8)", () => {
  const seedTest = (c: Tx, v: number, o: number, d: number) =>
    seedAssignment(c, { kind: "test", visible_from: at(v).toISOString(), opens_at: at(o).toISOString(), due_at: at(d).toISOString() });

  it("before start any time can change", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      const a = await seedTest(c, HOUR, 2 * HOUR, 3 * HOUR);
      await assign(c, a, s1);
      await as(c, t);
      await upd(c, a, { visible: at(2 * HOUR), opens: at(4 * HOUR), due: at(6 * HOUR) });
      const r = (await c.query("select visible_from, opens_at, due_at from public.assignments where id = $1", [a])).rows[0];
      expect(r.opens_at.getTime()).toBeGreaterThan(r.visible_from.getTime());
      expect((await updRefused(c, a, { visible: at(5 * HOUR) }))?.message).toBe(MSG.order);
      expect((await updRefused(c, a, { due: at(3 * HOUR) }))?.message).toBe(MSG.order);
    }));

  it("announced but not started: show-from is locked, start and end can still move", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      const a = await seedTest(c, -HOUR, HOUR, 3 * HOUR);
      await assign(c, a, s1);
      await as(c, t);
      expect((await updRefused(c, a, { visible: at(-2 * HOUR) }))?.message).toBe(MSG.shown);
      expect(await updRefused(c, a, { opens: at(2 * HOUR), due: at(4 * HOUR) })).toBeUndefined();
    }));

  it("while running only a later end is accepted", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      const a = await seedTest(c, -2 * DAY, -HOUR, HOUR);
      await assign(c, a, s1);
      await as(c, t);
      expect((await updRefused(c, a, { opens: at(-2 * HOUR) }))?.message).toBe(MSG.running);
      expect((await updRefused(c, a, { visible: at(-3 * DAY) }))?.message).toBe(MSG.running);
      expect((await updRefused(c, a, { due: at(30 * 60e3) }))?.message).toBe(MSG.running);
      const later = at(3 * HOUR);
      await upd(c, a, { due: later, title: "t_extended" });
      const r = (await c.query("select due_at, title from public.assignments where id = $1", [a])).rows[0];
      expect(r.due_at.getTime()).toBe(later.getTime());
      expect(r.title).toBe("t_extended");
    }));

  it("after the end everything is locked", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      const a = await seedTest(c, -3 * DAY, -2 * DAY, -DAY);
      await assign(c, a, s1);
      await as(c, t);
      expect((await updRefused(c, a, { due: at(DAY) }))?.message).toBe(MSG.ended);
      expect((await updRefused(c, a, { opens: at(-3 * DAY) }))?.message).toBe(MSG.ended);
      expect(await updRefused(c, a, { title: "t_after", instructions: "still editable" })).toBeUndefined();
    }));
});

describe("delete_assignment", () => {
  it("deletes and queues question and solution files; refused after a submission", () =>
    withTx(async (c) => {
      const { t, s1 } = await people(c);
      const a = await seedAssignment(c);
      const b = await seedAssignment(c);
      await assign(c, a, s1);
      await assign(c, b, s1);
      const qp = `${a}/${randomUUID()}.pdf`;
      const sp = `${a}/${randomUUID()}.pdf`;
      await c.query(
        `insert into public.assignment_files (assignment_id, purpose, original_name, object_path, size_bytes) values
         ($1,'question','q.pdf',$2,1), ($1,'solution','s.pdf',$3,1)`,
        [a, qp, sp],
      );
      await submit(c, b, s1);
      await as(c, t);
      await c.query("select public.delete_assignment($1)", [a]);
      expect((await c.query("select 1 from public.assignments where id = $1", [a])).rows).toHaveLength(0);
      const q = await c.query("select bucket, object_path from public.replaced_files where object_path = any($1::text[]) order by bucket", [[qp, sp]]);
      expect(q.rows).toEqual([
        { bucket: "questions", object_path: qp },
        { bucket: "solutions", object_path: sp },
      ]);
      expect((await refused(c, "select public.delete_assignment($1)", [b]))?.message).toBe(MSG.delete);
      expect((await refused(c, "select public.delete_assignment($1)", [a]))?.message).toBe(MSG.gone);
      expect((await c.query("select 1 from public.assignments where id = $1", [b])).rows).toHaveLength(1);
    }));
});

describe("set_assignment_students", () => {
  it("removes an unsubmitted student, refuses one who submitted (with their name), refuses an empty list", () =>
    withTx(async (c) => {
      const { t, s1, s2 } = await people(c);
      const s3 = await seedUser(c, { role: "student", username: "t_s3" });
      const off = await seedUser(c, { role: "student", username: "t_off", isActive: false });
      const a = await seedAssignment(c);
      await assign(c, a, s1, { excused: true });
      await assign(c, a, s2);
      await submit(c, a, s2);
      await as(c, t);
      const SET = "select public.set_assignment_students($1, $2::uuid[])";
      const name2 = (await c.query("select display_name from public.profiles where id = $1", [s2])).rows[0].display_name as string;

      expect((await refused(c, SET, [a, []]))?.message).toBe(MSG.none);
      expect((await refused(c, SET, [a, null]))?.message).toBe(MSG.none);
      expect((await refused(c, SET, [a, [s1]]))?.message).toBe(`${name2} has submitted, so they can't be removed. Excuse them instead.`);
      expect((await refused(c, SET, [a, [s1, s2, off]]))?.message).toBe(MSG.inactive);
      expect((await refused(c, SET, [a, [s1, s2, t]]))?.message).toBe(MSG.inactive);
      expect((await refused(c, SET, [randomUUID(), [s1]]))?.message).toBe(MSG.gone);

      await c.query(SET, [a, [s2, s3]]); // removes s1 (no submission), adds s3
      const rows = (await c.query("select student_id from public.assignment_students where assignment_id = $1", [a])).rows;
      expect(rows.map((r) => r.student_id).sort()).toEqual([s2, s3].sort());
      await c.query(SET, [a, [s2, s3, s1]]); // re-adding gives a fresh row with no overrides
      const back = (await c.query("select excused from public.assignment_students where assignment_id = $1 and student_id = $2", [a, s1])).rows[0];
      expect(back.excused).toBe(false);
    }));
});

describe("student_items", () => {
  it("a student sees own visible rows with title and status; the teacher sees every row with student_name", () =>
    withTx(async (c) => {
      const { t, s1, s2 } = await people(c);
      const open = await seedAssignment(c, { title: "t_open" });
      const done = await seedAssignment(c, { title: "t_done" });
      const hidden = await seedAssignment(c, { title: "t_hidden", visible_from: at(DAY).toISOString(), opens_at: at(DAY).toISOString(), due_at: at(8 * DAY).toISOString() });
      const other = await seedAssignment(c, { title: "t_other" });
      await assign(c, open, s1);
      await assign(c, done, s1);
      await assign(c, hidden, s1);
      await assign(c, other, s2);
      await submit(c, done, s1, { mark: 4 });
      const ids = [open, done, hidden, other];
      const q = "select * from public.student_items where assignment_id = any($1::uuid[]) order by title";

      await as(c, s1);
      const mine = (await c.query(q, [ids])).rows;
      expect(mine.map((r) => r.title)).toEqual(["t_done", "t_open"]);
      expect(mine.find((r) => r.title === "t_open")).toMatchObject({ action_state: "pending", has_submission: false, kind: "homework", student_id: s1 });
      expect(mine.find((r) => r.title === "t_done")).toMatchObject({ action_state: "done", has_submission: true, is_marked: true, is_late: false, submission_name: "hw.ipynb", revision: 1 });
      expect(mine[0].student_name).toMatch(/^Test t_s1/);

      await as(c, t);
      const all = (await c.query(q, [ids])).rows;
      expect(all.map((r) => r.title)).toEqual(["t_done", "t_hidden", "t_open", "t_other"]);
      expect(all.find((r) => r.title === "t_other").student_name).toMatch(/^Test t_s2/);
      expect(all.find((r) => r.title === "t_hidden").action_state).toBe("hidden");

      await as(c, null);
      expect((await refused(c, "select 1 from public.student_items"))?.code).toBe("42501");
    }));
});

describe("lock then clock (committed, two sessions)", () => {
  it("update_assignment waiting on a lock past visible_from is refused", async () => {
    let teacher = "";
    let a = "";
    await withCommitted(
      async (c, track) => {
        teacher = await seedUser(c, { role: "teacher", username: "t_cm_teacher" });
        track.userIds.push(teacher);
        const s = await seedUser(c, { role: "student", username: "t_cm_student" });
        track.userIds.push(s);
        // Placeholder times; visible_from is set below, after both sessions are connected.
        a = await seedAssignment(c, { title: "t_cm_hw", due_at: at(7 * DAY).toISOString() });
        track.assignmentIds.push(a);
        await assign(c, a, s);
      },
      async () => {
        const A = await session();
        const B = await session();
        try {
          await B.query("select 1"); // warm both connections before the clock starts
          await A.query("select 1");
          const v = (await A.query("select clock_timestamp() + interval '4 seconds' as v")).rows[0].v as Date;
          await A.query("update public.assignments set visible_from = $2, opens_at = $2 where id = $1", [a, v]);
          const cur = (await A.query("select * from public.assignments where id = $1", [a])).rows[0];
          const nv = new Date(v.getTime() + HOUR);
          await A.query("begin");
          await A.query("select 1 from public.assignment_students where assignment_id = $1 for update", [a]);
          await B.query("begin");
          await actAs(B, teacher);
          // B's transaction clock and the real clock are both still before visible_from when B calls.
          const pre = (await B.query("select clock_timestamp() < $1::timestamptz as c, now() < $1::timestamptz as n", [v])).rows[0];
          expect(pre, "B must start before visible_from").toEqual({ c: true, n: true });
          const pending = B.query(UPD_SQL, [a, cur.title, null, cur.max_marks, nv, nv, cur.due_at]).then(
            () => undefined,
            (e: Error) => e,
          );
          await new Promise((r) => setTimeout(r, 300));
          await A.query("select pg_sleep(5)");
          await A.query("commit");
          const e = await pending;
          expect(e?.message).toBe(MSG.shown);
          await B.query("rollback");
          const row = (await A.query("select visible_from from public.assignments where id = $1", [a])).rows[0];
          expect(row.visible_from.getTime()).toBe(cur.visible_from.getTime());
        } finally {
          await A.query("rollback").catch(() => {});
          await B.query("rollback").catch(() => {});
          A.release();
          B.release();
        }
      },
    );
  });

  it("update_assignment holds no lock that blocks a FOR KEY SHARE on the assignment (finalize FK check)", async () => {
    let teacher = "";
    let a = "";
    await withCommitted(
      async (c, track) => {
        teacher = await seedUser(c, { role: "teacher", username: "t_cm_teacher" });
        track.userIds.push(teacher);
        const s = await seedUser(c, { role: "student", username: "t_cm_student" });
        track.userIds.push(s);
        a = await seedAssignment(c, { title: "t_cm_keyshare" });
        track.assignmentIds.push(a);
        await assign(c, a, s);
      },
      async () => {
        const A = await session(); // plays update_assignment's caller, holding the assignment lock
        const B = await session(); // plays finalize's FK check
        try {
          const cur = (await A.query("select * from public.assignments where id = $1", [a])).rows[0];
          await A.query("begin");
          await actAs(A, teacher);
          // Lock the assignment exactly as update_assignment does, then run it; the tx stays open.
          await A.query(UPD_SQL, [a, "t_cm_keyshare2", null, cur.max_marks, cur.visible_from, cur.opens_at, cur.due_at]);
          await B.query("begin");
          await B.query("set local lock_timeout = '2s'");
          await B.query("select 1 from public.assignments where id = $1 for key share", [a]); // must not block
          await B.query("rollback");
          // Sanity: FOR UPDATE would conflict, so the test does distinguish the lock modes.
          await B.query("begin");
          await B.query("set local lock_timeout = '500ms'");
          await expect(B.query("select 1 from public.assignments where id = $1 for update", [a])).rejects.toThrow(/lock timeout/);
          await B.query("rollback");
          await A.query("rollback");
        } finally {
          await A.query("rollback").catch(() => {});
          await B.query("rollback").catch(() => {});
          A.release();
          B.release();
        }
      },
    );
  });

  it("replace_file locks the parent assignment before the file row", async () => {
    let teacher = "";
    let a = "";
    let fileId = "";
    let oldPath = "";
    let newPath = "";
    await withCommitted(
      async (c, track) => {
        teacher = await seedUser(c, { role: "teacher", username: "t_cm_teacher" });
        track.userIds.push(teacher);
        a = await seedAssignment(c, { title: "t_cm_parent" });
        track.assignmentIds.push(a);
        oldPath = `${a}/${randomUUID()}.pdf`;
        newPath = `${a}/${randomUUID()}.pdf`;
        track.objects.push({ bucket: "questions", name: oldPath });
        fileId = (
          await c.query(
            `insert into public.assignment_files (assignment_id, purpose, original_name, object_path, size_bytes)
             values ($1,'question','q.pdf',$2,1) returning id`,
            [a, oldPath],
          )
        ).rows[0].id as string;
        await uploadObject(track, "questions", newPath);
      },
      async () => {
        const A = await session();
        const B = await session();
        try {
          await A.query("begin");
          await A.query("select 1 from public.assignments where id = $1 for update", [a]);
          await B.query("begin");
          await actAs(B, teacher);
          let done = false;
          const pending = B.query("select public.replace_file('question', $1, $2, 'new.pdf')", [fileId, newPath]).then(() => {
            done = true;
          });
          pending.catch(() => {});
          await new Promise((r) => setTimeout(r, 1500));
          expect(done, "replace_file must wait for the parent assignment lock").toBe(false);
          await A.query("commit");
          await pending;
          await B.query("commit");
          const q = await A.query("select bucket from public.replaced_files where object_path = $1", [oldPath]);
          expect(q.rows).toEqual([{ bucket: "questions" }]);
        } finally {
          await A.query("rollback").catch(() => {});
          await B.query("rollback").catch(() => {});
          A.release();
          B.release();
        }
      },
    );
  });
});
