import { createAdminClient } from "@/lib/supabase/admin";
import { callAIProvider, type AIExtractionResult } from "./providers";

interface EvalPromptConfig {
  template: string;
  model_provider: "anthropic" | "openai";
  model_name: string;
}

interface EvalExtractionResult {
  result: AIExtractionResult;
  rawResponse: string;
  durationMs: number;
}

const JSON_FORMAT_INSTRUCTIONS = `

---
**IMPORTANT: You MUST respond with ONLY a valid JSON object in this exact format, no markdown or other text:**

{
  "guest_name": "Guest Name or null",
  "summary": "2-3 sentence summary of the episode",
  "insights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"],
  "topics": ["topic-slug-1", "topic-slug-2", "topic-slug-3"]
}

Return ONLY the raw JSON object, no markdown code blocks, no explanation.`;

/**
 * Extract insights for eval purposes — does NOT mutate production data.
 * Reads transcript from the episodes table and returns parsed results.
 * Automatically appends transcript and JSON format instructions if missing.
 */
export async function extractForEval(
  episodeId: string,
  promptConfig: EvalPromptConfig,
  showName: string
): Promise<EvalExtractionResult> {
  const supabase = createAdminClient();

  // Read episode data from DB
  const { data: episode, error } = await supabase
    .from("episodes")
    .select("title, transcript_text")
    .eq("id", episodeId)
    .single();

  if (error || !episode) {
    throw new Error(`Episode not found: ${episodeId}`);
  }

  if (!episode.transcript_text) {
    throw new Error(`Episode ${episodeId} has no transcript`);
  }

  // Build the prompt — replace placeholders if present,
  // otherwise auto-append context so user doesn't need to include them manually
  const hasTranscriptVar = promptConfig.template.includes("{transcript}");

  let prompt = promptConfig.template
    .replace("{show_name}", showName)
    .replace("{episode_title}", episode.title || "Unknown")
    .replace("{transcript}", episode.transcript_text);

  // If template didn't include {transcript}, auto-append the context
  if (!hasTranscriptVar) {
    prompt += `\n\n---\n**Show:** ${showName}\n**Episode Title:** ${episode.title || "Unknown"}\n\n**Transcript:**\n${episode.transcript_text}`;
  }

  // If template doesn't mention JSON output format, append instructions
  const lowerPrompt = prompt.toLowerCase();
  if (!lowerPrompt.includes("json")) {
    prompt += JSON_FORMAT_INSTRUCTIONS;
  }

  // Get API key
  const apiKey =
    promptConfig.model_provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      `Missing API key for provider: ${promptConfig.model_provider}`
    );
  }

  // Call AI and measure duration
  const startTime = Date.now();
  const { extraction: result } = await callAIProvider(
    {
      provider: promptConfig.model_provider,
      model: promptConfig.model_name,
      apiKey,
    },
    prompt
  );
  const durationMs = Date.now() - startTime;

  return {
    result,
    rawResponse: JSON.stringify(result),
    durationMs,
  };
}

/**
 * Run an eval for a single episode and save results to eval_results table.
 */
export async function runEvalForEpisode(
  evalRunId: string,
  episodeId: string,
  promptConfig: EvalPromptConfig,
  showName: string
): Promise<void> {
  const supabase = createAdminClient();

  // Mark as processing
  await supabase
    .from("eval_results")
    .update({ status: "processing" })
    .eq("eval_run_id", evalRunId)
    .eq("episode_id", episodeId);

  try {
    const { result, rawResponse, durationMs } = await extractForEval(
      episodeId,
      promptConfig,
      showName
    );

    // Save to eval_results
    await supabase
      .from("eval_results")
      .update({
        status: "completed",
        guest_name: result.guest_name,
        summary: result.summary,
        insights: result.insights,
        topics: result.topics,
        raw_response: rawResponse,
        duration_ms: durationMs,
      })
      .eq("eval_run_id", evalRunId)
      .eq("episode_id", episodeId);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await supabase
      .from("eval_results")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("eval_run_id", evalRunId)
      .eq("episode_id", episodeId);

    throw error;
  }
}
