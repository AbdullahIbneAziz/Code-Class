import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Geist } from "next/font/google";
import "./globals.css";
import { createServerSupabase } from "@/lib/supabase/server";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CodeClass",
  description: "Homework and tests for our coding class.",
};

async function UserBar() {
  await connection();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", data.user.id)
    .maybeSingle();
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm">
      <span className="text-black/70 dark:text-white/70">{p?.display_name}</span>
      <Link href="/account" className="underline">My account</Link>
      <button
        type="submit"
        className="rounded border border-black/20 px-3 py-1 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
      >
        Sign out
      </button>
    </form>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/15">
          <span className="font-semibold">CodeClass</span>
          <Suspense fallback={null}>
            <UserBar />
          </Suspense>
        </header>
        <div className="flex flex-1 flex-col"><Suspense fallback={null}>{children}</Suspense></div>
      </body>
    </html>
  );
}
