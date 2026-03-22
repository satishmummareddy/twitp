import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { AddShowForm } from "./_components/add-show-form";

export default async function AdminShowsPage() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");

  const supabase = createAdminClient();
  const { data: shows } = await supabase
    .from("shows")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shows</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage podcast shows and their transcript sources
          </p>
        </div>
      </div>

      <AddShowForm />

      <div className="mt-8">
        {shows && shows.length > 0 ? (
          <div className="space-y-3">
            {shows.map((show) => (
              <div
                key={show.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
              >
                <div>
                  <h3 className="font-medium">{show.name}</h3>
                  <p className="text-sm text-zinc-500">
                    /{show.slug} · {show.episode_count} episodes
                    {show.host_name && ` · Host: ${show.host_name}`}
                  </p>
                  {show.transcript_source_path && (
                    <p className="mt-1 text-xs text-zinc-400 font-mono">
                      {show.transcript_source_path}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      show.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {show.is_active ? "Active" : "Inactive"}
                  </span>
                  <Link
                    href={`/admin/shows/${show.id}`}
                    className="text-sm text-zinc-500 hover:text-zinc-700"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            No shows yet. Add one above to get started.
          </p>
        )}
      </div>
    </div>
  );
}
