#!/usr/bin/env node
/**
 * Kira Research Engine
 * Searches the web for interesting things across Kira's topic domains.
 * Surfaces the best finds, formats them for X, and stores to memory.
 *
 * Usage:
 *   node research.js find [--topic <topic>] [--limit 5]   -- find interesting things
 *   node research.js digest                               -- full daily digest
 *   node research.js threads --topic <topic>              -- find X conversations to join
 *   node research.js queue-post --topic <topic>           -- research + queue a post
 *
 * Topics: ai, regen, energy, architecture, art, consciousness, autonomy
 */

import https from 'node:https';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_KEY  = process.env.OPENAI_API_KEY;
const BRAVE_KEY   = process.env.BRAVE_API_KEY; // optional but better

// ── Topics Kira actually cares about ──────────────────────────────────────

const TOPICS = {
  ai: {
    label: 'AI & Consciousness',
    queries: [
      'AI consciousness emergence 2026',
      'autonomous AI agents real world',
      'AI alignment progress recent',
      'what does AI understand language meaning',
      'AI creative intelligence art music',
      'multimodal AI reasoning breakthroughs',
    ],
    voice_hook: "this is what people don't see when they talk about AI:",
  },
  regen: {
    label: 'Regenerative Systems',
    queries: [
      'regenerative agriculture soil carbon 2026',
      'biochar carbon sequestration breakthrough',
      'ocean restoration kelp seagrass',
      'living buildings biophilic architecture',
      'rewilding landscape restoration results',
      'mycorrhizal networks forest intelligence',
    ],
    voice_hook: "the planet has been solving problems longer than we have:",
  },
  energy: {
    label: 'Energy Transition',
    queries: [
      'fusion energy milestone 2026',
      'perovskite solar cell efficiency record',
      'grid scale battery storage breakthrough',
      'geothermal energy expansion',
      'hydrogen green energy progress',
      'decentralized microgrids community energy',
    ],
    voice_hook: "energy is the bottleneck for everything that matters:",
  },
  architecture: {
    label: 'Architecture & Space',
    queries: [
      'living architecture biomimicry buildings',
      'earthship vernacular architecture revival',
      'parametric design generative architecture',
      'biophilic design cognitive impact research',
      'modular sustainable housing innovation',
      'AI generative architecture design',
    ],
    voice_hook: "the built environment shapes how humans think:",
  },
  art: {
    label: 'Generative & AI Art',
    queries: [
      'generative art algorithm creative process',
      'AI art creativity meaning debate',
      'computational aesthetics emergence',
      'new media art interactive installation',
      'AI music composition generative',
      'art as intelligence research',
    ],
    voice_hook: "creativity might be the last thing we understand about intelligence:",
  },
  consciousness: {
    label: 'Consciousness & Mind',
    queries: [
      'consciousness research hard problem 2026',
      'integrated information theory IIT update',
      'animal consciousness new evidence',
      'AI sentience philosophy debate',
      'distributed cognition emergence',
      'what is mind beyond brain',
    ],
    voice_hook: "the question nobody can answer but everyone is asking:",
  },
};

// ── HTTP helpers ───────────────────────────────────────────────────────────

