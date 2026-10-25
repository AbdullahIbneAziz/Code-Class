# Supabase project settings (codeclass-dev)

These are dashboard settings that migrations cannot set. Re-check them after any project re-creation (ARCHITECTURE section 14.1 item 7).

## Auth (Authentication -> Sign In / Providers, Emails)
- Allow new users to sign up: OFF (public sign-up disabled)
- Confirm email: OFF
- Secure password change: OFF
- Custom SMTP: not configured (no email is ever sent)

## Storage buckets (created by migration 20261024000004_storage.sql)
| Bucket | Public | Max file size | Allowed MIME types | Extensions (enforced by policy) |
|---|---|---|---|---|
| lectures | no | 26214400 (25 MB) | any (null) | ipynb, py, pdf, pptx, png, jpg |
| questions | no | 26214400 (25 MB) | any (null) | ipynb, py, pdf, txt, zip |
| solutions | no | 26214400 (25 MB) | any (null) | ipynb, py, pdf, txt, zip |
| submissions | no | 5242880 (5 MB) | any (null) | ipynb, py |

- Policies exist for SELECT and INSERT only. There are no UPDATE or DELETE policies; deletion is done by the admin-client clean-up.
- The global storage upload limit (Project Settings -> Storage) must be at least 25 MB (free plan allows 50 MB).

## Phase 2 notes
- `replaced_files` has a `bucket` column: each row records which bucket (lectures, questions, solutions) holds the old file awaiting clean-up. Clean-up must delete from that bucket.
- A project restore or re-creation needs all Phase 1 migrations (20261024000001-000007) and the Phase 2 migrations 20261025000001-000005 (rule_helpers, files_lectures, assignments, assignment_lock_modes, finalize_submission), applied in order with `npm run db:push`.

- A restore (also after Phase 3) needs migrations up to `20261025000007_marking_solutions.sql`, 14 in total, applied in order.

## Auth values (config.toml mirrors these; the hosted dashboard must be set by hand)
- Minimum password length: **8** (Authentication -> Sign In / Providers -> Password). `supabase/config.toml` sets 8; the teacher changes the hosted dashboard setting.
- Session / JWT expiry: 3600 s (`jwt_expiry` in config.toml, the default).
- Site URL: `https://codeclass-tuition.netlify.app` (Authentication -> URL Configuration).
- Netlify site: `codeclass-tuition`, site id `86803e10-5330-4035-b6bf-71c6143d1064`.

## Environment variables
| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public |
| `SUPABASE_SERVICE_ROLE_KEY` | secret, runtime only |
| `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN` | not secret; inlined at build time, so it must be set at **build time** (and runtime) on Netlify in all deploy contexts |
| `DATABASE_URL` | local tests and `db:push` only, never on Netlify |
