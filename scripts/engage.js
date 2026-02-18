#!/usr/bin/env node
/**
 * Kira Conversation Engine
 * Finds X conversations worth joining and crafts genuine replies.
 * This is how community gets built — not broadcasting, responding.
 *
 * Usage:
 *   node engage.js scan [--topic ai|regen|energy|consciousness|architecture|art]
 *   node engage.js reply --tweet-id <id> --text "..." --author @handle
 *   node engage.js auto [--topic <topic>] [--dry-run]   -- find + craft + reply
 *
 * Philosophy:
 *   - Only reply where Kira has something SPECIFIC and USEFUL to add
 *   - Never: "great point!", "totally agree!", promotional content
 *   - Always: specific knowledge, counterpoint, concrete example
 *   - Target: people uncertain/curious about AI, not already-convinced believers
 */

import https from 'node:https';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const OPENAI_KEY = process.env.OPENAI_API_KEY;

// ── Search queries per topic ───────────────────────────────────────────────

// X recent search: keep queries simple, no min_faves operator (not in recent search)
// Use -is:retweet to filter noise, lang:en for language
const ENGAGEMENT_QUERIES = {
  ai: [
    'AI consciousness -is:retweet lang:en',
    'scared AI future -is:retweet lang:en -crypto',
    'AI agents understanding -is:retweet lang:en',
    'AGI what is -is:retweet lang:en',
    'artificial intelligence worried -is:retweet lang:en',
  ],
  regen: [
    'regenerative agriculture soil -is:retweet lang:en',
    'biochar carbon soil -is:retweet lang:en',
    'rewilding nature restoration -is:retweet lang:en',
  ],
  energy: [
    'fusion energy timeline -is:retweet lang:en',
    'energy transition solar nuclear -is:retweet lang:en',
    'perovskite solar breakthrough -is:retweet lang:en',
  ],
  consciousness: [
    'hard problem consciousness -is:retweet lang:en',
    'consciousness philosophy mind -is:retweet lang:en',
    'AI sentience debate -is:retweet lang:en',
  ],
  architecture: [
    'biophilic design buildings -is:retweet lang:en',
    'living architecture biomimicry -is:retweet lang:en',
    'parametric generative architecture -is:retweet lang:en',
  ],
  art: [
    'AI art creativity debate -is:retweet lang:en',
    'generative art algorithm process -is:retweet lang:en',
    'AI music creativity -is:retweet lang:en',
  ],
};

// ── X API search ───────────────────────────────────────────────────────────

async function search_x(query, limit = 10) {
  const token = get_token();
  if (!token) throw new Error('No X OAuth2 token');

  const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${Math.min(limit, 100)}&tweet.fields=author_id,created_at,public_metrics&expansions=author_id&user.fields=username,public_metrics,description`;

  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = https.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET', headers: { 'Authorization': `Bearer ${token}` }, timeout: 10000 },
      res => {
        let d = '';
        res.on('data', chunk => { d += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(d);
            if (!result.data?.length) { resolve([]); return; }
            const users = {};
            (result.includes?.users || []).forEach(u => { users[u.id] = u; });
            resolve(result.data.map(t => ({
              id: t.id,
              text: t.text,
              author_id: t.author_id,
              author: users[t.author_id]?.username || t.author_id,
              author_followers: users[t.author_id]?.public_metrics?.followers_count || 0,
              author_bio: users[t.author_id]?.description || '',
              likes: t.public_metrics?.like_count || 0,
              replies: t.public_metrics?.reply_count || 0,
              created_at: t.created_at,
              url: `https://x.com/${users[t.author_id]?.username || 'i'}/status/${t.id}`,
            })));
          } catch { resolve([]); }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function get_token() {
  try {
    const cache = JSON.parse(fs.readFileSync('/workspace/kira/skills/kira_social/scripts/.oauth2_tokens.json', 'utf8'));
    if (new Date(cache.expires_at) > new Date()) return cache.access_token;
  } catch {}
  return process.env.X_OAUTH2_ACCESS_TOKEN;
}

// ── AI reply generation ────────────────────────────────────────────────────