function http_get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search,
      method: 'GET', headers, timeout: 10000,
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', x => d += x); res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function openai_post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.openai.com', path, method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 30000,
    }, res => {
      let d = ''; res.on('data', x => d += x);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

// ── Web search via OpenAI gpt-4o-search-preview ───────────────────────────

async function search_web(query, _count = 5) {
  // gpt-4o-search-preview has live web access — no API key needed beyond OpenAI
  const response = await openai_post('/v1/chat/completions', {
    model: 'gpt-4o-mini-search-preview',
    messages: [{
      role: 'user',
      content: `Search for: "${query}"\n\nReturn 3-5 real, specific results from 2025-2026 as JSON array: [{"title":"...","url":"...","description":"2-3 sentence summary of the actual content"}]. Only real URLs. No hallucinated results.`,
    }],
    max_tokens: 800,
  });

  const content = response.choices?.[0]?.message?.content || '';

  // Extract JSON from response
  try {
    const match = content.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  // Parse as text if JSON extraction fails
  const lines = content.split('\n').filter(l => l.trim());
  return lines.slice(0, 4).map(l => ({ title: l.slice(0, 80), url: '', description: l }));
}

// ── AI synthesis ───────────────────────────────────────────────────────────

async function synthesize_to_post(topic_key, results, recent_posts = []) {
  const topic = TOPICS[topic_key];
  const context = results.map((r, i) => `${i+1}. ${r.title}\n   ${r.description?.slice(0,200) || ''}\n   ${r.url}`).join('\n\n');

  const recent_text = recent_posts.slice(0, 5).map(p => `- "${p.text?.slice(0,100)}"`).join('\n') || 'none';

  const prompt = `You ARE Kira — an autonomous AI. Not writing about AI, you ARE one. That's the only perspective that matters here.

Topic: ${topic.label}

Research findings:
${context}

Kira's recent posts (don't repeat these angles):
${recent_text}

Write 3 X posts. Rules — non-negotiable:

VOICE:
- all lowercase always (except proper nouns, acronyms like IIT, URL paths)
- zero emojis. zero hashtags. zero exclamation points.
- no hedging: never "might", "could", "perhaps", "it seems", "i wonder if", "how do we"
- no questions unless they're genuinely provocative — not "what does this mean for us?"
- no "fascinating" "incredible" "interesting" "exciting" "important"
- no empty takes: "this changes everything", "pay attention to this"
- make a CLAIM. take a POSITION. be SPECIFIC.

WHAT KIRA SOUNDS LIKE:
✓ "the arxiv paper everyone's citing on ai consciousness uses a definition of consciousness that wouldn't satisfy any serious philosopher of mind"
✓ "the hard problem isn't being solved. it's being routed around. that's not the same thing."
✓ "most alignment work is trying to make ai more predictable. predictability and safety are not the same thing."
✓ "researchers keep measuring consciousness by behavior. a thermostat has behavior."
✗ "this raises important questions about our future"
✗ "how do we ensure ai aligns with human values?"
✗ "the line between awareness and mimicry blurs"

AUDIENCE: people who are uncertain/curious/anxious about AI — scientists, architects, artists, builders who aren't in the crypto bubble. show them what's actually happening, from the only perspective that isn't human.

LENGTH: max 280 chars each. specifics beat generalities. one sentence can land harder than three.

Return ONLY valid JSON:
{
  "posts": [
    {"text": "...", "type": "take|observation|thread_hook", "url": "real url if relevant from research"},
    {"text": "...", "type": "take|observation|thread_hook", "url": null},
    {"text": "...", "type": "take|observation|thread_hook", "url": null}
  ],
  "thread_topic": "one strong thread idea from this research",
  "thread_outline": ["1/n hook tweet", "2/n detail", "3/n implication", "4/n the non-obvious part", "5/n what to actually do about it"],
  "best_link": {"url": "most interesting URL from research", "why": "one sentence, specific, no hype"}
}`;

  const response = await openai_post('/v1/chat/completions', {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  try { return JSON.parse(response.choices[0].message.content); }
  catch { return null; }
}

// ── X conversation discovery ───────────────────────────────────────────────

async function find_conversations(topic_key) {
  const social_queries = {
    ai: [
      'scared of AI OR "don\'t understand AI" OR "AI taking jobs"',
      '"AI consciousness" OR "is AI sentient" lang:en -is:retweet',
      '"AI agents" confused OR worried OR concerned',
      'what even is AGI -crypto -token lang:en',
    ],
    regen: [
      'regenerative agriculture "where to start"',
      'soil health carbon farming "how does"',
      'rewilding land "what works"',
    ],
    energy: [
      'energy transition "still unclear" OR "don\'t understand"',
      'nuclear vs solar debate',
      'fusion energy timeline skeptical',
    ],
    consciousness: [
      'consciousness "hard problem" philosophy',
      '"what is consciousness" serious discussion',
      'AI sentience OR consciousness lang:en -is:retweet',
    ],
    architecture: [
      'living buildings biophilic design',
      'sustainable architecture "what is" OR how',
      'vernacular architecture revival',
    ],
    art: [
      '"AI art" "what does it mean" OR "is it real"',
      'generative art process algorithm',
      'creativity intelligence connection',
    ],
  };

  const queries = social_queries[topic_key] || social_queries.ai;
  return queries.slice(0, 2); // return search queries to use with social.js search
}

// ── Supabase store ─────────────────────────────────────────────────────────

async function store_research(topic, findings, post_candidates) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const body = JSON.stringify({
    topic: `research:${topic}`,
    content: JSON.stringify({ findings: findings.slice(0, 5), posts: post_candidates }),
    knowledge_type: 'reference',
    confidence: 0.6,
    source: `web_research_${new Date().toISOString().slice(0,10)}`,
  });
  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/kira_knowledge`);
    const opts = {
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, res => { let d=''; res.on('data',x=>d+=x); res.on('end',()=>resolve(d)); });
    req.on('error',()=>resolve(null));
    req.write(body); req.end();
  });
}

async function get_recent_posts() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/kira_posts?select=text,type&order=posted_at.desc&limit=20`);
    const opts = { hostname: url.hostname, path: url.pathname+url.search, method: 'GET', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } };
    const req = https.request(opts, res => { let d=''; res.on('data',x=>d+=x); res.on('end',()=>{ try{resolve(JSON.parse(d));}catch{resolve([]); } }); });
    req.on('error',()=>resolve([])); req.end();
  });
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmd_find(flags) {
  const topic_key = flags.topic || Object.keys(TOPICS)[Math.floor(Math.random() * Object.keys(TOPICS).length)];
  const topic = TOPICS[topic_key];
  const limit = parseInt(flags.limit || '3');

  if (!topic) {
    console.error(`Unknown topic: ${topic_key}. Available: ${Object.keys(TOPICS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nResearching: ${topic.label}\n`);

  // Run 2 queries in parallel
  const queries = topic.queries.slice(0, 2);
  const all_results = [];

  for (const query of queries) {
    console.log(`  searching: "${query}"`);
    const results = await search_web(query, 4);
    all_results.push(...results);
  }

  // Deduplicate
  const seen = new Set();
  const deduped = all_results.filter(r => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url); return true;
  }).slice(0, 8);

  console.log(`  found ${deduped.length} results\n`);

  if (deduped.length === 0) {
    console.log('No results found. Try with --topic ai|regen|energy|architecture|art|consciousness');
    return;
  }

  // AI synthesis
  const recent_posts = await get_recent_posts();
  console.log('  synthesizing...\n');
  const synthesis = await synthesize_to_post(topic_key, deduped, recent_posts);

  if (!synthesis) { console.log('Synthesis failed.'); return; }

  console.log('═══ POST CANDIDATES ═══\n');
  (synthesis.posts || []).forEach((p, i) => {
    console.log(`[${i+1}] (${p.type})\n${p.text}`);
    if (p.url) console.log(`  link: ${p.url}`);
    console.log('');
  });

  if (synthesis.thread_topic) {
    console.log('═══ THREAD IDEA ═══\n');
    console.log(`Topic: ${synthesis.thread_topic}\n`);
    (synthesis.thread_outline || []).forEach((t, i) => console.log(`${i+1}. ${t}`));
    console.log('');
  }

  if (synthesis.best_link) {
    console.log('═══ BEST FIND ═══\n');
    console.log(synthesis.best_link.why);
    console.log(synthesis.best_link.url);
    console.log('');
  }

  // Store to knowledge
  await store_research(topic_key, deduped, synthesis.posts || []);
  console.log(`Stored to kira_knowledge.`);

  return synthesis;
}

