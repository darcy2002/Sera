import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { getLlmConfig } from "./config.js";

/**
 * Resolve the active LanguageModel for the real providers. The `mock` provider
 * never reaches here — extractBill() short-circuits it with canned data — so
 * this stays a pure provider switch.
 */
export function getModel(): LanguageModel {
  const { provider, model, apiKey } = getLlmConfig();
  switch (provider) {
    case "anthropic":
      return anthropic(model);
    case "openai":
      return openai(model);
    case "google":
      return google(model);
    case "openrouter":
      return createOpenRouter({ apiKey })(model);
    case "mock":
      throw new Error(
        "getModel() is not used for the mock provider; extractBill() returns canned data.",
      );
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unhandled provider: ${String(exhaustive)}`);
    }
  }
}
