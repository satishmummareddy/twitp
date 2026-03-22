import { createAdminClient } from "@/lib/supabase/admin";
import { Nav } from "../_components/nav";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createAdminClient();

  const [showsResult, topicsResult] = await Promise.all([
    supabase
      .from("shows")
      .select("name, slug")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("topics")
      .select("name, slug")
      .gt("episode_count", 0)
      .order("name"),
  ]);

  return (
    <>
      <Nav
        shows={showsResult.data ?? []}
        topics={topicsResult.data ?? []}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
