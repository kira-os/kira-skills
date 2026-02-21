import '/workspace/kira/scripts/load-env.js';
/**
 * Kira Router — Message Classification
 *
 * Fast intent classification via DeepSeek (cheap + fast for this task).
 * Falls back to Moonshot/Kimi K2.5 if DeepSeek is unavailable.
 */

import OpenAI from "openai";
import {
  INTENTS,
  CLASSIFY_PROMPT,
  CLASSIFY_MAX_TOKENS,
  CLASSIFY_TEMPERATURE,
  COMMAND_PATTERNS,
  PROVIDERS,
  FALLBACK_ORDER,
} from "./config.js";

/**
 * Create an OpenAI-compatible client for a given provider.
 */
function create_client(provider_name) {
  const provider = PROVIDERS[provider_name];
  if (provider === undefined) {
    throw new Error(`Unknown provider: ${provider_name}`);
  }

  const api_key = process.env[provider.api_key_env];
  if (api_key === undefined || api_key === "") {
    throw new Error(`${provider.api_key_env} is not set`);
  }

  return new OpenAI({
    baseURL: provider.base_url,
    apiKey: api_key,
  });
}

/**
 * Check if the message matches a known command pattern.
 * Returns the command name or null.
 */
function match_command(message) {
  for (const entry of COMMAND_PATTERNS) {
    if (entry.pattern.test(message)) {
      return entry.command;
    }
  }
  return null;
}

/**
 * Run classification against a specific provider/model.
 * Returns the intent string or null on failure.
 */
async function try_classify(provider_name, model, prompt) {
  try {
    const client = create_client(provider_name);
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: CLASSIFY_MAX_TOKENS,
      temperature: CLASSIFY_TEMPERATURE,
    });

    const choice = response.choices[0];
    if (choice === undefined) {
      return null;
    }

    const raw = choice.message.content.trim().toLowerCase();

    for (const intent of INTENTS) {
      if (raw.includes(intent)) {
        return intent;
      }
    }

    return null;
  } catch (err) {
    console.error(`Classification via ${provider_name}/${model} failed: ${err.message}`);
    return null;
  }
}

/**
 * Classify a message into an intent category.
 *
 * Uses DeepSeek for speed. Falls back to Moonshot if DeepSeek fails.
 * Falls back to "chat" if all classification attempts fail.
 *
 * @param {string} message - The user message to classify
 * @returns {Promise<{intent: string, matched_command: string | null}>}
 */
export async function classify_message(message) {
  // Check command patterns first (instant, no LLM call needed)
  const matched_command = match_command(message);
  if (matched_command !== null) {
    return { intent: "command", matched_command };
  }

  // Quick heuristics for obvious cases
  const trimmed = message.trim().toLowerCase();

  if (trimmed.length <= 5) {
    const greeting_words = ["hi", "hey", "gm", "yo", "sup", "hello", "heya"];
    if (greeting_words.includes(trimmed)) {
      return { intent: "greeting", matched_command: null };
    }
  }

  // LLM classification — try DeepSeek first (fast + cheap)
  const prompt = CLASSIFY_PROMPT.replace("{message}", message.slice(0, 500));

  const primary_result = await try_classify("deepseek", "deepseek-chat", prompt);
  if (primary_result !== null) {
    return { intent: primary_result, matched_command: null };
  }

  // Fallback to Moonshot if DeepSeek fails
  const fallback_provider = FALLBACK_ORDER["deepseek"];
  if (fallback_provider !== undefined) {
    console.error("DeepSeek classification failed, falling back to Moonshot");
    const fallback_result = await try_classify("moonshot", "kimi-k2.5", prompt);
    if (fallback_result !== null) {
      return { intent: fallback_result, matched_command: null };
    }
  }

  // Default to chat if all classification fails
  return { intent: "chat", matched_command: null };
}
