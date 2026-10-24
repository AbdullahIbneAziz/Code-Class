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
