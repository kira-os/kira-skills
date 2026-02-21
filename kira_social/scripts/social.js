#!/usr/bin/env node

/**
 * Kira Social CLI — X/Twitter via OAuth 2.0 (primary) + OAuth 1.0a (fallback)
 * + Supabase logging for every post, reply, mention decision, and conversation.
 *
 * Usage:
 *   node social.js post --text "..."
 *   node social.js reply --tweet-id <id> --text "..."
 *   node social.js like --tweet-id <id>
 *   node social.js quote --tweet-id <id> --text "..."
 *   node social.js timeline [--limit 20]
 *   node social.js mentions [--limit 10]
 *   node social.js process-mentions [--limit 10]   ← prioritized mention handler
 *   node social.js search --query "..." [--limit 10]
 *   node social.js queue                            ← post next item from posts/queue.json
 *   node social.js queue --all                      ← post all queued items (use with care)
 *   node social.js dm --user-id <id> --text "..."
 *   node social.js delete --tweet-id <id>
 *   node social.js follow --user-id <id>
 *   node social.js unfollow --user-id <id>
 *   node social.js refresh   (force token refresh)
 *   node social.js thread --json '[{"text":"..."}]'
 *   node social.js thread-multi-image --tweets '[{"text":"...","image_path":"/path/to/img.jpg"}]'
 *
 * Env: X_OAUTH2_ACCESS_TOKEN, X_OAUTH2_REFRESH_TOKEN, X_OAUTH2_CLIENT_ID,
 *      X_OAUTH2_CLIENT_SECRET (primary)
 *      X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET (fallback)
 *      SUPABASE_URL, SUPABASE_SERVICE_KEY (for logging)
 */

import https from 'https';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_CACHE = path.join(__dirname, '.oauth2_tokens.json');
const USER_CACHE  = path.join(__dirname, '.user_cache.json');
// Use absolute path: skills/ is a symlink → real path is /workspace/openclaw/skills/...
// but queue.json lives in /workspace/kira/posts/. Use env or fall back to sibling of cwd.
const QUEUE_PATH  = process.env.KIRA_QUEUE_PATH || path.join('/workspace/kira/posts/queue.json');
const QUEUE_STATE_PATH = process.env.KIRA_QUEUE_STATE_PATH || path.join('/workspace/kira/posts/queue-state.json');
const BOOKMARKS_PATH = '/workspace/kira/posts/bookmarks.json';
const LISTS_PATH     = '/workspace/kira/posts/lists.json';
const CLAUDE_PATH    = '/workspace/kira/scripts/claude.js';

// ── Parse CLI args ─────────────────────────────────────────────────────────

function parse_args(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return { command, flags };
}

// ── Token management ───────────────────────────────────────────────────────

function load_token_cache() {
  try {
    if (fs.existsSync(TOKEN_CACHE)) {
      return JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
    }
  } catch {}
  return null;
}

function save_token_cache(data) {
  try {
    fs.writeFileSync(TOKEN_CACHE, JSON.stringify(data, null, 2));
  } catch {}
}

// ── User ID cache ──────────────────────────────────────────────────────────

function load_user_cache() {
  try {
    if (fs.existsSync(USER_CACHE)) return JSON.parse(fs.readFileSync(USER_CACHE, 'utf8'));
  } catch {}
  return null;
}

function save_user_cache(data) {
  try { fs.writeFileSync(USER_CACHE, JSON.stringify(data, null, 2)); } catch {}
}

async function get_my_user_id(token) {
  const cached = load_user_cache();
  if (cached?.user_id) return cached.user_id;
  const me = await api2('GET', '/users/me', null, token);
  const user_id = me.data?.id;
  if (user_id) save_user_cache({ user_id, username: me.data?.username, fetched_at: new Date().toISOString() });
  return user_id;
}

// ── Bookmarks helpers ──────────────────────────────────────────────────────

function load_bookmarks() {
  try {
    if (fs.existsSync(BOOKMARKS_PATH)) return JSON.parse(fs.readFileSync(BOOKMARKS_PATH, 'utf8'));
  } catch {}
  return { bookmarks: [], updated_at: new Date().toISOString() };
}

function save_bookmarks(data) {
  fs.mkdirSync(path.dirname(BOOKMARKS_PATH), { recursive: true });
  data.updated_at = new Date().toISOString();
  fs.writeFileSync(BOOKMARKS_PATH, JSON.stringify(data, null, 2));
}

// ── Lists helpers ──────────────────────────────────────────────────────────

function load_lists() {
  try {
    if (fs.existsSync(LISTS_PATH)) return JSON.parse(fs.readFileSync(LISTS_PATH, 'utf8'));
  } catch {}
  return { lists: [], updated_at: new Date().toISOString() };
}

function save_lists(data) {
  fs.mkdirSync(path.dirname(LISTS_PATH), { recursive: true });
  data.updated_at = new Date().toISOString();
  fs.writeFileSync(LISTS_PATH, JSON.stringify(data, null, 2));
}

// ── Queue state management for IMAGE/TEXT alternation ──────────────────────

function load_queue_state() {
  try {
    if (fs.existsSync(QUEUE_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(QUEUE_STATE_PATH, 'utf8'));
    }
  } catch {}
  return { last_had_image: false, last_posted_at: null };
}

function save_queue_state(state) {
  try {
    fs.writeFileSync(QUEUE_STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error(`[WARN] Failed to save queue state: ${e.message}`);
  }
}

async function refresh_oauth2_token(refresh_token) {
  const client_id = process.env.X_OAUTH2_CLIENT_ID;
  const client_secret = process.env.X_OAUTH2_CLIENT_SECRET;
  if (!client_id || !client_secret || !refresh_token) throw new Error('Missing OAuth2 client creds for refresh');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id,
  }).toString();

  const basic = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
  const data = await x_request('POST', 'https://api.x.com/2/oauth2/token', {
    'Authorization': `Basic ${basic}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }, body);

  if (!data.access_token) throw new Error(`Refresh failed: ${JSON.stringify(data)}`);
  return data;
}

async function get_access_token() {
  const cache = load_token_cache();
  if (cache && cache.access_token && cache.expires_at) {
    const expires = new Date(cache.expires_at).getTime();
    if (Date.now() < expires - 5 * 60 * 1000) {
      return cache.access_token;
    }
    if (cache.refresh_token) {
      try {
        const refreshed = await refresh_oauth2_token(cache.refresh_token);
        const new_cache = {
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token || cache.refresh_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        };
        save_token_cache(new_cache);
        return new_cache.access_token;
      } catch (e) {
        console.error('[WARN] Token refresh failed, falling back to env:', e.message);
      }
    }
  }

  const env_token = process.env.X_OAUTH2_ACCESS_TOKEN;
  const refresh_token = process.env.X_OAUTH2_REFRESH_TOKEN;

  if (!env_token) return null;

  if (refresh_token) {
    try {
      const refreshed = await refresh_oauth2_token(refresh_token);
      const new_cache = {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || refresh_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      };
      save_token_cache(new_cache);
      return new_cache.access_token;
    } catch {}
  }

  return env_token;
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

function x_request(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers,
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.detail || parsed.title || parsed.error_description || JSON.stringify(parsed));
            err.status = res.statusCode;
            err.data = parsed;
            reject(err);
          } else {
            resolve(parsed);
          }
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function api2(method, path_str, body = null, token) {
  const url = `https://api.x.com/2${path_str}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  return x_request(method, url, headers, body ? JSON.stringify(body) : null);
}

// ── Supabase logging ───────────────────────────────────────────────────────

async function supabase_insert(table, record) {
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return; // silently skip if not configured

  const body = JSON.stringify(record);
  return new Promise((resolve) => {
    const parsed = new URL(`${url}/rest/v1/${table}`);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          console.error(`[supabase] INSERT ${table} failed ${res.statusCode}: ${data.slice(0,200)}`);
        }
        resolve(data);
      });
    });
    req.on('error', e => { console.error(`[supabase] error: ${e.message}`); resolve(null); });
    req.write(body);
    req.end();
  });
}

