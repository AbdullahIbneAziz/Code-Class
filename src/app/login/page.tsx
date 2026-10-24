import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-semibold">Log in</h1>
      <LoginForm />
      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        Forgot your password? Ask your teacher on WhatsApp.
      </p>
    </main>
  );
}
