/** Provider selection + env resolution (leaf module — no imports from the barrel). */

export type LlmProvider =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "google"
  | "mock";

export interface LlmConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string | undefined;
}

const API_KEY_ENV: Record<Exclude<LlmProvider, "mock">, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

const PROVIDERS: LlmProvider[] = [
  "anthropic",
  "openai",
  "openrouter",
  "google",
  "mock",
];

/**
 * Read the active provider config from environment variables. Defaults to the
 * `mock` provider so the app runs end-to-end with no key ($0). Set
 * LLM_PROVIDER + the matching key to switch on real extraction.
 */
export function getLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const provider = (env.LLM_PROVIDER ?? "mock") as LlmProvider;
  if (!PROVIDERS.includes(provider)) {
    throw new Error(
      `Unknown LLM_PROVIDER "${provider}". Expected one of: ${PROVIDERS.join(", ")}`,
    );
  }
  return {
    provider,
    model: env.LLM_MODEL ?? "anthropic/claude-3.5-sonnet",
    apiKey: provider === "mock" ? undefined : env[API_KEY_ENV[provider]],
  };
}