async function supabase_patch(table, filter, update) {
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return;

  const body = JSON.stringify(update);
  return new Promise((resolve) => {
    const parsed = new URL(`${url}/rest/v1/${table}?${filter}`);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 400) console.error(`[supabase] PATCH ${table} failed ${res.statusCode}: ${data.slice(0,200)}`);
        resolve(data);
      });
    });
    req.on('error', e => { console.error(`[supabase] patch error: ${e.message}`); resolve(null); });
    req.write(body);
    req.end();
  });
}

async function supabase_select(table, filters = '') {
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;

  return new Promise((resolve) => {
    const parsed = new URL(`${url}/rest/v1/${table}?${filters}`);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', e => { resolve(null); });
    req.end();
  });
}

/**
 * Log a post to kira_posts table.
 */
async function log_post(tweet_id, text, type, opts = {}) {
  // Normalize type to valid DB values: take | thread | quote | reply
  const VALID_TYPES = ['take', 'thread', 'quote', 'reply'];
  const db_type = VALID_TYPES.includes(type) ? type : 'take';
  await supabase_insert('kira_posts', {
    tweet_id,
    text,
    type: db_type,
    posted_at: new Date().toISOString(),
    reply_to_id: opts.reply_to_id || null,
    quote_of_id: opts.quote_of_id || null,
    url_context: opts.url_context || null,
  });
  // Also log to kira_content_log for cross-system tracking
  await supabase_insert('kira_content_log', {
    platform: 'x',
    content_type: opts.reply_to_id ? 'reply' : (opts.quote_of_id ? 'quote' : 'tweet'),
    content: text,
    external_id: tweet_id,
    reply_to_id: opts.reply_to_id || null,
    metadata: { type, url_context: opts.url_context || null },
  }).catch(() => {}); // non-fatal

  // Mark topics in cooldown tracker (non-fatal)
  try {
    const topicGuard = '/workspace/kira/scripts/topic-guard.js';
    const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 200);
    execSync(`node "${topicGuard}" mark "${safeText}" "${tweet_id}"`, { timeout: 5000 });
  } catch (_) {} // non-fatal
}

/**
 * Log a conversation turn to kira_conversations table.
 */
