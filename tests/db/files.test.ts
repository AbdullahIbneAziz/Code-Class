import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { actAs, closePool, seedAssignment, seedObject, seedUser, withTx } from "./helpers";

afterAll(closePool);

type Tx = Parameters<Parameters<typeof withTx>[0]>[0];

async function err(p: Promise<unknown>): Promise<{ code?: string; message?: string } | undefined> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; message?: string };
  }
  return undefined;
}

const GONE = "That item no longer exists.";
const UPLOAD = "That upload wasn't found. Please try again.";
const ATTACHED = "That file is already attached.";

/** Seeds a teacher plus a lecture as postgres, then acts as the teacher. */
async function withLecture(c: Tx) {
  const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
  const l = (await c.query("insert into public.lectures (title) values ('t_lec') returning id")).rows[0].id as string;
  return { t, l };
}

describe("clean_file_name", () => {
  it("cleans names", () =>
    withTx(async (c) => {
      const f = async (sql: string) => (await c.query(`select public.clean_file_name(${sql}) as n`)).rows[0].n as string;
      expect(await f(`'../../My HW (final).IPYNB'`)).toBe("My HW (final).IPYNB");
      expect(await f(`E'hw\\n1.ipynb'`)).toBe("hw1.ipynb");
      expect(await f(`'a:b*c?.py'`)).toBe("abc.py");
      const long = await f(`repeat('a',200) || '.ipynb'`);
      expect(long).toBe("a".repeat(114) + ".ipynb");
      expect(long.length).toBe(120);
      expect(await f(`'///'`)).toBe("file");
    }));
});

describe("lectures", () => {
  it("teacher creates, updates and deletes a lecture; files move to replaced_files with bucket lectures", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      await actAs(c, t);
      const id = (await c.query("select public.create_lecture('  Intro  ', '   ') as id")).rows[0].id as string;
      let row = (await c.query("select title, description from public.lectures where id = $1", [id])).rows[0];
      expect(row).toEqual({ title: "Intro", description: null });
      await c.query("select public.update_lecture($1, 'Intro 2', ' desc ')", [id]);
      row = (await c.query("select title, description from public.lectures where id = $1", [id])).rows[0];
      expect(row).toEqual({ title: "Intro 2", description: "desc" });

      const path = `${id}/${randomUUID()}.py`;
      await c.query("reset role");
      await seedObject(c, "lectures", path, 10);
      await actAs(c, t);
      await c.query("select public.attach_file('lecture', $1, $2, 'a.py')", [id, path]);
      await c.query("select public.delete_lecture($1)", [id]);
      expect((await c.query("select 1 from public.lectures where id = $1", [id])).rowCount).toBe(0);
      expect((await c.query("select 1 from public.lecture_files where lecture_id = $1", [id])).rowCount).toBe(0);
      const q = await c.query("select bucket, object_path from public.replaced_files where object_path = $1", [path]);
      expect(q.rows).toEqual([{ bucket: "lectures", object_path: path }]);
      await c.query("savepoint sp");
      expect((await err(c.query("select public.delete_lecture($1)", [id])))?.message).toBe(GONE);
      await c.query("rollback to savepoint sp");
      await c.query("savepoint sp2");
      expect((await err(c.query("select public.update_lecture($1, 'x', null)", [id])))?.message).toBe(GONE);
    }));

  it("create_lecture refuses an empty or 201-character title", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      await actAs(c, t);
      for (const [title, msg] of [
        ["   ", "Please enter a title."],
        ["a".repeat(201), "The title is too long (200 characters at most)."],
      ] as const) {
        await c.query("savepoint sp");
        const e = await err(c.query("select public.create_lecture($1, null)", [title]));
        await c.query("rollback to savepoint sp");
        expect(e?.code).toBe("P0001");
        expect(e?.message).toBe(msg);
      }
      expect(await err(c.query("select public.create_lecture($1, null)", ["a".repeat(200)]))).toBeUndefined();
    }));

  it("student and deactivated teacher get 42501 from every new function", () =>
    withTx(async (c) => {
      const s = await seedUser(c, { role: "student", username: "t_s" });
      const dt = await seedUser(c, { role: "teacher", username: "t_dt", isActive: false });
      const id = randomUUID();
      const calls = [
        "select public.create_lecture('x', null)",
        `select public.update_lecture('${id}', 'x', null)`,
        `select public.delete_lecture('${id}')`,
        `select public.attach_file('lecture', '${id}', 'p', 'n')`,
        `select public.replace_file('lecture', '${id}', 'p', 'n')`,
      ];
      for (const who of [s, dt]) {
        await actAs(c, who);
        for (const q of calls) {
          await c.query("savepoint sp");
          const e = await err(c.query(q));
          await c.query("rollback to savepoint sp");
          expect(e?.code, q).toBe("42501");
          expect(e?.message).toBe("Teacher access required.");
        }
      }
    }));
});

