#!/usr/bin/env node

/**
 * Kira Desktop Vision — Screenshot + Kimi K2.5 Visual Description
 *
 * Takes a screenshot via the desktop bridge API (POST /screenshot),
 * sends the base64 PNG to Kimi K2.5's multimodal vision model, and
 * returns a text description of what's on screen.
 *
 * Usage:
 *   node skills/kira_desktop/scripts/describe.js
 *   node skills/kira_desktop/scripts/describe.js --prompt "What windows are open?"
 *   node skills/kira_desktop/scripts/describe.js --prompt "Is there an error on screen?"
 *
 * Env:
 *   DESKTOP_BRIDGE_URL  — Desktop bridge API URL (default: http://localhost:9222)
 *   MOONSHOT_API_KEY    — Kimi K2.5 API key (multimodal model)
 */

import OpenAI from "openai";

// ── Config ───────────────────────────────────────────

const BRIDGE_URL = process.env.DESKTOP_BRIDGE_URL || "http://localhost:9222";
const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY;
const MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";
const VISION_MODEL = "kimi-k2.5";
const MAX_TOKENS = 1024;

const DEFAULT_PROMPT = "Describe what you see on this desktop screenshot. Include: what applications or windows are open, what content is visible, any errors or notifications, and the general state of the workspace. Be concise but thorough.";

// ── Arg parsing ──────────────────────────────────────

function parse_args(argv) {
  const result = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        result[key] = argv[i + 1];
        i += 2;
      } else {
        result[key] = true;
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return result;
}

// ── Screenshot capture via bridge API ────────────────

async function capture_screenshot() {
  const url = `${BRIDGE_URL}/screenshot`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bridge POST /screenshot returned ${response.status}: ${text}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Screenshot failed: ${data.error || JSON.stringify(data)}`);
  }

  const image_b64 = data.image_base64;
  if (!image_b64 || image_b64.length < 100) {
    throw new Error("Screenshot returned empty or invalid image data");
  }

  return {
    image_base64: image_b64,
    width: data.width || 1920,
    height: data.height || 1080,
    format: data.format || "png",
  };
}

// ── Vision analysis ──────────────────────────────────

async function describe_screenshot(image_base64, format, prompt) {
  if (!MOONSHOT_API_KEY) {
    throw new Error("MOONSHOT_API_KEY not set — required for Kimi K2.5 vision");
  }

  const client = new OpenAI({
    apiKey: MOONSHOT_API_KEY,
    baseURL: MOONSHOT_BASE_URL,
  });

  const data_uri = `data:image/${format};base64,${image_base64}`;

  const start = Date.now();

  const completion = await client.chat.completions.create({
    model: VISION_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: "You are Kira's visual perception system. You analyze desktop screenshots to help Kira understand what's happening on her workspace screen. Be precise and actionable in your descriptions. Focus on what's relevant for an AI agent managing a coding workspace.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: data_uri },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  });

  const elapsed_ms = Date.now() - start;
  const description = completion.choices[0].message.content;
  const tokens_used = completion.usage
    ? completion.usage.prompt_tokens + completion.usage.completion_tokens
    : null;

  return {
    description,
    model: VISION_MODEL,
    elapsed_ms,
    tokens_used,
  };
}

// ── Main ─────────────────────────────────────────────

async function main() {
  const args = parse_args(process.argv.slice(2));
  const prompt = args.prompt || DEFAULT_PROMPT;

  const start_total = Date.now();

  // Step 1: Capture screenshot via bridge API
  process.stderr.write("Capturing screenshot via bridge...\n");
  const screenshot = await capture_screenshot();
  const screenshot_ms = Date.now() - start_total;
  process.stderr.write(
    `Screenshot captured (${screenshot.width}x${screenshot.height}, ${Math.round(screenshot.image_base64.length / 1024)}KB) in ${screenshot_ms}ms\n`,
  );

  // Step 2: Send to Kimi K2.5 for visual analysis
  process.stderr.write(`Analyzing with ${VISION_MODEL}...\n`);
  const result = await describe_screenshot(
    screenshot.image_base64,
    screenshot.format,
    prompt,
  );

  const total_ms = Date.now() - start_total;

  // Output JSON to stdout
  const output = {
    description: result.description,
    model: result.model,
    screenshot_size: `${screenshot.width}x${screenshot.height}`,
    elapsed_ms: total_ms,
    vision_ms: result.elapsed_ms,
    tokens_used: result.tokens_used,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
});
