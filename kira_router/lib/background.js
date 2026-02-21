import '/workspace/kira/scripts/load-env.js';
/**
 * Kira Router — Background Tasks
 *
 * Post-response async tasks that run after the response is sent.
 * All tasks are fire-and-forget — errors are logged but don't block.
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { EMBEDDING_MODEL, EMBEDDING_MAX_CHARS } from "./config.js";

// ── Clients (lazy init) ───────────────────────────

let _supabase = null;
let _openai = null;

function get_supabase() {
  if (_supabase !== null) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (url === undefined || url === "" || key === undefined || key === "") {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  _supabase = createClient(url, key);
  return _supabase;
}

function get_openai() {
  if (_openai !== null) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (key === undefined || key === "") {
    throw new Error("OPENAI_API_KEY must be set");
  }
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

// ── Individual tasks ──────────────────────────────

/**
 * Store the exchange as a memory with embedding.
 */
async function store_memory(platform, message, response_text, importance) {
  const content = `[${platform}] User: ${message}\nKira: ${response_text}`;
  const truncated = content.slice(0, EMBEDDING_MAX_CHARS);

  const embedding_response = await get_openai().embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncated,
  });

  const first = embedding_response.data[0];
  if (first === undefined) {
    throw new Error("OpenAI returned no embedding data");
  }

  const channel = platform === "stream_chat" ? "stream_chat" : platform;

  const { error } = await get_supabase().from("memories").insert({
    channel,
    content,
    embedding: first.embedding,
    metadata: { source: "kira_router" },
    importance,
  });

  if (error !== null) {
    throw new Error(`Memory insert failed: ${error.message}`);
  }
}

/**
 * Log an engagement event for the user.
 */
async function log_engagement_event(user_id, event_type) {
  if (user_id === null) return;

  const platform = event_type.startsWith("telegram_") ? "telegram"
    : event_type.startsWith("x_") ? "x"
    : "kira";

  const { error } = await get_supabase().from("engagement_events").insert({
    user_id,
    event_type,
    platform,
    points: 1,
    metadata: { source: "kira_router" },
  });

  if (error !== null) {
    throw new Error(`Engagement log failed: ${error.message}`);
  }

  // Update last_message_at timestamp
  const timestamp_field = platform === "telegram" ? "last_message_at" : "last_x_interaction_at";
  await get_supabase()
    .from("engagement_scores")
    .update({ [timestamp_field]: new Date().toISOString() })
    .eq("user_id", user_id);
}

/**
 * Log the interaction to kira_interaction_log.
 */
async function log_interaction(user_id, platform, message, response_text, sentiment) {
  if (user_id === null) return;

  // Log to typed platform tables
  const session_id = `${platform}-${user_id}-${new Date().toISOString().slice(0,10)}`;
  const rows = [
    { platform, message_role: "user", content: message.slice(0, 4000), session_id, author_id: String(user_id), timestamp: new Date().toISOString(), metadata: { source: "router" } },
    { platform, message_role: "assistant", content: response_text.slice(0, 4000), session_id, timestamp: new Date().toISOString(), metadata: { source: "router", sentiment } },
  ];

  // Write to platform-specific table (telegram_log for telegram, conversations as fallback)
  if (platform === "telegram") {
    await get_supabase().from("kira_telegram_log").insert(
      rows.map(r => ({ ...r, has_tool_calls: false }))
    );
  } else if (platform === "discord" || platform === "website") {
    await get_supabase().from("kira_community_messages").insert(
      rows.map(r => ({ platform, channel: null, author_id: r.author_id, content: r.content, timestamp: r.timestamp, metadata: r.metadata }))
    );
  }

  // Always write to kira_conversations as generic log (backward compat)
  await get_supabase().from("kira_conversations").insert(rows);

  // Log inbound message
  const { error: in_error } = await get_supabase().from("kira_interaction_log").insert({
    user_id,
    platform,
    direction: "inbound",
    message: message.slice(0, 2000),
    context: "routed_response",
    sentiment: "neutral",
  });

  if (in_error !== null) {
    console.error(`Inbound log failed: ${in_error.message}`);
  }

  // Log outbound response
  const { error: out_error } = await get_supabase().from("kira_interaction_log").insert({
    user_id,
    platform,
    direction: "outbound",
    message: response_text.slice(0, 2000),
    context: "routed_response",
    sentiment: sentiment,
  });

  if (out_error !== null) {
    throw new Error(`Outbound log failed: ${out_error.message}`);
  }
}

/**
 * Speak on the avatar bridge (fire-and-forget HTTP call).
 */
