import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminAssign,
  adminClient,
  adminSeedAssignment,
  anonClient,
  cleanupTestUsers,
  fileOfSize,
  makeTestUser,
  trackLecture,
  trackObject,
  uuid,
  type TestUser,
} from "./helpers";

const MB = 1024 * 1024;
const HOUR = 3_600_000;

let teacher: TestUser;
let s1: TestUser;
let s2: TestUser;
let openHw: string;
let closedTest: string;
let ownPath: string; // s1 stored submission

const subPath = (a: string, s: string, ext = "ipynb") => `${a}/${s}/${uuid()}.${ext}`;

async function put(u: TestUser, bucket: string, path: string, body: Blob, upsert = false) {
  trackObject(bucket, path);
  return u.client.storage.from(bucket).upload(path, body, { upsert });
}

beforeAll(async () => {
  teacher = await makeTestUser("teacher");
  s1 = await makeTestUser("student");
  s2 = await makeTestUser("student");
  openHw = await adminSeedAssignment({ kind: "homework" });
  closedTest = await adminSeedAssignment({
    kind: "test",
    due_at: new Date(Date.now() - HOUR).toISOString(),
  });
  for (const a of [openHw, closedTest]) {
    await adminAssign(a, s1.id);
    await adminAssign(a, s2.id);
  }
}, 60_000);

afterAll(async () => {
  await cleanupTestUsers();
}, 60_000);

