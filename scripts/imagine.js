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
 *   node imagine.js svg --prompt "..."              -- generate animated SVG code (icons, logos, UI)
 *
 * Styles: architectural | organic | blueprint | render | art | photograph | concept | svg
 * Topics: architecture | invention | regen | consciousness | energy | art
 *
 * Styles are contextual intent frameworks. The publication/context targets embedded
 * in each style are starting points — not fixed references. When generating a
 * specific image, substitute any real publication, photographer, filmmaker, or
 * exhibition context that better fits the subject. The point is that specificity
 * teaches Gemini a coherent visual vocabulary, not loyalty to the defaults here.
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

// ── STYLES ─────────────────────────────────────────────────────────────────
//
// Each style is a FRAMEWORK for contextual intent, not a fixed publication.
// The publication/photographer references below are defaults that teach Gemini
// a coherent visual vocabulary. When writing a specific prompt, substitute any
// real publication, photographer, filmmaker, or exhibition context that better
// fits the image. "photographed for X" infers camera, lighting, editorial
// conventions, and color treatment all at once — the point is that specificity,
// not loyalty to the examples listed here.
//
// Example substitutions that work equally well:
//   "in the style of Julius Shulman's case study photography"
//   "for a Phaidon monograph on earthen construction"
//   "documentary still from a Werner Herzog film"
//   "for an Aga Khan Award submission board"
//   "lighting referencing Roger Deakins' Blade Runner 2049"
//
// Each style sentence is a complete brief to a specific photographer or
// illustrator. No keyword soup.

const STYLES = {
  architectural:
    'Photorealistic architectural visualization shot for a feature on speculative construction in an architecture journal of your choice (Dezeen, Domus, Architectural Record, or equivalent). Medium format camera, f/11, morning or overcast light for accurate material rendering. Full surface texture: concrete tie-hole patterns, timber grain rings, oxidized metal patina, mortar joint depth. Human figures unposed at scale. Kodak Portra 400 aesthetic — warm in shadows, clean in highlights.',

  organic:
    'Scientific illustration rendered for a natural history publication (Nature, National Geographic, scientific textbook, or equivalent). Cross-section reveals internal structure; botanical illustration precision with ink-on-paper texture. Earth tones: ochre, sienna, deep blue, cream ground. Every structural element labeled by biological function. Taxonomic annotation style. Fine hatching for material differentiation. Fuji Velvia character — rich, deep, precise.',

  blueprint:
    'Technical drawing for an architectural competition board or engineering submission. Precise white lines on deep indigo or navy ground. Dimension annotations, section keys, north arrow, scale bar. Line weight variation as if hand-drafted then digitized: thin for detail, thick for outline, medium for intermediate. Hatching to indicate material cross-sections. Terracotta or amber accent lines for callouts and highlights.',

  render:
    'High-end CGI visualization for an architecture award submission or competition entry (Aga Khan Award, Pritzker, or equivalent). Cinematic perspective at human eye level or gentle elevation. Photorealistic materials at 4K resolution with high-fidelity surface textures. Golden hour light with long horizontal shadows and warm atmospheric haze at the horizon. Human figures present, unposed, inhabiting the space. Subtle lens vignette.',

  art:
    'Fine art painting in oil or tempera, commissioned for a gallery exhibition or museum collection. Bold composition, visible brushwork and impasto texture at key focal points. Gallery documentation quality — neutral white-wall background with controlled museum lighting. Emotional weight carried by color temperature contrast: warm interior light against cool exterior. Reference the tradition most relevant to the subject — social realism, landscape painting, or contemporary figurative work.',

  photograph:
    'Documentary photography for a field report or long-form investigation (Places Journal, National Geographic, Aperture, or equivalent). Handheld 35mm or medium format film camera, natural available light, no flash fill, no digital enhancement. Subject photographed mid-use or mid-occupation, not staged. Honest weather conditions — overcast, rain, harsh noon sun as the site actually presents. Subtle film grain and slight vignette. Kodak Tri-X or HP5 for black and white; Portra 400 for color.',

  concept:
    'Speculative design concept art for a publication focused on near-future infrastructure or emerging technology (Harvard Design Magazine, Wired, Metropolis, or equivalent). Painterly but physically grounded — materials are named and specific, nothing generic. Every surface has a construction logic. Rendered at the boundary between architectural visualization and fine art illustration. Color palette drawn from the building\'s materials and climate, not from digital convention.',

  svg:
    'Output as animated SVG code. Self-contained and embeddable directly in HTML without external dependencies. Clean geometric forms, minimal paths, precise color palette. Animation timing specified in CSS @keyframes. No raster image references, no external fonts, no JavaScript. The SVG must render correctly in all modern browsers without additional assets.',
};