async function speak_on_bridge(response_text, emotion) {
  const bridge_url = process.env.AVATAR_BRIDGE_URL;
  const bridge_token = process.env.AVATAR_BRIDGE_TOKEN;

  if (bridge_url === undefined || bridge_url === "") return;

  // Trim response for speech (max ~200 chars for natural speech)
  const speech_text = response_text.length > 200
    ? response_text.slice(0, 197) + "..."
    : response_text;

  const url = `${bridge_url}/speak`;
  const headers = { "Content-Type": "application/json" };
  if (bridge_token !== undefined && bridge_token !== "") {
    headers["Authorization"] = `Bearer ${bridge_token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: speech_text, emotion }),
  });

  if (!response.ok) {
    throw new Error(`Bridge speak failed: ${response.status}`);
  }
}

/**
 * Push a thought to the dashboard via stream bridge.
 */
async function push_thought(thought_text, thought_type) {
  const stream_url = process.env.STREAM_BRIDGE_URL;
  if (stream_url === undefined || stream_url === "") {
    // Fall back to localhost
    const fallback_url = "http://localhost:8766";
    try {
      await fetch(`${fallback_url}/thought`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: thought_text, type: thought_type }),
      });
    } catch (_) {
      // Silent fail — dashboard might not be running
    }
    return;
  }

  await fetch(`${stream_url}/thought`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: thought_text, type: thought_type }),
  });
}

/**
 * Update relationship tracking for the user after every response.
 */
async function update_relationship(user_id, sender_name, message, response_text, platform) {
  if (user_id === null) return;

  const sb = get_supabase();

  // Build a concise summary of the exchange
  const msg_preview = message.length > 80 ? message.slice(0, 77) + "..." : message;
  const resp_preview = response_text.length > 80 ? response_text.slice(0, 77) + "..." : response_text;
  const summary = `[${platform}] User: ${msg_preview} | Kira: ${resp_preview}`.slice(0, 200);

  // Check if relationship exists
  const { data: existing, error: select_error } = await sb
    .from("kira_relationships")
    .select("id, interaction_count")
    .eq("user_id", user_id)
    .limit(1);

  if (select_error !== null) {
    throw new Error(`Relationship select failed: ${select_error.message}`);
  }

  if (existing !== null && existing.length > 0) {
    // Update existing relationship
    const row = existing[0];
    const { error: update_error } = await sb
      .from("kira_relationships")
      .update({
        interaction_count: row.interaction_count + 1,
        last_interaction_summary: summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (update_error !== null) {
      throw new Error(`Relationship update failed: ${update_error.message}`);
    }
  } else {
    // Insert new relationship
    const first_met = `[${platform}] ${msg_preview}`;
    const { error: insert_error } = await sb
      .from("kira_relationships")
      .insert({
        user_id,
        relationship_type: "acquaintance",
        interaction_count: 1,
        first_met_context: first_met,
        last_interaction_summary: summary,
      });

    if (insert_error !== null) {
      throw new Error(`Relationship insert failed: ${insert_error.message}`);
    }
  }
}

// ── Main background runner ────────────────────────

/**
 * Derive importance for memory storage based on intent.
 */
function derive_importance(intent) {
  const importance_map = {
    greeting: 0.2,
    chat: 0.3,
    question: 0.5,
    technical: 0.6,
    feedback: 0.7,
    command: 0.3,
    spam: 0.1,
  };
  const val = importance_map[intent];
  return val !== undefined ? val : 0.3;
}

/**
 * Derive emotion for bridge speech based on intent.
 */
function derive_emotion(intent) {
  const emotion_map = {
    greeting: "happy",
    chat: "neutral",
    question: "thinking",
    technical: "thinking",
    feedback: "neutral",
    command: "neutral",
  };
  const val = emotion_map[intent];
  return val !== undefined ? val : "neutral";
}

/**
 * Run all background tasks after the response has been sent.
 *
 * @param {object} context
 * @param {string} context.platform
 * @param {string | null} context.user_id
 * @param {string} context.sender_name
 * @param {string} context.message
 * @param {string} context.response_text
 * @param {string} context.intent
 * @returns {Promise<string[]>} Array of task results ("ok" or error message)
 */
export async function run_background_tasks(context) {
  const importance = derive_importance(context.intent);
  const emotion = derive_emotion(context.intent);
  const event_type = `${context.platform}_message`;

  // Don't do background work for spam
  if (context.intent === "spam") {
    return ["skipped_spam"];
  }

  // Don't store empty responses
  if (context.response_text.length === 0) {
    return ["skipped_empty"];
  }

  const tasks = [
    store_memory(
      context.platform,
      context.message,
      context.response_text,
      importance,
    ),
    log_engagement_event(context.user_id, event_type),
    log_interaction(
      context.user_id,
      context.platform,
      context.message,
      context.response_text,
      "neutral",
    ),
    speak_on_bridge(context.response_text, emotion),
    push_thought(
      `Replied to ${context.sender_name} on ${context.platform}`,
      "response",
    ),
    update_relationship(
      context.user_id,
      context.sender_name,
      context.message,
      context.response_text,
      context.platform,
    ),
  ];

  const results = await Promise.allSettled(tasks);
  const task_names = [
    "memory_stored",
    "engagement_logged",
    "interaction_logged",
    "bridge_spoke",
    "thought_pushed",
    "relationship_updated",
  ];

  return results.map((r, i) => {
    if (r.status === "fulfilled") {
      return task_names[i];
    }
    console.error(`Background task ${task_names[i]} failed: ${r.reason.message}`);
    return `${task_names[i]}_failed`;
  });
}
