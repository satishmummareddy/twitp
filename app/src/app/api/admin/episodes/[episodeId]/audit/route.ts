import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { episodeId } = await params;
  const supabase = createAdminClient();

  const { data: auditLog, error } = await supabase
    .from("processing_audit_log")
    .select("*")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ auditLog: auditLog || [] });
}
