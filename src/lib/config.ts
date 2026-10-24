export function getLoginEmailDomain(): string {
  return process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || "email.com";
}
