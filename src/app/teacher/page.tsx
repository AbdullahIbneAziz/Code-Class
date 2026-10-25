import Link from "next/link";

export default function TeacherHome() {
  return (
    <main>
      <h1 className="text-2xl font-semibold">Teacher dashboard</h1>
      <p className="mt-3">
        <Link href="/teacher/lectures" className="rounded border border-black/20 px-3 py-1 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10">
          + Upload lecture
        </Link>
      </p>
      <p className="mt-3">
        <Link href="/teacher/students" className="underline">
          Students
        </Link>
      </p>
      <p className="mt-2 text-black/70 dark:text-white/70">More coming soon.</p>
    </main>
  );
}