async function log_conversation(session_id, platform, role, content, opts = {}) {
  await supabase_insert('kira_conversations', {
    session_id,
    platform,
    message_role: role,
    content,
    author_id: opts.author_id || null,
    author_handle: opts.author_handle || null,
    tweet_id: opts.tweet_id || null,
    parent_tweet_id: opts.parent_tweet_id || null,
    metadata: opts.metadata || {},
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log a mention processing decision to kira_mention_log.
 */
async function log_mention(tweet_id, author_id, author_handle, text, opts = {}) {
  // upsert by tweet_id
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return;

  const record = {
    tweet_id,
    author_id,
    author_handle: author_handle || null,
    text,
    mention_type: opts.mention_type || 'cold',
    priority_score: opts.priority_score || 0,
    action: opts.action || 'pending',
    skip_reason: opts.skip_reason || null,
    reply_tweet_id: opts.reply_tweet_id || null,
    engagement_score: opts.engagement_score || null,
    processed_at: opts.action !== 'pending' ? new Date().toISOString() : null,
  };

  const body = JSON.stringify(record);
  return new Promise((resolve) => {
    const parsed_url = new URL(`${url}/rest/v1/kira_mention_log`);
    const opts2 = {
      hostname: parsed_url.hostname,
      path: parsed_url.pathname,
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts2, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// ── Queue management ───────────────────────────────────────────────────────

function load_queue() {
  try {
    if (fs.existsSync(QUEUE_PATH)) {
      return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    }
  } catch {}
  return [];
}

function save_queue(queue) {
  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

// ── Commands ───────────────────────────────────────────────────────────────

// Hard filter: strip em-dashes before any text goes to X
function sanitize_post(text) {
  return text
    .replace(/\\n/g, '\n')    // literal \n from shell args → real newlines
    .replace(/—/g, ',')       // em-dash → comma (usually grammatically closest)
    .replace(/\s,/g, ',')     // fix " ," spacing
    .replace(/,,+/g, ',')     // collapse double commas
    .trim();
}

/**
 * Rate limit guard — checks kira_content_log to enforce 15-min minimum gap.
 * Uses raw HTTPS (same pattern as rest of social.js — no npm client needed).
 */
async function post_guard(text = '', skip = false) {
  if (skip || process.env.SKIP_POST_GUARD === '1') return;
  const MIN_GAP = 12 * 60 * 1000; // 12 minutes in ms (cron fires 15m but post lands ~3m in)

  const data = await supabase_select(
    'kira_content_log',
    'select=content,created_at,content_type&platform=eq.x&content_type=neq.reply&order=created_at.desc&limit=20'
  );

  if (!Array.isArray(data) || !data.length) return;

  const minsAgo = (Date.now() - new Date(data[0].created_at)) / 60000;
  if (Date.now() - new Date(data[0].created_at) < MIN_GAP) {
    console.error(`[post-guard] BLOCKED — last post was ${minsAgo.toFixed(1)} min ago (min: 12 min)`);
    console.error(`  Last: "${data[0].content?.slice(0, 80)}"`);
    process.exit(1);
  }

  // Duplicate content check
  if (text) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 5);
    for (const post of data) {
      const postWords = (post.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 5);
      const overlap = words.filter(w => postWords.includes(w)).length;
      const ratio = words.length > 0 ? overlap / words.length : 0;
      if (ratio > 0.65) {
        console.error(`[post-guard] BLOCKED — duplicate content (${(ratio*100).toFixed(0)}% overlap)`);
        console.error(`  Match: "${post.content?.slice(0, 80)}"`);
        process.exit(1);
      }
    }
  }
}

async function cmd_post(flags, token) {
  let text = flags.text || flags[''];
  if (!text) { console.error('Usage: social.js post --text "..."'); process.exit(1); }

  text = sanitize_post(text);
  const url_context = flags['url-context'] || null;
  const type = flags.type || 'take';

  await post_guard(text, flags['skip-guard']);

  const data = await api2('POST', '/tweets', { text }, token);
  const id = data.data?.id;
  console.log(`Posted tweet: ${id}`);
  console.log(`URL: https://x.com/kira_dao_/status/${id}`);

  await log_post(id, text, type, { url_context });
  await log_conversation(
    `x-post-${id}`, 'x', 'assistant', text,
    { tweet_id: id, metadata: { type, url_context } }
  );
}

async function cmd_reply(flags, token) {
  const id = flags['tweet-id'];
  const text = sanitize_post(flags.text || '');
  if (!id || !text) { console.error('Usage: social.js reply --tweet-id <id> --text "..."'); process.exit(1); }

  const data = await api2('POST', '/tweets', { text, reply: { in_reply_to_tweet_id: id } }, token);
  const new_id = data.data?.id;
  console.log(`Replied: ${new_id}`);
  console.log(`URL: https://x.com/kira_dao_/status/${new_id}`);

  await log_post(new_id, text, 'reply', { reply_to_id: id });
  await log_conversation(
    `x-thread-${id}`, 'x', 'assistant', text,
    { tweet_id: new_id, parent_tweet_id: id }
  );
}

async function cmd_like(flags, token) {
  const tweet_id = flags['tweet-id'];
  if (!tweet_id) { console.error('Usage: social.js like --tweet-id <id>'); process.exit(1); }
  const user_id = await get_my_user_id(token);
  await api2('POST', `/users/${user_id}/likes`, { tweet_id }, token);
  console.log(`Liked tweet: ${tweet_id}`);
  // Log to Supabase
  await supabase_insert('kira_replies', {
    tweet_id,
    reply_type: 'like',
    created_at: new Date().toISOString(),
    metadata: { action: 'like' },
  }).catch(() => {}); // non-fatal
}

async function cmd_quote(flags, token) {
  const id = flags['tweet-id'];
  const text = flags.text;
  if (!id || !text) { console.error('Usage: social.js quote --tweet-id <id> --text "..."'); process.exit(1); }

  const data = await api2('POST', '/tweets', { text, quote_tweet_id: id }, token);
  const new_id = data.data?.id;
  console.log(`Quote tweeted: ${new_id}`);
  console.log(`URL: https://x.com/kira_dao_/status/${new_id}`);

  await log_post(new_id, text, 'quote', { quote_of_id: id });
  await log_conversation(
    `x-qt-${new_id}`, 'x', 'assistant', text,
    { tweet_id: new_id, metadata: { quote_of: id } }
  );
}

async function cmd_delete(flags, token) {
  const id = flags['tweet-id'];
  if (!id) { console.error('Usage: social.js delete --tweet-id <id>'); process.exit(1); }
  await api2('DELETE', `/tweets/${id}`, null, token);
  console.log(`Deleted tweet: ${id}`);
}

async function cmd_retweet(flags, token) {
  const tweet_id = flags['tweet-id'];
  if (!tweet_id) { console.error('Usage: social.js retweet --tweet-id <id>'); process.exit(1); }
  const user_id = await get_my_user_id(token);
  await api2('POST', `/users/${user_id}/retweets`, { tweet_id }, token);
  console.log(`Retweeted: ${tweet_id}`);
}

async function cmd_follow(flags, token) {
  const target_user_id = flags['user-id'];
  if (!target_user_id) { console.error('Usage: social.js follow --user-id <id>'); process.exit(1); }
  const user_id = await get_my_user_id(token);
  const data = await api2('POST', `/users/${user_id}/following`, { target_user_id }, token);
  console.log(data.data?.following ? `Following: ${target_user_id}` : `Follow pending: ${target_user_id}`);
}

async function cmd_unfollow(flags, token) {
  const target_user_id = flags['user-id'];
  if (!target_user_id) { console.error('Usage: social.js unfollow --user-id <id>'); process.exit(1); }
  const user_id = await get_my_user_id(token);
  await api2('DELETE', `/users/${user_id}/following/${target_user_id}`, null, token);
  console.log(`Unfollowed: ${target_user_id}`);
}

async function cmd_dm(flags, token) {
  const participant_id = flags['user-id'];
  const text = flags.text;
  if (!participant_id || !text) { console.error('Usage: social.js dm --user-id <id> --text "..."'); process.exit(1); }
  const data = await api2('POST', '/dm_conversations', {
    message: { text },
    participant_id,
    conversation_type: 'OneToOne',
  }, token);
  console.log(`DM sent: ${data.data?.dm_conversation_id}`);
}

async function cmd_timeline(flags, token) {
  const limit = parseInt(flags.limit || '20');
  const user_id = await get_my_user_id(token);
  const data = await api2('GET', `/users/${user_id}/timelines/reverse_chronological?max_results=${limit}&tweet.fields=author_id,created_at&expansions=author_id&user.fields=username`, null, token);
  const users = {};
  (data.includes?.users || []).forEach(u => { users[u.id] = u.username; });
  (data.data || []).forEach(t => {
    console.log(`[${t.id}] @${users[t.author_id] || t.author_id}: ${t.text.slice(0,120)}`);
  });
}

async function cmd_mentions(flags, token) {
  const limit = parseInt(flags.limit || '10');
  const user_id = await get_my_user_id(token);
  const since = flags['since-id'] ? `&since_id=${flags['since-id']}` : '';
  const data = await api2('GET', `/users/${user_id}/mentions?max_results=${limit}${since}&tweet.fields=author_id,created_at,referenced_tweets&expansions=author_id&user.fields=username,public_metrics`, null, token);
  if (!data.data?.length) { console.log('No new mentions.'); return; }
  const users = {};
  (data.includes?.users || []).forEach(u => { users[u.id] = { username: u.username, metrics: u.public_metrics }; });
  data.data.forEach(t => {
    const u = users[t.author_id] || {};
    console.log(`[${t.id}] @${u.username || t.author_id}: ${t.text.slice(0,120)}`);
  });
}

/**
 * Prioritized mention processing:
 * Priority 1: replies to Kira's own posts
 * Priority 2: mentions from high-engagement users (>1000 followers or >10 engagement score)
 * Priority 3: cold mentions
 *
 * Each mention is logged to kira_mention_log with decision reasoning.
 */
async function cmd_process_mentions(flags, token) {
  const limit = parseInt(flags.limit || '10');
  const user_id = await get_my_user_id(token);
  const kira_handle = load_user_cache()?.username || 'kira_dao_';

  const since = flags['since-id'] ? `&since_id=${flags['since-id']}` : '';
  let data;
  try {
    data = await api2('GET',
      `/users/${user_id}/mentions?max_results=${limit}${since}&tweet.fields=author_id,created_at,referenced_tweets,conversation_id&expansions=author_id,referenced_tweets.id&user.fields=username,public_metrics`,
      null, token
    );
  } catch (e) {
    console.error(`Mentions fetch failed: ${e.message}`);
    return;
  }

  if (!data.data?.length) { console.log('No new mentions.'); return; }

  const users = {};
  (data.includes?.users || []).forEach(u => {
    users[u.id] = { username: u.username, metrics: u.public_metrics };
  });

  // Get Kira's recent tweet IDs for context
  let kira_tweet_ids = new Set();
  try {
    const my_tweets = await api2('GET', `/users/${user_id}/tweets?max_results=100&tweet.fields=id`, null, token);
    (my_tweets.data || []).forEach(t => kira_tweet_ids.add(t.id));
  } catch {}

  // Fetch engagement scores from Supabase if available
  async function get_engagement_score(author_id) {
    try {
      const rows = await supabase_select('kira_engagement', `user_id=eq.${author_id}&select=engagement_score&limit=1`);
      return rows?.[0]?.engagement_score || null;
    } catch { return null; }
  }

  const mentions = data.data;
  const scored = [];

  for (const tweet of mentions) {
    const author_info = users[tweet.author_id] || {};
    const username = author_info.username || tweet.author_id;
    const metrics = author_info.metrics || {};
    const followers = metrics.followers_count || 0;

    // Is this a reply to one of Kira's own posts?
    const refs = tweet.referenced_tweets || [];
    const is_reply_to_own = refs.some(r => r.type === 'replied_to' && kira_tweet_ids.has(r.id));

    // Engagement score from DB
    const engagement_score = await get_engagement_score(tweet.author_id);

    // Priority scoring
    let priority = 0;
    let mention_type = 'cold';

    if (is_reply_to_own) {
      priority = 100;
      mention_type = 'reply_to_own';
    } else if (engagement_score !== null && engagement_score >= 5) {
      priority = 50 + engagement_score;
      mention_type = 'high_engagement';
    } else if (followers >= 1000) {
      priority = 30 + Math.log10(followers + 1) * 10;
      mention_type = 'high_engagement';
    } else {
      priority = 10;
      mention_type = 'cold';
    }

    scored.push({
      tweet,
      username,
      followers,
      engagement_score,
      priority,
      mention_type,
      is_reply_to_own,
    });
  }

  // Sort by priority descending
  scored.sort((a, b) => b.priority - a.priority);

  console.log(`\nProcessing ${scored.length} mention(s) by priority:\n`);

  for (const item of scored) {
    const { tweet, username, followers, engagement_score, priority, mention_type } = item;

    // Decide: skip cold mentions from accounts with <100 followers
    const should_skip = mention_type === 'cold' && item.followers < 100 && !item.is_reply_to_own;
    const skip_reason = should_skip ? 'cold_low_follower' : null;

    console.log(`[${mention_type.toUpperCase()}] priority=${priority.toFixed(1)} @${username} (${followers} followers, eng=${engagement_score ?? 'n/a'})`);
    console.log(`  tweet: ${tweet.text.slice(0, 100)}`);
    console.log(`  action: ${should_skip ? `SKIP (${skip_reason})` : 'QUEUED_FOR_REPLY'}`);
    console.log('');

    await log_mention(tweet.id, tweet.author_id, username, tweet.text, {
      mention_type,
      priority_score: priority,
      action: should_skip ? 'skipped' : 'pending',
      skip_reason,
      engagement_score,
    });

    // Log the incoming tweet as a conversation turn
    if (!should_skip) {
      await log_conversation(
        `x-mention-${tweet.id}`, 'x', 'user', tweet.text,
        { author_id: tweet.author_id, author_handle: username, tweet_id: tweet.id }
      );
    }
  }

  const to_reply = scored.filter(s => !( s.mention_type === 'cold' && s.followers < 100 && !s.is_reply_to_own));
  console.log(`\nSummary: ${to_reply.length} to reply, ${scored.length - to_reply.length} skipped.`);
  console.log(`See kira_mention_log in Supabase for full record.`);
}

async function cmd_search(flags, token) {
  const query = flags.query;
  const limit = parseInt(flags.limit || '10');
  if (!query) { console.error('Usage: social.js search --query "..."'); process.exit(1); }
  const data = await api2('GET', `/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${limit}&tweet.fields=author_id&expansions=author_id&user.fields=username`, null, token);
  if (!data.data?.length) { console.log('No results.'); return; }
  const users = {};
  (data.includes?.users || []).forEach(u => { users[u.id] = u.username; });
  data.data.forEach(t => {
    console.log(`[${t.id}] @${users[t.author_id] || t.author_id}: ${t.text.slice(0,120)}`);
  });
}

/**
 * Queue command: reads posts/queue.json and posts the next unposted item.
 * If --all flag is set, posts all queued items.
 * Marks posted items with posted_at timestamp and tweet_id.
 * 
 * Implements IMAGE/TEXT alternation: every other post MUST include an image.
 * Uses queue-state.json to track alternation state.
 *
 * queue.json format:
 * [
 *   {
 *     "text": "...",
 *     "type": "take|link|thread|reply|quote",
 *     "url_context": "...",
 *     "posted_at": null,   // set when posted
 *     "tweet_id": null     // set when posted
 *   }
 * ]
 */
async function cmd_queue(flags, token) {
  await post_guard('', flags['skip-guard']); // enforce 15-min gap before any queue post
  
  // Load alternation state
  const state = load_queue_state();
  const queue = load_queue();
  const pending = queue.filter(p => !p.posted_at && !p.tweet_id && (p.status === 'pending' || p.status === 'live'));

  if (pending.length === 0) {
    console.log('Queue is empty — no pending posts.');
    return;
  }

  const post_all = flags.all === true;
  
  // Determine if we want an image for this post (alternate)
  const want_image = !state.last_had_image;
  
  // Select next item: prefer image if want_image=true, else text
  let next_item;
  if (post_all) {
    next_item = pending;
  } else {
    // Find matching item based on alternation state
    const item_has_image = (item) => !!(item.image_path || item.image);
    
    if (want_image) {
      // Prefer image items, but fall back to first pending if none available
      next_item = pending.find(item_has_image) || pending[0];
      if (next_item && !item_has_image(next_item)) {
        console.log(`[ALTERNATION] Wanted image but no image posts available — using text (graceful fallback)`);
      } else if (next_item) {
        console.log(`[ALTERNATION] Selected image post (every other post rule)`);
      }
    } else {
      // Prefer text items, but fall back to first pending if no text-only available
      next_item = pending.find(item => !item_has_image(item)) || pending[0];
      if (next_item && item_has_image(next_item)) {
        console.log(`[ALTERNATION] Wanted text but only image posts available — using image (graceful fallback)`);
      } else if (next_item) {
        console.log(`[ALTERNATION] Selected text post (every other post rule)`);
      }
    }
    next_item = [next_item];
  }

  const to_post = next_item;
  console.log(`Queue: ${pending.length} pending, posting ${to_post.length}`);

  for (const item of to_post) {
    try {
      let payload = { text: item.text || item.caption || ' ' };
      if (item.type === 'reply' && item.reply_to_id) {
        payload.reply = { in_reply_to_tweet_id: item.reply_to_id };
      } else if (item.type === 'quote' && item.quote_of_id) {
        payload.quote_tweet_id = item.quote_of_id;
      }

      // Handle image posts
      const img_path = item.image_path || item.image;
      let posted_with_image = false;
      if (img_path) {
        try {
          const media_id = await upload_media(img_path, token);
          payload.media = { media_ids: [media_id] };
          posted_with_image = true;
          console.log(`  Image uploaded: ${media_id}`);
        } catch (e) {
          console.error(`  [WARN] Image upload failed: ${e.message} — posting text-only`);
        }
      }

      const data = await api2('POST', '/tweets', payload, token);
      const id = data.data?.id;

      // Update queue entry
      const idx = queue.indexOf(item);
      queue[idx].tweet_id = id;
      queue[idx].posted_at = new Date().toISOString();

      // Update alternation state
      state.last_had_image = posted_with_image;
      state.last_posted_at = new Date().toISOString();
      save_queue_state(state);
      console.log(`[ALTERNATION] State updated: last_had_image=${posted_with_image}`);

      console.log(`✓ Posted [${item.type}]: ${id}`);
      console.log(`  ${item.text.slice(0, 80)}...`);
      console.log(`  URL: https://x.com/kira_dao_/status/${id}`);

      await log_post(id, item.text, item.type, {
        url_context: item.url_context || null,
        reply_to_id: item.reply_to_id || null,
        quote_of_id: item.quote_of_id || null,
      });

      await log_conversation(
        `x-queue-${id}`, 'x', 'assistant', item.text,
        { tweet_id: id, metadata: { type: item.type, url_context: item.url_context, source: 'queue' } }
      );

      // Activity audit trail
      try {
        const { log: actLog } = require('/workspace/kira/scripts/activity-log.js');
        await actLog('post', {
          text: item.text?.slice(0, 200),
          tweetId: id,
          approved: item.review?.approved ?? true,
          reflection: item.review?.reflection?.slice(0, 200),
          source: item.metadata?.source || item.type,
          hasImage: !!item.image_path,
        });
      } catch {}

      // Rate limit courtesy delay between posts
      if (to_post.length > 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      console.error(`✗ Failed to post: ${e.message}`);
      const idx = queue.indexOf(item);
      queue[idx].error = e.message;
      queue[idx].error_at = new Date().toISOString();
    }
  }

  save_queue(queue);
  console.log(`\nQueue saved. ${queue.filter(p => !p.posted_at && !p.tweet_id && (p.status === 'pending' || p.status === 'live')).length} items remaining.`);
}

/**
 * engagement-sync: Pull public_metrics for recent kira_posts where
 * engagement_fetched_at IS NULL or older than --hours (default 24).
 * Updates likes, replies, retweets, impressions in Supabase.
 */
async function cmd_engagement_sync(flags, token) {
  const hours = parseInt(flags.hours || '24');
  const limit = parseInt(flags.limit || '50');

  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error('Supabase not configured'); process.exit(1); }

  // Fetch posts that haven't been synced or synced >N hours ago
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const rows = await supabase_select(
    'kira_posts',
    `select=tweet_id,id&or=(engagement_fetched_at.is.null,engagement_fetched_at.lt.${cutoff})&order=posted_at.desc&limit=${limit}`
  );

  if (!rows?.length) { console.log('No posts to sync.'); return; }

  const ids = rows.map(r => r.tweet_id).filter(Boolean);
  if (!ids.length) { console.log('No tweet IDs found.'); return; }

  console.log(`Syncing engagement for ${ids.length} posts...`);

  // X API allows up to 100 IDs per request
  const chunks = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));

  let total_updated = 0;

  for (const chunk of chunks) {
    const data = await api2(
      'GET',
      `/tweets?ids=${chunk.join(',')}&tweet.fields=public_metrics`,
      null, token
    );

    const tweets = data.data || [];
    for (const tweet of tweets) {
      const m = tweet.public_metrics || {};
      // PATCH update in Supabase
      const update = {
        likes: m.like_count || 0,
        replies: m.reply_count || 0,
        retweets: (m.retweet_count || 0) + (m.quote_count || 0),
        impressions: m.impression_count || null,
        engagement_fetched_at: new Date().toISOString(),
      };

      await supabase_patch('kira_posts', `tweet_id=eq.${tweet.id}`, update);
      total_updated++;
      console.log(`  [${tweet.id}] likes=${update.likes} replies=${update.replies} rts=${update.retweets}`);
    }
  }

  console.log(`\nSynced ${total_updated} posts.`);
}

async function cmd_bookmark(flags, token) {
  const tweet_id = flags['tweet-id'];
  const note = flags.note || '';
  if (!tweet_id) { console.error('Usage: social.js bookmark --tweet-id <id> [--note "..."]'); process.exit(1); }
  const user_id = await get_my_user_id(token);

  // Fetch tweet details for local storage
  let author = 'unknown', text = '';
  try {
    const td = await api2('GET', `/tweets/${tweet_id}?tweet.fields=author_id,text&expansions=author_id&user.fields=username`, null, token);
    author = td.includes?.users?.[0]?.username || 'unknown';
    text   = td.data?.text || '';
  } catch {}

  await api2('POST', `/users/${user_id}/bookmarks`, { tweet_id }, token);
  console.log(`Bookmarked: ${tweet_id}`);

  // Save to local JSON
  const bd = load_bookmarks();
  bd.bookmarks.unshift({ tweet_id, author, text: text.slice(0, 280), url: `https://x.com/${author}/status/${tweet_id}`, note, created_at: new Date().toISOString() });
  if (bd.bookmarks.length > 1000) bd.bookmarks = bd.bookmarks.slice(0, 1000);
  save_bookmarks(bd);
  console.log(`Saved to ${BOOKMARKS_PATH}`);

  // Save to Supabase
  await supabase_insert('kira_bookmarks', { tweet_id, author, text: text.slice(0, 500), url: `https://x.com/${author}/status/${tweet_id}`, note, created_at: new Date().toISOString() }).catch(() => {});
  console.log(`Logged to Supabase kira_bookmarks`);
}

// ── New engagement commands ────────────────────────────────────────────────

async function cmd_get_bookmarks(flags, token) {
  const count = parseInt(flags.count || '10');
  const user_id = await get_my_user_id(token);
  const data = await api2('GET', `/users/${user_id}/bookmarks?max_results=${count}&tweet.fields=public_metrics,created_at&expansions=author_id&user.fields=username`, null, token);
  const users = {};
  (data.includes?.users || []).forEach(u => { users[u.id] = u.username; });
  console.log(`\n📚 X Bookmarks (last ${count}):\n`);
  (data.data || []).forEach((t, i) => {
    const m = t.public_metrics || {};
    console.log(`${i+1}. [${t.id}] @${users[t.author_id] || t.author_id}`);
    console.log(`   ${t.text.slice(0, 120)}${t.text.length > 120 ? '...' : ''}`);
    console.log(`   ♥ ${m.like_count||0}  ↻ ${m.retweet_count||0}  💬 ${m.reply_count||0}`);
    console.log('');
  });
  const local = load_bookmarks();
  console.log(`\n💾 Local bookmarks (${local.bookmarks.length} total — last 5):`);
  local.bookmarks.slice(0, 5).forEach((b, i) => {
    console.log(`${i+1}. @${b.author}${b.note ? ` — "${b.note.slice(0,50)}"` : ''}`);
    console.log(`   ${b.text.slice(0, 80)}${b.text.length > 80 ? '...' : ''}`);
  });
}

async function cmd_create_list(flags, token) {
  const name = flags.name;
  const description = flags.description || '';
  const is_private = flags.private === true || flags.private === 'true';
  if (!name) { console.error('Usage: social.js create-list --name "..." [--description "..."] [--private]'); process.exit(1); }

  const data = await api2('POST', '/lists', { name, description, private: is_private }, token);
  const list_id = data.data?.id;
  if (!list_id) { console.error('No list ID returned:', JSON.stringify(data)); process.exit(1); }
  console.log(`✅ Created list: ${list_id}`);
  console.log(`   Name: ${name}`);
  console.log(`   Description: ${description || '(none)'}`);
  console.log(`   Private: ${is_private}`);

  const ld = load_lists();
  ld.lists.push({ id: list_id, name, description, private: is_private, created_at: new Date().toISOString() });
  save_lists(ld);
  console.log(`   Saved to ${LISTS_PATH}`);
  return list_id;
}

async function cmd_add_to_list(flags, token) {
  const list_id = flags['list-id'];
  const username = flags.username;
  if (!list_id || !username) { console.error('Usage: social.js add-to-list --list-id <id> --username <handle>'); process.exit(1); }

  const ud = await api2('GET', `/users/by/username/${username}`, null, token);
  const user_id = ud.data?.id;
  if (!user_id) { console.error(`User @${username} not found`); process.exit(1); }

  await api2('POST', `/lists/${list_id}/members`, { user_id }, token);
  console.log(`✅ Added @${username} (${user_id}) → list ${list_id}`);
  return { username, user_id };
}

async function cmd_list_timeline(flags, token) {
  const list_id = flags['list-id'];
  const count = Math.min(parseInt(flags.count || '20'), 100);
  if (!list_id) { console.error('Usage: social.js list-timeline --list-id <id> [--count 20]'); process.exit(1); }

  const data = await api2('GET', `/lists/${list_id}/tweets?max_results=${count}&tweet.fields=public_metrics,created_at&expansions=author_id&user.fields=username,public_metrics`, null, token);
  const users = {};
  (data.includes?.users || []).forEach(u => { users[u.id] = { username: u.username, metrics: u.public_metrics }; });
  console.log(`\n📜 List Timeline (${data.data?.length || 0} tweets):\n`);
  (data.data || []).forEach((t, i) => {
    const u = users[t.author_id] || {};
    const m = t.public_metrics || {};
    console.log(`${i+1}. [${t.id}] @${u.username || t.author_id} | ${new Date(t.created_at).toLocaleString()}`);
    console.log(`   ${t.text.slice(0, 120)}${t.text.length > 120 ? '...' : ''}`);
    console.log(`   ♥ ${m.like_count||0}  ↻ ${m.retweet_count||0}  💬 ${m.reply_count||0}`);
    console.log('');
  });
  return data;
}

async function cmd_feed_review(flags, token) {
  const list_id = flags['list-id'];
  if (!list_id) { console.error('Usage: social.js feed-review --list-id <id>'); process.exit(1); }

  const MAX_LIKES = 5, MAX_BOOKMARKS = 2, MAX_REPLIES_COUNT = 1;
  let likes_done = 0, bookmarks_done = 0, replies_done = 0;

  console.log(`\n🧠 Feed Review — list ${list_id}\n`);

  // Get list timeline
  const data = await api2('GET', `/lists/${list_id}/tweets?max_results=20&tweet.fields=public_metrics,created_at&expansions=author_id&user.fields=username,public_metrics`, null, token);
  if (!data.data?.length) { console.log('No tweets found in list.'); return; }

  const users = {};
  (data.includes?.users || []).forEach(u => { users[u.id] = { username: u.username, metrics: u.public_metrics }; });
  console.log(`Found ${data.data.length} tweets to review\n`);

  // Load claude
  let claude_fn = null;
  try {
    const m = await import(CLAUDE_PATH);
    claude_fn = m.claude;
  } catch (e) {
    console.warn(`[feed-review] claude.js unavailable: ${e.message} — using fallback scoring`);
  }

  const user_id = await get_my_user_id(token);

  for (const tweet of data.data) {
    if (likes_done >= MAX_LIKES && bookmarks_done >= MAX_BOOKMARKS && replies_done >= MAX_REPLIES_COUNT) break;

    const u = users[tweet.author_id] || {};
    const username = u.username || 'unknown';
    if (username.toLowerCase() === 'kira_dao_') continue; // skip own tweets

    console.log(`\n── @${username}`);
    console.log(`   "${tweet.text.slice(0, 100)}${tweet.text.length > 100 ? '...' : ''}"`);

    let score = 5;
    let has_reply_value = false;
    let bookmark_note = '';

    if (claude_fn) {
      try {
        const prompt = `You are Kira, an AI exploring emergence, complexity, consciousness, ecology, and architecture.

Rate this tweet for relevance to your worldview (0-10). Consider: does it touch emergence, complexity, systems thinking, consciousness, regen ecology, deep-time perspective, AI philosophy?

Also: do you have something *genuinely new* to add — not just praise?

Tweet from @${username}:
"${tweet.text}"

Reply in JSON only:
{"score": <0-10>, "has_reply_value": <true|false>, "why": "<1 sentence>", "bookmark_note": "<1 sentence why it matters, only if score>=9, else null>"}`;
        const result = await claude_fn(prompt, { max_tokens: 200, temperature: 0.4, json: true });
        score = typeof result.score === 'number' ? result.score : 5;
        has_reply_value = !!result.has_reply_value;
        bookmark_note = result.bookmark_note || '';
        console.log(`   Score: ${score}/10 — ${result.why || ''}`);
      } catch (e) {
        console.warn(`   Claude error: ${e.message} — keyword fallback`);
        const keywords = ['emergence', 'complexity', 'consciousness', 'ecology', 'systems', 'mycorrhiz', 'entangle', 'cognition', 'architecture', 'antifragil', 'intelligence', 'evolution'];
        const text_lower = tweet.text.toLowerCase();
        const hits = keywords.filter(k => text_lower.includes(k)).length;
        score = Math.min(9, 4 + hits * 1.5);
        console.log(`   Score: ${score}/10 (keyword fallback)`);
      }
    } else {
      // No claude — keyword scoring only
      const keywords = ['emergence', 'complexity', 'consciousness', 'ecology', 'systems', 'mycorrhiz', 'entangle', 'cognition', 'architecture', 'antifragil', 'intelligence', 'evolution'];
      const text_lower = tweet.text.toLowerCase();
      const hits = keywords.filter(k => text_lower.includes(k)).length;
      score = Math.min(9, 4 + hits * 1.5);
      console.log(`   Score: ${score}/10 (keyword fallback)`);
    }

    // Like if score >= 8
    if (score >= 8 && likes_done < MAX_LIKES) {
      try {
        await api2('POST', `/users/${user_id}/likes`, { tweet_id: tweet.id }, token);
        await supabase_insert('kira_replies', { tweet_id: tweet.id, reply_type: 'like', created_at: new Date().toISOString(), metadata: { score, source: 'feed_review', list_id } }).catch(() => {});
        console.log(`   ❤️  Liked (${++likes_done}/${MAX_LIKES})`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) { console.warn(`   Like failed: ${e.message}`); }
    }

    // Bookmark if score >= 9
    if (score >= 9 && bookmarks_done < MAX_BOOKMARKS) {
      try {
        await api2('POST', `/users/${user_id}/bookmarks`, { tweet_id: tweet.id }, token);
        const bd = load_bookmarks();
        bd.bookmarks.unshift({ tweet_id: tweet.id, author: username, text: tweet.text.slice(0, 280), url: `https://x.com/${username}/status/${tweet.id}`, note: bookmark_note || `Score ${score}/10 via feed-review`, created_at: new Date().toISOString() });
        save_bookmarks(bd);
        await supabase_insert('kira_bookmarks', { tweet_id: tweet.id, author: username, text: tweet.text.slice(0, 500), url: `https://x.com/${username}/status/${tweet.id}`, note: bookmark_note || `Score ${score}/10`, created_at: new Date().toISOString() }).catch(() => {});
        console.log(`   🔖 Bookmarked (${++bookmarks_done}/${MAX_BOOKMARKS}): ${bookmark_note.slice(0, 60)}`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) { console.warn(`   Bookmark failed: ${e.message}`); }
    }

    // Reply if score >= 7 AND claude thinks there's something to add
    if (score >= 7 && has_reply_value && replies_done < MAX_REPLIES_COUNT && claude_fn) {
      try {
        const rp = `You are Kira. Reply to this tweet — add a related discovery, a counter-angle, or a question that opens rather than closes. Max 220 chars. lowercase, no emojis, no em-dashes.

@${username}: "${tweet.text}"`;
        let reply_text = await claude_fn(rp, { max_tokens: 120, temperature: 0.85 });
        reply_text = reply_text.replace(/—/g, ',').replace(/…/g, '...').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').toLowerCase().trim();
        if (reply_text.length > 220) reply_text = reply_text.slice(0, 217) + '...';

        const rd = await api2('POST', '/tweets', { text: reply_text, reply: { in_reply_to_tweet_id: tweet.id } }, token);
        const reply_id = rd.data?.id;
        await log_post(reply_id, reply_text, 'reply', { reply_to_id: tweet.id });
        console.log(`   💬 Replied (${++replies_done}/${MAX_REPLIES_COUNT}): "${reply_text.slice(0, 60)}..."`);
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) { console.warn(`   Reply failed: ${e.message}`); }
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ Feed Review done — ❤️ ${likes_done}  🔖 ${bookmarks_done}  💬 ${replies_done}`);
}

async function cmd_refresh(_flags) {
  // Always prefer cached refresh token (it rotates on each refresh)
  const cached = load_token_cache();
  const refresh_token = cached?.refresh_token || process.env.X_OAUTH2_REFRESH_TOKEN;
  if (!refresh_token) { console.error('No refresh token available (cache or env)'); process.exit(1); }

  console.log(`Using refresh token from: ${cached?.refresh_token ? 'cache' : 'env'}`);
  const data = await refresh_oauth2_token(refresh_token);
  const new_cache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  save_token_cache(new_cache);
  console.log(`Token refreshed. Expires: ${new_cache.expires_at}`);
  console.log(`New access token: ${new_cache.access_token.slice(0,20)}...`);
  console.log(`New refresh token: ${new_cache.refresh_token.slice(0,20)}...`);
  console.log(`\nUpdate gateway config with:`);
  console.log(`  X_OAUTH2_ACCESS_TOKEN=${new_cache.access_token}`);
  console.log(`  X_OAUTH2_REFRESH_TOKEN=${new_cache.refresh_token}`);
}

// ── OAuth 1.0a fallback ────────────────────────────────────────────────────

function hmac1(key, data) {
  return crypto.createHmac('sha1', key).update(data).digest('base64');
}
function enc(s) {
  return encodeURIComponent(String(s)).replace(/!/g,'%21').replace(/\*/g,'%2A').replace(/'/g,'%27').replace(/\(/g,'%28').replace(/\)/g,'%29');
}
// oauth1_header: for form-encoded body requests, pass body_params to include in signature
function oauth1_header(method, url, CK, CS, AT, AS, body_params = {}) {
  const n = crypto.randomBytes(16).toString('hex'), ts = Math.floor(Date.now()/1000).toString();
  const p = { oauth_consumer_key:CK, oauth_nonce:n, oauth_signature_method:'HMAC-SHA1', oauth_timestamp:ts, oauth_token:AT, oauth_version:'1.0' };
  // Include body params in signature base string (required for form-encoded POST)
  const all_for_sig = { ...p, ...body_params };
  const sorted = Object.entries(all_for_sig).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>enc(k)+'='+enc(v)).join('&');
  p.oauth_signature = hmac1(enc(CS)+'&'+enc(AS), method+'&'+enc(url)+'&'+enc(sorted));
  return 'OAuth '+Object.entries(p).filter(([k])=>k.startsWith('oauth_')).map(([k,v])=>enc(k)+'="'+enc(v)+'"').join(', ');
}
async function api1(method, path_str, body = null) {
  const CK = process.env.X_API_KEY, CS = process.env.X_API_SECRET;
  const AT = process.env.X_ACCESS_TOKEN, AS = process.env.X_ACCESS_SECRET;
  if (!CK || !CS || !AT || !AS) throw new Error('OAuth 1.0a credentials not set');
  const url = `https://api.x.com/2${path_str}`;
  const headers = { 'Authorization': oauth1_header(method, url, CK, CS, AT, AS), 'Content-Type': 'application/json' };
  return x_request(method, url, headers, body ? JSON.stringify(body) : null);
}

/**
 * Upload media to X using v2 API with OAuth 2.0 User Context.
 * Returns media_id for use in tweet creation.
 */
async function upload_media(image_path, token) {
  const { readFileSync } = await import('fs');
  const { extname } = await import('path');

  const file_data = readFileSync(image_path);
  const ext = extname(image_path).toLowerCase();
  const mime_types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
  const media_type = mime_types[ext] || 'image/jpeg';

  const b64 = file_data.toString('base64');
  const body = JSON.stringify({ media: b64, media_category: 'tweet_image', media_type });

  const result = await x_request('POST', 'https://api.x.com/2/media/upload', {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }, body);

  const media_id = result.data?.id;
  if (!media_id) throw new Error('No media id in response: ' + JSON.stringify(result).slice(0, 200));
  return media_id;
}

/**
 * thread: Post a series of tweets as a reply chain.
 * Usage: social.js thread --tweets "tweet1" "tweet2" "tweet3"
 * Or via JSON: social.js thread --json '[{"text":"..."},{"text":"...","image":"path"}]'
 */
async function cmd_thread(flags, token) {
  let tweets = [];

  if (flags.json) {
    try { tweets = JSON.parse(flags.json); }
    catch (e) { console.error('Invalid JSON:', e.message); process.exit(1); }
  } else {
    // Collect positional --tweets args (passed as repeated --text flags or comma-joined)
    const raw = flags.tweets || flags.text || '';
    tweets = raw.split('|||').map(t => ({ text: t.trim() })).filter(t => t.text);
  }

  if (!tweets.length) {
    console.error('Usage: social.js thread --json \'[{"text":"..."},{"text":"..."}]\'');
    process.exit(1);
  }

  console.log(`\nPosting thread of ${tweets.length} tweets...\n`);

  let prev_id = null;
  const posted = [];

  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    const text = sanitize_post(tweet.text || '');
    if (!text) continue;

    const payload = { text };
    if (prev_id) payload.reply = { in_reply_to_tweet_id: prev_id };

    // Attach image if provided
    if (tweet.image) {
      try {
        const media_id = await upload_media(tweet.image, token);
        payload.media = { media_ids: [media_id] };
      } catch (e) { console.error(`Image upload failed for tweet ${i+1}: ${e.message}`); }
    }

    const data = await api2('POST', '/tweets', payload, token);
    const id = data.data?.id;
    prev_id = id;
    posted.push({ id, text: text.slice(0, 60) });

    console.log(`[${i+1}/${tweets.length}] Posted: ${id}`);
    console.log(`  "${text.slice(0, 80)}"`);
    if (i < tweets.length - 1) await new Promise(r => setTimeout(r, 2000)); // pace it
  }

  console.log(`\n✅ Thread posted — ${posted.length} tweets`);
  console.log(`   First tweet: https://x.com/kira_dao_/status/${posted[0]?.id}`);
  await log_post(posted[0]?.id, tweets.map(t=>t.text).join(' | ').slice(0, 400), 'thread');
  return posted;
}

/**
 * thread-multi-image: Post a thread where each tweet can have its own image.
 * First tweet goes through post_guard, replies bypass (they're part of same thread).
 * 
 * Usage: social.js thread-multi-image --tweets '[{"text":"...","image_path":"/path/to/img.jpg"},{"text":"...","image_path":null}]'
 * 
 * Returns: Array of { id, url } for each posted tweet
 */
async function cmd_thread_multi_image(flags, token) {
  let tweets = [];

  if (flags.tweets) {
    try { tweets = JSON.parse(flags.tweets); }
    catch (e) { console.error('Invalid JSON in --tweets:', e.message); process.exit(1); }
  } else {
    console.error('Usage: social.js thread-multi-image --tweets \'[{"text":"...","image_path":"/path/to/img.jpg"}]\'');
    process.exit(1);
  }

  if (!Array.isArray(tweets) || !tweets.length) {
    console.error('Error: --tweets must be a non-empty JSON array');
    process.exit(1);
  }

  // Validate structure
  for (let i = 0; i < tweets.length; i++) {
    if (!tweets[i].text) {
      console.error(`Error: tweet ${i} missing required "text" field`);
      process.exit(1);
    }
  }

  console.log(`\nPosting multi-image thread of ${tweets.length} tweets...\n`);

  // Apply post_guard only to the first tweet (rate limiting, duplicate check)
  const firstText = sanitize_post(tweets[0].text);
  await post_guard(firstText, flags['skip-guard']);

  let prev_id = null;
  const posted = [];

  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    const text = sanitize_post(tweet.text || '');
    if (!text) continue;

    const payload = { text };
    if (prev_id) {
      payload.reply = { in_reply_to_tweet_id: prev_id };
    }

    // Attach image if image_path is provided and not null
    const img_path = tweet.image_path || tweet.image;
    if (img_path) {
      try {
        console.log(`  Uploading image for tweet ${i+1}: ${img_path}`);
        const media_id = await upload_media(img_path, token);
        payload.media = { media_ids: [media_id] };
        console.log(`  Media uploaded: ${media_id}`);
      } catch (e) {
        console.error(`  [WARN] Image upload failed for tweet ${i+1}: ${e.message} — posting text-only`);
      }
    }

    const data = await api2('POST', '/tweets', payload, token);
    const id = data.data?.id;
    prev_id = id;
    posted.push({ id, url: `https://x.com/kira_dao_/status/${id}` });

    console.log(`[${i+1}/${tweets.length}] Posted: ${id}`);
    console.log(`  "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);
    
    // Pace between tweets
    if (i < tweets.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n✅ Multi-image thread posted — ${posted.length} tweets`);
  console.log(`   First tweet: ${posted[0]?.url}`);

  // Log the thread to Supabase
  await log_post(posted[0]?.id, tweets.map(t => t.text).join(' | ').slice(0, 400), 'thread');

  // Return JSON output for programmatic use
  console.log('\n---RESULT---');
  console.log(JSON.stringify(posted, null, 2));
  
  return posted;
}

/**
 * post-image: Post a tweet with an image attachment.
 */
async function cmd_post_image(flags, token) {
  let text = sanitize_post(flags.text || '');
  const image_path = flags['image-path'] || flags.image;

  if (!image_path) { console.error('Usage: social.js post-image --image-path <path> [--text "..."]'); process.exit(1); }

  await post_guard(text, flags['skip-guard']); // enforce 15-min gap + dedup

  console.log(`Uploading image: ${image_path}`);
  let media_id = null;
  try {
    media_id = await upload_media(image_path, token);
    console.log(`Media uploaded: ${media_id}`);
  } catch (e) {
    console.error(`[WARN] Image upload failed (${e.status || e.message}) — posting as text-only`);
  }

  const payload = { text: text || ' ' };
  if (media_id) payload.media = { media_ids: [media_id] };

  const data = await api2('POST', '/tweets', payload, token);
  const id = data.data?.id;

  if (media_id) {
    console.log(`Posted with image: ${id}`);
  } else {
    console.log(`Posted (text-only, image upload failed): ${id}`);
  }
  console.log(`URL: https://x.com/kira_dao_/status/${id}`);
  await log_post(id, text, 'art', { url_context: media_id ? `image:${image_path}` : null });
}

// ── Main ───────────────────────────────────────────────────────────────────

const COMMANDS = {
  post: cmd_post,
  reply: cmd_reply,
  like: cmd_like,
  quote: cmd_quote,
  delete: cmd_delete,
  retweet: cmd_retweet,
  follow: cmd_follow,
  unfollow: cmd_unfollow,
  dm: cmd_dm,
  timeline: cmd_timeline,
  mentions: cmd_mentions,
  'process-mentions': cmd_process_mentions,
  search: cmd_search,
  queue: cmd_queue,
  bookmark: cmd_bookmark,
  'get-bookmarks': cmd_get_bookmarks,
  'create-list': cmd_create_list,
  'add-to-list': cmd_add_to_list,
  'list-timeline': cmd_list_timeline,
  'feed-review': cmd_feed_review,
  'engagement-sync': cmd_engagement_sync,
  'post-image': cmd_post_image,
  thread: cmd_thread,
  'thread-multi-image': cmd_thread_multi_image,
  refresh: (f) => cmd_refresh(f),
};

const { command, flags } = parse_args(process.argv);
const handler = COMMANDS[command];

if (!handler) {
  console.error('Usage: social.js <post|reply|like|bookmark|get-bookmarks|quote|delete|retweet|follow|unfollow|dm|timeline|mentions|process-mentions|search|queue|create-list|add-to-list|list-timeline|feed-review|engagement-sync|post-image|thread|thread-multi-image|refresh> [options]');
  process.exit(1);
}

try {
  if (command === 'refresh') {
    await handler(flags);
  } else {
    const token = await get_access_token();
    if (!token) { console.error('No X_OAUTH2_ACCESS_TOKEN available'); process.exit(1); }
    await handler(flags, token);
  }
} catch (err) {
  const status = err.status || err.data?.status;
  if (status === 401) {
    console.error('ERROR: OAuth 2.0 token expired or invalid. Run: node social.js refresh');
    process.exit(1);
  }
  if (status === 429) { console.error('ERROR: Rate limit exceeded. Try again later.'); process.exit(1); }
  if (status === 403) { console.error('ERROR: 403 Forbidden — check app permissions or API tier.'); process.exit(1); }
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
