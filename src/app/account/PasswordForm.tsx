"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/actions/account";

const input = "mt-1 w-full rounded border border-black/20 bg-transparent px-3 py-2 dark:border-white/25";

export default function PasswordForm({ after }: { after: "home" | "stay" }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="after" value={after} />
      <label className="text-sm font-medium">
        Current password
        <input name="currentPassword" type="password" className={input} autoComplete="current-password" required />
      </label>
      <label className="text-sm font-medium">
        New password
        <input name="newPassword" type="password" className={input} autoComplete="new-password" required />
      </label>
      <label className="text-sm font-medium">
        Confirm new password
        <input name="confirmPassword" type="password" className={input} autoComplete="new-password" required />
      </label>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.message}</p>
      )}
      {state?.ok && <p role="status" className="text-sm text-green-700 dark:text-green-400">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        Change password
      </button>
    </form>
  );
}
