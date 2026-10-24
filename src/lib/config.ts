export function getLoginEmailDomain(): string {
  return process.env.LOGIN_EMAIL_DOMAIN || "email.com";
}
