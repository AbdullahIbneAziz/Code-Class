import { afterEach, describe, expect, it } from "vitest";
import {
  isValidUsername,
  normalizeUsername,
  usernameToEmail,
} from "@/lib/auth/username";

describe("username helpers", () => {
  const original = process.env.LOGIN_EMAIL_DOMAIN;
  afterEach(() => {
    if (original === undefined) delete process.env.LOGIN_EMAIL_DOMAIN;
    else process.env.LOGIN_EMAIL_DOMAIN = original;
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
    delete process.env.LOGIN_EMAIL_DOMAIN;
    expect(usernameToEmail(" Miraz")).toBe("miraz@email.com");
  });

  it("uses LOGIN_EMAIL_DOMAIN when set", () => {
    process.env.LOGIN_EMAIL_DOMAIN = "example.org";
    expect(usernameToEmail(" Miraz")).toBe("miraz@example.org");
  });
});
