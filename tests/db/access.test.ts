import { afterAll, describe, expect, it } from "vitest";
import { actAs, assign, closePool, seedAssignment, seedUser, withTx } from "./helpers";

afterAll(closePool);

type Tx = Parameters<Parameters<typeof withTx>[0]>[0];

async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

const TABLES = [
  "profiles",
  "lectures",
  "lecture_files",
  "assignments",
  "assignment_files",
  "assignment_students",
  "submissions",
  "replaced_files",
  "app_meta",
];

async function seedSubmission(c: Tx, a: string, s: string) {
  await c.query(
    `insert into public.submissions (assignment_id, student_id, original_name, object_path, size_bytes, submitted_at)
     values ($1, $2, 't.py', $3, 10, now())`,
    [a, s, `p/${a}/${s}`],
  );
}

describe("grants and RLS", () => {
  it("anon sees no rows in any table", () =>
    withTx(async (c) => {
      for (const t of TABLES) {
        await c.query("savepoint sp");
        await actAs(c, null);
        const code = await pgCode(c.query(`select count(*) from public.${t}`));
        expect(code, t).toBe("42501");
        await c.query("rollback to savepoint sp");
      }
    }));

  it("student sees only own profile", () =>
    withTx(async (c) => {
      await seedUser(c, { role: "teacher", username: "t_teacher" });
      const a = await seedUser(c, { role: "student", username: "t_a" });
      await seedUser(c, { role: "student", username: "t_b" });
      await actAs(c, a);
      const r = await c.query("select id from public.profiles");
      expect(r.rows.map((x) => x.id)).toEqual([a]);
    }));

  it("teacher sees all profiles", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      const a = await seedUser(c, { role: "student", username: "t_a" });
      const b = await seedUser(c, { role: "student", username: "t_b" });
      await actAs(c, t);
      const r = await c.query("select id from public.profiles where id = any($1)", [[t, a, b]]);
      expect(r.rows).toHaveLength(3);
    }));

  it("student sees only own assignment_students rows", () =>
    withTx(async (c) => {
      const a = await seedUser(c, { role: "student", username: "t_a" });
      const b = await seedUser(c, { role: "student", username: "t_b" });
      const as = await seedAssignment(c);
      await assign(c, as, a);
      await assign(c, as, b);
      await actAs(c, a);
      const r = await c.query("select student_id from public.assignment_students");
      expect(r.rows.map((x) => x.student_id)).toEqual([a]);
    }));

  it("deactivated student sees nothing", () =>
    withTx(async (c) => {
      const a = await seedUser(c, { role: "student", username: "t_a", isActive: false });
      const as = await seedAssignment(c);
      await assign(c, as, a);
      await seedSubmission(c, as, a);
      await actAs(c, a);
      for (const t of ["profiles", "assignment_students", "submissions", "lectures"]) {
        const r = await c.query(`select count(*)::int as n from public.${t}`);
        expect(r.rows[0].n, t).toBe(0);
      }
    }));

  it("deactivated teacher sees nothing", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher", isActive: false });
      await seedAssignment(c);
      await actAs(c, t);
      for (const tbl of ["profiles", "assignments", "replaced_files"]) {
        const r = await c.query(`select count(*)::int as n from public.${tbl}`);
        expect(r.rows[0].n, tbl).toBe(0);
      }
    }));

  it("student sees only own submissions; teacher sees all; student cannot read replaced_files", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      const a = await seedUser(c, { role: "student", username: "t_a" });
      const b = await seedUser(c, { role: "student", username: "t_b" });
      const as = await seedAssignment(c);
      await assign(c, as, a);
      await assign(c, as, b);
      await seedSubmission(c, as, a);
      await seedSubmission(c, as, b);
      await c.query("insert into public.replaced_files (object_path) values ('t_x')");
      await actAs(c, a);
      const own = await c.query("select student_id from public.submissions");
      expect(own.rows.map((x) => x.student_id)).toEqual([a]);
      expect((await c.query("select 1 from public.replaced_files")).rows).toHaveLength(0);
      await actAs(c, t);
      expect((await c.query("select 1 from public.submissions")).rows.length).toBeGreaterThanOrEqual(2);
      expect((await c.query("select 1 from public.replaced_files")).rows.length).toBeGreaterThanOrEqual(1);
    }));

  it("students see lectures; assignments are hidden while can_see_assignment is a stub", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      const a = await seedUser(c, { role: "student", username: "t_a" });
      await c.query("insert into public.lectures (title) values ('t_lec')");
      await seedAssignment(c);
      await actAs(c, a);
      expect((await c.query("select 1 from public.lectures where title='t_lec'")).rows).toHaveLength(1);
      expect((await c.query("select 1 from public.assignments")).rows).toHaveLength(0);
      await actAs(c, t);
      expect((await c.query("select 1 from public.assignments")).rows.length).toBeGreaterThanOrEqual(1);
    }));

  it("teacher cannot insert into assignments directly", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      await actAs(c, t);
      const code = await pgCode(
        c.query(
          `insert into public.assignments (kind, title, max_marks, visible_from, opens_at, due_at)
           values ('homework', 't_x', 10, now(), now(), now() + interval '1 day')`,
        ),
      );
      expect(code).toBe("42501");
    }));

  it("teacher cannot update or delete submissions directly", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      const s = await seedUser(c, { role: "student", username: "t_a" });
      const as = await seedAssignment(c);
      await assign(c, as, s);
      await seedSubmission(c, as, s);
      await actAs(c, t);
      await c.query("savepoint sp");
      expect(await pgCode(c.query("update public.submissions set mark = 1"))).toBe("42501");
      await c.query("rollback to savepoint sp");
      expect(await pgCode(c.query("delete from public.submissions"))).toBe("42501");
    }));

  it("student cannot update own profile", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_a" });
      await actAs(c, s);
      const code = await pgCode(c.query("update public.profiles set role = 'teacher' where id = $1", [s]));
      expect(code).toBe("42501");
    }));

  it("anon cannot execute is_teacher", () =>
    withTx(async (c) => {
      await actAs(c, null);
      expect(await pgCode(c.query("select public.is_teacher()"))).toBe("42501");
    }));

  it("trigger function is not executable by anon/authenticated", () =>
    withTx(async (c) => {
      const r = await c.query(
        `select has_function_privilege('anon', 'public.submissions_mark_le_max()', 'execute') as anon,
                has_function_privilege('authenticated', 'public.submissions_mark_le_max()', 'execute') as auth`,
      );
      expect(r.rows[0]).toEqual({ anon: false, auth: false });
    }));

  it("no public function is executable by anon", () =>
    withTx(async (c) => {
      const r = await c.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`,
      );
      expect(r.rows).toEqual([]);
    }));

  it("whole-schema guard: RLS on, no anon access, no authenticated DML, views are security_invoker", () =>
    withTx(async (c) => {
      const noRls = await c.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
      );
      expect(noRls.rows, "tables without RLS").toEqual([]);

      const anon = await c.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
           and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
                or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))`,
      );
      expect(anon.rows, "anon privileges").toEqual([]);

      const dml = await c.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and (has_table_privilege('authenticated', c.oid, 'insert, update, delete, truncate')
                or has_any_column_privilege('authenticated', c.oid, 'insert, update'))`,
      );
      expect(dml.rows, "authenticated DML").toEqual([]);

      const fns = await c.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`,
      );
      expect(fns.rows, "anon-executable functions").toEqual([]);

      const views = await c.query(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'v'
           and not coalesce('security_invoker=true' = any(c.reloptions) or 'security_invoker=on' = any(c.reloptions), false)`,
      );
      expect(views.rows, "views without security_invoker").toEqual([]);
    }));
});
