import { config } from "dotenv";
import { spawnSync } from "node:child_process";

config({ path: ".env.local", quiet: true });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}

const res = spawnSync("npx", ["supabase", "db", "push", "--db-url", dbUrl, ...process.argv.slice(2)], {
  shell: process.platform === "win32",
  encoding: "utf8",
});

// Never echo the connection string.
const mask = (s: string) => s.split(dbUrl).join("***");
process.stdout.write(mask(res.stdout ?? ""));
process.stderr.write(mask(res.stderr ?? ""));
process.exit(res.status ?? 1);
