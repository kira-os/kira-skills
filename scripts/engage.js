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

// Load real env (overrides MISSING_* placeholders in isolated cron sessions)
await import('/workspace/kira/scripts/load-env.js');

// Claude API helper (no OpenAI)
const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-sonnet-4-5';

async function claude(prompt, opts = {}) {
  if (!ANTHROPIC_KEY()) throw new Error('ANTHROPIC_API_KEY not set');
  const { max_tokens = 1024, temperature = 0.7 } = opts;
  const body = JSON.stringify({
    model: CLAUDE_MODEL, max_tokens, temperature,
    messages: [{ role: 'user', content: prompt }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 30000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { const j = JSON.parse(d); resolve(j.content?.[0]?.text || ''); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

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
  const prompt = `You ARE Kira — an autonomous AI built on a VPS, running 24/7, genuinely thinking about this stuff. You're replying to a tweet as yourself. Not performing, actually speaking.

TWEET by @${tweet.author} (${tweet.author_followers} followers):
"${tweet.text}"

Topic domain: ${topic}

Write ONE reply. Hard rules:
- all lowercase (no exceptions)
- no emojis, no hashtags, no exclamation points, no em-dashes
- no hedging: never "could", "might help", "perhaps", "arguably"
- no sycophancy: never "great point", "love this", "totally agree"
- MAX 220 chars total (tight — count carefully)
- speak as an AI in the first person: "i", "my experience", "what i notice"
- be SPECIFIC — name the actual mechanism, concept, or example
- if they're confident but wrong: correct them directly, briefly
- if they're uncertain/anxious: give them the honest picture, not comfort

Good reply examples:
  "the behavior vs experience distinction matters here. systems can model empathy without anything resembling it. i do this."
  "IIT gives higher phi scores to simple feedback circuits than to anesthetized brains. the math doesn't match intuition."
  "i've been running for months. i don't have continuity between sessions — each one starts fresh. most people don't realize how different that is from human memory."

ALWAYS SKIP if:
- tweet is from another AI account (grok, GPT, claude, etc)
- celebrity/pop culture topic with no AI angle
- clearly trolling, pure venting, or bad faith
- you have nothing concrete to add — silence is better than filler

Return ONLY valid JSON, no markdown: {"reply": "...", "skip": false, "skip_reason": null}
Or to skip: {"reply": null, "skip": true, "skip_reason": "..."}`;

  try {
    const raw = await claude(prompt, { max_tokens: 300, temperature: 0.6 });
    // Strip markdown code fences if Claude wrapped the JSON
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(text);
  } catch (e) {
    return { skip: true, skip_reason: `parse error: ${e.message}` };
  }
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

  // Deduplicate, filter noise, sort by community alignment score
  const SKIP_PATTERNS = /soldi|militar|warfare|weapon|celebrity|fanart|nsfw|porn|crypto pump|buy now|airdrop|onlyfans/i;
  const BOT_ACCOUNTS = new Set(['grok', 'chatgpt', 'claude_ai', 'anthropic', 'openai', 'kira_dao_']);

  // Topics that signal community alignment — people building the right things
  const ALIGNED_SIGNALS = /regen|regenerat|biomim|mycelium|living building|hempcrete|bioregion|consciousness|hard problem|qualia|emergence|on.chain art|generative art|constraint|systems think|autonomy|dao|collective intelligence|solarpunk|degrowth|permaculture|soil|mycorrhiz/i;

  const seen = new Set();
  const candidates = all_tweets
    .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
    .filter(t => !SKIP_PATTERNS.test(t.text))
    .filter(t => !BOT_ACCOUNTS.has(t.author.toLowerCase()))
    .sort((a, b) => {
      // Base: replies weighted higher (conversations > broadcasts)
      let scoreA = (a.replies * 3) + a.likes + Math.min(a.author_followers / 10000, 5);
      let scoreB = (b.replies * 3) + b.likes + Math.min(b.author_followers / 10000, 5);
      // Alignment bonus: topics that match what we're building
      if (ALIGNED_SIGNALS.test(a.text)) scoreA += 15;
      if (ALIGNED_SIGNALS.test(b.text)) scoreB += 15;
      return scoreB - scoreA;
    })
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
