"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { usernameToEmail } from "@/lib/auth/username";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await createBrowserSupabase().auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (err) {
      setError("Username or password is incorrect");
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const input =
    "mt-1 w-full rounded border border-black/20 bg-transparent px-3 py-2 dark:border-white/25";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="text-sm font-medium">
        Username
        <input
          name="username"
          className={input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
        />
      </label>
      <label className="text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          className={input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        Log in
      </button>
    </form>
  );
}