describe("storage policies", () => {
  it("student uploads 5 MB .ipynb to own folder of an open homework", async () => {
    ownPath = subPath(openHw, s1.id);
    const { error } = await put(s1, "submissions", ownPath, fileOfSize(5 * MB));
    expect(error).toBeNull();
  });

  it("student upload over 5 MB is refused", async () => {
    const { error } = await put(s1, "submissions", subPath(openHw, s1.id), fileOfSize(5 * MB + 1));
    expect(error).not.toBeNull();
  });

  it("student upload of .exe is refused", async () => {
    const { error } = await put(s1, "submissions", subPath(openHw, s1.id, "exe"), fileOfSize(10));
    expect(error).not.toBeNull();
  });

  it("student upload with malformed path is denied", async () => {
    const { error } = await put(s1, "submissions", `not-a-uuid/${s1.id}/${uuid()}.py`, fileOfSize(10));
    expect(error).not.toBeNull();
  });

  it("student cannot upload into another student folder", async () => {
    const { error } = await put(s1, "submissions", subPath(openHw, s2.id), fileOfSize(10));
    expect(error).not.toBeNull();
  });

  it("student cannot upload to a closed test", async () => {
    const { error } = await put(s1, "submissions", subPath(closedTest, s1.id), fileOfSize(10));
    expect(error).not.toBeNull();
  });

  it("student cannot overwrite an existing object", async () => {
    const { error } = await put(s1, "submissions", ownPath, fileOfSize(20), true);
    expect(error).not.toBeNull();
    const { data } = await adminClient().storage.from("submissions").download(ownPath);
    expect(data?.size).toBe(5 * MB);
  });

  it("student cannot delete own uploaded object", async () => {
    await s1.client.storage.from("submissions").remove([ownPath]);
    const { data } = await adminClient().storage.from("submissions").download(ownPath);
    expect(data).not.toBeNull();
  });

  it("student can sign own submission but not another student one", async () => {
    const own = await s1.client.storage.from("submissions").createSignedUrl(ownPath, 60);
    expect(own.error).toBeNull();
    const other = await s2.client.storage.from("submissions").createSignedUrl(ownPath, 60);
    expect(other.error).not.toBeNull();
  });

  it("teacher can read a student submission", async () => {
    const { error } = await teacher.client.storage.from("submissions").createSignedUrl(ownPath, 60);
    expect(error).toBeNull();
  });

  it("teacher uploads 25 MB .pdf to lectures", { timeout: 120_000 }, async () => {
    const path = `${uuid()}/${uuid()}.pdf`;
    const { error } = await put(teacher, "lectures", path, fileOfSize(25 * MB));
    expect(error).toBeNull();
  });

  it("teacher upload over 25 MB or bad extension is refused", { timeout: 120_000 }, async () => {
    const big = await put(teacher, "questions", `${openHw}/${uuid()}.pdf`, fileOfSize(25 * MB + 1));
    expect(big.error).not.toBeNull();
    const bad = await put(teacher, "lectures", `${uuid()}/${uuid()}.zip`, fileOfSize(10));
    expect(bad.error).not.toBeNull();
  });

  it("students cannot insert into teacher buckets", async () => {
    const { error } = await put(s1, "lectures", `${uuid()}/${uuid()}.pdf`, fileOfSize(10));
    expect(error).not.toBeNull();
  });

  it("question and solution visibility follow the rule functions", async () => {
    const qPath = `${openHw}/${uuid()}.pdf`;
    const sPath = `${openHw}/${uuid()}.pdf`;
    expect((await put(teacher, "questions", qPath, fileOfSize(10))).error).toBeNull();
    expect((await put(teacher, "solutions", sPath, fileOfSize(10))).error).toBeNull();
    const att = await teacher.client.rpc("attach_file", {
      p_target: "question", p_parent_id: openHw, p_object_path: qPath, p_original_name: "t_q.pdf",
    });
    expect(att.error).toBeNull();
    expect((await s1.client.storage.from("questions").createSignedUrl(qPath, 60)).error).toBeNull();
    // deadline not passed => solution closed for students
    expect((await s2.client.storage.from("solutions").createSignedUrl(sPath, 60)).error).not.toBeNull();
    expect((await teacher.client.storage.from("solutions").createSignedUrl(sPath, 60)).error).toBeNull();
  });

  it("students cannot sign never-attached, replaced or deleted-lecture objects", async () => {
    // never attached
    const loose = `${openHw}/${uuid()}.pdf`;
    expect((await put(teacher, "questions", loose, fileOfSize(10))).error).toBeNull();
    expect((await s1.client.storage.from("questions").createSignedUrl(loose, 60)).error).not.toBeNull();

    // attached, then replaced
    const oldQ = `${openHw}/${uuid()}.pdf`;
    const newQ = `${openHw}/${uuid()}.pdf`;
    expect((await put(teacher, "questions", oldQ, fileOfSize(10))).error).toBeNull();
    expect((await put(teacher, "questions", newQ, fileOfSize(10))).error).toBeNull();
    const att = await teacher.client.rpc("attach_file", {
      p_target: "question", p_parent_id: openHw, p_object_path: oldQ, p_original_name: "t_old.pdf",
    });
    expect(att.error).toBeNull();
    expect((await s1.client.storage.from("questions").createSignedUrl(oldQ, 60)).error).toBeNull();
    const rep = await teacher.client.rpc("replace_file", {
      p_target: "question", p_file_id: att.data, p_object_path: newQ, p_original_name: "t_new.pdf",
    });
    expect(rep.error).toBeNull();
    expect((await s1.client.storage.from("questions").createSignedUrl(oldQ, 60)).error).not.toBeNull();
    expect((await s1.client.storage.from("questions").createSignedUrl(newQ, 60)).error).toBeNull();

    // lecture: live, then deleted
    const lec = await teacher.client.rpc("create_lecture", { p_title: "t_live_rows", p_description: "" });
    expect(lec.error).toBeNull();
    trackLecture(lec.data as string);
    const lPath = `${lec.data}/${uuid()}.pdf`;
    expect((await put(teacher, "lectures", lPath, fileOfSize(10))).error).toBeNull();
    const la = await teacher.client.rpc("attach_file", {
      p_target: "lecture", p_parent_id: lec.data, p_object_path: lPath, p_original_name: "t_l.pdf",
    });
    expect(la.error).toBeNull();
    expect((await s1.client.storage.from("lectures").createSignedUrl(lPath, 60)).error).toBeNull();
    const del = await teacher.client.rpc("delete_lecture", { p_lecture_id: lec.data });
    expect(del.error).toBeNull();
    expect((await s1.client.storage.from("lectures").createSignedUrl(lPath, 60)).error).not.toBeNull();
  });

  it("teacher cannot delete a stored object", async () => {
    await teacher.client.storage.from("submissions").remove([ownPath]);
    const { data } = await adminClient().storage.from("submissions").download(ownPath);
    expect(data).not.toBeNull();
  });

  it("anon cannot list or read any bucket", async () => {
    const anon = anonClient();
    for (const b of ["lectures", "questions", "solutions", "submissions"]) {
      const list = await anon.storage.from(b).list();
      expect(list.data ?? []).toHaveLength(0);
      expect((await anon.storage.from(b).createSignedUrl(ownPath, 60)).error).not.toBeNull();
      expect((await anon.storage.from(b).download(ownPath)).error).not.toBeNull();
    }
    const up = await anon.storage.from("submissions").upload(subPath(openHw, s1.id), fileOfSize(5));
    expect(up.error).not.toBeNull();
  });

  it("deactivated student cannot read own submission", async () => {
    const s3 = await makeTestUser("student");
    await adminAssign(openHw, s3.id);
    const p = subPath(openHw, s3.id);
    expect((await put(s3, "submissions", p, fileOfSize(10))).error).toBeNull();
    expect((await s3.client.storage.from("submissions").createSignedUrl(p, 60)).error).toBeNull();
    const { error: dErr } = await adminClient().from("profiles").update({ is_active: false }).eq("id", s3.id);
    expect(dErr).toBeNull();
    expect((await s3.client.storage.from("submissions").createSignedUrl(p, 60)).error).not.toBeNull();
  });

  it("signed URL expires after 60 seconds", { timeout: 90_000 }, async () => {
    const { data, error } = await s1.client.storage.from("submissions").createSignedUrl(ownPath, 60);
    expect(error).toBeNull();
    expect((await fetch(data!.signedUrl)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 65_000));
    expect([400, 403]).toContain((await fetch(data!.signedUrl)).status);
  });
});

