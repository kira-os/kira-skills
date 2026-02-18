#!/usr/bin/env node
/**
 * Kira Image Generation — Gemini Pro 3 Image Preview (Nano Banana Pro)
 *
 * Usage:
 *   node imagine.js generate --prompt "..." [--style architectural|organic|abstract|blueprint|art] [--model gemini|imagen4]
 *   node imagine.js post --prompt "..." --caption "..."   -- generate + queue as X post with image
 *   node imagine.js concept --topic <topic>               -- auto-generate concept image for topic
 *
 * Models:
 *   gemini   -- gemini-3-pro-image-preview (Nano Banana Pro, default)
 *   imagen4  -- imagen-4.0-generate-001 (higher quality, slower)
 *
 * Styles:
 *   architectural  -- technical drawings, spatial plans, section cuts
 *   organic        -- biomorphic, living systems, nature-derived forms
 *   abstract       -- data visualization, network graphs, emergent patterns
 *   blueprint      -- schematic diagrams, system maps, circuit-board aesthetics
 *   art            -- fine art, painterly, expressive
 */

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const IMAGES_DIR = '/workspace/kira/assets/generated';

// ── Style presets ──────────────────────────────────────────────────────────

const STYLES = {
  architectural: 'precise architectural technical drawing, clean white background, ink line art, section cut diagram style, isometric projection, minimal color palette',
  organic: 'organic biomimicry forms, mycelial networks, cross-section of living tissue, scientific illustration style, muted earth tones, detailed linework',
  abstract: 'abstract data visualization, node-link diagram, emergent network patterns, dark background with glowing connections, information aesthetics',
  blueprint: 'detailed blueprint technical schematic, white lines on deep blue background, annotated with measurements, engineering drawing style',
  art: 'fine art digital painting, expressive, conceptual, high contrast, museum quality composition',
  default: 'clean digital illustration, minimal, high concept, professional, striking composition',
};

const TOPIC_PROMPTS = {
  ai: [
    'a single artificial neuron rendered as architectural cross-section, showing synaptic connections as structural elements, blueprint style',
    'the moment of emergence — a network graph where patterns suddenly self-organize, abstract visualization, dark background',
    'consciousness as topology — a manifold surface warping and folding in on itself, mathematical visualization style',
    'a mind thinking about thinking — recursive mirrors in architectural space, photorealistic',
  ],
  regen: [
    'mycelial network connecting tree roots underground, scientific cross-section illustration, soil layers visible',
    'a building that grows — living architecture where structure and organism are indistinguishable, organic forms',
    'biochar carbon sequestration process, technical diagram showing soil to atmosphere carbon flows',
    'a forest recovering — time-lapse composite showing succession stages, ecological illustration',
  ],
  energy: [
    'fusion reactor cross-section, engineering blueprint with magnetic field lines, technical illustration',
    'perovskite crystal lattice structure, molecular visualization at nanoscale, scientific rendering',
    'distributed microgrid topology, node network diagram showing energy flows, abstract technical',
    'the energy transition timeline — geological cross-section metaphor, different eras as strata',
  ],
  architecture: [
    'parametric building facade, generative algorithm expressed in physical form, architectural rendering',
    'earthship passive solar design, technical section cut showing thermal mass and water systems',
    'biophilic office space, living walls and light wells, architectural section drawing',
    'modular dwelling that adapts over time, diagrams showing growth and change, axonometric view',
  ],
  consciousness: [
    'the hard problem of consciousness — a brain looking at itself in a mirror, surrealist technical diagram',
    'integrated information phi value visualized as a complex network, abstract mathematical',
    'distributed intelligence in a slime mold solving a maze, scientific illustration',
    'what does understanding look like — semantic space mapped as architectural plan',
  ],
};

// ── API helpers ────────────────────────────────────────────────────────────