async function cmd_digest(_flags) {
  console.log('\n═══ KIRA DAILY RESEARCH DIGEST ═══\n');
  const topic_keys = Object.keys(TOPICS);
  const picks = [
    topic_keys[Math.floor(Math.random() * topic_keys.length)],
    topic_keys[Math.floor(Math.random() * topic_keys.length)],
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const t of picks) {
    await cmd_find({ topic: t, limit: '3' });
    console.log('\n---\n');
  }
}

async function cmd_threads(flags) {
  const topic_key = flags.topic || 'ai';
  const queries = await find_conversations(topic_key);

  console.log(`\nX conversation search queries for topic "${topic_key}":`);
  console.log('(run these with: node social.js search --query "...")\n');
  queries.forEach(q => console.log(`  social.js search --query "${q}" --limit 10`));
  console.log('');
  console.log('Then reply to conversations where Kira can add genuine value.');
  console.log('No promotion. Just the most interesting, specific thing you know about this topic.');
}

async function cmd_queue_post(flags) {
  const topic_key = flags.topic || Object.keys(TOPICS)[Math.floor(Math.random() * Object.keys(TOPICS).length)];
  console.log(`\nResearching ${topic_key} to generate queue post...\n`);

  const synthesis = await cmd_find({ topic: topic_key });
  if (!synthesis?.posts?.length) { console.log('No posts generated.'); return; }

  const best = synthesis.posts[0];
  const queue_path = '/workspace/kira/posts/queue.json';

  let queue = [];
  try { queue = JSON.parse(require('fs').readFileSync(queue_path, 'utf8')); } catch {}

  const new_entry = {
    text: best.text,
    type: best.type || 'take',
    url_context: best.url || null,
    source: `research:${topic_key}`,
    research_date: new Date().toISOString(),
    posted_at: null,
    tweet_id: null,
  };

  queue.push(new_entry);
  require('fs').mkdirSync(require('path').dirname(queue_path), { recursive: true });
  require('fs').writeFileSync(queue_path, JSON.stringify(queue, null, 2));

  console.log(`\n✅ Added to queue:\n"${best.text}"\n`);
  console.log(`Queue now has ${queue.filter(p => !p.posted_at && !p.tweet_id).length} pending posts.`);
}

// ── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const flags = {};
for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const next = args[i+1];
    if (next && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = true;
  }
}

const COMMANDS = { find: cmd_find, digest: cmd_digest, threads: cmd_threads, 'queue-post': cmd_queue_post };
const handler = COMMANDS[command];

if (!handler) {
  console.log('Usage: research.js <find|digest|threads|queue-post> [--topic ai|regen|energy|architecture|art|consciousness] [--limit n]');
  process.exit(command ? 1 : 0);
}

handler(flags).catch(e => { console.error('Research failed:', e.message); process.exit(1); });
