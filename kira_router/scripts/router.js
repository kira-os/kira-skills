import '/workspace/kira/scripts/load-env.js';
#!/usr/bin/env node

/**
 * Kira Router CLI — Intelligent message routing for OpenClaw.
 *
 * Usage:
 *   node router.js respond --platform telegram --sender-id "123" --message "hello" [--sender-name "alice"]
 *   node router.js classify --message "Can you help me write a Solana program?"
 *   node router.js status
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY
 *      Optional: MOONSHOT_API_KEY, AVATAR_BRIDGE_URL, AVATAR_BRIDGE_TOKEN, STREAM_BRIDGE_URL
 */

import { classify_message } from "../lib/classify.js";
import { load_context } from "../lib/context_loader.js";
import { generate_response } from "../lib/responder.js";
import { run_background_tasks } from "../lib/background.js";

// ── Parse CLI args ─────────────────────────────────

function parse_args(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }

  return { command, flags };
}

// ── Commands ───────────────────────────────────────

async function cmd_respond(flags) {
  const platform = flags.platform;
  const sender_id = flags["sender-id"];
  const message = flags.message;
  const sender_name = flags["sender-name"];

  if (platform === undefined || sender_id === undefined || message === undefined) {
    console.error(
      "Usage: router.js respond --platform <platform> --sender-id <id> --message <text> [--sender-name <name>]",
    );
    process.exit(1);
  }

  const start_time = Date.now();

  // Step 1: Classify the message
  const { intent, matched_command } = await classify_message(message);

  // Step 2: Load context (runs in parallel internally)
  const context = await load_context({
    platform,
    sender_id,
    message,
    intent,
  });

  // Step 3: Generate response with routed model
  const { response_text, model_used } = await generate_response({
    message,
    intent,
    matched_command,
    context_text: context.context_text,
    sender_name,
    platform,
  });

  const elapsed_ms = Date.now() - start_time;

  // Output response immediately so the agent can send it
  const output = {
    response_text,
    intent,
    model_used,
    user_tier: context.engagement.tier,
    context_loaded: context.context_loaded,
    elapsed_ms,
    background_tasks: [],
  };

  // Print the response JSON first (agent reads this)
  console.log(JSON.stringify(output, null, 2));

  // Step 4: Run background tasks (after response is output)
  const bg_results = await run_background_tasks({
    platform,
    user_id: context.user_id,
    sender_name: sender_name !== undefined ? sender_name : sender_id,
    message,
    response_text,
    intent,
  });

  // Log background results to stderr (not mixed with JSON output)
  console.error(`Background: ${bg_results.join(", ")}`);
}

async function cmd_classify(flags) {
  const message = flags.message;

  if (message === undefined) {
    console.error("Usage: router.js classify --message <text>");
    process.exit(1);
  }

  const start_time = Date.now();
  const { intent, matched_command } = await classify_message(message);
  const elapsed_ms = Date.now() - start_time;

  console.log(JSON.stringify({
    intent,
    matched_command,
    elapsed_ms,
  }, null, 2));
}

async function cmd_status() {
  const checks = {
    supabase_url: process.env.SUPABASE_URL !== undefined && process.env.SUPABASE_URL !== "",
    supabase_key: process.env.SUPABASE_SERVICE_KEY !== undefined && process.env.SUPABASE_SERVICE_KEY !== "",
    openai_key: process.env.OPENAI_API_KEY !== undefined && process.env.OPENAI_API_KEY !== "",
    deepseek_key: process.env.DEEPSEEK_API_KEY !== undefined && process.env.DEEPSEEK_API_KEY !== "",
    moonshot_key: process.env.MOONSHOT_API_KEY !== undefined && process.env.MOONSHOT_API_KEY !== "",
    avatar_bridge: process.env.AVATAR_BRIDGE_URL !== undefined && process.env.AVATAR_BRIDGE_URL !== "",
    stream_bridge: process.env.STREAM_BRIDGE_URL !== undefined && process.env.STREAM_BRIDGE_URL !== "",
  };

  const required_ok = checks.supabase_url && checks.supabase_key && checks.openai_key && checks.moonshot_key;

  console.log(JSON.stringify({
    status: required_ok ? "ok" : "missing_required_env",
    checks,
  }, null, 2));
}

// ── Main ───────────────────────────────────────────

const { command, flags } = parse_args(process.argv);

const commands = {
  respond: cmd_respond,
  classify: cmd_classify,
  status: cmd_status,
};

const handler = commands[command];

if (handler === undefined) {
  console.error("Usage: router.js <respond|classify|status> [options]");
  process.exit(1);
}

try {
  await handler(flags);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
