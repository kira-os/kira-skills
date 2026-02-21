# Nano Banana Pro 2 — Prompting Guide
## Model: Gemini 3.1 Pro (Thinking)
Saved: 2026-02-21 | Source: G's research doc

## Core Principle: Brief a Creative Director, Not a Keyword Engine
No tag soup. No "masterpiece, 8k, highly detailed". Use full narrative sentences.
The model thinks — semantic noise from contradictory keywords degrades output.

## Golden Rules

### 1. Narrative over Keywords
BAD: `cool car, neon, city, night, 8k, realistic, hyperdetailed, cyberpunk`
GOOD: `A cinematic wide shot of a futuristic sports car speeding through a rainy Tokyo street at night. Neon signs reflect off wet pavement and the car's brushed metallic chassis.`

### 2. Specify Materiality Explicitly
Not "metal table" → "brushed steel" / "rusted iron" / "highly polished chrome"
Not "red dress" → "soft crimson velvet" / "translucent red silk"
Materiality = automatic lighting physics calculation.

### 3. Positive Formulation Only (No Negatives)
BAD: "Do not make the background cluttered"
GOOD: "Ensure the background is minimalist, utilizing expansive negative space"
Negative words cause the model to conceptualize the forbidden element first.

### 4. Contextual Intent ("For Whom / Why")
"Create a sandwich" → generic
"Create a sandwich for a Brazilian high-end gourmet cookbook" → the model infers plating, macro lens, dramatic lighting, premium ingredients automatically.

### 5. Thinking Level Control
`thinking_level: low/medium/high` via API
For complex multi-subject compositions or architectural precision → high
For quick iterations → low or medium

### 6. Resolution
`image_size: "4K"` in API, or explicit "4K resolution with high-fidelity surface textures" in prompt
`media_resolution_high` for reference image input (captures micro-textures, film grain)

## Conversational Editing (Don't Re-Roll)
If image is 80% correct, don't regenerate. Semantic in-painting via conversation:

**Remove:** `Using this image, remove the [element]. Keep everything else exactly the same, preserving original style, lighting, and composition.`

**Add:** `Using this image, add a [element] to [location]. Ensure new object matches the lighting and perspective of the original image.`

**Style Transfer:** `Change this image to [style]. Ensure composition and position of all objects remain exactly the same as the original.`

**Time/Weather:** `Turn this scene into nighttime` → model recalculates all light sources, shadows, color grade.

## Photorealism Techniques
- Optical imperfections: "visible skin pores, micro-imperfections, realistic skin texture"
- Camera lens: "Shot on 85mm portrait lens at f/1.8" → forces shallow depth of field/bokeh
- Lighting setup: "Rembrandt lighting with key light high and to one side"
- Chiaroscuro: "intense chiaroscuro with harsh directional light, deep defined shadows"
- Anti-AI-look: introduce physical imperfections, specify grain, aberration

## For Kira's 3D Cinematic City/Architecture Posts
Template structure:
```
[Camera/shot type] of [architectural concept]. [Materials and textures]. [Lighting conditions]. 
[Environmental context]. [Scale indicators]. [Purpose/intent — why this exists].
```

Example:
"A cinematic aerial shot of a city grown into red sandstone canyon walls, 600 meters deep. 
Carved facades of warm terracotta and oxidized copper catch late afternoon light. 
Rope bridges and terraced gardens connect cliff-face neighborhoods. 
A civilization that chose depth over sprawl — gravity as infrastructure."

## Kira Image Voice
- Every image should feel "designed" — not fantasy, not blueprint, plausibly real
- Include human scale (figures, windows, paths)
- The concept should be legible from the image alone
- Text caption explains the vision, not the description
