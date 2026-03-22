export interface AIExtractionResult {
  guest_name: string | null;
  summary: string;
  insights: string[];
  topics: string[];
}

interface AIProviderConfig {
  provider: "anthropic" | "openai";
  model: string;
  apiKey: string;
}

/**
 * Call an AI provider to extract insights from a transcript.
 */
export async function callAIProvider(
  config: AIProviderConfig,
  prompt: string
): Promise<AIExtractionResult> {
  if (config.provider === "anthropic") {
    return callAnthropic(config.apiKey, config.model, prompt);
  } else {
    return callOpenAI(config.apiKey, config.model, prompt);
  }
}

async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string
): Promise<AIExtractionResult> {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.status === 429 && attempt < maxRetries) {
      // Rate limited — wait with exponential backoff (30s, 60s, 120s)
      const waitMs = 30_000 * Math.pow(2, attempt);
      console.log(`Rate limited, waiting ${waitMs / 1000}s before retry ${attempt + 1}/${maxRetries}...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Anthropic API error (${response.status}): ${errorBody}`
      );
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      throw new Error("No text in Anthropic response");
    }

    return parseAIResponse(text);
  }

  throw new Error("Max retries exceeded for Anthropic API");
}

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<AIExtractionResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("No text in OpenAI response");
  }

  return parseAIResponse(text);
}

/**
 * Parse the AI response text into structured data.
 * Handles responses that may include markdown code blocks.
 */
function parseAIResponse(text: string): AIExtractionResult {
  // Strip markdown code blocks if present
  let jsonStr = text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!Array.isArray(parsed.insights) || parsed.insights.length === 0) {
      throw new Error("Missing or empty insights array");
    }
    if (!Array.isArray(parsed.topics) || parsed.topics.length === 0) {
      throw new Error("Missing or empty topics array");
    }
    if (typeof parsed.summary !== "string" || !parsed.summary) {
      throw new Error("Missing or empty summary");
    }

    return {
      guest_name: parsed.guest_name || null,
      summary: parsed.summary,
      insights: parsed.insights.slice(0, 5), // Ensure max 5
      topics: parsed.topics.slice(0, 7), // Ensure max 7
    };
  } catch (e) {
    throw new Error(
      `Failed to parse AI response as JSON: ${e instanceof Error ? e.message : "Unknown error"}\n\nRaw response:\n${text.slice(0, 500)}`
    );
  }
}