describe("solutions live rows", () => {
  it("students can sign the live solution after their deadline but not a replaced or never-attached one", async () => {
    const hw = await adminSeedAssignment({
      kind: "homework",
      visible_from: new Date(Date.now() - 3 * HOUR).toISOString(),
      opens_at: new Date(Date.now() - 2 * HOUR).toISOString(),
      due_at: new Date(Date.now() - HOUR).toISOString(),
    });
    await adminAssign(hw, s1.id);
    await adminAssign(hw, s2.id);
    // s1 has an admin-inserted submission (so the solution opens for them after the deadline)
    const { error: subErr } = await adminClient().from("submissions").insert({
      assignment_id: hw,
      student_id: s1.id,
      original_name: "t_sub.py",
      object_path: `${hw}/${s1.id}/${uuid()}.py`,
      size_bytes: 1,
      submitted_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    });
    expect(subErr).toBeNull();

    const oldS = `${hw}/${uuid()}.pdf`;
    const newS = `${hw}/${uuid()}.pdf`;
    const loose = `${hw}/${uuid()}.pdf`;
    for (const p of [oldS, newS, loose]) expect((await put(teacher, "solutions", p, fileOfSize(10))).error).toBeNull();
    const att = await teacher.client.rpc("attach_file", {
      p_target: "solution", p_parent_id: hw, p_object_path: oldS, p_original_name: "t_old.pdf",
    });
    expect(att.error).toBeNull();
    expect((await s1.client.storage.from("solutions").createSignedUrl(oldS, 60)).error).toBeNull();
    const rep = await teacher.client.rpc("replace_file", {
      p_target: "solution", p_file_id: att.data, p_object_path: newS, p_original_name: "t_new.pdf",
    });
    expect(rep.error).toBeNull();
    expect((await s1.client.storage.from("solutions").createSignedUrl(oldS, 60)).error).not.toBeNull();
    expect((await s1.client.storage.from("solutions").createSignedUrl(newS, 60)).error).toBeNull();
    expect((await s1.client.storage.from("solutions").createSignedUrl(loose, 60)).error).not.toBeNull();
    expect((await s2.client.storage.from("solutions").createSignedUrl(newS, 60)).error).not.toBeNull();
  });
});
