import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { promptId, promoted } = await request.json();

    if (!promptId) {
      return NextResponse.json(
        { error: "promptId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("prompts")
      .update({ is_promoted: !!promoted })
      .eq("id", promptId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: promoted ? "Prompt promoted" : "Prompt demoted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
