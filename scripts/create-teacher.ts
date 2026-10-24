import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { isValidUsername, normalizeUsername, usernameToEmail } from "../src/lib/auth/username";

config({ path: ".env.local", quiet: true });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const rawUser = arg("username");
  const name = arg("name")?.trim();
  const password = arg("password");
  if (!rawUser || !name || !password) {
    console.error('Usage: npm run create-teacher -- --username <u> --name "<n>" --password <temp>');
    process.exit(1);
  }
  const username = normalizeUsername(rawUser);
  if (!isValidUsername(username)) {
    console.error("Usernames must be 3–20 characters: lowercase letters, numbers or _, starting with a letter.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  if (name.length < 1 || name.length > 60) {
    console.error("Name must be 1–60 characters.");
    process.exit(1);
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { count, error: cErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "teacher");
  if (cErr) {
    console.error(`Could not check for an existing teacher: ${cErr.message}`);
    process.exit(1);
  }
  if ((count ?? 0) > 0) {
    console.error("A teacher account already exists. Refusing to create another.");
    process.exit(1);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    console.error(`Could not create the login: ${error?.message}`);
    process.exit(1);
  }
  const { error: pErr } = await admin.from("profiles").insert({
    id: data.user.id,
    role: "teacher",
    username,
    display_name: name,
    must_change_password: true,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    console.error(`Could not create the profile: ${pErr.message}`);
    process.exit(1);
  }
  console.log(`Teacher "${username}" created. They must choose a new password at first login.`);
}

main();
