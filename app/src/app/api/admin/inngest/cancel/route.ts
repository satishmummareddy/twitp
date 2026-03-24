import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get the job details before cancelling
    const { data: job } = await supabase
      .from("processing_jobs")
      .select("id, job_type, started_at, show_id")
      .eq("id", jobId)
      .eq("status", "running")
      .single();

    if (!job) {
      return NextResponse.json(
        { error: "Job not found or not running" },
        { status: 404 }
      );
    }

    // Cancel Inngest functions via REST API
    const inngestResults: string[] = [];
    const signingKey = process.env.INNGEST_SIGNING_KEY;

    if (signingKey) {
      const functionsToCancel = [
        "twitp-batch-process",
        "twitp-process-episode",
        "twitp-batch-fetch-transcripts",
        "twitp-fetch-transcript",
        "twitp-discover-episodes",
      ];

      const startedAfter = job.started_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const startedBefore = new Date().toISOString();

      for (const fnId of functionsToCancel) {
        try {
          const res = await fetch("https://api.inngest.com/v1/cancellations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${signingKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              app_id: "twitp",
              function_id: fnId,
              started_after: startedAfter,
              started_before: startedBefore,
              if: `event.data.jobId == '${jobId}'`,
            }),
          });

          if (res.ok) {
            inngestResults.push(`${fnId}: cancelled`);
          } else {
            const errText = await res.text();
            inngestResults.push(`${fnId}: ${res.status} ${errText.slice(0, 100)}`);
          }
        } catch (e) {
          inngestResults.push(`${fnId}: error ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    // Mark the job as cancelled in our DB
    await supabase
      .from("processing_jobs")
      .update({
        status: "failed",
        error_message: "Cancelled by admin",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Reset episodes in 'processing' state back to 'pending' (only for this show)
    await supabase
      .from("episodes")
      .update({ processing_status: "pending", processing_error: null })
      .eq("show_id", job.show_id)
      .eq("processing_status", "processing");

    return NextResponse.json({
      message: "Job cancelled",
      jobId: job.id,
      inngestCancellations: inngestResults,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
