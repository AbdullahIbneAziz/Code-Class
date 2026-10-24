"use client";

import { useActionState, useState } from "react";
import {
  createStudentAction,
  renameStudentAction,
  resetStudentPasswordAction,
  setStudentActiveAction,
  type ActionState,
} from "@/actions/teacher-students";

const input = "rounded border border-black/20 px-2 py-1 dark:border-white/25 dark:bg-transparent";
const btn = "rounded border border-black/20 px-3 py-1 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10";

function TempPassword({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded border border-green-600/40 bg-green-600/10 p-3 text-sm">
      <div>
        Temporary password (shown once):{" "}
        <code data-testid="temp-password" className="font-mono font-semibold">{value}</code>{" "}
        <button
          type="button"
          className={btn}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          Copy
        </button>
        {copied && <span className="ml-2">Copied</span>}
      </div>
      <p className="mt-1 text-black/70 dark:text-white/70">Send this to the family on WhatsApp.</p>
    </div>
  );
}

function Err({ state }: { state: ActionState }) {
  return state && !state.ok && state.message ? (
    <p role="alert" className="mt-1 text-sm text-red-600">{state.message}</p>
  ) : null;
}

export function AddStudentForm() {
  const [state, action, pending] = useActionState(createStudentAction, null);
  return (
    <form action={action} className="mt-6 flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-sm">
        Username
        <input name="username" required className={input} autoComplete="off" />
      </label>
      <label className="flex flex-col text-sm">
        Display name
        <input name="displayName" required maxLength={60} className={input} autoComplete="off" />
      </label>
      <label className="flex flex-col text-sm">
        Temporary password
        <input name="tempPassword" required minLength={8} className={input} autoComplete="off" />
      </label>
      <button type="submit" disabled={pending} className={btn}>Add student</button>
      <div className="w-full">
        <Err state={state} />
        {state?.ok && state.tempPassword && <TempPassword value={state.tempPassword} />}
      </div>
    </form>
  );
}

export function RowActions({ id, username, active }: { id: string; username: string; active: boolean }) {
  const [reset, resetAction] = useActionState(resetStudentPasswordAction, null);
  const [rename, renameAction] = useActionState(renameStudentAction, null);
  const [toggle, toggleAction] = useActionState(setStudentActiveAction, null);
  return (
    <div className="flex flex-col gap-2">
      <form action={resetAction} className="flex gap-2">
        <input type="hidden" name="studentId" value={id} />
        <input
          name="tempPassword"
          required
          minLength={8}
          aria-label={`Reset password for ${username}`}
          placeholder="New temporary password"
          className={input}
          autoComplete="off"
        />
        <button type="submit" className={btn}>Reset password</button>
      </form>
      <Err state={reset} />
      {reset?.ok && reset.tempPassword && <TempPassword value={reset.tempPassword} />}
      <form action={renameAction} className="flex gap-2">
        <input type="hidden" name="studentId" value={id} />
        <input
          name="username"
          required
          aria-label={`Rename ${username}`}
          placeholder="New name"
          className={input}
          autoComplete="off"
        />
        <button type="submit" className={btn}>Rename</button>
      </form>
      <Err state={rename} />
      <form action={toggleAction}>
        <input type="hidden" name="studentId" value={id} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <button type="submit" className={btn}>{active ? "Deactivate" : "Reactivate"}</button>
      </form>
      <Err state={toggle} />
    </div>
  );
}
