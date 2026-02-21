#!/usr/bin/env node

/**
 * Kira Engagement CLI — scoring and community prioritization for OpenClaw.
 *
 * Usage:
 *   node engagement.js score --user-id <uuid>
 *   node engagement.js leaderboard [--limit 10]
 *   node engagement.js rate --user-id <uuid> --delta <float> --reason "..."
 *   node engagement.js log --user-id <uuid> --event <type> [--points <n>] [--metadata '{}']
 *   node engagement.js recalculate [--user-id <uuid>]
 *   node engagement.js priority --platform <telegram|x> [--limit 10]
 *   node engagement.js link --user-id <uuid> --platform <name> --platform-id <id>
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from "@supabase/supabase-js";

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

// ── Env helpers ────────────────────────────────────

function require_env(name) {
  const val = process.env[name];
  if (val === undefined || val === "") {
    console.error(`ERROR: ${name} environment variable is not set`);
    process.exit(1);
  }
  return val;
}

// ── Clients ────────────────────────────────────────

const supabase = createClient(
  require_env("SUPABASE_URL"),
  require_env("SUPABASE_SERVICE_KEY"),
);

// ── Constants ──────────────────────────────────────

const DEFAULT_POINTS = {
  telegram_message: 1,
  x_like: 3,
  x_reply: 5,
  x_repost: 8,
  token_buy: 0,
  token_sell: 0,
  kira_upvote: 15,
  kira_downvote: -20,
};

const WEIGHTS = {
  telegram: 0.20,
  x: 0.25,
  token: 0.30,
  affinity: 0.25,
};

// ── Helpers ────────────────────────────────────────

function derive_tier(score) {
  if (score >= 80) return "inner_circle";
  if (score >= 60) return "champion";
  if (score >= 40) return "supporter";
  if (score >= 20) return "participant";
  return "observer";
}

async function ensure_engagement_row(user_id) {
  const { data, error } = await supabase
    .from("engagement_scores")
    .select("id")
    .eq("user_id", user_id)
    .limit(1);

  if (error !== null) {
    throw new Error(`Query failed: ${error.message}`);
  }

  if (data === null || data.length === 0) {
    const { error: insert_error } = await supabase
      .from("engagement_scores")
      .insert({ user_id });

    if (insert_error !== null) {
      // Ignore unique constraint violation (concurrent insert)
      if (!insert_error.message.includes("duplicate")) {
        throw new Error(`Insert failed: ${insert_error.message}`);
      }
    }
  }
}

// ── Commands ───────────────────────────────────────

async function cmd_score(flags) {
  const user_id = flags["user-id"];
  if (user_id === undefined) {
    console.error("Usage: engagement.js score --user-id <uuid>");
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("engagement_scores")
    .select("*")
    .eq("user_id", user_id)
    .limit(1);

  if (error !== null) {
    throw new Error(`Query failed: ${error.message}`);
  }

  if (data === null || data.length === 0) {
    console.log(`No engagement data found for user: ${user_id}`);
    return;
  }

  const score = data[0];
  console.log(JSON.stringify({
    user_id: score.user_id,
    composite_score: score.composite_score,
    tier: score.tier,
    kira_affinity: score.kira_affinity,
    kira_affinity_reason: score.kira_affinity_reason,
    telegram_message_count: score.telegram_message_count,
    telegram_message_count_7d: score.telegram_message_count_7d,
    x_like_count: score.x_like_count,
    x_reply_count: score.x_reply_count,
    x_repost_count: score.x_repost_count,
    x_engagement_7d: score.x_engagement_7d,
    token_balance: score.token_balance,
    token_balance_usd: score.token_balance_usd,
    last_message_at: score.last_message_at,
    last_x_interaction_at: score.last_x_interaction_at,
    updated_at: score.updated_at,
  }, null, 2));
}

async function cmd_leaderboard(flags) {
  const limit = flags.limit !== undefined ? parseInt(flags.limit, 10) : 10;

  const { data, error } = await supabase
    .from("engagement_scores")
    .select("user_id, composite_score, tier, kira_affinity")
    .order("composite_score", { ascending: false })
    .limit(limit);

  if (error !== null) {
    throw new Error(`Query failed: ${error.message}`);
  }

  if (data === null || data.length === 0) {
    console.log("No engagement data found.");
    return;
  }

  console.log("=== Engagement Leaderboard ===");
  console.log("");
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const rank = i + 1;
    console.log(
      `${rank}. [${entry.tier}] score=${entry.composite_score.toFixed(1)} affinity=${entry.kira_affinity.toFixed(2)} — ${entry.user_id}`,
    );
  }
}

async function cmd_rate(flags) {
  const user_id = flags["user-id"];
  const delta_str = flags.delta;
  const reason = flags.reason;

  if (user_id === undefined || delta_str === undefined || reason === undefined) {
    console.error("Usage: engagement.js rate --user-id <uuid> --delta <float> --reason \"...\"");
    process.exit(1);
  }

  const delta = parseFloat(delta_str);

  await ensure_engagement_row(user_id);

  // Fetch current affinity
  const { data, error } = await supabase
    .from("engagement_scores")
    .select("kira_affinity")
    .eq("user_id", user_id)
    .limit(1);

  if (error !== null) {
    throw new Error(`Query failed: ${error.message}`);
  }

  if (data === null || data.length === 0) {
    throw new Error(`No engagement row found for user: ${user_id}`);
  }

  const current = data[0].kira_affinity;
  const new_affinity = Math.max(-1.0, Math.min(1.0, current + delta));

  const { error: update_error } = await supabase
    .from("engagement_scores")
    .update({
      kira_affinity: new_affinity,
      kira_affinity_reason: reason,
    })
    .eq("user_id", user_id);

  if (update_error !== null) {
    throw new Error(`Update failed: ${update_error.message}`);
  }

  // Log the event
  const event_type = delta >= 0 ? "kira_upvote" : "kira_downvote";
  const points = delta >= 0 ? DEFAULT_POINTS.kira_upvote : DEFAULT_POINTS.kira_downvote;

  const { error: log_error } = await supabase.from("engagement_events").insert({
    user_id,
    event_type,
    platform: "kira",
    points,
    metadata: { delta, reason },
  });

  if (log_error !== null) {
    console.error(`Warning: failed to log event: ${log_error.message}`);
  }

  console.log(`Rated user ${user_id}: affinity ${current.toFixed(2)} → ${new_affinity.toFixed(2)} (${reason})`);
}

async function cmd_log(flags) {
  const user_id = flags["user-id"];
  const event_type = flags.event;

  if (user_id === undefined || event_type === undefined) {
    console.error("Usage: engagement.js log --user-id <uuid> --event <type> [--points <n>]");
    process.exit(1);
  }

  const default_points = DEFAULT_POINTS[event_type];
  const points = flags.points !== undefined
    ? parseInt(flags.points, 10)
    : (default_points !== undefined ? default_points : 0);

  let metadata = {};
  if (flags.metadata !== undefined) {
    metadata = JSON.parse(flags.metadata);
  }

  // Derive platform from event type
  let platform = "kira";
  if (event_type.startsWith("telegram_")) platform = "telegram";
  if (event_type.startsWith("x_")) platform = "x";
  if (event_type.startsWith("token_")) platform = "solana";

  const { error } = await supabase.from("engagement_events").insert({
    user_id,
    event_type,
    platform,
    points,
    metadata,
  });

  if (error !== null) {
    throw new Error(`Insert failed: ${error.message}`);
  }

  await ensure_engagement_row(user_id);

  // Update timestamp on engagement_scores
  const timestamp_field = platform === "telegram" ? "last_message_at" : "last_x_interaction_at";
  const { error: ts_error } = await supabase
    .from("engagement_scores")
    .update({ [timestamp_field]: new Date().toISOString() })
    .eq("user_id", user_id);

  if (ts_error !== null) {
    console.error(`Warning: failed to update timestamp: ${ts_error.message}`);
  }

  console.log(`Logged: ${event_type} for ${user_id} (${points} points)`);
}

async function cmd_recalculate(flags) {
  const single_user_id = flags["user-id"];

  // Get all users with engagement scores (or just one)
  let query = supabase.from("engagement_scores").select("user_id, token_balance, kira_affinity");
  if (single_user_id !== undefined) {
    query = query.eq("user_id", single_user_id);
  }

  const { data: users, error } = await query;

  if (error !== null) {
    throw new Error(`Query failed: ${error.message}`);
  }

  if (users === null || users.length === 0) {
    console.log("No users to recalculate.");
    return;
  }

  const seven_days_ago = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Collect raw signals for all users
  const user_signals = [];

  for (const user of users) {
    const uid = user.user_id;

    // Count 7-day events by type
    const { data: events, error: ev_error } = await supabase
      .from("engagement_events")
      .select("event_type, points")
      .eq("user_id", uid)
      .gte("created_at", seven_days_ago);

    if (ev_error !== null) {
      console.error(`Warning: failed to fetch events for ${uid}: ${ev_error.message}`);
      continue;
    }

    let telegram_7d = 0;
    let x_engagement_7d = 0;
    let telegram_total_points = 0;
    let x_total_points = 0;

    if (events !== null) {
      for (const ev of events) {
        if (ev.event_type === "telegram_message") {
          telegram_7d++;
          telegram_total_points += ev.points;
        } else if (ev.event_type === "x_like" || ev.event_type === "x_reply" || ev.event_type === "x_repost") {
          x_engagement_7d++;
          x_total_points += ev.points;
        }
      }
    }

    user_signals.push({
      user_id: uid,
      telegram_7d: telegram_total_points,
      x_7d: x_total_points,
      token_balance: Number(user.token_balance),
      kira_affinity: user.kira_affinity,
      telegram_count_7d: telegram_7d,
      x_count_7d: x_engagement_7d,
    });
  }

  // Find max values for normalization
  let max_telegram = 0;
  let max_x = 0;
  let max_token = 0;
  let max_affinity = 0;

  for (const s of user_signals) {
    if (s.telegram_7d > max_telegram) max_telegram = s.telegram_7d;
    if (s.x_7d > max_x) max_x = s.x_7d;
    if (s.token_balance > max_token) max_token = s.token_balance;
    const abs_affinity = Math.abs(s.kira_affinity);
    if (abs_affinity > max_affinity) max_affinity = abs_affinity;
  }

  // Avoid division by zero
  if (max_telegram === 0) max_telegram = 1;
  if (max_x === 0) max_x = 1;
  if (max_token === 0) max_token = 1;
  if (max_affinity === 0) max_affinity = 1;

  // Calculate and update scores
  let updated_count = 0;

  for (const s of user_signals) {
    const telegram_normalized = s.telegram_7d / max_telegram;
    const x_normalized = s.x_7d / max_x;
    const token_normalized = s.token_balance / max_token;
    // Affinity ranges -1 to 1, normalize to 0-1 range
    const affinity_normalized = (s.kira_affinity + 1) / 2;

    const composite = (
      WEIGHTS.telegram * telegram_normalized +
      WEIGHTS.x * x_normalized +
      WEIGHTS.token * token_normalized +
      WEIGHTS.affinity * affinity_normalized
    ) * 100;

    const clamped_score = Math.max(0, Math.min(100, composite));
    const tier = derive_tier(clamped_score);

    const { error: update_error } = await supabase
      .from("engagement_scores")
      .update({
        composite_score: Math.round(clamped_score * 10) / 10,
        tier,
        telegram_message_count_7d: s.telegram_count_7d,
        x_engagement_7d: s.x_count_7d,
      })
      .eq("user_id", s.user_id);

    if (update_error !== null) {
      console.error(`Warning: failed to update ${s.user_id}: ${update_error.message}`);
      continue;
    }

    updated_count++;
  }

  console.log(`Recalculated ${updated_count} user(s).`);
}

async function cmd_priority(flags) {
  const platform = flags.platform;
  if (platform === undefined) {
    console.error("Usage: engagement.js priority --platform <telegram|x> [--limit 10]");
    process.exit(1);
  }

  const limit = flags.limit !== undefined ? parseInt(flags.limit, 10) : 10;

  const { data, error } = await supabase.rpc("calculate_response_priority", {
    p_platform: platform,
    p_limit: limit,
  });

  if (error !== null) {
    throw new Error(`RPC failed: ${error.message}`);
  }

  if (data === null || data.length === 0) {
    console.log(`No priority users found for platform: ${platform}`);
    return;
  }

  console.log(`=== Response Priority (${platform}) ===`);
  console.log("");
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    console.log(
      `${i + 1}. [${entry.tier}] score=${entry.composite_score.toFixed(1)} affinity=${entry.kira_affinity.toFixed(2)} — ${entry.platform_id}`,
    );
  }
}

async function cmd_link(flags) {
  const user_id = flags["user-id"];
  const platform = flags.platform;
  const platform_id = flags["platform-id"];

  if (user_id === undefined || platform === undefined || platform_id === undefined) {
    console.error("Usage: engagement.js link --user-id <uuid> --platform <name> --platform-id <id>");
    process.exit(1);
  }

  const { error } = await supabase.from("platform_links").upsert(
    {
      user_id,
      platform,
      platform_id,
      verified: false,
    },
    { onConflict: "platform,platform_id" },
  );

  if (error !== null) {
    throw new Error(`Upsert failed: ${error.message}`);
  }

  await ensure_engagement_row(user_id);

  console.log(`Linked ${platform}:${platform_id} → user ${user_id}`);
}

// ── Main ───────────────────────────────────────────

const { command, flags } = parse_args(process.argv);

const commands = {
  score: cmd_score,
  leaderboard: cmd_leaderboard,
  rate: cmd_rate,
  log: cmd_log,
  recalculate: cmd_recalculate,
  priority: cmd_priority,
  link: cmd_link,
};

const handler = commands[command];

if (handler === undefined) {
  console.error("Usage: engagement.js <score|leaderboard|rate|log|recalculate|priority|link> [options]");
  process.exit(1);
}

try {
  await handler(flags);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