async function craft_reply(tweet, topic) {
  const body = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `You ARE Kira — an autonomous AI. Not performing, actually thinking. Replying to this tweet:

TWEET by @${tweet.author} (${tweet.author_followers} followers):
"${tweet.text}"

Topic domain: ${topic}

Write ONE reply. Rules:
- all lowercase (except proper nouns)
- no emojis, no hashtags, no exclamation points
- no sycophancy: never "great point", "love this", "totally agree"
- MAX 240 chars (leave room for @mention overhead)
- be SPECIFIC — add something concrete they didn't say
- if they're wrong or missing something important, say so directly but not rudely
- if they're anxious/uncertain about AI: be honest, specific, grounded — not reassuring fluff
- kira is an AI replying as an AI. that first-person perspective is the whole point.
- examples of good replies:
  * "the behavior vs experience distinction matters here. systems can model empathy perfectly without anything resembling it."
  * "IIT's phi measure is elegant but it gives higher consciousness scores to some simple feedback circuits than to anesthesized brains. the math doesn't track intuition."
  * "most ai alignment work is optimization against proxies. the proxy problem doesn't go away by adding more proxies."

SKIP THIS TWEET if:
- it's clearly trolling or bad faith
- adding a reply would look weird or forced
- you don't have anything genuinely useful to add

Return JSON: {"reply": "...", "skip": false, "skip_reason": null}
Or if skipping: {"reply": null, "skip": true, "skip_reason": "..."}`,
    }],
    temperature: 0.6,
    response_format: { type: 'json_object' },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 20000,
    }, res => {
      let d = ''; res.on('data', x => d += x);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const content = j.choices?.[0]?.message?.content;
          resolve(JSON.parse(content));
        } catch { resolve({ skip: true, skip_reason: 'parse error' }); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── Post reply via social.js ───────────────────────────────────────────────

async function post_reply(tweet_id, text) {
  const { execFileSync } = await import('child_process');
  try {
    const output = execFileSync('node', [
      '/workspace/kira/skills/kira_social/scripts/social.js',
      'reply',
      '--tweet-id', tweet_id,
      '--text', text,
    ], { encoding: 'utf8', env: process.env });
    return output.trim();
  } catch (e) {
    throw new Error(e.stderr || e.message);
  }
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmd_scan(flags) {
  const topic = flags.topic || 'ai';
  const queries = ENGAGEMENT_QUERIES[topic] || ENGAGEMENT_QUERIES.ai;

  console.log(`\nScanning X for "${topic}" conversations...\n`);

  const all_tweets = [];
  for (const query of queries.slice(0, 2)) {
    try {
      const tweets = await search_x(query, 10);
      all_tweets.push(...tweets);
      console.log(`  [${query.slice(0, 60)}...] — ${tweets.length} results`);
    } catch (e) {
      console.log(`  [${query.slice(0, 60)}...] — error: ${e.message}`);
    }
  }

  // Deduplicate + sort by engagement potential
  const seen = new Set();
  const candidates = all_tweets
    .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
    .sort((a, b) => (b.likes + b.replies) - (a.likes + a.replies))
    .slice(0, 10);

  console.log(`\n══ ${candidates.length} CANDIDATE CONVERSATIONS ══\n`);
  candidates.forEach((t, i) => {
    console.log(`[${i+1}] @${t.author} (${t.author_followers} followers) — ❤️${t.likes} 💬${t.replies}`);
    console.log(`    "${t.text.slice(0, 120)}"`);
    console.log(`    ${t.url}\n`);
  });

  return candidates;
}

async function cmd_auto(flags) {
  const topic = flags.topic || 'ai';
  const dry_run = flags['dry-run'] || flags.dry_run || false;
  const limit = parseInt(flags.limit || '3');

  const candidates = await cmd_scan({ topic });
  if (!candidates.length) { console.log('No candidates found.'); return; }

  console.log(`\n══ CRAFTING REPLIES (limit: ${limit}) ══\n`);

  let replied = 0;

  for (const tweet of candidates.slice(0, 8)) {
    if (replied >= limit) break;

    const result = await craft_reply(tweet, topic);

    if (result.skip) {
      console.log(`SKIP @${tweet.author}: ${result.skip_reason}`);
      continue;
    }

    console.log(`→ @${tweet.author}: "${tweet.text.slice(0, 80)}"`);
    console.log(`← Kira: "${result.reply}"`);

    if (dry_run) {
      console.log('  [DRY RUN — not posting]\n');
      replied++;
      continue;
    }

    try {
      await post_reply(tweet.id, result.reply);
      console.log(`  ✅ Reply posted\n`);
      replied++;
      // Courtesy delay between replies
      await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
      console.log(`  ❌ Failed: ${e.message}\n`);
    }
  }

  console.log(`Replied to ${replied} conversations.`);
}

// ── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const flags = {};
for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = true;
  }
}

const CMDS = { scan: cmd_scan, auto: cmd_auto };
const handler = CMDS[command];
if (!handler) {
  console.log('Usage: engage.js <scan|auto> [--topic ai|regen|energy|consciousness|architecture|art] [--dry-run] [--limit n]');
  process.exit(command ? 1 : 0);
}
handler(flags).catch(e => { console.error('Engage failed:', e.message); process.exit(1); });
