import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PromptEvalLoader } from "./_components/prompt-eval-loader";
import { ActivePromptSelector } from "./_components/active-prompt-selector";

export const dynamic = "force-dynamic";

export default async function AdminPromptsPage() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");

  const supabase = createAdminClient();

  // Fetch shows for the episode picker
  const { data: shows } = await supabase
    .from("shows")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  // Fetch all prompts for the active selector
  const { data: prompts } = await supabase
    .from("prompts")
    .select("id, name, is_active, is_promoted, model_provider, model_name")
    .order("name");

  return (
    <div>
      <h1 className="text-2xl font-bold">Prompt Eval Tool</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500">
        Write prompts, run them against episodes, and compare results
        side-by-side
      </p>

      {/* Global Display Prompt Setting */}
      <ActivePromptSelector prompts={prompts || []} />

      <PromptEvalLoader initialShows={shows || []} />
    </div>
  );
}
