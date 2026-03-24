const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 0.003, output: 0.015 },
  "claude-3-5-haiku-20241022": { input: 0.001, output: 0.005 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = COST_PER_1K_TOKENS[model] || { input: 0.003, output: 0.015 };
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${tokens}`;
}
