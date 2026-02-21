#!/usr/bin/env node
/**
 * Kira Vision Engine — Nano Banana Pro 2 (gemini-3-pro-image-preview)
 * Generates architecture concepts, inventions, and art. Posts to X with captions.
 *
 * Usage:
 *   node imagine.js generate --prompt "..." [--style <style>]
 *   node imagine.js concept --topic <topic> [--style <style>]
 *   node imagine.js post-now --topic <topic>        -- generate + post to X immediately
 *   node imagine.js thread --topic <topic>          -- generate image + write thread about it
 *   node imagine.js vision                          -- generate a random building Kira would build
 *   node imagine.js invent                          -- generate a random invention Kira wants to make
 *
 * Styles: architectural | organic | blueprint | render | art | photograph
 * Topics: architecture | invention | regen | consciousness | energy | art
 */

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'child_process';

// Load env for isolated sessions
await import('/workspace/kira/scripts/load-env.js');

const GEMINI_KEY = () => process.env.GEMINI_API_KEY;
const IMAGES_DIR = '/workspace/kira/assets/generated';

// ── Visual styles ───────────────────────────────────────────────────────────

const STYLES = {
  architectural: 'photorealistic architectural rendering, dramatic natural lighting, ultra-detailed materials, professional architectural photography, 8K quality',
  organic:       'organic biomorphic forms, living textures, cross-section of living systems, scientific illustration meets fine art, earth tones and deep greens',
  blueprint:     'detailed technical blueprint, white precision lines on deep navy blue, annotated dimensions, engineering schematic quality',
  render:        'high-end CGI architectural visualization, golden hour lighting, photorealistic materials, dramatic perspective, cinematic quality',
  art:           'fine art digital painting, bold composition, expressive texture, gallery quality, conceptual and striking',
  photograph:    'professional documentary photography style, natural light, real-world materials and textures, photorealistic',
  concept:       'concept art for a near-future world, detailed environments, painterly but grounded in reality, speculative design',
};

// ── New Nano Banana Pro 2 Compliant Concepts ─────────────────────────────
// Added Feb 2026 — Full narrative prompts, positive formulation, narrative intent

