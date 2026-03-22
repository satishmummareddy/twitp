import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin/auth";

export default async function AdminPromptsPage() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) redirect("/admin/login");

  return (
    <div>
      <h1 className="text-2xl font-bold">Prompts</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Configure AI prompts for insights extraction
      </p>
      <div className="mt-6 rounded-lg border border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Coming in Phase 2C
      </div>
    </div>
  );
}
