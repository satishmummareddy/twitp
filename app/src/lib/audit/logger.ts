import { createAdminClient } from "@/lib/supabase/admin";

export async function logAuditEvent(params: {
  episodeId: string;
  jobId?: string;
  eventType: string;
  modelProvider?: string;
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  costEstimate?: number;
  durationMs?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  await supabase.from("processing_audit_log").insert({
    episode_id: params.episodeId,
    job_id: params.jobId || null,
    event_type: params.eventType,
    model_provider: params.modelProvider || null,
    model_name: params.modelName || null,
    input_tokens: params.inputTokens || null,
    output_tokens: params.outputTokens || null,
    cost_estimate: params.costEstimate || null,
    duration_ms: params.durationMs || null,
    error_message: params.errorMessage || null,
    metadata: params.metadata || {},
  });
}
