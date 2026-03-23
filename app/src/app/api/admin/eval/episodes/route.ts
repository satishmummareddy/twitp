import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const showId = request.nextUrl.searchParams.get("showId");

  const supabase = createAdminClient();
  let query = supabase
    .from("episodes")
    .select("id, title, guest_name, processing_status, show_id, shows(name)")
    .order("title", { ascending: true });

  if (showId) {
    query = query.eq("show_id", showId);
  }

  const { data: episodes, error } = await query.limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ episodes });
}