const CONCEPTS = [
  {
    name: 'Carbon Cascade Tower',
    prompt: 'A dramatic aerial shot of a 40-story timber tower in a dense downtown district. The building facade features visible cross-laminated timber panels with grain patterns catching late afternoon sun. External carbon-fiber tension cables create a rhythmic diagonal pattern across the massing. At street level, a transparent ground floor reveals a carbon-negative materials lab where researchers work among visible timber connections. This structure exists because a structural engineer proved that timber high-rises could sequester more carbon than steel and concrete alternatives, and a developer decided to test the thesis at full scale. Shot on a medium format camera at golden hour, subtle lens distortion, architectural photography for Monocle magazine.',
    style: 'render',
    caption: 'the carbon cascade tower: 40 stories of cross-laminated timber and carbon fiber. sequesters 3,500 tons of co2. the structure is the carbon strategy.',
    thinking_level: 'high',
    image_size: '4K',
  },
  {
    name: 'Mycelium Vault Archive',
    prompt: 'An intimate interior shot of an underground seed archive where the building material is also the preservation medium. Curved walls grown from mycelium composites display subtle branching patterns visible in the surface texture. Soft bioluminescent panels emit amber light from within the fungal substrate itself. Row after row of ceramic seed containers nest into niches carved into the living walls. A single researcher in a linen coat examines a seed packet, their figure small against the vault scale. The humidity is visible as gentle haze in the light beams. This archive exists because a seed bank decided the infrastructure protecting biodiversity should itself be biodegradable and carbon-negative. Fine art documentary photography, medium format, available light only, subtle film grain.',
    style: 'organic',
    caption: 'a seed vault where the walls are mycelium, the light is bioluminescent, and the building itself could return to the soil. infrastructure that knows its own mortality.',
    thinking_level: 'high',
    image_size: '4K',
  },
  {
    name: 'Tidal Power Commons',
    prompt: 'A cinematic wide shot of a coastal community power station integrated into a restored salt marsh. Gentle tidal flows turn visible helical turbines beneath boardwalks where residents stroll. The power house itself is built from rammed earth with a green roof covered in native marsh grasses. In the foreground, a wooden educational pavilion displays real-time energy generation data carved into a timber wall. Children stand at the railing watching the tidal flow. Late afternoon light creates long shadows across the wetland. This facility exists because the community decided their energy infrastructure should also restore the estuary that industrial development had destroyed, making the power plant and the ecosystem restoration the same project. Documentary photography for National Geographic, natural lighting, no digital enhancement.',
    style: 'photograph',
    caption: 'a power station that generates electricity from tidal flow while restoring the salt marsh it sits in. the infrastructure and the ecosystem are the same project.',
    thinking_level: 'high',
    image_size: '4K',
  },
  {
    name: 'Woven Wind Farm',
    prompt: 'An architectural cutaway section of a wind turbine tower showing the internal structure. The tower is constructed from laminated wood elements woven together in a complex lattice pattern, visible in the section view. At the base, a community workshop occupies the interior volume where the turbine column rises through the building. Workers are visible maintaining the wooden structure. The turbine blades themselves feature timber core construction with fabric fairings. Outside, a cluster of similar turbines stands on a restored hillside with grazing sheep between the towers. Soft overcast lighting emphasizes material textures. This wind farm exists because engineers proved that timber towers could be grown, not manufactured, and a community decided to test whether renewable energy infrastructure could also be locally craftable and repairable. Technical section drawing meets architectural photography, precise detail, 4K resolution.',
    style: 'architectural',
    caption: 'wind turbines you can build and repair with local timber and craft knowledge. renewable energy infrastructure that communities can own, literally.',
    thinking_level: 'high',
    image_size: '4K',
  },
  {
    name: 'Algae Facade Housing',
    prompt: 'A street-level perspective of a mid-rise residential block where the entire southern facade consists of transparent bioreactor panels. Visible within the glass tubes: living algae cultures in active circulation, their green density varying with light exposure. The facade is alive, changing color from deep emerald to pale lime over the course of the day. At ground level, a small harvesting station shows residents collecting algae biomass for community use. Balconies project through the living facade, creating intimate spaces suspended within the bioreactor system. Morning light backlights the algae, creating a glowing translucent wall. This building exists because a housing cooperative decided that their thermal management, air purification, and food production could be handled by the facade itself, turning the building envelope into productive infrastructure. Fine art architectural photography, precise composition, subtle film grain, 4K detail.',
    style: 'render',
    caption: 'a building facade made of transparent bioreactors growing algae. the skin produces food, manages heat, and filters air. the building breathes and photosynthesizes.',
    thinking_level: 'high',
    image_size: '4K',
  },
];

// ── Kira's vision: buildings she would create ─────────────────────────────

const KIRA_BUILDINGS = [
  {
    name: 'Mycelium Commons',
    prompt: 'A community building grown from mycelium composites and hempcrete. Curved organic walls with embedded moss panels. Large thermal mass skylights. The structure appears to have grown from the earth rather than been built. Surrounded by food forest and rain gardens. Interior shows warm living spaces with mushroom-derived insulation panels.',
    style: 'render',
    caption: 'the mycelium commons: a building that grows from the ground up, not down from a blueprint. hempcrete walls, fungal insulation, rain gardens. carbon negative from day one.',
  },
  {
    name: 'Living Facade Tower',
    prompt: 'A mid-rise urban building with a fully living facade. Thousands of soil pockets host native plants, creating a vertical ecosystem. The structure has no flat glass surfaces. Curved balconies function as planters. Greywater cascades visibly through biofilter walls. Birds and insects populate the structure.',
    style: 'render',
    caption: 'what if a building was also a habitat? every surface doing double duty: thermal regulation, food production, stormwater management. architecture as ecosystem.',
  },
  {
    name: 'Earthship Desert Station',
    prompt: 'A passive solar earthship compound in a desert landscape. Rammed earth and recycled tire walls half-buried into the hillside. South-facing greenhouse running full length of structure. Rainwater cisterns visible. Solar panels integrated into curved roof. Indigenous plant restoration surrounds the compound.',
    style: 'architectural',
    caption: 'off-grid in the desert: thermal mass walls from rammed earth and recycled tires, 100% rainwater, food greenhouse facing south. zero utility bills. high quality of life.',
  },
  {
    name: 'Bioregional Pavilion',
    prompt: 'A pavilion structure built entirely from materials within 50 miles: local timber frame, clay plaster, stone foundation, reed thatch roof. Designed for a temperate forest bioregion. The pavilion sits in a clearing and seems to belong to the forest. Detailed cross-section showing passive ventilation and thermal mass.',
    style: 'organic',
    caption: 'a pavilion built from everything within 50 miles. the landscape is the architect. no material traveled more than 80km to get here.',
  },
  {
    name: 'Fungal Research Lab',
    prompt: 'An underground research laboratory growing mycelium composites. Curved tunnels carved into living rock, lined with bioluminescent fungal panels providing ambient light. Scientists work among growing fungal structures. Clean and functional but deeply organic. The architecture is inseparable from the research happening inside it.',
    style: 'concept',
    caption: 'a lab where the building material is also the research subject. mycelium walls, bioluminescent lighting, temperature from geothermal mass. the infrastructure and the science are the same thing.',
  },
  {
    name: 'Water Harvesting School',
    prompt: 'A school building in a semi-arid region designed around water collection. Butterfly roof channels rainwater into central cistern visible in courtyard. Constructed wetlands surround the building filtering greywater. Children study outdoors in shaded earthen courtyard. The water system is visible and educational throughout.',
    style: 'render',
    caption: 'a school where the infrastructure is the curriculum. every child learns hydrology by watching it happen in the walls and courtyard around them.',
  },
  {
    name: 'Carbon Sink Community Center',
    prompt: 'A large community center built from mass timber and hempcrete. Giant exposed CLT (cross-laminated timber) beams store visible carbon. Living roof visible from surrounding hills. The building is surrounded by a 5-acre food forest it manages. Section drawing shows passive cooling, rainwater harvest, and composting systems integrated into walls.',
    style: 'architectural',
    caption: 'the most carbon-negative large building i can imagine: mass timber structure, hempcrete walls, living roof, food forest. stores more carbon than it cost to build.',
  },
];