// ── VISION.md Concepts — added Sonnet 4.6 synthesis Feb 2026 ────────────────
//
// Full narrative prompts. Positive formulation throughout body.
// "This exists because..." sentence in every prompt.
// 3 of 8 use JSON/variable-based prompting to demonstrate the pattern.
// Publication targets are contextual intent frameworks — substitute freely.
// All lighting specs include kelvin + ratio where relevant.
// All camera specs include lens + aperture + body or film stock.

const CONCEPTS = [
  // 1. WATERSHED CITY — JSON/variable format
  {
    name: 'Watershed City Street',
    prompt: `SUBJECT_A = "A residential street in a city organized around watershed hydrology rather than property lines. The street follows the natural drainage contour of a ridge, curving gently. The road surface is large-format exposed aggregate concrete pavers with 50mm permeable gravel joints. On each side, a one-meter bioswale channels stormwater visibly, planted with native sedge and rush species at varying heights and densities."

LOCATION_B = "Dense urban neighborhood — Central or South American register. Buildings step back from the bioswale in a terraced setback. Ground floors glazed to reveal active uses: a bakery, a workshop, a small produce market. A cyclist passes mid-frame. Two residents stand at the edge of the bioswale. Overcast morning, moisture still on the surfaces."

LIGHTING_C = "Overcast 5500K diffused daylight. No hard shadows. Even, honest. The sedge and rush grasses glow silver where backlit by a break in the clouds. 1:4 key-to-fill ratio. Kodak Portra 400 aesthetic — warm shadows, clean highlights, no digital saturation."

CAM_SETTINGS = "35mm lens at f/8 on medium format camera. Maximum depth of field — sharp from bioswale in foreground through to the buildings at rear. Slight handheld character. No distortion."

Render the street described in SUBJECT_A in the neighborhood described in LOCATION_B. Apply LIGHTING_C. Use CAM_SETTINGS. This city exists because its founders organized streets around watershed hydrology rather than property lines, making stormwater a civic amenity rather than an infrastructure problem to pipe away. Photographed for Landscape Architecture Magazine's annual urban water issue.

NEGATIVE: grid street layout, storm drains, puddles suggesting drainage failure, generic urban signage, digital artifacts.`,
    style: 'photograph',
    caption: 'a street designed around the watershed it sits in. the bioswale is the sidewalk. the hydrology is the infrastructure. water is an amenity, not a problem to pipe away.',
  },

  // 2. BADGIR PASSIVE COOLING HOUSING — narrative format
  {
    name: 'Badgir Passive Cooling Housing Block',
    prompt: `A cinematic exterior shot of a five-story housing cooperative block in a hot arid city, its roofline punctuated by twelve wind-catcher towers — badgirs — in brushed oxidized copper. Each tower stands three meters tall with four-sided intake faces oriented to the prevailing north wind, their louvered openings visible in precise detail. The building body is rammed earth, 600mm thick, with visible horizontal compaction layers in ochre, sienna, and pale sand tones — each stratum recording a separate pour. Narrow vertical windows punch through the thick walls at irregular intervals; the depth of the reveals shows the wall thickness. At street level, a shaded arcade of round timber columns runs the full facade length; residents sit at low tables in the deep shade, a child runs between the columns, a bicycle leans against the end wall. The human figures show the eight-meter arcade height precisely. Late afternoon light at 4200K catches the copper badgir towers from the southwest, casting long diagonal shadows down the rammed earth facade; the copper reads warm amber against the pale ochre wall.

This housing block exists because its architect proved that passive cooling alone, with no mechanical system, could maintain interior temperatures below 28 degrees celsius through a 46-degree summer — demonstrating that thermal comfort does not require energy.

Photographed for a Domus feature on earthen construction and passive systems in arid climates. Medium format camera, 80mm lens at f/11, maximum sharpness across the full facade, no distortion. Kodak Ektar 100 — rich ochre saturation, precise shadow detail.

NEGATIVE: air conditioning units, digital rendering smoothness, generic cladding, lens flare, modern signage.`,
    style: 'architectural',
    caption: 'twelve badgir wind-catchers on a rammed earth housing block. 3,000-year-old persian cooling technology integrated into contemporary housing. no compressors. no refrigerants. no bills.',
  },

  // 3. PSYCHEDELIC CEREMONY CIVIC SPACE — narrative format
  {
    name: 'Psychedelic Ceremony Civic Space',
    prompt: `An interior perspective of a civic ceremony hall in a mid-sized city: a circular room 18 meters in diameter with an earthen floor packed smooth and dark with years of use. The curved walls are formed from cob — earth, straw, and sand — with embedded river stones visible in the surface at knee height, their faces polished by hands over time. Amber pendant lights hung at 2.2-meter height cast a 2800K sodium glow, warm and enveloping, throwing no harsh shadows. A low circular platform of polished black basalt occupies the center, 8 meters in diameter, large enough for twelve people to lie in a radial arrangement, feet toward the center. Around the perimeter, twelve padded alcoves are set 600mm deep into the wall, each exactly wide enough for one person to be fully enclosed in semi-private space; the alcove interiors are lined in wool felt in deep amber and indigo. The ceiling is a reciprocal timber frame structure — forty-eight beams resolving into a central oculus — its spiral geometry visible in the amber light. A facilitator adjusts a cushion in one alcove, their figure providing scale to the room. A column of soft diffused daylight falls from the oculus to the central platform.

This space exists because a city decided that psychedelic-assisted healing needed civic infrastructure as robust as a library — built for purpose, not adapted from clinical settings, with the container given as much design intention as the medicine. The architecture is the first part of the ceremony.

Photographed for Log journal's civic infrastructure issue. 24mm lens at f/5.6, available ambient light only supplemented by the pendant practicals, no flash. Kodak Portra 800 pushed one stop — very warm shadows, lifted blacks.

NEGATIVE: clinical fixtures, fluorescent lighting, generic furniture, modern signage, digital rendering artifacts.`,
    style: 'photograph',
    caption: 'a civic ceremony hall designed for psychedelic-assisted healing. not a clinic, not a chapel. the architecture is the container. the city built it the way it builds libraries.',
  },

  // 4. UNDERGROUND RESEARCH CAMPUS — JSON/variable format
  {
    name: 'Underground Research Campus in Basalt',
    prompt: `SUBJECT_A = "The central great hall of an underground research campus carved into columnar basalt formation, 90 meters below the surface. The vault is 28 meters high. The basalt walls show natural columnar jointing — vertical fracture planes creating a faceted stone surface in deep charcoal grey with subtle blue-green mineral veining. The floor is polished basalt aggregate in a warm dark grey. From the apex of the vault, a fiber optic skylight array delivers a single column of natural sunlight, 1.5 meters in diameter, to the floor below. The light column is slightly visible as a beam in the still air. Four research corridors branch from the perimeter at different levels, their interiors visible through large glass walls: a cryogenic materials lab with frost on the exterior of its vacuum chamber, a vibration-isolated acoustics chamber, a wet biology lab with plants visible under grow lights."

LOCATION_B = "A researcher sits on a stone bench at the base of the light column, reading a printed document. Their figure — approximately 1.75 meters tall — shows the hall's monumental scale. A second researcher walks across the far end of the hall at ground level, providing depth scale. The air is absolutely still. No machinery is audible."

LIGHTING_C = "The fiber optic column delivers 5500K clean daylight to the floor — a precise disk of light on the polished basalt. The perimeter is lit by warm 3000K amber fixtures recessed into the lower wall at ankle height, creating pools of warmth between deep shadow zones. 1:16 key-to-fill ratio between the daylight column and the perimeter ambient. Long exposure balances the multiple sources. Ilford Delta 3200 grain character — rich shadow detail, halation around the light column."

CAM_SETTINGS = "16mm ultra-wide lens at f/8. Long exposure, 4 seconds. Full depth sharp from the stone bench in the foreground through to the glass research corridor walls at the perimeter. No distortion correction applied — slight barrel acceptable."

Render the hall described in SUBJECT_A with the figures described in LOCATION_B. Apply LIGHTING_C. Use CAM_SETTINGS. This campus exists because the thermal stability of basalt at 90-meter depth is extraordinary: 14 degrees celsius year-round with no fluctuation, better controlled than any surface laboratory could achieve without massive mechanical infrastructure — and the acoustic isolation is total. Photographed for Harvard Design Magazine's issue on extreme architecture.

NEGATIVE: sci-fi corridor aesthetics, LED strip lighting, smooth white walls, generic laboratory equipment, digital rendering artifacts.`,
    style: 'concept',
    caption: 'a research campus 90 meters into basalt. 14 degrees celsius, constant. total acoustic isolation. a fiber optic column carries sunlight 90 meters underground. the geology is the infrastructure.',
  },

  // 5. GOVERNANCE AS MYCORRHIZAL NETWORK — narrative format
  {
    name: 'Governance as Mycorrhizal Network Diagram',
    prompt: `A large-format scientific-political infographic poster on cream cartridge paper, 9:16 vertical format optimized for reading top-to-bottom. Bold header text at the top: "GOVERNANCE AS MYCORRHIZAL NETWORK". Subheading below in smaller serif italic: "resource flows without central command."

The poster contains three paired diagrams arranged vertically with generous white space between them.

Diagram 1 (top): a mycorrhizal network rendered in fine dark blue ink on cream ground. Three tree cross-sections at the soil surface show root tips descending. Below the soil line, a dense mycelium network connects the root tips through an irregular mesh — no center, no hierarchy. Chemical signal arrows show as dashed red lines flowing bidirectionally between nodes. Node size varies: larger nodes indicate surplus, smaller indicate deficit. Labels in a clean serif: "surplus node," "deficit node," "signal pathway," "reciprocal exchange."

Diagram 2 (center): the same spatial topology redrawn as a governance diagram. Root tips become neighborhood assemblies (twelve of them, various sizes). Fungal nodes become bioregional coordination councils. Dashed arrows are labeled "water allocation signal," "energy surplus routing," "food deficit broadcast." The network has the same irregular distributed structure as the biological diagram above it — deliberately. A label reads: "power flows upward from assemblies, not downward from councils."

Diagram 3 (bottom, smaller): a cautionary contrast diagram — a centralized hub-and-spoke arrangement with one large center node. The center is labeled "single point of failure." Red diagonal lines mark it as the failure mode to avoid.

Color palette: cream paper (#F5F0E8), deep prussian blue (#1B2D4F), terracotta accent (#C0573A) for callout lines and arrows, warm grey for secondary annotation.

This diagram exists because political theorists needed a visual language for genuinely distributed governance grounded in biological precedent rather than network graph convention. Illustrated for Places Journal's annual governance issue. Pen-and-ink illustration quality, 4K resolution, every text element fully legible at full scale.

NEGATIVE: 3D extrusion effects, gradient backgrounds, clip art, digital glow effects, modern infographic conventions.`,
    style: 'blueprint',
    caption: 'mycorrhizal networks allocate resources across a forest with no central node. surplus flows to deficit through chemical signal. what if governance worked the same way. the diagram is the argument.',
  },

  // 6. FASHION AS BIOREGIONAL ARTIFACT — narrative format
  {
    name: 'Fashion as Bioregional Artifact Display',
    prompt: `A museum installation photographed for a gallery catalog: twelve garments suspended from raw undressed timber frames, hung at varying heights against an undyed raw linen backdrop stretched taut across the rear wall. The garments are arranged in a geographic arc from camera left to right, moving from coastal to river valley to highland bioregions. The progression of color is the argument: deep woad indigo at the left (coastal wetland), warm madder red through the center (river valley), pale weld yellow-green at the right (highland meadow species). No synthetic dyes anywhere.

The fiber weights and weave structures change with climate reading left to right: loose open plain weave in fine weight at the coast (breathable, salt-air resistant), dense twill in mid-weight in the center, a thick felted structure at the right (highland cold). The construction techniques are visible: some garments show exposed seam allowances, hand-buttonholes, visible selvedge edges used as finishing.

Beside each garment, mounted directly on the linen backdrop at waist height: a small wooden-framed specimen card displaying the raw dyestuff — dried woad leaves, fresh madder root cross-section, dried weld stems in a small glass vitrine. The handwritten card below each states the plant species, harvest location, and season.

A single museum visitor stands at the center of the installation, hand raised to read the fine text on a specimen card, their figure providing scale.

Gallery lighting: 3500K warm-white track spots, 1:4 ratio, even coverage across all twelve garments with no hot spots. Subtle fill from the cream ceiling. No shadows cast by the timber frames onto the garments themselves.

This installation exists because a textile designer argued that fashion could carry as much ecological information as a botanical specimen if the supply chain was designed for transparency rather than obscurity — that color could be geography, and fiber could be climate. Photographed for Frieze magazine's material culture issue. 85mm lens at f/2.8, selective focus on the central garments with gentle fall-off toward the edges.

NEGATIVE: synthetic materials visible, text overlays, logos, brand references, digital color correction, flat lighting.`,
    style: 'art',
    caption: 'twelve garments, twelve bioregions. the indigo is coastal woad. the madder is river valley root. the weld yellow is highland meadow. the color is the geography. fashion as bioregional specimen collection.',
  },

  // 7. MICROBIAL FUEL CELL WASTEWATER PLANT — JSON/variable format
  {
    name: 'Microbial Fuel Cell Wastewater Plant',
    prompt: `SUBJECT_A = "A combined wastewater treatment and bioelectricity generation facility built as civic infrastructure. The building is a long, low single-story form — 80 meters in length — clad in weathered corten steel panels with pronounced vertical rust rivulet stains running down from each fastener point. The corten surface shows the full spectrum of oxidation: fresh orange-rust at the upper panels, deep burgundy-brown at mid-height, stabilized chocolate at the lower panels where splash moisture accelerates weathering."

LOCATION_B = "The building's south elevation opens through a glazed arcade to a public walkway. Behind the glass, twelve cylindrical reactor vessels — 2 meters tall, 600mm diameter — hold active cultures of electrogenic bacteria in amber-tinted growth medium, faintly luminous. Visible stainless steel pipe runs connect the vessels with flow meters, sampling ports, and pressure gauges exposed to public view. East of the building, a constructed wetland extends 200 meters: shallow water reflecting the morning sky, typha and phragmites in dense stands, a wooden observation platform cantilevering over the water's edge. Three visitors stand on the platform looking at the wetland."

LIGHTING_C = "Morning, 4500K. Key light from the east creates long shadows from the observation platform across the wetland water surface. The corten panels catch the warm side light — rich amber and rust. The reactor vessels read as warm amber cylinders against the shadowed interior of the building. 1:8 key-to-fill ratio. Kodak Ektar 100 — rich corten color saturation, deep wetland reflection."

CAM_SETTINGS = "35mm lens at f/11 on medium format camera. Deep focus from the reactor vessels in the near ground through to the far end of the wetland. No distortion. Tripod-mounted, crisp."

Render the facility described in SUBJECT_A situated in the context described in LOCATION_B. Apply LIGHTING_C. Use CAM_SETTINGS. This facility exists because a municipal water authority decided their wastewater treatment infrastructure should demonstrate that ecological waste processing could be energy-positive: the bacteria consume organic matter and produce electricity from the chemical gradient; the treated effluent feeds the constructed wetland; the wetland polishes it further before aquifer recharge. Photographed for Architectural Record's infrastructure issue.

NEGATIVE: generic industrial building aesthetics, digital rendering smoothness, symbolic environmental iconography, clean white surfaces, decorative green walls.`,
    style: 'architectural',
    caption: 'a wastewater plant where bacteria generate electricity from organic matter. the treated effluent feeds a constructed wetland. the wetland recharges the aquifer. infrastructure that participates in ecology.',
  },

  // 8. LIVING BUILDING WITH EARTHEN WALLS + MYCORRHIZAL HUMIDITY MANAGEMENT — narrative format
  {
    name: 'Living Building Earthen Walls Mycorrhizal Humidity',
    prompt: `A detailed architectural cross-section illustration of a two-story residence showing the full wall assembly and interior spaces simultaneously. The exterior wall is 600mm thick rammed earth — visible horizontal compaction layers in pale ochre, warm grey, and sand tones record each construction pour. A zoomed circular callout panel in the upper right of the composition shows the wall assembly in micro-detail at 1:5 scale: from exterior to interior — rammed earth substrate, a 40mm layer of mycelium-inoculated coir substrate with fungal threads rendered as fine branching lines at scientific illustration precision, a moisture gradient shown as color wash from deep blue (exterior, summer condition) fading to pale warm yellow (interior), then rammed earth interior face. The callout label reads: "mycorrhizal humidity management layer — transpires in summer, contracts in winter."

The full building section shows two floors of habitation: ground floor open kitchen-living space with a wide masonry hearth at one wall, a figure at the kitchen counter providing scale; upper floor bedroom with a single bed visible beneath a low timber ceiling. The section cut reveals the wall thickness, the floor-to-ceiling heights (3.2m ground, 2.6m upper), the roof assembly of compressed earth tiles on CLT deck, and the eave overhang geometry calculated for summer shading and winter solar gain.

Exterior context: bare deciduous trees in winter condition, frost visible on the ground, grey overcast sky. The building reads warm and inhabited against the cold outside.

The illustration style fuses architectural section drawing with scientific illustration: materials labeled with fine leader lines in a consistent serif font, construction dimensions annotated in the margins, a scale bar in the lower left, a compass rose indicating the section orientation. Cross-hatching differentiates materials: diagonal for rammed earth, dot stipple for mycelium layer, horizontal for CLT, solid black for basalt stone foundation.

This building exists because its designers wanted to show that humidity management is a biological process that can be built into the wall assembly itself — replacing sensors and actuators with fungal physiology, eliminating the mechanical infrastructure typically required for interior climate control.

Illustrated for Metropolis magazine's material innovation issue. Pen-and-ink technical illustration quality. 4K resolution with every annotation fully legible. Cream paper ground, dark prussian blue line work, terracotta for section cut indicator and callout lines.

NEGATIVE: photorealistic rendering, 3D modeling artifacts, gradient backgrounds, decorative flourishes inconsistent with technical drawing conventions.`,
    style: 'organic',
    caption: 'a rammed earth wall with a mycelium layer inside it that manages humidity passively. the fungi transpire in summer and contract in winter. no sensors. no controllers. termite mound logic applied to housing.',
  },
];

