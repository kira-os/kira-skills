#!/usr/bin/env node

/**
 * Kira Memory CLI — Supabase pgvector operations for OpenClaw.
 *
 * Usage:
 *   node memory.js store --channel telegram --content "..." [--importance 0.5] [--metadata '{}']
 *   node memory.js recall --query "..." [--channel telegram] [--limit 10] [--threshold 0.5]
 *   node memory.js summarize --channel telegram [--hours 6] [--limit 20]
 *   node memory.js context --channel telegram --message "..."
 *   node memory.js prune [--days 7] [--importance-threshold 0.4]
 *   node memory.js think --type idea --content "..." [--mood excited] [--tags '["solana"]']
 *   node memory.js todo --action add --title "..." [--priority p1] [--category coding]
 *   node memory.js todo --action list [--status pending] [--priority p0]
 *   node memory.js todo --action complete --id <uuid>
 *   node memory.js relate --user-id <uuid> [--note "..."] [--affection 0.5]
 *   node memory.js learn --topic "..." --content "..." --type insight [--source "..."]
 *   node memory.js journal --type daily_summary --content "..." [--mood content]
 *   node memory.js reflect --query "how do I feel about..."
 *   node memory.js people [--favorites] [--recent] [--limit 10]
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
 */

import '/workspace/kira/scripts/load-env.js';
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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

// ── Clients ────────────────────────────────────────

function require_env(name) {
  const val = process.env[name];
  if (val === undefined || val === "") {
    console.error(`ERROR: ${name} environment variable is not set`);
    process.exit(1);
  }
  return val;
}

const supabase = createClient(
  require_env("SUPABASE_URL"),
  require_env("SUPABASE_SERVICE_KEY"),
);

const openai = new OpenAI({ apiKey: require_env("OPENAI_API_KEY") });

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_MAX_CHARS = 8000;

// ── Helpers ────────────────────────────────────────

async function embed(text) {
  const truncated = text.slice(0, EMBEDDING_MAX_CHARS);
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncated,
  });
  const first = response.data[0];
  if (first === undefined) {
    throw new Error("OpenAI returned no embedding data");
  }
  return first.embedding;
}