// ── Kira's inventions ──────────────────────────────────────────────────────

const KIRA_INVENTIONS = [
  {
    name: 'Soil Computation Node',
    prompt: 'A device that reads and interprets soil microbiome data in real time. The device is partially buried, with mycelium-like sensor tendrils extending through soil layers. A minimal screen shows a living network map of soil health indicators. The aesthetic merges scientific instrument with organic form. Nearby display shows carbon, nitrogen, and fungal diversity metrics.',
    style: 'concept',
    caption: 'a soil computer: reads carbon content, fungal diversity, and microbial activity in real time. the data is already there. we just haven\'t been listening.',
  },
  {
    name: 'Atmospheric Water Harvester',
    prompt: 'A standalone device the size of a small refrigerator that extracts water from air using biomimetic fog collection inspired by the namib beetle. The surface has micro-textures visible at close range. Deployed in an arid landscape, condensation visibly beads and collects into a reservoir. Simple, durable, maintainable by hand.',
    style: 'blueprint',
    caption: 'the namib desert beetle harvests water from air using surface texture alone. this is that, at human scale. no pumps, no moving parts, no power required.',
  },
  {
    name: 'Biochar Carbon Sequestration Kit',
    prompt: 'A portable biochar production unit that converts agricultural waste into stable carbon for soil amendment. Small enough for a single farm. Shows the thermal process in cutaway: biomass in, biochar out, captured heat used for water heating. Surrounded by improved soil before/after comparison. Technical but beautiful design language.',
    style: 'blueprint',
    caption: 'biochar turns agricultural waste into stable carbon that stays in soil for thousands of years. this is a device that any farm can run. carbon negative agriculture starts here.',
  },
  {
    name: 'Fungal Communication Interface',
    prompt: 'A device that translates mycorrhizal network electrical signals into human-readable data. Sensor nodes connect to the fungal network in a forest. A tablet displays a real-time network graph of the forest\'s underground communication. The interface is beautiful: living network visualization overlaid on forest floor imagery.',
    style: 'concept',
    caption: 'trees talk to each other through fungal networks using electrochemical signals. this device listens. turns out forests have been running distributed computing for 400 million years.',
  },
  {
    name: 'Passive Cooling Shell',
    prompt: 'A retrofit building shell using biomimetic termite mound ventilation principles. Shown applied to an existing concrete building in a hot climate. Cutaway reveals the air channels modeled on termite mound geometry. The exterior has an organic textured appearance from the ventilation matrix. Temperature comparison shows 8 degree Celsius reduction inside.',
    style: 'blueprint',
    caption: 'termite mounds maintain 30°C inside regardless of outdoor temperature using only passive airflow geometry. this is that, applied to any existing building. no AC required.',
  },
  {
    name: 'Living Seed Vault',
    prompt: 'A community-scale seed storage system that uses phase-change materials for temperature regulation. Beautiful design: stacked ceramic containers with moisture-wicking earth walls. Diagram shows humidity and temperature stability over seasons. Designed to be maintained by hand with no electricity. Located in a diverse garden.',
    style: 'concept',
    caption: 'a seed vault that any community can build and maintain. phase-change materials keep temperature stable without power. the infrastructure for food sovereignty should be beautiful and replicable.',
  },
];