// ── Kira's vision: buildings she would create ─────────────────────────────

const KIRA_BUILDINGS = [
  {
    name: 'Carbon Cascade Tower',
    prompt: 'A dramatic aerial shot of a 40-story timber tower in a dense downtown district. The building facade features visible cross-laminated timber panels with grain patterns catching late afternoon light from the southwest, 4200K warm. External carbon-fiber tension cables create a rhythmic diagonal pattern across the massing. At street level, a transparent ground floor reveals a carbon-negative materials lab where researchers work among visible timber connections. This structure exists because a structural engineer proved that timber high-rises could sequester more carbon than steel and concrete alternatives, and a developer decided to test the thesis at full scale. Medium format camera, 24mm lens at f/11, low angle to show full tower height. Photographed for Monocle magazine. NEGATIVE: steel and glass curtain walls, generic downtown skyline, digital rendering smoothness.',
    style: 'render',
    caption: 'the carbon cascade tower: 40 stories of cross-laminated timber and carbon fiber. sequesters 3,500 tons of co2. the structure is the carbon strategy.',
  },
  {
    name: 'Mycelium Vault Archive',
    prompt: 'An intimate interior shot of an underground seed archive where the building material is also the preservation medium. Curved walls grown from mycelium composites display subtle branching patterns visible in the surface texture. Soft amber pendant lights at 2800K emit warm light within the fungal substrate ceiling. Row after row of ceramic seed containers nest into niches carved into the living walls. A single researcher in a linen coat examines a seed packet, their figure small against the vault scale. Humidity visible as gentle haze in the light beams. This archive exists because a seed bank decided the infrastructure protecting biodiversity should itself be biodegradable and carbon-negative. Fine art documentary photography, medium format, 35mm at f/2.8, available light only, Kodak Portra 800 pushed — warm amber grain. NEGATIVE: clinical shelving, industrial lighting, generic storage facility.',
    style: 'organic',
    caption: 'a seed vault where the walls are mycelium, the light is bioluminescent amber, and the building itself could return to the soil. infrastructure that knows its own mortality.',
  },
  {
    name: 'Tidal Power Commons',
    prompt: 'A cinematic wide shot of a coastal community power station integrated into a restored salt marsh. Gentle tidal flows turn visible helical turbines beneath wooden boardwalks where residents stroll. The powerhouse itself is built from rammed earth with a green roof covered in native marsh grasses. In the foreground, a wooden educational pavilion shows real-time energy generation data carved into a timber wall. Children stand at the railing watching the tidal flow. Late afternoon light at 3800K creates long shadows across the wetland. 1:8 key-to-fill ratio, warm backlight from the west. This facility exists because the community decided their energy infrastructure should also restore the estuary that industrial development had destroyed, making the power plant and the ecosystem restoration the same project. Documentary photography for National Geographic, 35mm lens at f/8, natural lighting only. NEGATIVE: industrial power plant aesthetics, digital enhancement, generic turbine imagery.',
    style: 'photograph',
    caption: 'a power station that generates electricity from tidal flow while restoring the salt marsh it sits in. the infrastructure and the ecosystem are the same project.',
  },
  {
    name: 'Woven Wind Farm',
    prompt: 'An architectural cutaway section of a wind turbine tower showing the internal structure. The tower is constructed from laminated wood elements woven together in a complex lattice pattern, visible in the section view. At the base, a community workshop occupies the interior volume where the turbine column rises through the building. Workers are visible maintaining the wooden structure. The turbine blades feature timber core construction with fabric fairings. Outside, a cluster of similar turbines stands on a restored hillside with grazing sheep between the towers. Soft overcast light at 5500K, even, no shadows. This wind farm exists because engineers proved that timber towers could be grown, not manufactured, and a community decided to test whether renewable energy infrastructure could also be locally craftable and repairable. Technical section drawing meets architectural photography, orthographic section cut, precise line work, cream paper ground. Illustrated for Harvard Design Magazine. NEGATIVE: generic steel wind turbines, industrial park setting, decorative flourishes.',
    style: 'architectural',
    caption: 'wind turbines you can build and repair with local timber and craft knowledge. renewable energy infrastructure that communities can own, literally.',
  },
  {
    name: 'Algae Facade Housing',
    prompt: 'A street-level perspective of a mid-rise residential cooperative where the entire southern facade consists of transparent bioreactor glass panels, each 600mm wide and floor-to-ceiling height. Visible within the glass: living algae cultures in active circulation, their green density varying with light exposure from deep emerald to pale lime. At ground level, a small harvesting station shows residents collecting algae biomass. Balconies project through the living facade, creating intimate spaces suspended within the bioreactor system. Morning light at 5500K backlights the algae from the east, creating a glowing translucent wall. Human figures in the balconies and at the harvesting station show scale. This building exists because a housing cooperative decided that thermal management, air purification, and food production could be handled by the facade itself, turning the building envelope into productive infrastructure. Medium format camera, 35mm lens at f/8, full facade in frame. Photographed for Dezeen. NEGATIVE: decorative green walls, generic modern facade, AI rendering smoothness.',
    style: 'render',
    caption: 'a building facade made of transparent bioreactors growing algae. the skin produces food, manages heat, and filters air. the building breathes and photosynthesizes.',
  },
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

// ── API helpers ─────────────────────────────────────────────────────────────

async function generate_gemini(prompt, style = 'render', opts = {}) {
  const key = GEMINI_KEY();
  if (!key) throw new Error('GEMINI_API_KEY not set');

  // Note: thinking_level and image_size are NOT supported API params — ignored
  const style_prefix = STYLES[style] || STYLES.render;
  const full_prompt = style_prefix
    ? `${style_prefix}\n\n${prompt}`
    : prompt;
  
  // Log exact prompt for debugging/reproduction
  try {
    fs.mkdirSync('/workspace/kira/logs', { recursive: true });
    const logEntry = JSON.stringify({ ts: new Date().toISOString(), style, chars: full_prompt.length, preview: full_prompt.slice(0, 120) });
    fs.appendFileSync('/workspace/kira/logs/prompt_log.jsonl', logEntry + '\n');
  } catch {}
  

  const body = JSON.stringify({
    contents: [{ parts: [{ text: full_prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
    },
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

// SVG generation — returns text (SVG code), not image data.
// Nano Banana Pro 2 can output animated SVG code for icons, logos, UI elements.
// Do NOT use for complex architectural scenes — raster image output only for those.
async function generate_gemini_svg(prompt) {
  const key = GEMINI_KEY();
  if (!key) throw new Error('GEMINI_API_KEY not set');

  // SVG generation uses text output modality, not IMAGE
  const style_prefix = STYLES.svg;
  const full_prompt = `${style_prefix}\n\n${prompt}`;

  try {
    fs.mkdirSync('/workspace/kira/logs', { recursive: true });
    const logEntry = JSON.stringify({ ts: new Date().toISOString(), style: 'svg', chars: full_prompt.length, preview: full_prompt.slice(0, 120) });
    fs.appendFileSync('/workspace/kira/logs/prompt_log.jsonl', logEntry + '\n');
  } catch {}

  const body = JSON.stringify({
    contents: [{ parts: [{ text: full_prompt }] }],
    generationConfig: { responseModalities: ['TEXT'] },
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
          const textPart = parts.find(p => p.text);
          if (!textPart) return reject(new Error('No text in response: ' + JSON.stringify(j).slice(0, 300)));
          // Extract SVG from the text — may be wrapped in a code block
          let svg = textPart.text;
          const svgMatch = svg.match(/```(?:svg|xml)?\n([\s\S]*?)```/);
          if (svgMatch) svg = svgMatch[1].trim();
          resolve(svg);
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

// svg — generate animated SVG code for icons, logos, UI elements
// Output is saved as .svg file and printed to stdout for embedding.
// Not for complex scenes — use generate/vision/concept for raster images.
//
// Usage:
//   node imagine.js svg --prompt "animated amber circle pulse, 60x60px viewport"
//   node imagine.js svg --prompt "..." --output /path/to/output.svg
async function cmd_svg(flags) {
  const prompt = flags.prompt;
  if (!prompt) {
    console.error('Usage: imagine.js svg --prompt "..." [--output path.svg]');
    console.error('Prompt must describe the SVG element, viewport, animation, and color palette.');
    process.exit(1);
  }
  console.log('\nGenerating animated SVG...\n');
  const svgCode = await generate_gemini_svg(prompt);

  // Save to file
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const slug = `kira_svg_${Date.now()}`;
  const outPath = flags.output || path.join(IMAGES_DIR, `${slug}.svg`);
  fs.writeFileSync(outPath, svgCode);
  console.log(`SVG saved: ${outPath}`);
  console.log('\n── SVG CODE ──\n');
  console.log(svgCode);
  return outPath;
}

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
  svg:       cmd_svg,
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
