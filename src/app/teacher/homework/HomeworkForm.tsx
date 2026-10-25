"use client";

import { useState, useTransition } from "react";
import { useHydrated } from "@/lib/ui/useHydrated";
import { useRouter } from "next/navigation";
import { createHomeworkAction, updateHomeworkAction } from "@/actions/homework";
import { UkDateTimeField } from "@/components/UkDateTimeField";
import { uploadAndAttach } from "@/lib/files/attach";
import { ALLOWED_EXT, validateFile } from "@/lib/files/rules";
import type { HomeworkFormState } from "@/lib/homework/types";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { UkZone } from "@/lib/time/uk";

const input = "rounded border border-black/20 px-2 py-1 dark:border-white/25 dark:bg-transparent";
const btn = "rounded border border-black/20 px-3 py-1 text-sm hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";
const ACCEPT = ALLOWED_EXT.question.map((e) => "." + e).join(",");

type Parts = { date: string; time: string; zone: UkZone };

export type CreateProps = {
  mode: "create";
  students: { id: string; displayName: string; username: string }[];
};
export type EditProps = {
  mode: "edit";
  id: string;
  title: string;
  instructions: string;
  maxMarks: number;
  visibleFrom: Parts;
  due: Parts;
  isVisible: boolean;
};

export function HomeworkForm(props: CreateProps | EditProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [state, setState] = useState<HomeworkFormState>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const create = props.mode === "create";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.name !== "");
    fd.delete("files"); // file bytes go straight to Storage, never through the server action
    setFileError(null);
    setSaved(false);
    for (const f of files) {
      const v = validateFile(f, "question");
      if (!v.ok) {
        setFileError(`${f.name}: ${v.message}`);
        return;
      }
    }
    startTransition(async () => {
      const r = await (create ? createHomeworkAction(fd) : updateHomeworkAction(fd));
      setState(r);
      if (!r || !r.ok) return;
      if (!create) {
        setSaved(true);
        router.refresh();
        return;
      }
      const client = createBrowserSupabase();
      let failed = false;
      for (const f of files) {
        setProgress(`Uploading ${f.name}…`);
        const up = await uploadAndAttach(client, { target: "question", parentId: r.id, file: f });
        if (!up.ok) failed = true;
      }
      setProgress(null);
      router.push(`/teacher/homework/${r.id}${failed ? "?upload=failed" : ""}`);
    });
  }

  const zone = state && !state.ok ? (state.zoneChoice ?? []) : [];
  const message = state && !state.ok && zone.length === 0 ? state.message : null;
  const edit = props.mode === "edit" ? props : null;

  return (
    <form onSubmit={onSubmit} aria-label={create ? "New homework" : "Edit homework"} className="mt-6 flex flex-col gap-4">
      {edit && <input type="hidden" name="id" value={edit.id} />}
      <label className="flex flex-col text-sm">
        Title
        <input name="title" required maxLength={200} defaultValue={edit?.title} className={input} autoComplete="off" />
      </label>
      <label className="flex flex-col text-sm">
        Instructions
        <textarea name="instructions" rows={4} defaultValue={edit?.instructions} className={input} />
      </label>
      <label className="flex flex-col text-sm">
        Maximum mark
        <input
          name="maxMarks"
          type="number"
          min="0.01"
          step="any"
          required
          defaultValue={edit ? edit.maxMarks : 10}
          className={`${input} w-32`}
        />
      </label>
      <UkDateTimeField
        name="visibleFrom"
        label={create ? "Show from (leave blank to publish now)" : "Show from"}
        optional={create}
        defaultValue={edit?.visibleFrom}
        disabled={!!edit?.isVisible}
        hint={edit?.isVisible ? "Locked: students can already see this." : undefined}
        needsZoneChoice={zone.includes("visibleFrom")}
      />
      <UkDateTimeField name="due" label="Deadline" defaultValue={edit?.due} needsZoneChoice={zone.includes("due")} />
      {props.mode === "create" && (
        <fieldset className="text-sm">
          <legend className="font-medium">Students</legend>
          {props.students.length === 0 && <p className="opacity-70">There are no active students yet.</p>}
          {props.students.map((s) => (
            <label key={s.id} className="block">
              <input type="checkbox" name="studentIds" value={s.id} defaultChecked /> {s.displayName} ({s.username})
            </label>
          ))}
        </fieldset>
      )}
      {create && (
        <label className="flex flex-col text-sm">
          Question files
          <input name="files" type="file" multiple accept={ACCEPT} />
        </label>
      )}
      <div>
        <button type="submit" disabled={!hydrated || pending} className={btn}>
          {create ? "Create homework" : "Save changes"}
        </button>
      </div>
      {progress && (
        <p role="status" className="text-sm">
          {progress}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Changes saved.
        </p>
      )}
      {(message || fileError) && (
        <p role="alert" className="text-sm text-red-600">
          {fileError ?? message}
        </p>
      )}
    </form>
  );
}
