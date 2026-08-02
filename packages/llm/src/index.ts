/**
 * @sera/llm — switchable LLM provider abstraction.
 *
 * Phase 1: typed stub that resolves provider config from env. The real model
 * clients (Vercel AI SDK: @ai-sdk/anthropic | openai | google | openrouter)
 * are wired in Phase 2 when extraction/reasoning actually calls a model.
 */

export type LlmProvider = "anthropic" | "openai" | "openrouter" | "google";

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string | undefined;
}

const API_KEY_ENV: Record<LlmProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/** Read the active provider config from environment variables. */
export function getLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const provider = (env.LLM_PROVIDER ?? "openrouter") as LlmProvider;
  if (!(provider in API_KEY_ENV)) {
    throw new Error(
      `Unknown LLM_PROVIDER "${provider}". Expected one of: ${Object.keys(
        API_KEY_ENV,
      ).join(", ")}`,
    );
  }
  return {
    provider,
    model: env.LLM_MODEL ?? "anthropic/claude-3.5-sonnet",
    apiKey: env[API_KEY_ENV[provider]],
  };
}

/**
 * Resolve a text-generation model. Not implemented until Phase 2 — kept as a
 * clear seam so the worker can depend on the interface now.
 */
export function getModel(): never {
  throw new Error(
    "getModel() is not wired yet — the LLM provider is connected in Phase 2 (extraction).",
  );
}
