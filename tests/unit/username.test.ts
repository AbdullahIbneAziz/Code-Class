import { afterEach, describe, expect, it } from "vitest";
import {
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from "@/lib/auth/username";

describe("username helpers", () => {
  const original = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN;
    else process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN = original;
  });

  it("normalizes by trimming and lowercasing", () => {
    expect(normalizeUsername(" Student1 ")).toBe("student1");
  });

  it("validates usernames after normalizing", () => {
    expect(isValidUsername("student2")).toBe(true);
    expect(isValidUsername(" Student2 ")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("1abc")).toBe(false);
    expect(isValidUsername("a-b-c")).toBe(false);
    expect(isValidUsername("a".repeat(21))).toBe(false);
  });

  it("maps username to login email using default domain", () => {
    delete process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN;
    expect(usernameToEmail(" Miraz")).toBe("miraz@email.com");
  });

  it("uses NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN when set", () => {
    process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN = "example.org";
    expect(usernameToEmail(" Miraz")).toBe("miraz@example.org");
  });
});

describe("login email domain config", () => {
  it("reads NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN (inlined into the client bundle)", async () => {
    const { getLoginEmailDomain } = await import("@/lib/config");
    const prev = process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN;
    process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN = "example.net";
    expect(getLoginEmailDomain()).toBe("example.net");
    if (prev === undefined) delete process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN;
    else process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN = prev;
  });
});
