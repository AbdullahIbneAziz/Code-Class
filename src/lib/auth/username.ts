import { getLoginEmailDomain } from "@/lib/config";

const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(u: string): boolean {
  return USERNAME_RE.test(normalizeUsername(u));
}

export function usernameToEmail(raw: string): string {
  return `${normalizeUsername(raw)}@${getLoginEmailDomain()}`;
}
