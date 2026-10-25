"use client";

import { useRef, useState, useTransition } from "react";
import { useHydrated } from "@/lib/ui/useHydrated";
import { useRouter } from "next/navigation";
import {
  createLectureAction,
  deleteLectureAction,
  updateLectureAction,
} from "@/actions/lectures";
import { DownloadButton } from "@/components/DownloadButton";
import { UkTime } from "@/components/UkTime";
import { uploadAndAttach, uploadAndReplace } from "@/lib/files/attach";
import { ALLOWED_EXT, BUCKET, validateFile } from "@/lib/files/rules";
import type { Lecture } from "@/lib/lectures/queries";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const input = "rounded border border-black/20 px-2 py-1 dark:border-white/25 dark:bg-transparent";
const btn = "rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";
const ACCEPT = ALLOWED_EXT.lecture.map((e) => "." + e).join(",");

function Err({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  ) : null;
}

function Progress({ progress }: { progress: { name: string; pct: number } | null }) {
  return progress ? (
    <p role="status" className="mt-1 text-sm">
      Uploading {progress.name}… {progress.pct}%
    </p>
  ) : null;
}

export function UploadLectureForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get("title") ?? "");
    const description = String(fd.get("description") ?? "");
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.name !== "");
    setError(null);
    setNotes([]);
    // Refuse bad files before anything is created or uploaded.
    for (const f of files) {
      const v = validateFile(f, "lecture");
      if (!v.ok) {
        setError(`${f.name}: ${v.message}`);
        return;
      }
    }
    startTransition(async () => {
      const created = await createLectureAction({ title, description });
      if (!created.ok) {
        setError(created.message);
        return;
      }
      const client = createBrowserSupabase();
      const failed: string[] = [];
      for (const f of files) {
        setProgress({ name: f.name, pct: 0 });
        const r = await uploadAndAttach(client, {
          target: "lecture",
          parentId: created.id,
          file: f,
          onProgress: (x) => setProgress({ name: f.name, pct: Math.round(x * 100) }),
        });
        if (!r.ok) failed.push(`The lecture was saved, but ${f.name} didn't upload. Add it again below. (${r.message})`);
      }
      setProgress(null);
      setNotes(failed);
      if (failed.length === 0) form.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} aria-label="Upload lecture" className="mt-6 flex flex-col gap-3">
      <label className="flex flex-col text-sm">
        Title
        <input name="title" required maxLength={200} className={input} autoComplete="off" />
      </label>
      <label className="flex flex-col text-sm">
        Description (optional)
        <textarea name="description" rows={2} className={input} />
      </label>
      <label className="flex flex-col text-sm">
        Files
        <input name="files" type="file" multiple accept={ACCEPT} />
      </label>
      <div>
        <button type="submit" disabled={!hydrated || pending} className={btn}>
          Upload lecture
        </button>
      </div>
      <Progress progress={progress} />
      <Err message={error} />
      {notes.map((n) => (
        <p key={n} role="alert" className="text-sm text-red-600">
          {n}
        </p>
      ))}
    </form>
  );
}

function FileRowView({ lectureId, file }: { lectureId: string; file: Lecture["files"][number] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const f = el.files?.[0];
    el.value = "";
    if (!f) return;
    setError(null);
    const v = validateFile(f, "lecture");
    if (!v.ok) {
      setError(v.message);
      return;
    }
    startTransition(async () => {
      const r = await uploadAndReplace(createBrowserSupabase(), {
        target: "lecture",
        parentId: lectureId,
        fileId: file.id,
        file: f,
        onProgress: (x) => setProgress({ name: f.name, pct: Math.round(x * 100) }),
      });
      setProgress(null);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });
  }

  return (
    <li className="py-1">
      <span className="mr-3">{file.originalName}</span>
      <DownloadButton bucket={BUCKET.lecture} objectPath={file.objectPath} downloadName={file.originalName} />{" "}
      <button type="button" disabled={!hydrated || pending} className={btn} onClick={() => inputRef.current?.click()}>
        Replace
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        aria-label={`Replacement for ${file.originalName}`}
        className="hidden"
        onChange={onPick}
      />
      <Progress progress={progress} />
      <Err message={error} />
    </li>
  );
}

export function LectureCard({ lecture }: { lecture: Lecture }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  function onAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const files = Array.from(el.files ?? []);
    el.value = "";
    if (!files.length) return;
    setError(null);
    for (const f of files) {
      const v = validateFile(f, "lecture");
      if (!v.ok) {
        setError(`${f.name}: ${v.message}`);
        return;
      }
    }
    startTransition(async () => {
      const client = createBrowserSupabase();
      for (const f of files) {
        const r = await uploadAndAttach(client, {
          target: "lecture",
          parentId: lecture.id,
          file: f,
          onProgress: (x) => setProgress({ name: f.name, pct: Math.round(x * 100) }),
        });
        if (!r.ok) {
          setError(`${f.name}: ${r.message}`);
          break;
        }
      }
      setProgress(null);
      router.refresh();
    });
  }

  function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await updateLectureAction({
        id: lecture.id,
        title: String(fd.get("title") ?? ""),
        description: String(fd.get("description") ?? ""),
      });
      if (!r.ok) setError(r.message);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const r = await deleteLectureAction(lecture.id);
      if (!r.ok) {
        setError(r.message);
        setConfirming(false);
      } else router.refresh();
    });
  }

  return (
    <article aria-label={lecture.title} className="rounded border border-black/15 p-4 dark:border-white/20">
      {editing ? (
        <form onSubmit={onEdit} className="flex flex-col gap-2">
          <label className="flex flex-col text-sm">
            Title
            <input name="title" required maxLength={200} defaultValue={lecture.title} className={input} />
          </label>
          <label className="flex flex-col text-sm">
            Description (optional)
            <textarea name="description" rows={2} defaultValue={lecture.description ?? ""} className={input} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={!hydrated || pending} className={btn}>
              Save
            </button>
            <button type="button" className={btn} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <h2 className="text-lg font-semibold">{lecture.title}</h2>
          {lecture.description && <p className="mt-1 whitespace-pre-wrap">{lecture.description}</p>}
          <p className="mt-1 text-sm">
            <UkTime at={lecture.createdAt} teacher />
          </p>
        </>
      )}
      <ul className="mt-3">
        {lecture.files.map((f) => (
          <FileRowView key={f.id} lectureId={lecture.id} file={f} />
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!hydrated || pending} className={btn} onClick={() => addRef.current?.click()}>
          Add file
        </button>
        <input
          ref={addRef}
          type="file"
          multiple
          accept={ACCEPT}
          aria-label={`Add files to ${lecture.title}`}
          className="hidden"
          onChange={onAdd}
        />
        {!editing && (
          <button type="button" className={btn} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {confirming ? (
          <>
            <button type="button" disabled={!hydrated || pending} className={btn} onClick={onDelete}>
              Confirm delete
            </button>
            <button type="button" className={btn} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className={btn} onClick={() => setConfirming(true)}>
            Delete lecture
          </button>
        )}
      </div>
      <Progress progress={progress} />
      <Err message={error} />
    </article>
  );
}
