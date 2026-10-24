import PasswordForm from "../PasswordForm";

export default function NewPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-md p-6">
      <h1 className="text-2xl font-semibold">Choose your new password</h1>
      <p className="mt-2 mb-6 text-black/70 dark:text-white/70">
        This is a temporary password from your teacher. Please choose your own.
      </p>
      <PasswordForm after="home" />
    </main>
  );
}
