import '/workspace/kira/scripts/load-env.js';
/**
 * Kira Router — Smart Context Loading
 *
 * Loads only the context relevant to the message intent,
 * instead of loading everything every time.
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

// ── Embedding ─────────────────────────────────────

async function embed(text) {
  const truncated = text.slice(0, EMBEDDING_MAX_CHARS);
  const response = await get_openai().embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncated,
  });
  const first = response.data[0];
  if (first === undefined) {
    throw new Error("OpenAI returned no embedding data");
  }
  return first.embedding;
}

// ── Tier 1: Always Load (fast DB queries) ─────────

/**
 * Look up the user's internal UUID from their platform ID.
 * Returns null if not found.
 */
async function resolve_user_id(platform, sender_id) {
  const sb = get_supabase();
  const { data, error } = await sb
    .from("platform_links")
    .select("user_id")
    .eq("platform", platform)
    .eq("platform_id", sender_id)
    .limit(1);

  if (error !== null || data === null || data.length === 0) {
    return null;
  }
  return data[0].user_id;
}

/**
 * Get engagement score and tier for a user.
 */
async function get_engagement(user_id) {
  if (user_id === null) {
    return { tier: "observer", composite_score: 0, kira_affinity: 0 };
  }

  const sb = get_supabase();
  const { data, error } = await sb
    .from("engagement_scores")
    .select("composite_score, tier, kira_affinity")
    .eq("user_id", user_id)
    .limit(1);

  if (error !== null || data === null || data.length === 0) {
    return { tier: "observer", composite_score: 0, kira_affinity: 0 };
  }

  return data[0];
}

/**
 * Get last N interactions with this user from kira_interaction_log.
 */
async function get_recent_interactions(user_id, limit) {
  if (user_id === null) return [];

  const sb = get_supabase();
  const { data, error } = await sb
    .from("kira_interaction_log")
    .select("direction, message, sentiment, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error !== null || data === null) return [];
  return data;
}

/**
 * Get platform links for a user (to recognize cross-platform identity).
 */
async function get_platform_links(user_id) {
  if (user_id === null) return [];

  const sb = get_supabase();
  const { data, error } = await sb
    .from("platform_links")
    .select("platform, platform_id")
    .eq("user_id", user_id);

  if (error !== null || data === null) return [];
  return data;
}

/**
 * Get relationship data for a user from kira_relationships.
 */
async function get_relationship(user_id) {
  if (user_id === null) return null;

  const sb = get_supabase();
  const { data, error } = await sb.rpc("kira_get_relationship", {
    p_user_id: user_id,
  });

  if (error !== null || data === null) return null;

  // The RPC returns a jsonb object with relationship, user, engagement keys
  const rel = data.relationship;
  if (rel === null || rel === undefined) return null;
  return rel;
}

/**
 * Search knowledge base for relevant entries via vector similarity.
 */
async function search_knowledge(message, limit) {
  const query_embedding = await embed(message);

  const sb = get_supabase();
  const { data, error } = await sb.rpc("kira_search_knowledge", {
    query_embedding,
    type_filter: null,
    topic_filter: null,
    result_limit: limit,
    match_threshold: 0.4,
  });

  if (error !== null || data === null) return [];
  return data;
}

// ── Tier 2: Conditional Load (based on intent) ───

/**
 * Semantic recall from pgvector memories.
 */
async function recall_memories(message, limit) {
  const query_embedding = await embed(message);

  const sb = get_supabase();
  const { data, error } = await sb.rpc("match_memories", {
    query_embedding,
    match_count: limit,
    match_threshold: 0.4,
    filter_channel: null,
  });

  if (error !== null || data === null) return [];

  return data.map((m) => ({
    content: m.content,
    channel: m.channel,
    similarity: Math.round(m.similarity * 1000) / 1000,
  }));
}

/**
 * Get recent channel activity summary.
 */
async function get_channel_summary(channel, hours, limit) {
  const sb = get_supabase();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from("memories")
    .select("content, metadata, created_at")
    .eq("channel", channel)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error !== null || data === null || data.length === 0) return null;

  return data.map((entry) => {
    const sender = entry.metadata?.sender;
    const prefix = sender !== undefined && sender !== null ? String(sender) : channel;
    return `${prefix}: ${entry.content.slice(0, 200)}`;
  }).join("\n");
}

// ── Main Context Loader ───────────────────────────