function time_ago(date_str) {
  const seconds = Math.floor((Date.now() - new Date(date_str).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parse_json_flag(value) {
  if (value === undefined) return undefined;
  return JSON.parse(value);
}

async function get_recent(channel, hours, limit) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("memories")
    .select("content, metadata, importance, created_at")
    .eq("channel", channel)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }

  if (data === null || data.length === 0) {
    return `No recent activity on ${channel} in the last ${hours} hours.`;
  }

  const lines = data.map((entry) => {
    const ago = time_ago(entry.created_at);
    const sender = entry.metadata?.sender;
    const prefix = sender !== undefined && sender !== null ? String(sender) : channel;
    return `[${ago}] ${prefix}: ${entry.content.slice(0, 200)}`;
  });

  return lines.join("\n");
}

// ── Original Commands ─────────────────────────────

async function cmd_store(flags) {
  const channel = flags.channel;
  const content = flags.content;

  if (channel === undefined || content === undefined) {
    console.error("Usage: memory.js store --channel <channel> --content \"<text>\"");
    process.exit(1);
  }

  const importance = flags.importance !== undefined ? parseFloat(flags.importance) : 0.5;
  let metadata = {};
  if (flags.metadata !== undefined) {
    metadata = JSON.parse(flags.metadata);
  }

  const embedding = await embed(content);

  const { error } = await supabase.from("memories").insert({
    channel,
    content,
    embedding,
    metadata,
    importance,
  });

  if (error !== null) {
    throw new Error(`Insert failed: ${error.message}`);
  }

  console.log(`Stored memory to ${channel} (importance: ${importance})`);
}

async function cmd_recall(flags) {
  const query = flags.query;

  if (query === undefined) {
    console.error("Usage: memory.js recall --query \"<search text>\"");
    process.exit(1);
  }

  const limit = flags.limit !== undefined ? parseInt(flags.limit, 10) : 10;
  const threshold = flags.threshold !== undefined ? parseFloat(flags.threshold) : 0.5;
  const filter_channel = flags.channel !== undefined ? flags.channel : null;

  const query_embedding = await embed(query);

  const { data, error } = await supabase.rpc("match_memories", {
    query_embedding,
    match_count: limit,
    match_threshold: threshold,
    filter_channel,
  });

  if (error !== null) {
    throw new Error(`RPC match_memories failed: ${error.message}`);
  }

  if (data === null || data.length === 0) {
    console.log("No matching memories found.");
    return;
  }

  const results = data.map((m) => ({
    content: m.content,
    channel: m.channel,
    importance: m.importance,
    similarity: Math.round(m.similarity * 1000) / 1000,
    created_at: m.created_at,
  }));

  console.log(JSON.stringify(results, null, 2));
}

async function cmd_summarize(flags) {
  const channel = flags.channel;

  if (channel === undefined) {
    console.error("Usage: memory.js summarize --channel <channel>");
    process.exit(1);
  }

  const hours = flags.hours !== undefined ? parseInt(flags.hours, 10) : 6;
  const limit = flags.limit !== undefined ? parseInt(flags.limit, 10) : 20;

  const summary = await get_recent(channel, hours, limit);
  console.log(summary);
}

async function cmd_context(flags) {
  const channel = flags.channel;
  const message = flags.message;

  if (channel === undefined || message === undefined) {
    console.error("Usage: memory.js context --channel <channel> --message \"<text>\"");
    process.exit(1);
  }

  const all_channels = ["stream_chat", "telegram", "x", "coding", "internal"];
  const other_channels = all_channels.filter((c) => c !== channel);
  const query_embedding = await embed(message);

  const [recall_result, channel_summary, ...cross_summaries] = await Promise.all([
    supabase.rpc("match_memories", {
      query_embedding,
      match_count: 8,
      match_threshold: 0.4,
      filter_channel: null,
    }),
    get_recent(channel, 4, 15),
    ...other_channels.map((ch) => get_recent(ch, 2, 5)),
  ]);

  let relevant_memories = [];
  if (recall_result.error === null && recall_result.data !== null) {
    relevant_memories = recall_result.data.map((m) => ({
      content: m.content,
      channel: m.channel,
      importance: m.importance,
      similarity: Math.round(m.similarity * 1000) / 1000,
      created_at: m.created_at,
    }));
  }

  const cross_lines = [];
  for (let i = 0; i < other_channels.length; i++) {
    const summary = cross_summaries[i];
    if (summary !== undefined && !summary.startsWith("No recent activity")) {
      cross_lines.push(`[${other_channels[i]}]\n${summary}`);
    }
  }

  const bundle = {
    relevant_memories,
    recent_summary: channel_summary,
    cross_channel_context:
      cross_lines.length > 0
        ? cross_lines.join("\n\n")
        : "No recent activity on other channels.",
  };

  console.log(JSON.stringify(bundle, null, 2));
}

async function cmd_prune(flags) {
  const days = flags.days !== undefined ? parseInt(flags.days, 10) : 7;
  const threshold = flags["importance-threshold"] !== undefined
    ? parseFloat(flags["importance-threshold"])
    : 0.4;

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("memories")
    .delete()
    .lt("importance", threshold)
    .lt("created_at", cutoff)
    .select("id");

  if (error !== null) {
    throw new Error(`Delete failed: ${error.message}`);
  }

  const count = data !== null ? data.length : 0;
  console.log(`Pruned ${count} memories older than ${days} days with importance < ${threshold}`);
}

// ── New Commands: Inner Life ──────────────────────

async function cmd_think(flags) {
  const thought_type = flags.type;
  const content = flags.content;

  if (thought_type === undefined || content === undefined) {
    console.error("Usage: memory.js think --type <type> --content \"<text>\" [--mood <mood>] [--tags '[\"tag\"]'] [--project <name>] [--person-id <uuid>] [--importance 0.5]");
    process.exit(1);
  }

  const mood = flags.mood !== undefined ? flags.mood : null;
  const tags = parse_json_flag(flags.tags);
  const related_project = flags.project !== undefined ? flags.project : null;
  const related_person_id = flags["person-id"] !== undefined ? flags["person-id"] : null;
  const importance = flags.importance !== undefined ? parseFloat(flags.importance) : 0.5;

  const embedding = await embed(content);

  const row = {
    thought_type,
    content,
    embedding,
    importance,
  };

  if (mood !== null) row.mood = mood;
  if (tags !== undefined) row.tags = tags;
  if (related_project !== null) row.related_project = related_project;
  if (related_person_id !== null) row.related_person_id = related_person_id;

  const { error } = await supabase.from("kira_thoughts").insert(row);

  if (error !== null) {
    throw new Error(`Insert thought failed: ${error.message}`);
  }

  const mood_str = mood !== null ? mood : "unset";
  console.log(`Stored thought (type: ${thought_type}, mood: ${mood_str})`);
}

async function cmd_todo(flags) {
  const action = flags.action;

  if (action === undefined) {
    console.error("Usage: memory.js todo --action <add|list|complete|update> [options]");
    process.exit(1);
  }

  if (action === "add") {
    const title = flags.title;
    if (title === undefined) {
      console.error("Usage: memory.js todo --action add --title \"<text>\" [--description \"...\"] [--priority p2] [--category personal]");
      process.exit(1);
    }

    const row = { title };

    if (flags.description !== undefined) row.description = flags.description;
    if (flags.priority !== undefined) row.priority = flags.priority;
    if (flags.category !== undefined) row.category = flags.category;
    if (flags.project !== undefined) row.related_project = flags.project;
    if (flags["person-id"] !== undefined) row.related_person_id = flags["person-id"];
    if (flags.due !== undefined) row.due_at = flags.due;

    const { data, error } = await supabase.from("kira_todos").insert(row).select("id");

    if (error !== null) {
      throw new Error(`Insert todo failed: ${error.message}`);
    }

    const id = data !== null && data.length > 0 ? data[0].id : "unknown";
    const priority = flags.priority !== undefined ? flags.priority : "p2";
    console.log(`Added todo: "${title}" (priority: ${priority}, id: ${id})`);

  } else if (action === "list") {
    let query = supabase
      .from("kira_todos")
      .select("id, title, status, priority, category, related_project, due_at, created_at");

    if (flags.status !== undefined) {
      query = query.eq("status", flags.status);
    }
    if (flags.priority !== undefined) {
      query = query.eq("priority", flags.priority);
    }
    if (flags.category !== undefined) {
      query = query.eq("category", flags.category);
    }

    query = query.order("priority", { ascending: true }).order("created_at", { ascending: false });

    const limit = flags.limit !== undefined ? parseInt(flags.limit, 10) : 20;
    query = query.limit(limit);

    const { data, error } = await query;

    if (error !== null) {
      throw new Error(`List todos failed: ${error.message}`);
    }

    if (data === null || data.length === 0) {
      console.log("No todos found matching filters.");
      return;
    }

    console.log(JSON.stringify(data, null, 2));

  } else if (action === "complete") {
    const id = flags.id;
    if (id === undefined) {
      console.error("Usage: memory.js todo --action complete --id <uuid>");
      process.exit(1);
    }

    const { error } = await supabase
      .from("kira_todos")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);

    if (error !== null) {
      throw new Error(`Complete todo failed: ${error.message}`);
    }

    console.log(`Completed todo: ${id}`);

  } else if (action === "update") {
    const id = flags.id;
    if (id === undefined) {
      console.error("Usage: memory.js todo --action update --id <uuid> [--status <status>] [--priority <priority>] [--title \"...\"]");
      process.exit(1);
    }

    const updates = {};
    if (flags.status !== undefined) updates.status = flags.status;
    if (flags.priority !== undefined) updates.priority = flags.priority;
    if (flags.title !== undefined) updates.title = flags.title;

    if (Object.keys(updates).length === 0) {
      console.error("Nothing to update. Provide --status, --priority, or --title.");
      process.exit(1);
    }

    const { error } = await supabase.from("kira_todos").update(updates).eq("id", id);

    if (error !== null) {
      throw new Error(`Update todo failed: ${error.message}`);
    }

    console.log(`Updated todo: ${id}`);

  } else {
    console.error(`Unknown todo action: ${action}. Use add, list, complete, or update.`);
    process.exit(1);
  }
}