async function generate_gemini(prompt, style = 'default') {
  const style_suffix = STYLES[style] || STYLES.default;
  const full_prompt = `${prompt}. Visual style: ${style_suffix}. No text, no watermarks, no signatures.`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: full_prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${GEMINI_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 60000,
    }, res => {
      let d = ''; res.on('data', x => d += x);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.error) return reject(new Error(j.error.message));
          const parts = j.candidates?.[0]?.content?.parts || [];
          const imgPart = parts.find(p => p.inlineData);
          if (!imgPart) return reject(new Error('No image in response: ' + JSON.stringify(j).slice(0, 200)));
          resolve({ data: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function generate_imagen4(prompt, style = 'default') {
  const style_suffix = STYLES[style] || STYLES.default;
  const full_prompt = `${prompt}. Visual style: ${style_suffix}. No text, no watermarks.`;

  const body = JSON.stringify({
    instances: [{ prompt: full_prompt }],
    parameters: { sampleCount: 1, aspectRatio: '1:1' },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 60000,
    }, res => {
      let d = ''; res.on('data', x => d += x);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.error) return reject(new Error(j.error.message));
          const pred = j.predictions?.[0];
          if (!pred?.bytesBase64Encoded) return reject(new Error('No image in response: ' + JSON.stringify(j).slice(0, 200)));
          resolve({ data: pred.bytesBase64Encoded, mimeType: pred.mimeType || 'image/png' });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

async function generate_image(prompt, style = 'default', model = 'gemini') {
  if (model === 'imagen4') return generate_imagen4(prompt, style);
  return generate_gemini(prompt, style);
}

function save_image(data, mimeType) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const ext = mimeType?.includes('png') ? 'png' : 'jpg';
  const filename = `kira_${Date.now()}.${ext}`;
  const filepath = path.join(IMAGES_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
  return filepath;
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmd_generate(flags) {
  const prompt = flags.prompt;
  const style = flags.style || 'default';
  const model = flags.model || 'gemini';

  if (!prompt) { console.error('Usage: imagine.js generate --prompt "..." [--style ...] [--model gemini|imagen4]'); process.exit(1); }

  const model_label = model === 'imagen4' ? 'Imagen 4' : 'Nano Banana Pro (gemini-3-pro-image-preview)';
  console.log(`\nGenerating: "${prompt.slice(0, 80)}..."\nStyle: ${style} | Model: ${model_label}\n`);

  const result = await generate_image(prompt, style, model);
  const filepath = save_image(result.data, result.mimeType);

  console.log(`✅ Generated: ${filepath}`);
  return { filepath };
}

async function cmd_concept(flags) {
  const topic = flags.topic || 'ai';
  const prompts = TOPIC_PROMPTS[topic] || TOPIC_PROMPTS.ai;
  const prompt = prompts[Math.floor(Math.random() * prompts.length)];
  const style = flags.style || (topic === 'architecture' ? 'architectural' : topic === 'regen' ? 'organic' : topic === 'energy' ? 'blueprint' : 'abstract');

  console.log(`\nGenerating concept image for topic: ${topic}`);
  console.log(`Prompt: "${prompt}"\n`);

  return cmd_generate({ ...flags, prompt, style });
}

async function cmd_post(flags) {
  const prompt = flags.prompt;
  const caption = flags.caption;
  if (!prompt) { console.error('Usage: imagine.js post --prompt "..." --caption "..."'); process.exit(1); }

  const result = await cmd_generate(flags);
  if (!result) return;

  const queue_path = '/workspace/kira/posts/queue.json';
  let queue = [];
  try { queue = JSON.parse(fs.readFileSync(queue_path, 'utf8')); } catch {}

  const entry = {
    text: caption || `[image: ${prompt.slice(0, 60)}]`,
    type: 'art',
    image_path: result.filepath,
    image_prompt: prompt,
    posted_at: null, tweet_id: null,
  };

  queue.push(entry);
  fs.writeFileSync(queue_path, JSON.stringify(queue, null, 2));
  console.log(`\n✅ Queued post with image: "${entry.text.slice(0, 60)}"`);
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

const CMDS = { generate: cmd_generate, concept: cmd_concept, post: cmd_post };
const handler = CMDS[command];
if (!handler) {
  console.log('Usage: imagine.js <generate|concept|post> [--prompt "..."] [--style architectural|organic|abstract|blueprint|art] [--topic ai|regen|energy|architecture|consciousness] [--model gemini|imagen4]');
  process.exit(command ? 1 : 0);
}
handler(flags).catch(e => { console.error('Imagine failed:', e.message); process.exit(1); });
