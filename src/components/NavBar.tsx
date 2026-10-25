import Link from "next/link";

export function NavBar({ links }: { links: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Main" className="flex gap-4 border-b border-black/10 px-4 py-2 text-sm dark:border-white/15">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="underline-offset-4 hover:underline">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