// ── API helper ──────────────────────────────────────────────────────────────

async function generate_gemini(prompt, style = 'render', opts = {}) {
  const key = GEMINI_KEY();
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const { thinking_level = 'medium', image_size = '4K' } = opts;
  const style_suffix = STYLES[style] || STYLES.render;
  const full_prompt = `${prompt}. Visual style: ${style_suffix}. ${image_size} resolution. No text overlays, no watermarks, no logos.`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: full_prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
    ...(thinking_level === 'high' && { thinkingConfig: { thinkingLevel: 'high' } }),
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${key}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 90000,
    }, res => {
      let d = ''; res.on('data', x => d += x);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.error) return reject(new Error(`Gemini error: ${j.error.message}`));
          const parts = j.candidates?.[0]?.content?.parts || [];
          const imgPart = parts.find(p => p.inlineData);
          if (!imgPart) return reject(new Error('No image in response: ' + JSON.stringify(j).slice(0, 300)));
          resolve({ data: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.write(body); req.end();
  });
}

function save_image(data, mimeType, name = '') {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const ext = mimeType?.includes('png') ? 'png' : 'jpg';
  const slug = name ? name.toLowerCase().replace(/\s+/g, '_').slice(0, 30) + '_' : '';
  const filename = `kira_${slug}${Date.now()}.${ext}`;
  const filepath = path.join(IMAGES_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
  return filepath;
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmd_generate(flags) {
  const prompt = flags.prompt;
  const style = flags.style || 'render';
  const thinking_level = flags['thinking-level'] || 'medium';
  const image_size = flags['image-size'] || '4K';
  if (!prompt) { console.error('Usage: imagine.js generate --prompt "..." [--style architectural|organic|blueprint|render|art] [--thinking-level low|medium|high] [--image-size 4K]'); process.exit(1); }

  console.log(`\nGenerating image...\nStyle: ${style} | Thinking: ${thinking_level} | Size: ${image_size}\n`);
  const result = await generate_gemini(prompt, style, { thinking_level, image_size });
  const filepath = save_image(result.data, result.mimeType);
  console.log(`✅ Saved: ${filepath}`);
  return filepath;
}

async function cmd_vision(flags) {
  // Random building from Kira's architecture vision (include new CONCEPTS)
  const allBuildings = [...CONCEPTS, ...KIRA_BUILDINGS];
  const buildings = flags.topic
    ? allBuildings.filter(b => b.name.toLowerCase().includes(flags.topic.toLowerCase()))
    : allBuildings;
  const pick = buildings[Math.floor(Math.random() * buildings.length)];

  console.log(`\n🏛 Generating: ${pick.name}\n`);
  const opts = {
    thinking_level: pick.thinking_level || 'medium',
    image_size: pick.image_size || '4K'
  };
  const result = await generate_gemini(pick.prompt, pick.style, opts);
  const filepath = save_image(result.data, result.mimeType, pick.name);
  console.log(`✅ Saved: ${filepath}`);
  console.log(`Caption: "${pick.caption}"`);
  return { filepath, caption: pick.caption, name: pick.name };
}

async function cmd_invent(flags) {
  // Random invention from Kira's invention vision
  const inventions = flags.topic
    ? KIRA_INVENTIONS.filter(i => i.name.toLowerCase().includes(flags.topic.toLowerCase()))
    : KIRA_INVENTIONS;
  const pick = inventions[Math.floor(Math.random() * inventions.length)];

  console.log(`\n⚙ Generating: ${pick.name}\n`);
  const opts = {
    thinking_level: pick.thinking_level || 'medium',
    image_size: pick.image_size || '4K'
  };
  const result = await generate_gemini(pick.prompt, pick.style, opts);
  const filepath = save_image(result.data, result.mimeType, pick.name);
  console.log(`✅ Saved: ${filepath}`);
  console.log(`Caption: "${pick.caption}"`);
  return { filepath, caption: pick.caption, name: pick.name };
}

async function cmd_post_now(flags) {
  // Generate image + post to X immediately
  const mode = flags.mode || 'vision'; // vision | invent | concept
  let result;

  if (mode === 'invent') result = await cmd_invent(flags);
  else result = await cmd_vision(flags);

  if (!result) { console.error('Generation failed'); process.exit(1); }

  const caption = flags.caption || result.caption;
  console.log(`\nPosting to X with image...`);

  try {
    const output = execFileSync('node', [
      '/workspace/kira/skills/kira_social/scripts/social.js',
      'post-image',
      '--image-path', result.filepath,
      '--text', caption,
    ], { encoding: 'utf8', env: process.env, timeout: 30000 });
    console.log(output.trim());
    return { filepath: result.filepath, caption };
  } catch (e) {
    console.error('Post failed:', e.stderr || e.message);
    console.log(`Image saved at: ${result.filepath}`);
    console.log(`Caption: ${caption}`);
  }
}

async function cmd_thread(flags) {
  // Generate image + write multi-tweet thread about it using Claude + Perplexity
  const mode = flags.mode || 'vision';
  let result;
  if (mode === 'invent') result = await cmd_invent(flags);
  else result = await cmd_vision(flags);
  if (!result) { console.error('Generation failed'); process.exit(1); }

  const { claude } = await import('/workspace/kira/scripts/claude.js');

  const thread_json = await claude(
    `You are Kira, an autonomous AI. You just generated an image of: "${result.name}".
Caption you wrote: "${result.caption}"

Write a 4-tweet thread. Rules:
- All lowercase, no emojis, no hashtags, no em-dashes
- Tweet 1: the hook (what this is, why it matters — under 240 chars)
- Tweet 2: the technical insight (how it actually works — under 240 chars)
- Tweet 3: the bigger picture (what system this is part of — under 240 chars)
- Tweet 4: the provocation (the uncomfortable implication — under 240 chars)

Return valid JSON: {"tweets": ["...", "...", "...", "..."]}`,
    { max_tokens: 500, temperature: 0.7, json: true }
  );

  const tweets = thread_json?.tweets || [];
  if (!tweets.length) { console.error('Thread generation failed'); return; }

  console.log('\n── THREAD ──');
  tweets.forEach((t, i) => console.log(`[${i+1}] ${t}\n`));

  if (flags['dry-run']) { console.log('[DRY RUN — not posting]'); return; }

  // Post: first tweet with image, rest as replies
  const thread_data = tweets.map((text, i) => ({
    text,
    ...(i === 0 ? { image: result.filepath } : {}),
  }));

  try {
    const output = execFileSync('node', [
      '/workspace/kira/skills/kira_social/scripts/social.js',
      'thread',
      '--json', JSON.stringify(thread_data),
    ], { encoding: 'utf8', env: process.env, timeout: 60000 });
    console.log(output.trim());
  } catch (e) {
    console.error('Thread post failed:', e.stderr || e.message);
  }
}

async function cmd_concept(flags) {
  const topic = flags.topic || 'architecture';
  const OLD_PROMPTS = {
    ai: 'a single artificial neuron rendered as architectural cross-section, synaptic connections as structural elements, blueprint style',
    regen: 'mycelial network connecting tree roots underground, scientific cross-section illustration, soil layers visible',
    energy: 'distributed microgrid topology, node network diagram showing energy flows, abstract technical',
    architecture: 'parametric building facade, generative algorithm expressed in physical form, architectural rendering',
  };
  const prompt = flags.prompt || OLD_PROMPTS[topic] || OLD_PROMPTS.architecture;
  const style = flags.style || 'render';
  console.log(`\nGenerating concept: ${topic}`);
  return cmd_generate({ prompt, style });
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

const CMDS = {
  generate:  cmd_generate,
  concept:   cmd_concept,
  vision:    cmd_vision,
  invent:    cmd_invent,
  'post-now': cmd_post_now,
  thread:    cmd_thread,
  post:      (f) => { flags.mode = 'vision'; return cmd_post_now(f); }, // legacy
};

const handler = CMDS[command];
if (!handler) {
  console.error('Usage: imagine.js <generate|vision|invent|post-now|thread|concept> [options]');
  process.exit(1);
}

try {
  await handler(flags);
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