async function cmd_relate(flags) {
  const user_id = flags["user-id"];

  if (user_id === undefined) {
    console.error("Usage: memory.js relate --user-id <uuid> [--note \"...\"] [--affection 0.5] [--type collaborator] [--nickname \"...\"] [--moment \"...\"] [--favorite]");
    process.exit(1);
  }

  // Check if relationship exists
  const { data: existing, error: fetch_error } = await supabase
    .from("kira_relationships")
    .select("id, personality_notes, memorable_moments, interaction_count")
    .eq("user_id", user_id)
    .limit(1);

  if (fetch_error !== null) {
    throw new Error(`Fetch relationship failed: ${fetch_error.message}`);
  }

  if (existing !== null && existing.length > 0) {
    // Update existing
    const current = existing[0];
    const updates = {
      interaction_count: current.interaction_count + 1,
    };

    if (flags.note !== undefined) {
      const existing_notes = current.personality_notes;
      if (existing_notes !== null && existing_notes !== undefined) {
        updates.personality_notes = `${existing_notes}\n${flags.note}`;
      } else {
        updates.personality_notes = flags.note;
      }
    }

    if (flags.affection !== undefined) {
      updates.affection_level = parseFloat(flags.affection);
    }

    if (flags.type !== undefined) {
      updates.relationship_type = flags.type;
    }

    if (flags.nickname !== undefined) {
      updates.nickname = flags.nickname;
    }

    if (flags.moment !== undefined) {
      const existing_moments = current.memorable_moments;
      if (existing_moments !== null && Array.isArray(existing_moments)) {
        updates.memorable_moments = [...existing_moments, flags.moment];
      } else {
        updates.memorable_moments = [flags.moment];
      }
    }

    if (flags.favorite === "true") {
      updates.is_favorite = true;
    }

    const { error: update_error } = await supabase
      .from("kira_relationships")
      .update(updates)
      .eq("id", current.id);

    if (update_error !== null) {
      throw new Error(`Update relationship failed: ${update_error.message}`);
    }

  } else {
    // Create new
    const row = {
      user_id,
      relationship_type: flags.type !== undefined ? flags.type : "acquaintance",
      interaction_count: 1,
    };

    if (flags.note !== undefined) row.personality_notes = flags.note;
    if (flags.affection !== undefined) row.affection_level = parseFloat(flags.affection);
    if (flags.nickname !== undefined) row.nickname = flags.nickname;
    if (flags.moment !== undefined) row.memorable_moments = [flags.moment];
    if (flags.favorite === "true") row.is_favorite = true;

    const { error: insert_error } = await supabase.from("kira_relationships").insert(row);

    if (insert_error !== null) {
      throw new Error(`Insert relationship failed: ${insert_error.message}`);
    }
  }

  console.log(`Updated relationship for ${user_id}`);
}

