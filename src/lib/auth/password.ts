export type PasswordCheck = { ok: true } | { ok: false; message: string };

export function validateNewPassword(
  newPw: string,
  confirm: string,
  currentPw: string,
): PasswordCheck {
  if (newPw.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  if (newPw !== confirm) {
    return { ok: false, message: "The two new passwords don't match." };
  }
  if (newPw === currentPw) {
    return {
      ok: false,
      message: "Choose a password different from your current one.",
    };
  }
  return { ok: true };
}
