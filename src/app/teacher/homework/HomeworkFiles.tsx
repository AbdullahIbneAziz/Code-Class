"use client";

import { useRef, useState, useTransition } from "react";
import { useHydrated } from "@/lib/ui/useHydrated";
import { useRouter } from "next/navigation";
import { DownloadButton } from "@/components/DownloadButton";
import { uploadAndAttach, uploadAndReplace } from "@/lib/files/attach";
import type { FileRow } from "@/lib/files/types";
import { ALLOWED_EXT, BUCKET, validateFile } from "@/lib/files/rules";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const btn = "rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";
const ACCEPT = ALLOWED_EXT.question.map((e) => "." + e).join(",");

function FileItem({ assignmentId, file }: { assignmentId: string; file: FileRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const f = el.files?.[0];
    el.value = "";
    if (!f) return;
    setError(null);
    const v = validateFile(f, "question");
    if (!v.ok) {
      setError(v.message);
      return;
    }
    startTransition(async () => {
      const r = await uploadAndReplace(createBrowserSupabase(), {
        target: "question",
        parentId: assignmentId,
        fileId: file.id,
        file: f,
        onProgress: (x) => setProgress(Math.round(x * 100)),
      });
      setProgress(null);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });
  }

  return (
    <li className="py-1">
      <span className="mr-3">{file.originalName}</span>
      <DownloadButton bucket={BUCKET.question} objectPath={file.objectPath} downloadName={file.originalName} />{" "}
      <button type="button" disabled={!hydrated || pending} className={btn} onClick={() => ref.current?.click()}>
        Replace
      </button>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        aria-label={`Replacement for ${file.originalName}`}
        className="hidden"
        onChange={onPick}
      />
      {progress !== null && (
        <p role="status" className="text-sm">
          Uploading… {progress}%
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </li>
  );
}

export function HomeworkFiles({
  assignmentId,
  files,
  anySubmission,
}: {
  assignmentId: string;
  files: FileRow[];
  anySubmission: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  function onAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const picked = Array.from(el.files ?? []);
    el.value = "";
    if (!picked.length) return;
    setError(null);
    for (const f of picked) {
      const v = validateFile(f, "question");
      if (!v.ok) {
        setError(`${f.name}: ${v.message}`);
        return;
      }
    }
    startTransition(async () => {
      const client = createBrowserSupabase();
      for (const f of picked) {
        const r = await uploadAndAttach(client, { target: "question", parentId: assignmentId, file: f });
        if (!r.ok) {
          setError(`${f.name}: ${r.message}`);
          break;
        }
      }
      router.refresh();
    });
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Question files</h2>
      {files.length === 0 && <p className="mt-1 opacity-70">No question files yet.</p>}
      <ul className="mt-2">
        {files.map((f) => (
          <FileItem key={f.id} assignmentId={assignmentId} file={f} />
        ))}
      </ul>
      {anySubmission && files.length > 0 && (
        <p className="mt-1 text-sm">
          Students who already downloaded the old file won&apos;t see the change. Tell them in class.
        </p>
      )}
      <div className="mt-2">
        <button type="button" disabled={!hydrated || pending} className={btn} onClick={() => addRef.current?.click()}>
          Add question file
        </button>
        <input
          ref={addRef}
          type="file"
          multiple
          accept={ACCEPT}
          aria-label="Add question file"
          className="hidden"
          onChange={onAdd}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