/**
 * Load context appropriate for the message intent.
 *
 * @param {object} params
 * @param {string} params.platform - telegram, stream_chat, x
 * @param {string} params.sender_id - Platform-specific sender ID
 * @param {string} params.message - The message text
 * @param {string} params.intent - Classified intent
 * @returns {Promise<object>} Context bundle
 */
export async function load_context({ platform, sender_id, message, intent }) {
  // Tier 1: Always load (run in parallel)
  const user_id_promise = resolve_user_id(platform, sender_id);

  // We need user_id for most tier 1 queries, so await it first
  const user_id = await user_id_promise;

  // Run remaining tier 1 queries in parallel with tier 2 queries
  const parallel_tasks = [
    // Tier 1
    get_engagement(user_id),
    get_recent_interactions(user_id, 3),
    get_platform_links(user_id),
    get_relationship(user_id),
  ];

  // Tier 2: Conditional based on intent
  if (intent === "question" || intent === "technical") {
    parallel_tasks.push(recall_memories(message, 5));
  } else {
    parallel_tasks.push(Promise.resolve([]));
  }

  if (intent === "chat") {
    parallel_tasks.push(get_channel_summary(platform, 2, 10));
  } else {
    parallel_tasks.push(Promise.resolve(null));
  }

  // Tier 2: Knowledge search for question/technical intents
  if (intent === "question" || intent === "technical") {
    parallel_tasks.push(search_knowledge(message, 3));
  } else {
    parallel_tasks.push(Promise.resolve([]));
  }

  const [
    engagement,
    recent_interactions,
    platform_links,
    relationship,
    recalled_memories,
    channel_summary,
    knowledge_entries,
  ] = await Promise.all(parallel_tasks);

  // Build context string for the LLM
  const context_parts = [];

  // User identity context
  if (user_id !== null) {
    const link_str = platform_links
      .map((l) => `${l.platform}: ${l.platform_id}`)
      .join(", ");

    context_parts.push(
      `[User] tier=${engagement.tier} score=${engagement.composite_score} affinity=${engagement.kira_affinity}` +
      (link_str.length > 0 ? ` platforms=(${link_str})` : "")
    );
  }

  // Relationship context
  if (relationship !== null) {
    let rel_str = `type=${relationship.relationship_type} affection=${relationship.affection_level} interactions=${relationship.interaction_count}`;
    if (relationship.nickname !== null && relationship.nickname !== undefined) {
      rel_str = `nickname="${relationship.nickname}" ${rel_str}`;
    }
    if (relationship.personality_notes !== null && relationship.personality_notes !== undefined) {
      rel_str += `\nnotes: ${relationship.personality_notes.slice(0, 300)}`;
    }
    if (relationship.last_interaction_summary !== null && relationship.last_interaction_summary !== undefined) {
      rel_str += `\nlast: ${relationship.last_interaction_summary}`;
    }
    if (relationship.is_favorite === true) {
      rel_str += " ★ favorite";
    }
    context_parts.push(`[Relationship] ${rel_str}`);
  }

  // Recent interaction history
  if (recent_interactions.length > 0) {
    const history = recent_interactions.map((i) => {
      const dir = i.direction === "outbound" ? "Kira" : "User";
      return `${dir}: ${i.message.slice(0, 150)}`;
    }).join("\n");
    context_parts.push(`[Recent conversation]\n${history}`);
  }

  // Recalled memories (for questions/technical)
  if (recalled_memories.length > 0) {
    const memories_str = recalled_memories
      .map((m) => `[${m.channel}] ${m.content.slice(0, 200)}`)
      .join("\n");
    context_parts.push(`[Relevant memories]\n${memories_str}`);
  }

  // Channel summary (for chat)
  if (channel_summary !== null) {
    context_parts.push(`[Recent ${platform} activity]\n${channel_summary}`);
  }

  // Relevant knowledge (for questions/technical)
  if (knowledge_entries.length > 0) {
    const knowledge_str = knowledge_entries
      .map((k) => `[${k.knowledge_type}] ${k.topic}: ${k.content.slice(0, 200)} (confidence=${k.confidence})`)
      .join("\n");
    context_parts.push(`[Relevant knowledge]\n${knowledge_str}`);
  }

  return {
    user_id,
    engagement,
    relationship,
    recent_interactions,
    platform_links,
    recalled_memories,
    knowledge_entries,
    channel_summary,
    context_text: context_parts.join("\n\n"),
    context_loaded: context_parts.length,
  };
}