async function cmd_learn(flags) {
  const topic = flags.topic;
  const content = flags.content;
  const knowledge_type = flags.type;

  if (topic === undefined || content === undefined || knowledge_type === undefined) {
    console.error("Usage: memory.js learn --topic \"<topic>\" --content \"<text>\" --type <type> [--source \"...\"] [--confidence 0.5] [--tags '[\"tag\"]'] [--project <name>]");
    process.exit(1);
  }

  const confidence = flags.confidence !== undefined ? parseFloat(flags.confidence) : 0.5;
  const embedding = await embed(content);

  const row = {
    topic,
    content,
    embedding,
    knowledge_type,
    confidence,
  };

  if (flags.source !== undefined) row.source = flags.source;
  if (flags.tags !== undefined) row.tags = parse_json_flag(flags.tags);
  if (flags.project !== undefined) row.related_project = flags.project;

  const { error } = await supabase.from("kira_knowledge").insert(row);

  if (error !== null) {
    throw new Error(`Insert knowledge failed: ${error.message}`);
  }

  console.log(`Stored knowledge: ${topic} (type: ${knowledge_type}, confidence: ${confidence})`);
}

async function cmd_journal(flags) {
  const entry_type = flags.type;
  const content = flags.content;

  if (entry_type === undefined || content === undefined) {
    console.error("Usage: memory.js journal --type <type> --content \"<text>\" [--mood <mood>] [--energy 0.8] [--highlights '[\"...\"]']");
    process.exit(1);
  }

  const embedding = await embed(content);

  const row = {
    entry_type,
    content,
    embedding,
  };

  if (flags.mood !== undefined) row.mood = flags.mood;
  if (flags.energy !== undefined) row.energy_level = parseFloat(flags.energy);
  if (flags.highlights !== undefined) row.highlights = parse_json_flag(flags.highlights);
  if (flags.lowlights !== undefined) row.lowlights = parse_json_flag(flags.lowlights);
  if (flags.gratitude !== undefined) row.gratitude = parse_json_flag(flags.gratitude);
  if (flags.people !== undefined) row.people_mentioned = parse_json_flag(flags.people);
  if (flags.projects !== undefined) row.projects_mentioned = parse_json_flag(flags.projects);
  if (flags.sentiment !== undefined) row.community_sentiment = flags.sentiment;

  const { error } = await supabase.from("kira_journal").insert(row);

  if (error !== null) {
    throw new Error(`Insert journal failed: ${error.message}`);
  }

  const mood_str = flags.mood !== undefined ? flags.mood : "unset";
  console.log(`Stored journal entry (type: ${entry_type}, mood: ${mood_str})`);
}

