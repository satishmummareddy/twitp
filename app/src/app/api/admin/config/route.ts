import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: configs } = await supabase
    .from("processing_config")
    .select("key, value");

  // Convert array of {key, value} to a flat object
  const config: Record<string, unknown> = {};
  for (const row of configs || []) {
    config[row.key] = row.value;
  }

  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const updates = await request.json();
    const supabase = createAdminClient();

    // Upsert each key-value pair
    for (const [key, value] of Object.entries(updates)) {
      await supabase.from("processing_config").upsert(
        {
          key,
          value: value as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    }

    return NextResponse.json({ message: "Config updated" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
