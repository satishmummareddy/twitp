import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProcessingPanel } from "./_components/processing-panel";

export default async function AdminProcessingPage() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");

  const supabase = createAdminClient();

  const [showsResult, jobsResult] = await Promise.all([
    supabase.from("shows").select("id, name, slug, episode_count").order("name"),
    supabase
      .from("processing_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Processing</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Process podcast transcripts to extract insights
      </p>

      <ProcessingPanel
        shows={showsResult.data ?? []}
        initialJobs={jobsResult.data ?? []}
      />
    </div>
  );
}