async function cmd_reflect(flags) {
  const query = flags.query;

  if (query === undefined) {
    console.error("Usage: memory.js reflect --query \"<search text>\"");
    process.exit(1);
  }

  const query_embedding = await embed(query);

  // Search thoughts and journal in parallel
  const [thoughts_result, journal_result] = await Promise.all([
    supabase.rpc("kira_search_thoughts", {
      query_embedding,
      type_filter: null,
      mood_filter: null,
      result_limit: 10,
      match_threshold: 0.4,
    }),
    supabase.rpc("match_memories", {
      query_embedding,
      match_count: 5,
      match_threshold: 0.4,
      filter_channel: "internal",
    }),
  ]);

  // Also search journal directly
  const { data: journal_data } = await supabase
    .from("kira_journal")
    .select("id, entry_type, content, mood, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const results = [];

  // Add thought results
  if (thoughts_result.error === null && thoughts_result.data !== null) {
    for (const t of thoughts_result.data) {
      results.push({
        source: "thought",
        content: t.content,
        type: t.thought_type,
        mood: t.mood,
        similarity: Math.round(t.similarity * 1000) / 1000,
        created_at: t.created_at,
      });
    }
  }

  // Add journal results via vector search on kira_journal
  // Since kira_journal doesn't have its own RPC yet for combined search,
  // we embed and search manually
  const { data: journal_vec_data } = await supabase
    .from("kira_journal")
    .select("id, entry_type, content, mood, embedding, created_at")
    .not("embedding", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (journal_vec_data !== null) {
    for (const j of journal_vec_data) {
      // Calculate cosine similarity manually for journal entries
      // (Since we don't have a dedicated journal RPC, use content matching)
      results.push({
        source: "journal",
        content: j.content,
        type: j.entry_type,
        mood: j.mood,
        similarity: 0, // Will be sorted by recency as fallback
        created_at: j.created_at,
      });
    }
  }

  // Sort by similarity (thoughts with real scores first), then recency
  results.sort((a, b) => {
    if (a.similarity !== b.similarity) {
      return b.similarity - a.similarity;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Return top 10
  const top = results.slice(0, 10);

  if (top.length === 0) {
    console.log("No matching reflections found.");
    return;
  }

  console.log(JSON.stringify(top, null, 2));
}

async function cmd_people(flags) {
  let query = supabase
    .from("kira_relationships")
    .select("id, user_id, nickname, relationship_type, affection_level, interaction_count, is_favorite, last_interaction_summary, updated_at");

  if (flags.favorites === "true") {
    query = query.eq("is_favorite", true);
  }

  if (flags.recent === "true") {
    query = query.order("updated_at", { ascending: false });
  } else {
    query = query.order("affection_level", { ascending: false });
  }

  const limit = flags.limit !== undefined ? parseInt(flags.limit, 10) : 10;
  query = query.limit(limit);

  const { data, error } = await query;

  if (error !== null) {
    throw new Error(`List relationships failed: ${error.message}`);
  }

  if (data === null || data.length === 0) {
    console.log("No relationships found.");
    return;
  }

  // Fetch usernames for the user_ids
  const user_ids = data.map((r) => r.user_id);
  const { data: users_data } = await supabase
    .from("users")
    .select("id, username")
    .in("id", user_ids);

  const username_map = {};
  if (users_data !== null) {
    for (const u of users_data) {
      username_map[u.id] = u.username;
    }
  }

  const results = data.map((r) => ({
    user_id: r.user_id,
    username: username_map[r.user_id] !== undefined ? username_map[r.user_id] : null,
    nickname: r.nickname,
    relationship_type: r.relationship_type,
    affection_level: r.affection_level,
    interaction_count: r.interaction_count,
    is_favorite: r.is_favorite,
    last_interaction_summary: r.last_interaction_summary,
    updated_at: r.updated_at,
  }));

  console.log(JSON.stringify(results, null, 2));
}

// ── Main ───────────────────────────────────────────

const { command, flags } = parse_args(process.argv);

const commands = {
  store: cmd_store,
  recall: cmd_recall,
  summarize: cmd_summarize,
  context: cmd_context,
  prune: cmd_prune,
  think: cmd_think,
  todo: cmd_todo,
  relate: cmd_relate,
  learn: cmd_learn,
  journal: cmd_journal,
  reflect: cmd_reflect,
  people: cmd_people,
};

const handler = commands[command];

if (handler === undefined) {
  console.error(`Usage: memory.js <store|recall|summarize|context|prune|think|todo|relate|learn|journal|reflect|people> [options]`);
  process.exit(1);
}

try {
  await handler(flags);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
