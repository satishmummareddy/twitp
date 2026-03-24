import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { promptId } = await request.json();

    if (!promptId) {
      return NextResponse.json(
        { error: "promptId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Deactivate all prompts
    await supabase
      .from("prompts")
      .update({ is_active: false })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // update all

    // Activate the selected prompt
    const { error } = await supabase
      .from("prompts")
      .update({ is_active: true })
      .eq("id", promptId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Prompt activated for display" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
