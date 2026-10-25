import { NavBar } from "@/components/NavBar";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar
        links={[
          { href: "/", label: "Home" },
          { href: "/homework", label: "Homework" },
          { href: "/lectures", label: "Lectures" },
        ]}
      />
      {children}
    </>
  );
}
