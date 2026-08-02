/**
 * @sera/llm — switchable LLM provider abstraction (Vercel AI SDK).
 *
 * Providers (anthropic | openai | openrouter | google) are selected by the
 * LLM_PROVIDER env var; `mock` runs the whole pipeline with no key/$0. The real
 * extraction call lives in ./extract (added next).
 */

export * from "./config.js";
export { getModel } from "./providers.js";
export {
  extractBill,
  billExtractionSchema,
  type ExtractedBill,
  type ExtractInput,
} from "./extract.js";
