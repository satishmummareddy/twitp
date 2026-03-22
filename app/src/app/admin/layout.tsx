import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authenticated = await isAdminAuthenticated();

  // Don't redirect if we're on the login page
  // (login page is rendered inside this layout)
  if (!authenticated) {
    // We'll handle this with a client check instead
  }

  return (
    <div className="flex min-h-screen">
      {authenticated && (
        <aside className="w-56 border-r border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-6">
            <Link href="/admin" className="text-lg font-bold">
              TWITP Admin
            </Link>
          </div>
          <nav className="space-y-1">
            <NavLink href="/admin">Dashboard</NavLink>
            <NavLink href="/admin/shows">Shows</NavLink>
            <NavLink href="/admin/prompts">Prompts</NavLink>
            <NavLink href="/admin/processing">Processing</NavLink>
          </nav>
          <div className="mt-8 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ← Back to site
            </Link>
          </div>
        </aside>
      )}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </Link>
  );
}
