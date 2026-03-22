import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminDashboardPage() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");

  const supabase = createAdminClient();

  const [showsResult, episodesResult, topicsResult, jobsResult] =
    await Promise.all([
      supabase.from("shows").select("id", { count: "exact", head: true }),
      supabase.from("episodes").select("id", { count: "exact", head: true }),
      supabase.from("topics").select("id", { count: "exact", head: true }),
      supabase
        .from("processing_jobs")
        .select("*")
        .eq("status", "running")
        .limit(5),
    ]);

  const stats = {
    shows: showsResult.count ?? 0,
    episodes: episodesResult.count ?? 0,
    topics: topicsResult.count ?? 0,
    activeJobs: jobsResult.data?.length ?? 0,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">
        ThisWeekInTechPodcasts.com admin
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Shows" value={stats.shows} />
        <StatCard label="Episodes" value={stats.episodes} />
        <StatCard label="Topics" value={stats.topics} />
        <StatCard label="Active Jobs" value={stats.activeJobs} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
