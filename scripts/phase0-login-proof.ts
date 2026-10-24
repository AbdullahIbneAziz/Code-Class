/**
 * Phase 0: prove username login works on the live dev Supabase project.
 * Login email = `${username}@${NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN}`.
 * This is the ONLY file allowed to call auth.signUp (to verify sign-ups are disabled).
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || "email.com";

if (!url || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opts);
const anon = () => createClient(url, anonKey, opts);

const rand = () => randomBytes(3).toString("hex");
const r = rand();
const username = `t_p0_${r}`;
const email = `${username}@${domain}`;
const renamedEmail = `t_p0_${r}_renamed@${domain}`;
const signupEmail = `t_p0_signup_${r}@${domain}`;

let failed = false;
let userId: string | undefined;
let signupUserId: string | undefined;

async function step(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    console.log(`PASS ${name}`);
    return true;
  } catch (e) {
    failed = true;
    const err = e as { code?: string; message?: string };
    console.log(`FAIL ${name}: ${err.code ? err.code + " " : ""}${err.message ?? String(e)}`);
    return false;
  }
}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function signIn(client: SupabaseClient, e: string, password: string) {
  return client.auth.signInWithPassword({ email: e, password });
}

async function main() {
  const ok1 = await step("1 admin createUser", async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "Temp-pass-1",
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  });

  if (ok1 && userId) {
    const id = userId;

    await step("2 anon signInWithPassword", async () => {
      const { data, error } = await signIn(anon(), email, "Temp-pass-1");
      if (error) throw error;
      must(data.session, "no session returned");
    });

    await step("3 signUp disabled", async () => {
      const { data, error } = await anon().auth.signUp({
        email: signupEmail,
        password: "Whatever-123",
      });
      signupUserId = data?.user?.id;
      must(error, "signUp unexpectedly succeeded (sign-ups must be disabled)");
    });

    await step("4 rename email", async () => {
      const { error } = await admin.auth.admin.updateUserById(id, {
        email: renamedEmail,
        email_confirm: true,
      });
      if (error) throw error;
      const ok = await signIn(anon(), renamedEmail, "Temp-pass-1");
      if (ok.error) throw ok.error;
      must(ok.data.session, "no session for new email");
      const old = await signIn(anon(), email, "Temp-pass-1");
      must(old.error, "old email still signs in");
    });

    await step("5 admin reset password", async () => {
      const { error } = await admin.auth.admin.updateUserById(id, { password: "Temp-pass-2" });
      if (error) throw error;
      const ok = await signIn(anon(), renamedEmail, "Temp-pass-2");
      if (ok.error) throw ok.error;
      must(ok.data.session, "no session with new password");
      const old = await signIn(anon(), renamedEmail, "Temp-pass-1");
      must(old.error, "old password still works");
    });

    await step("6 user updateUser password", async () => {
      const client = anon();
      const si = await signIn(client, renamedEmail, "Temp-pass-2");
      if (si.error) throw si.error;
      const { error } = await client.auth.updateUser({ password: "Own-pass-3" });
      if (error) throw error;
      const ok = await signIn(anon(), renamedEmail, "Own-pass-3");
      if (ok.error) throw ok.error;
      must(ok.data.session, "no session with own password");
    });
  } else {
    console.log("SKIP steps 2-6 (step 1 failed)");
  }

  await step("7 cleanup", async () => {
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
    if (signupUserId) {
      const { error } = await admin.auth.admin.deleteUser(signupUserId);
      if (error) throw error;
    }
  });

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Unexpected error:", (e as Error).message);
  process.exit(1);
});
