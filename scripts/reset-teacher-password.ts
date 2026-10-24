import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resetTeacherPassword } from "../src/lib/accounts/reset-teacher";

config({ path: ".env.local", quiet: true });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const username = arg("username");
  const password = arg("password");
  if (!username || !password) {
    console.error("Usage: npm run -s reset-teacher-password -- --username <u> --password <temp>");
    process.exit(1);
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const res = await resetTeacherPassword(admin, username, password);
  if (!res.ok) {
    console.error(res.message);
    process.exit(1);
  }
  console.log("Password reset. You must choose a new password at your next login.");
}

main();