describe("attach_file", () => {
  it("records a lecture file with size from storage and a cleaned name", () =>
    withTx(async (c) => {
      const { t, l } = await withLecture(c);
      const path = `${l}/${randomUUID()}.ipynb`;
      await seedObject(c, "lectures", path, 1234, t);
      await actAs(c, t);
      const fid = (await c.query("select public.attach_file('lecture', $1, $2, '../My: file.ipynb') as id", [l, path])).rows[0].id;
      const row = (await c.query("select * from public.lecture_files where id = $1", [fid])).rows[0];
      expect(row.size_bytes).toBe("1234");
      expect(row.original_name).toBe("My file.ipynb");
      expect(row.object_path).toBe(path);
      expect(row.lecture_id).toBe(l);
    }));

  it("refuses a missing object, another parent's folder and a nested path", () =>
    withTx(async (c) => {
      const { t, l } = await withLecture(c);
      const missing = `${l}/${randomUUID()}.py`;
      const foreign = `${randomUUID()}/${randomUUID()}.py`;
      const nested = `${l}/sub/${randomUUID()}.py`;
      const wrongBucket = `${l}/${randomUUID()}.py`;
      await seedObject(c, "lectures", foreign, 5);
      await seedObject(c, "lectures", nested, 5);
      await seedObject(c, "questions", wrongBucket, 5);
      await actAs(c, t);
      for (const p of [missing, foreign, nested, wrongBucket]) {
        await c.query("savepoint sp");
        const e = await err(c.query("select public.attach_file('lecture', $1, $2, 'a.py')", [l, p]));
        await c.query("rollback to savepoint sp");
        expect(e?.code, p).toBe("P0001");
        expect(e?.message, p).toBe(UPLOAD);
      }
    }));

  it("refuses an object already attached", () =>
    withTx(async (c) => {
      const { t, l } = await withLecture(c);
      const path = `${l}/${randomUUID()}.py`;
      await seedObject(c, "lectures", path, 5);
      await actAs(c, t);
      await c.query("select public.attach_file('lecture', $1, $2, 'a.py')", [l, path]);
      const e = await err(c.query("select public.attach_file('lecture', $1, $2, 'a.py')", [l, path]));
      expect(e?.code).toBe("P0001");
      expect(e?.message).toBe(ATTACHED);
    }));

  it("question/solution writes assignment_files with that purpose; an unknown parent is gone", () =>
    withTx(async (c) => {
      const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
      const aid = await seedAssignment(c);
      const paths = {
        question: `${aid}/${randomUUID()}.pdf`,
        solution: `${aid}/${randomUUID()}.pdf`,
      };
      await seedObject(c, "questions", paths.question, 77);
      await seedObject(c, "solutions", paths.solution, 78);
      await actAs(c, t);
      for (const target of ["question", "solution"] as const) {
        const fid = (await c.query("select public.attach_file($1, $2, $3, 'q.pdf') as id", [target, aid, paths[target]])).rows[0].id;
        const row = (await c.query("select purpose, size_bytes, assignment_id from public.assignment_files where id = $1", [fid])).rows[0];
        expect(row).toEqual({ purpose: target, size_bytes: target === "question" ? "77" : "78", assignment_id: aid });
      }
      const ghost = randomUUID();
      const e = await err(c.query("select public.attach_file('question', $1, $2, 'q.pdf')", [ghost, `${ghost}/${randomUUID()}.pdf`]));
      expect(e?.code).toBe("P0001");
      expect(e?.message).toBe(GONE);
    }));
});

describe("replace_file", () => {
  async function setup(c: Tx) {
    const t = await seedUser(c, { role: "teacher", username: "t_teacher" });
    const aid = await seedAssignment(c);
    const old = `${aid}/${randomUUID()}.pdf`;
    const next = `${aid}/${randomUUID()}.pdf`;
    await seedObject(c, "questions", old, 10);
    await seedObject(c, "questions", next, 99);
    await actAs(c, t);
    const fid = (await c.query("select public.attach_file('question', $1, $2, 'old.pdf') as id", [aid, old])).rows[0].id as string;
    await c.query("reset role");
    return { t, aid, old, next, fid };
  }

  it("swaps the path and queues the old one (bucket questions), even after a submission", () =>
    withTx(async (c) => {
      const { t, aid, old, next, fid } = await setup(c);
      const s = await seedUser(c, { role: "student", username: "t_s" });
      await c.query(
        `insert into public.submissions (assignment_id, student_id, original_name, object_path, size_bytes, submitted_at)
         values ($1, $2, 't.py', $3, 10, now())`,
        [aid, s, `${aid}/${s}/${randomUUID()}.py`],
      );
      await actAs(c, t);
      await c.query("select public.replace_file('question', $1, $2, 'new.pdf')", [fid, next]);
      const row = (await c.query("select object_path, original_name, size_bytes from public.assignment_files where id = $1", [fid])).rows[0];
      expect(row).toEqual({ object_path: next, original_name: "new.pdf", size_bytes: "99" });
      const q = await c.query("select bucket, object_path from public.replaced_files");
      expect(q.rows).toEqual([{ bucket: "questions", object_path: old }]);
    }));

  it("refuses a purpose mismatch", () =>
    withTx(async (c) => {
      const { t, fid, next } = await setup(c);
      await actAs(c, t);
      const e = await err(c.query("select public.replace_file('solution', $1, $2, 'x.pdf')", [fid, next]));
      expect(e?.code).toBe("P0001");
      expect(e?.message).toBe(GONE);
    }));
});

describe("function privileges", () => {
  it("anon cannot execute any new function; nobody can execute clean_file_name", () =>
    withTx(async (c) => {
      const sigs = [
        "public.create_lecture(text, text)",
        "public.update_lecture(uuid, text, text)",
        "public.delete_lecture(uuid)",
        "public.attach_file(text, uuid, text, text)",
        "public.replace_file(text, uuid, text, text)",
        "public.clean_file_name(text)",
      ];
      for (const s of sigs) {
        const r = await c.query(
          `select has_function_privilege('anon', '${s}', 'execute') as anon,
                  has_function_privilege('authenticated', '${s}', 'execute') as auth`,
        );
        expect(r.rows[0].anon, s).toBe(false);
        expect(r.rows[0].auth, s).toBe(!s.includes("clean_file_name"));
      }
    }));
});
