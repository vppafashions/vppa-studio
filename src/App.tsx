/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Upload, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle, Sparkles, Trash2, Plus, X, Download, Camera, Layers, Zap, RotateCcw, RefreshCw, Lock, Mail, Eye, EyeOff, ChevronLeft, ChevronRight, Share2, Heart, ArrowLeft, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';

const SHOW_BRAND_CAMPAIGNS = false;

// Initialize Gemini API for analysis + image generation.
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Image generation via Google Gemini directly.
// Same model as Runware's google:nano-banana@2-lite → Nano Banana 2 Lite.
// Docs: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image
// Note: Lite is optimized for 1K only (2K/4K unsupported).
const IMAGE_MODEL_PRIMARY = 'gemini-3.1-flash-lite-image';
const IMAGE_MODEL_FALLBACK = 'gemini-2.5-flash-image';
const IMAGE_MODEL = IMAGE_MODEL_PRIMARY;
const ANALYSIS_MODEL = 'gemini-3-flash-preview';

// Once primary hits hard-quota 429 (limit:0), skip it for the rest of the session.
let imageModelDegraded = false;
// Optional hook: set by the app so the helper can surface a one-time info toast.
let onImageModelFallback: ((msg: string) => void) | null = null;

const MAX_PARALLEL_IMAGE_GEN = 4;

async function runWithConcurrency(
  count: number,
  limit: number,
  worker: (index: number) => Promise<void>
): Promise<void> {
  if (count <= 0) return;
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, limit), count);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= count) break;
        try {
          await worker(i);
        } catch {
          // each worker handles its own errors; swallow here so peers keep going.
        }
      }
    })
  );
}

// Helper: call Gemini generateContent with retry on 429, then fallback model.
async function callImageGenWithRetry(params: any, maxRetries = 2): Promise<any> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY. Add it to .env and rebuild.');
  }

  const originalModel = params?.model || IMAGE_MODEL_PRIMARY;
  const primaryModel = imageModelDegraded ? IMAGE_MODEL_FALLBACK : originalModel;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await genAI.models.generateContent({ ...params, model: primaryModel });
    } catch (err: any) {
      lastErr = err;
      const msg = typeof err?.message === 'string' ? err.message : JSON.stringify(err || {});
      const is429 = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('"code":429') || msg.includes(' 429');
      const isHardQuota = msg.includes('limit: 0') || msg.includes('limit":0');
      if (!is429) throw err;
      if (isHardQuota || attempt === maxRetries) break;
      const retryMatch = msg.match(/retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
      const delaySec = retryMatch ? parseFloat(retryMatch[1]) : Math.pow(2, attempt);
      const delayMs = Math.min(30000, Math.max(1000, delaySec * 1000));
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  if (primaryModel !== IMAGE_MODEL_FALLBACK) {
    const wasFirstDegradation = !imageModelDegraded;
    imageModelDegraded = true;
    console.warn(`[image] primary model ${primaryModel} exhausted, falling back to ${IMAGE_MODEL_FALLBACK}`);
    if (wasFirstDegradation && onImageModelFallback) {
      onImageModelFallback(`Nano Banana 2 Lite quota hit. Falling back to ${IMAGE_MODEL_FALLBACK} for the rest of this session.`);
    }
    return await genAI.models.generateContent({ ...params, model: IMAGE_MODEL_FALLBACK });
  }
  throw lastErr;
}

type UploadMode = 'standard' | 'printed';

interface ReferenceImage {
  file: File;
  preview: string;
  label?: 'front' | 'back';
}

interface GeneratedView {
  url: string;
  type: string;
  description: string;
}

interface GalleryImage {
  url: string;
  label: string;
  section: string;
}

interface ApparelItem {
  id: string;
  images: ReferenceImage[];
  views: GeneratedView[];
  status: 'idle' | 'analyzing' | 'processing' | 'completed' | 'error';
  analysis?: string;
  currentProcessingIndex?: number;
  generatedStyleId?: string;
  uploadMode: UploadMode;
  heroColor?: string;
  price?: string;
  selectedCampaignObjects?: string[];
  campaignImages?: { objectId: string; objectLabel: string; view: GeneratedView }[];
  campaignStatus?: 'idle' | 'generating' | 'completed' | 'error';
  campaignProgress?: { current: number; total: number };
  selectedPressPalettes?: string[];
  pressImages?: { paletteId: string; paletteLabel: string; view: GeneratedView }[];
  pressStatus?: 'idle' | 'generating' | 'completed' | 'error';
  pressProgress?: { current: number; total: number };
  selectedEditorialSettings?: string[];
  editorialImages?: { settingId: string; settingLabel: string; view: GeneratedView }[];
  editorialStatus?: 'idle' | 'generating' | 'completed' | 'error';
  editorialProgress?: { current: number; total: number };
  selectedHeritagePalettes?: string[];
  heritageImages?: { paletteId: string; paletteLabel: string; view: GeneratedView }[];
  heritageStatus?: 'idle' | 'generating' | 'completed' | 'error';
  heritageProgress?: { current: number; total: number };
  selectedHermesThemes?: string[];
  hermesImages?: { themeId: string; themeLabel: string; view: GeneratedView }[];
  hermesStatus?: 'idle' | 'generating' | 'completed' | 'error';
  hermesProgress?: { current: number; total: number };
  selectedBottegaThemes?: string[];
  bottegaImages?: { themeId: string; themeLabel: string; view: GeneratedView }[];
  bottegaStatus?: 'idle' | 'generating' | 'completed' | 'error';
  bottegaProgress?: { current: number; total: number };
  selectedSaintLaurentThemes?: string[];
  saintLaurentImages?: { themeId: string; themeLabel: string; view: GeneratedView }[];
  saintLaurentStatus?: 'idle' | 'generating' | 'completed' | 'error';
  saintLaurentProgress?: { current: number; total: number };
  selectedPradaThemes?: string[];
  pradaImages?: { themeId: string; themeLabel: string; view: GeneratedView }[];
  pradaStatus?: 'idle' | 'generating' | 'completed' | 'error';
  pradaProgress?: { current: number; total: number };
  selectedDiorThemes?: string[];
  diorImages?: { themeId: string; themeLabel: string; view: GeneratedView }[];
  diorStatus?: 'idle' | 'generating' | 'completed' | 'error';
  diorProgress?: { current: number; total: number };
  selectedJacquemusThemes?: string[];
  jacquemusImages?: { themeId: string; themeLabel: string; view: GeneratedView }[];
  jacquemusStatus?: 'idle' | 'generating' | 'completed' | 'error';
  jacquemusProgress?: { current: number; total: number };
  selectedBurberryThemes?: string[];
  burberryImages?: { themeId: string; themeLabel: string; view: GeneratedView }[];
  burberryStatus?: 'idle' | 'generating' | 'completed' | 'error';
  burberryProgress?: { current: number; total: number };
  selectedBalenciagaThemes?: string[];
  balenciagaImages?: { themeId: string; themeLabel: string; view: GeneratedView }[];
  balenciagaStatus?: 'idle' | 'generating' | 'completed' | 'error';
  balenciagaProgress?: { current: number; total: number };
}

interface EditorialSetting {
  id: string;
  label: string;
  mood: string;
  location: string;
  pose: string;
  lighting: string;
}

const EDITORIAL_SETTINGS: EditorialSetting[] = [
  { id: 'concrete-stairs', label: 'Concrete Stairs', mood: 'Architectural, calm', location: 'a wide shallow concrete staircase with raw texture, industrial minimalism, no railings', pose: 'model stands casually on one of the steps, hand lightly on a hip, gaze off to the side', lighting: 'soft overcast daylight from above, no direct sun, even shadowless diffusion' },
  { id: 'white-corner', label: 'White Corner', mood: 'Clean, quiet, studio', location: 'an empty off-white painted studio corner where two walls meet, subtle shadow line in the crease', pose: 'model leans one shoulder into the wall corner, one leg crossed, head turned slightly', lighting: 'large diffused softbox window light from the left, 5500K, very low contrast' },
  { id: 'arched-doorway', label: 'Arched Doorway', mood: 'Mediterranean, elegant', location: 'a tall white stucco arched doorway viewed from outside, textured plaster walls, tiled threshold', pose: 'model stands under the arch, one hand on the frame, profile angle to the camera', lighting: 'bright natural sunlight spilling across the plaster, soft bounce fill, warm 5200K' },
  { id: 'window-light', label: 'Window Light', mood: 'Intimate, serene', location: 'a tall minimal window with sheer linen curtain, plain wall behind, soft wood floor', pose: 'model stands three-quarter facing the window, eyes closed, chin lifted slightly, hands loose', lighting: 'soft backlight and sidelight through the sheer curtain, 5500K, natural falloff' },
  { id: 'marble-hallway', label: 'Marble Hallway', mood: 'Gallery, refined, quiet', location: 'a long minimal marble hallway with columns receding, polished stone floor, no decoration', pose: 'model walks forward mid-stride, one foot lifted, looking straight ahead, hands by sides', lighting: 'cool museum lighting from ceiling fixtures, neutral 6000K, very diffused' },
  { id: 'brutalist-wall', label: 'Brutalist Wall', mood: 'Raw, urban, editorial', location: 'a raw concrete brutalist wall with formwork lines, rough texture, nothing else in frame', pose: 'model stands with back against the wall, head tilted up, both arms relaxed', lighting: 'hard directional late-afternoon sidelight casting soft concrete textures, 5000K' },
  { id: 'urban-sidewalk', label: 'Urban Sidewalk', mood: 'Street, candid, effortless', location: 'a clean wide city sidewalk with painted crosswalk lines, minimal background, neutral grey pavement', pose: 'model walks mid-stride across the crosswalk lines, natural gait, not looking at camera', lighting: 'overcast city daylight, soft shadowless, neutral 5800K' },
  { id: 'mirror-room', label: 'Mirror Room', mood: 'Conceptual, quiet', location: 'a minimal room with a tall full-length mirror on one wall, pale wood floor, off-white walls', pose: 'model stands facing the mirror in three-quarter view, reflection visible but soft', lighting: 'soft window light from behind camera, 5500K neutral, low contrast' },
  { id: 'gallery-space', label: 'Gallery Space', mood: 'Artistic, curated', location: 'a museum gallery space with high white walls, pale wood floor, one blurred framed piece in distance', pose: 'model stands still facing away from the camera, head slightly turned', lighting: 'neutral gallery spotlight from overhead, 5700K, low contrast' },
  { id: 'rooftop-minimal', label: 'Rooftop Minimal', mood: 'Open, quiet, elevated', location: 'a minimalist rooftop with clean concrete floor, distant city haze, no skyline clutter', pose: 'model stands at the edge looking out, three-quarter back view, arms loose', lighting: 'diffused open-sky light, no hard sun, cool 6000K with slight gradient from sky' },
];

interface HeritagePalette {
  id: string;
  label: string;
  mood: string;
  paletteDescription: string;
  monogramDescription: string;
  accentDescription: string;
}

const HERITAGE_PALETTES: HeritagePalette[] = [
  { id: 'classic-monogram', label: 'Classic Monogram', mood: 'Timeless, archival, heritage', paletteDescription: 'warm tan and rich chestnut brown, canvas-and-leather heritage tones', monogramDescription: 'warm golden beige monogram on a deep chestnut canvas backdrop', accentDescription: 'brass gold for logo and wordmark' },
  { id: 'forest-heritage', label: 'Forest Heritage', mood: 'Regal, stately, hunting lodge', paletteDescription: 'deep forest green with muted olive undertones, old-library ambience', monogramDescription: 'muted antique gold monogram on a deep forest green backdrop', accentDescription: 'antique gold for logo and wordmark' },
  { id: 'bordeaux-wine', label: 'Bordeaux Wine', mood: 'Opulent, operatic, velvet', paletteDescription: 'deep bordeaux wine red with subtle crimson highlights, theatrical richness', monogramDescription: 'soft champagne gold monogram on a deep bordeaux velvet backdrop', accentDescription: 'champagne gold for logo and wordmark' },
  { id: 'midnight-sapphire', label: 'Midnight Sapphire', mood: 'Refined, midnight, jeweled', paletteDescription: 'deep midnight sapphire blue with subtle navy undertones, jewel-box quiet', monogramDescription: 'pale moonlight silver monogram on a deep midnight sapphire backdrop', accentDescription: 'moonlight silver for logo and wordmark' },
  { id: 'ivory-champagne', label: 'Ivory Champagne', mood: 'Bridal, ceremonial, golden', paletteDescription: 'warm ivory with champagne gold undertones, fine-linen elegance', monogramDescription: 'soft warm champagne monogram on an ivory cream backdrop', accentDescription: 'warm champagne gold for logo and wordmark' },
  { id: 'black-onyx-gold', label: 'Black Onyx Gold', mood: 'Dramatic, nocturnal, couture', paletteDescription: 'deep matte onyx black with rich warm undertones, couture-runway drama', monogramDescription: 'bright burnished gold monogram on a matte onyx black backdrop', accentDescription: 'burnished gold for logo and wordmark' },
  { id: 'burnt-terracotta', label: 'Burnt Terracotta', mood: 'Earthen, mediterranean, sun', paletteDescription: 'warm burnt terracotta orange with subtle ochre warmth, sun-baked earth', monogramDescription: 'bronze-copper monogram on a burnt terracotta backdrop', accentDescription: 'bronze copper for logo and wordmark' },
  { id: 'sage-silver', label: 'Sage Silver', mood: 'Herbarium, cool, collected', paletteDescription: 'muted sage green-grey with soft cool undertones, botanical archive feel', monogramDescription: 'brushed silver monogram on a muted sage backdrop', accentDescription: 'brushed silver for logo and wordmark' },
];

interface HermesTheme {
  id: string;
  label: string;
  mood: string;
  backgroundDescription: string;
  backgroundHex: string;
  illustrationMotif: string;
  illustrationColor: string;
}

const HERMES_THEMES: HermesTheme[] = [
  { id: 'orange-equestrian', label: 'Equestrian Orange', mood: 'Iconic, playful, hand-crafted', backgroundDescription: 'pure iconic Hermes orange, flat warm vermilion fill, no gradient, fully saturated', backgroundHex: '#FF7300', illustrationMotif: 'whimsical hand-drawn galloping horses with flowing manes, riding crops, leather bridles, equestrian stirrups, and curling rope flourishes drawn in loose pen-and-ink style around the garment', illustrationColor: 'rich espresso brown ink' },
  { id: 'silk-scarf', label: 'Silk Scarf Reverie', mood: 'Whimsical, poetic, hand-drawn', backgroundDescription: 'warm cream off-white reminiscent of vintage paper, slight grainy texture', backgroundHex: '#F5EBD8', illustrationMotif: 'dreamy hand-illustrated marginalia of botanical sprigs, butterflies, sea creatures, acrobatic flower-headed figures, drifting clouds, and cursive curlicues in loose ink-line style around the garment', illustrationColor: 'deep ink black with occasional warm vermilion accents' },
  { id: 'maritime-blue', label: 'Maritime Blue', mood: 'Nautical, breezy, archival', backgroundDescription: 'soft pale sky-meets-sea blue, a quiet maritime watercolor wash', backgroundHex: '#C8DAE4', illustrationMotif: 'hand-drawn sailing knots, sextants, paper boats, anchors, wave swirls, and dolphins playing in loose ink line around the garment', illustrationColor: 'deep navy ink' },
  { id: 'meadow-green', label: 'Meadow Green', mood: 'Pastoral, garden, fresh', backgroundDescription: 'soft sage meadow green, slightly chalky like vintage gardening prints', backgroundHex: '#B8C7A8', illustrationMotif: 'hand-drawn flowering vines, butterflies mid-flight, tiny rabbits, leaf garlands, garden trellises, and bumblebees in loose pen line around the garment', illustrationColor: 'deep forest green ink' },
  { id: 'rose-poudre', label: 'Rose Poudre', mood: 'Tender, romantic, atelier', backgroundDescription: 'soft powder rose blush, the color of vintage millinery silk ribbon', backgroundHex: '#F0D7CE', illustrationMotif: 'hand-drawn ribbons tying bows, single long-stem roses, paper hearts, perfume bottles, lace fans, and powder puffs in loose ink line around the garment', illustrationColor: 'deep oxblood ink' },
  { id: 'noir-sketch', label: 'Noir Sketch', mood: 'Moody, atelier-night, classical', backgroundDescription: 'dense midnight black with very subtle warm undertone, like aged ink paper', backgroundHex: '#1A1614', illustrationMotif: 'fine hand-drawn fencing foils, opera masks, antique pocket watches, candelabras, plumed pens, and curling smoke wisps in loose white line around the garment', illustrationColor: 'warm cream ivory white ink' },
];

interface BottegaTheme {
  id: string;
  label: string;
  mood: string;
  backgroundDescription: string;
  backgroundHex: string;
  surfaceDescription: string;
  craftDetail: string;
}

const BOTTEGA_THEMES: BottegaTheme[] = [
  { id: 'parakeet-green', label: 'Parakeet Green', mood: 'Iconic, signature, quiet', backgroundDescription: 'iconic Bottega parakeet green flat fill, deep saturated emerald-leaf green, completely uniform, no gradient', backgroundHex: '#2E5E47', surfaceDescription: 'a smooth pale travertine stone plinth or polished concrete pedestal where the garment rests, casting a single soft natural shadow', craftDetail: 'a tight macro hint of intrecciato woven leather texture (over-under leather strips at 45 degrees) just visible in one corner as a subtle backdrop element' },
  { id: 'travertine-cream', label: 'Travertine Cream', mood: 'Architectural, calm, raw', backgroundDescription: 'warm travertine stone cream with the very faintest natural mineral mottle, almost imperceptible, otherwise flat and uniform', backgroundHex: '#E8DCC4', surfaceDescription: 'a brushed natural oak wood plinth or honed limestone slab where the garment is placed, casting a single soft shadow', craftDetail: 'a quiet glimpse of natural raw leather hide texture grain on a folded swatch beside the garment, no logos at all' },
  { id: 'caramel-leather', label: 'Caramel Leather', mood: 'Warm, tactile, archival', backgroundDescription: 'rich warm caramel leather brown flat fill, the color of vintage saddle leather, smooth and uniform', backgroundHex: '#A07254', surfaceDescription: 'a polished walnut wood plinth or aged copper-edged surface where the garment lies, single soft shadow', craftDetail: 'a small folded edge of intrecciato woven leather visible as a tactile detail beside the garment' },
  { id: 'fondant-rose', label: 'Fondant Rose', mood: 'Tender, restrained, modern', backgroundDescription: 'muted dusty fondant pink, the color of pressed silk satin, completely flat and uniform', backgroundHex: '#D4B5AC', surfaceDescription: 'a smooth pale Carrara marble plinth or matte cream-painted box where the garment is presented', craftDetail: 'a single fold of supple lambskin laid like a ribbon beside the garment, no logos visible' },
  { id: 'kalk-white', label: 'Kalk White', mood: 'Pure, gallery, weightless', backgroundDescription: 'pure soft chalk white, slight matte texture like fine plaster, completely uniform', backgroundHex: '#F1EEE7', surfaceDescription: 'a slim raw concrete plinth or solid white display block where the garment is placed, casting a clean single shadow', craftDetail: 'a tightly cropped corner of intrecciato woven leather pattern visible at the edge as a tactile texture detail' },
  { id: 'midnight-suede', label: 'Midnight Suede', mood: 'Nocturnal, hushed, refined', backgroundDescription: 'deep midnight charcoal with subtle suede-like texture, looks like brushed dark suede leather, uniform tone', backgroundHex: '#1F1E1C', surfaceDescription: 'a polished black granite plinth or dark walnut surface where the garment rests, single low shadow', craftDetail: 'a glimpse of woven leather intrecciato pattern softly catching light at the edge of frame' },
];

interface SaintLaurentTheme {
  id: string;
  label: string;
  mood: string;
  backgroundDescription: string;
  backgroundHex: string;
  lightingDescription: string;
  poseDirection: string;
}

const SAINTLAURENT_THEMES: SaintLaurentTheme[] = [
  { id: 'pure-noir', label: 'Pure Noir', mood: 'Iconic, rock, monochrome', backgroundDescription: 'absolute pure black void with subtle film grain, completely flat and infinite, no gradient, no walls visible', backgroundHex: '#000000', lightingDescription: 'single hard directional spotlight from upper-left at 45 degrees, harsh raking key, deep crushed shadows on the right side, ratio 8:1, almost noir cinema. 5500K neutral white.', poseDirection: 'model stands rigid, hand on hip, chin lifted defiantly, sharp shoulder line, eyes locked on camera through downturned brow' },
  { id: 'bleached-mono', label: 'Bleached Mono', mood: 'Bleached, contrast, brutalist', backgroundDescription: 'flat bleached white wall with subtle grain, slightly off-white but reads as overexposed bright white', backgroundHex: '#F4F4F0', lightingDescription: 'hard frontal flash light blasting the model with a deep crushed shadow falling onto the wall behind, contrast ratio 5:1, color desaturated to near monochrome', poseDirection: 'model leans back against the wall, one knee bent forward, smoking-pose energy, hands relaxed at sides, jaw set' },
  { id: 'crushed-shadow', label: 'Crushed Shadow', mood: 'Cinematic, half-light, sensual', backgroundDescription: 'deep crushed charcoal black background with a subtle dark vignette that fades into pure black at the edges', backgroundHex: '#0E0D0C', lightingDescription: 'one slim vertical strip light from camera-right grazes the body, leaving half the model in deep shadow and the other half rim-lit. Strong chiaroscuro. 4500K warm.', poseDirection: 'model in half-shadow profile, head turned to camera over the shoulder, sharp cheekbones lit, body silhouetted' },
  { id: 'high-flash', label: 'High Flash', mood: 'Paparazzi, raw, fashion-week', backgroundDescription: 'pure dense black background with the slightest motion-blur halo around the subject from camera flash, no walls', backgroundHex: '#050505', lightingDescription: 'direct on-axis camera flash creating a sharp hard-edged shadow halo just outside the silhouette, harsh, slightly overexposed on highlights, 5500K cold flash quality', poseDirection: 'model walks straight at the camera mid-stride, looking down past the lens, attitude-driven, model-off-duty energy' },
  { id: 'silver-rain', label: 'Silver Rain', mood: 'Wet, glam-rock, glitter', backgroundDescription: 'deep gunmetal grey background with subtle water-droplet sheen specks suggesting rain, almost black, soft vignette', backgroundHex: '#1A1A1D', lightingDescription: 'two hard rim lights from upper-left and upper-right casting twin highlights along the body and water specs, deep central shadow, 4800K cool, very contrast-heavy', poseDirection: 'model stands head-on, arms slightly out, hair slick back as if wet, gaze sharp and direct, slight forward lean' },
  { id: 'velvet-couture', label: 'Velvet Couture', mood: 'Couture, salon, opera', backgroundDescription: 'deep oxblood velvet drape backdrop, rich deep wine red with subtle pile texture, soft vignette to dark', backgroundHex: '#3A1620', lightingDescription: 'single warm soft key from upper-left with strong falloff to deep shadow, subtle hair light from behind. 3800K very warm tungsten, 6:1 contrast, opera-house mood', poseDirection: 'model seated on a velvet stool in three-quarter view, one arm draped over the seat back, head tilted slightly, sultry editorial gaze' },
];

interface PradaTheme {
  id: string;
  label: string;
  mood: string;
  backgroundDescription: string;
  backgroundHex: string;
  setSetting: string;
  poseDirection: string;
}

const PRADA_THEMES: PradaTheme[] = [
  { id: 'acid-yellow', label: 'Acid Yellow', mood: 'Bold, conceptual, uniform', backgroundDescription: 'a completely flat acid-chartreuse yellow wall filling the frame, laboratory-bright, no gradient, no texture', backgroundHex: '#D8E041', setSetting: 'a minimal geometric gallery set, one large matte-black monolith cube or a slim stainless steel rod protruding from the floor as a conceptual prop', poseDirection: 'model stands rigid and centered, arms held close to the sides, gaze deadpan into the camera, slight institutional detachment' },
  { id: 'cobalt-blocked', label: 'Cobalt Blocked', mood: 'Architectural, graphic, crisp', backgroundDescription: 'a sharp color-blocked backdrop split diagonally between a deep cobalt blue upper half and a flat vermilion lower half, laser-crisp edge', backgroundHex: '#1A3EB8', setSetting: 'a single polished aluminium bench or a geometric plinth, nothing else in frame', poseDirection: 'model sits on the bench in three-quarter view, knees together, one hand on thigh, eyes looking slightly off-frame with intellectual stillness' },
  { id: 'flesh-pink', label: 'Flesh Pink', mood: 'Provocative, softly weird', backgroundDescription: 'a flat pale-flesh pink backdrop with a subtle matte texture, slightly cold pink, nothing else', backgroundHex: '#E8C7BE', setSetting: 'a thin transparent acrylic dividing panel bisecting the frame, catching a subtle refraction, otherwise empty', poseDirection: 'model stands behind the acrylic panel, pressing one palm lightly against it, head tilted, subtly off-kilter gaze' },
  { id: 'industrial-slate', label: 'Industrial Slate', mood: 'Brutalist, minimal, cold', backgroundDescription: 'a raw polished concrete wall in cool slate grey with faint formwork seams, otherwise flat and uniform', backgroundHex: '#6B6E72', setSetting: 'a slim fluorescent strip light mounted horizontally mid-wall, otherwise empty floor', poseDirection: 'model stands statuesque in profile against the wall, head turned to camera, sculptural stillness' },
  { id: 'olive-military', label: 'Olive Military', mood: 'Functional, utilitarian, sharp', backgroundDescription: 'a matte deep olive military-green wall, flat and uniform, like a factory-painted surface', backgroundHex: '#4F5A3A', setSetting: 'a single galvanised steel folding chair centered in frame, nothing else', poseDirection: 'model sits on the folding chair with knees apart, forearms resting on thighs, jaw squared, direct unflinching gaze' },
  { id: 'millennial-rose', label: 'Millennial Rose', mood: 'Pop, ironic, glossy', backgroundDescription: 'a uniform glossy millennial-pink backdrop with a very subtle specular sheen, no gradient', backgroundHex: '#F2B9BD', setSetting: 'a reflective chrome stool or a mirrored disc on the floor reflecting the model lightly', poseDirection: 'model stands with one hand on hip, chin lifted, pop-deadpan gaze, slight runway commitment' },
];

interface DiorTheme {
  id: string;
  label: string;
  mood: string;
  locationDescription: string;
  paletteDescription: string;
  paletteHex: string;
  poseDirection: string;
  lightingDescription: string;
}

const DIOR_THEMES: DiorTheme[] = [
  { id: 'baroque-salon', label: 'Baroque Salon', mood: 'Couture, romantic, Versailles', locationDescription: 'a gilded Versailles-style salon with cream panelled walls, ornate gold moulding, parquet floor, a marble bust in a shallow alcove', paletteDescription: 'cream ivory walls with warm gold accents and soft butter-cream highlights', paletteHex: '#F2E4C7', poseDirection: 'model leans one shoulder against a panelled wall, head tilted gracefully, free hand loosely holding a long silk ribbon', lightingDescription: 'soft north-facing window light pooling from camera-left, 5200K warm, creamy 2:1 ratio, painterly falloff into the corners' },
  { id: 'garden-bloom', label: 'Garden Bloom', mood: 'Pastoral, romantic, floral', locationDescription: 'a spring garden alcove with climbing pale pink roses and hydrangeas on a weathered stone wall, soft grass underfoot', paletteDescription: 'pale pinks, sage greens, soft ivory blooms, misted morning light', paletteHex: '#E6CFD2', poseDirection: 'model stands among the blooms holding a single long-stem rose, half-turn to camera, eyes closed in quiet reverie', lightingDescription: 'very soft overcast morning diffusion, 5800K, shadowless, slight atmospheric haze in the distance' },
  { id: 'renaissance-atelier', label: 'Renaissance Atelier', mood: 'Painterly, classical, couture', locationDescription: 'a painterly artist atelier with warm plaster walls, a partially draped easel in the corner, scattered antique sketchbooks, a heavy velvet curtain drawn open to one side', paletteDescription: 'umber warm earth tones, plum curtain, deep burnt sienna accents', paletteHex: '#A88A6D', poseDirection: 'model stands against the curtain in a three-quarter classical contrapposto pose, one hand resting lightly on a balustrade', lightingDescription: 'warm single-window chiaroscuro from upper-left, 4500K, 3:1 ratio, reminiscent of Vermeer or Caravaggio' },
  { id: 'silk-drapery', label: 'Silk Drapery', mood: 'Haute couture, studio, poetic', locationDescription: 'a studio with cascading layers of silk drapery in soft champagne and powder rose falling from the ceiling to the polished oak floor', paletteDescription: 'champagne gold silk and soft powder rose, pearlescent sheen', paletteHex: '#EAD7C1', poseDirection: 'model stands among the drapes, one hand gently parting the silk, body in three-quarter view, dreamy distant gaze', lightingDescription: 'diffused overhead key with strong bounce fill making the silk glow, 5500K, 1.8:1 low contrast ethereal' },
  { id: 'marble-statuary', label: 'Marble Statuary', mood: 'Classical, sculptural, couture', locationDescription: 'a museum statuary hall with polished white Carrara marble floor, classical plaster nudes and Greek busts on plinths in the background, tall arched windows', paletteDescription: 'bright cool whites, pale stone greys, faint green marble veining', paletteHex: '#E5E2D8', poseDirection: 'model stands between two statuary plinths in a classical pose, body slightly turned, head lifted, echoing the statues', lightingDescription: 'cool museum daylight through tall windows, 6000K, very diffused and shadowless, almost flat' },
  { id: 'candlelit-boudoir', label: 'Candlelit Boudoir', mood: 'Intimate, twilight, couture', locationDescription: 'a candlelit Parisian boudoir with silk wallpaper, a velvet chaise longue, antique mirrors, brass candelabras glowing softly', paletteDescription: 'deep blush silk wallpaper, dark mahogany, warm candle-amber', paletteHex: '#5E2A3A', poseDirection: 'model reclines on the chaise in three-quarter view, one arm draped over the back, head turned toward camera, soft contemplative gaze', lightingDescription: 'warm candle flame key from camera-right supplemented by subtle ambient fill, 3000K, strong warm tungsten, 4:1 gentle chiaroscuro' },
];

interface JacquemusTheme {
  id: string;
  label: string;
  mood: string;
  locationDescription: string;
  palette: string;
  paletteHex: string;
  surrealProp: string;
  poseDirection: string;
}

const JACQUEMUS_THEMES: JacquemusTheme[] = [
  { id: 'lavender-field', label: 'Lavender Field', mood: 'Provence, sun-kissed, dreamy', locationDescription: 'endless rows of lavender stretching to the horizon under a clear pale-blue Provencal sky', palette: 'lavender violet-purple, warm golden sun-bleached hues, chalky sky blue', paletteHex: '#B8A0D8', surrealProp: 'an oversized straw sun hat (2x normal size) that the model holds at arm\'s length', poseDirection: 'model walks along a dirt path between the lavender rows, mid-stride, holding the giant hat loosely, golden hour glow' },
  { id: 'olive-grove', label: 'Olive Grove', mood: 'Mediterranean, warm, earthy', locationDescription: 'an ancient olive grove with gnarled silver-green trees, dry amber grass, terracotta dry stone wall in distance', palette: 'silver-sage olive green, warm terracotta, sun-bleached amber', paletteHex: '#BFC19B', surrealProp: 'an oversized single ripe olive branch with leaves (3x normal size) held in the model\'s arms', poseDirection: 'model stands under an olive tree cradling the giant branch, leaning shoulder against the trunk, serene sunlit gaze' },
  { id: 'beach-cove', label: 'Beach Cove', mood: 'Riviera, turquoise, oversize', locationDescription: 'a small Mediterranean cove with turquoise water, white pebble beach, a single painted wooden rowboat in shallows', palette: 'turquoise sea, bone-white pebbles, sun-washed cream', paletteHex: '#88C8D4', surrealProp: 'a giant oversized lemon (5x normal size) or a massive white conch seashell held in hand', poseDirection: 'model stands in ankle-deep water holding the giant prop, white sun-bleached linen mood, golden warm skin' },
  { id: 'stucco-wall', label: 'Stucco Wall', mood: 'Graphic, minimal, cote', locationDescription: 'a flat whitewashed Mediterranean stucco wall with a thin shadow line, a single terracotta pot with a sculpted olive tree', palette: 'cream white stucco, warm terracotta accents, bright cote blue door in the distance', paletteHex: '#F2EADC', surrealProp: 'an oversized single croissant (3x normal size) or a giant lemon wedge held at the chest', poseDirection: 'model stands against the stucco wall in profile silhouette, holding the giant prop, sun-bleached noon light' },
  { id: 'yacht-deck', label: 'Yacht Deck', mood: 'Riviera jet-set, breezy', locationDescription: 'the bleached teak deck of a sleek yacht at sea, polished brass fittings, white linen sun-cushions, endless cobalt ocean on the horizon', palette: 'bleached teak, polished brass, cobalt sea, white linen', paletteHex: '#E5D4A1', surrealProp: 'a giant oversized tennis ball (4x normal size) or a massive single pearl held at the hip', poseDirection: 'model leans one hand on the teak rail, wind in hair, gaze off toward the horizon, oversize prop visible at their side' },
  { id: 'cobblestone-alley', label: 'Cobblestone Alley', mood: 'Old-town, pastel, sun-dappled', locationDescription: 'a sun-dappled old-town cobblestone alley with pastel-painted shutters, terracotta tile roof visible above, a lone bougainvillea branch', palette: 'soft lemon yellow, powder blue, terracotta roof, muted rose shutters', paletteHex: '#F2D88A', surrealProp: 'an oversized straw market basket (3x normal size) overflowing with oversize peaches', poseDirection: 'model walks toward camera down the alley carrying the giant basket on one arm, warm late-afternoon sun raking across' },
];

interface BurberryTheme {
  id: string;
  label: string;
  mood: string;
  locationDescription: string;
  paletteDescription: string;
  paletteHex: string;
  weatherAtmosphere: string;
  poseDirection: string;
}

const BURBERRY_THEMES: BurberryTheme[] = [
  { id: 'foggy-moors', label: 'Foggy Moors', mood: 'British, atmospheric, stoic', locationDescription: 'a wide Yorkshire-style moorland stretching to an invisible horizon, heather and dry grass, a lone gnarled tree in the middle distance', paletteDescription: 'muted sage green, dusty mauve heather, warm oatmeal, cold grey-blue sky', paletteHex: '#8C9287', weatherAtmosphere: 'thick rolling fog wrapping the landscape, subdued cool diffusion, faint drizzle, moisture on the grass', poseDirection: 'model stands alone on the moor with hands in coat pockets, wind tousling hair slightly, gaze into the fog, stoic quiet' },
  { id: 'rainy-cobblestones', label: 'Rainy Cobblestones', mood: 'London, cinematic, noir', locationDescription: 'a narrow London cobblestone alley glistening with rain, a single antique iron lamppost glowing faintly, wet brick walls', paletteDescription: 'wet slate cobble, warm amber lamppost glow, deep charcoal, ochre brick', paletteHex: '#4D4A45', weatherAtmosphere: 'steady drizzle, cold damp air, subtle mist curling around the lamppost glow, reflections in the puddles', poseDirection: 'model walks toward camera mid-stride under the lamppost, collar turned up, hands in pockets, cinematic gaze slightly past the lens' },
  { id: 'cliffside-wind', label: 'Cliffside Wind', mood: 'Coastal, windswept, heroic', locationDescription: 'a sheer British coastal cliff edge with wild sea-grass, chalky white cliffs falling into a grey sea below, distant seabirds', paletteDescription: 'chalky cliff white, muted sea green, overcast ashen sky, pale grass', paletteHex: '#CDCFC5', weatherAtmosphere: 'strong sea wind visibly tugging coat and hair, cold salt spray in the air, cool cloudy diffused light', poseDirection: 'model stands at the cliff edge in three-quarter view looking out to sea, coat and hair blowing dramatically, one hand steadying collar' },
  { id: 'misty-lake', label: 'Misty Lake', mood: 'Lake-district, contemplative', locationDescription: 'the still edge of an English lake at dawn, wooden rowboat moored in reeds, forested far shore disappearing into mist', paletteDescription: 'silver-grey water, forest green, warm ochre reed, pale champagne mist', paletteHex: '#A4A59A', weatherAtmosphere: 'low dawn mist hovering above water surface, still air, ethereal cool light with pale warm sun struggling through', poseDirection: 'model stands at the reedy shore beside the moored boat, half-turned to camera, quiet meditative gaze toward the mist' },
  { id: 'autumn-forest', label: 'Autumn Forest', mood: 'Earthy, heritage, warm', locationDescription: 'a British autumn beech forest with a carpet of fallen leaves, thin shafts of golden sunlight piercing through amber canopy', paletteDescription: 'rich copper-brown, burnt ochre, mossy green, warm gold leaf-light', paletteHex: '#9E6935', weatherAtmosphere: 'crisp cool air, faint leaf drift, shafts of warm sun creating atmospheric beams of amber light through haze', poseDirection: 'model walks through ankle-deep leaves between tree trunks, mid-stride in three-quarter view, warm glow on cheek' },
  { id: 'country-house', label: 'Country House', mood: 'Heritage, stately, refined', locationDescription: 'the gravel drive of a grand English country manor with limestone facade, ivy climbing, clipped topiary hedges, a single vintage roadster parked in the background', paletteDescription: 'warm limestone cream, dark ivy green, slate grey roof, polished chestnut car', paletteHex: '#D6C9A0', weatherAtmosphere: 'overcast cool British afternoon, soft diffused cool light, slight haze over the manor, no harsh shadows', poseDirection: 'model stands on the gravel drive facing slightly away from the manor, half-turn to camera, one hand adjusting the collar, aristocratic stillness' },
];

interface BalenciagaTheme {
  id: string;
  label: string;
  mood: string;
  environmentDescription: string;
  paletteDescription: string;
  paletteHex: string;
  weatherAtmosphere: string;
  poseDirection: string;
  lightingDescription: string;
}

const BALENCIAGA_THEMES: BalenciagaTheme[] = [
  { id: 'snow-apocalypse', label: 'Snow Apocalypse', mood: 'Dystopian, blizzard, defiant', environmentDescription: 'a desolate white-out snowy plain with horizontal snow drifts and no visible horizon, a single leaning steel pole in distance', paletteDescription: 'near-white blizzard, icy cold blue-grey, black silhouettes', paletteHex: '#E5E8EB', weatherAtmosphere: 'heavy horizontal snowfall streaking across the frame, cold wind visibly pushing snow, desaturated freezing atmosphere', poseDirection: 'model stands facing the blizzard head-on, coat whipping in the wind, hood pulled up, defiant forward lean, unreadable expression', lightingDescription: 'harsh flat blizzard-diffused daylight, 7000K very cold, no shadows, overexposed highlights on skin, crushed black garments' },
  { id: 'brutalist-bunker', label: 'Brutalist Bunker', mood: 'Cold-war, brutalist, sculptural', environmentDescription: 'the interior of a raw concrete brutalist bunker with formwork seams, one overhead fluorescent strip, a rusted heavy steel door partially open', paletteDescription: 'monolithic concrete grey, cold steel, flat fluorescent white, deep shadow', paletteHex: '#575756', weatherAtmosphere: 'cold damp air, faint industrial haze, fluorescent hum mood, echo-emptiness', poseDirection: 'model stands rigidly centered in the bunker facing camera, arms at sides, oversize silhouette, industrial stillness', lightingDescription: 'single overhead fluorescent casting hard downward shadow on cheeks and under coat, 6500K cold flat, 5:1 ratio, institutional' },
  { id: 'rainswept-street', label: 'Rainswept Street', mood: 'Urban dystopia, neon wet noir', environmentDescription: 'a deserted nighttime city street drowning in rain, distant red/blue neon signage reflected in puddles, a toppled bollard', paletteDescription: 'wet asphalt black, neon magenta and electric cyan reflections, deep charcoal', paletteHex: '#2A1F2E', weatherAtmosphere: 'heavy vertical rain, steam rising from manhole grates, neon-lit raindrops catching the light like sparks', poseDirection: 'model walks into camera through the downpour, oversized coat soaking wet, head slightly down, gaze burning up toward lens', lightingDescription: 'mix of cold neon magenta + cyan from above with occasional harsh streetlight rim, 4000K variegated, 7:1 strong contrast, cinematic' },
  { id: 'abandoned-mall', label: 'Abandoned Mall', mood: 'Post-consumer, surreal, stark', environmentDescription: 'an abandoned 90s shopping mall with flickering fluorescents, cracked marble floor, empty store vitrines covered with plastic sheeting', paletteDescription: 'sickly green fluorescent cast, beige marble, dusty plastic translucence', paletteHex: '#B8C1A8', weatherAtmosphere: 'still stale air with floating dust motes, eerie quiet, faint buzz', poseDirection: 'model stands alone in the empty concourse facing camera from a distance, oversized silhouette, head slightly tilted, stillness', lightingDescription: 'overhead flickering fluorescents casting green-tinted institutional light, 5000K with green cast, flat 2:1, CCTV-quality mood' },
  { id: 'industrial-warehouse', label: 'Industrial Warehouse', mood: 'Factory, massive scale, raw', environmentDescription: 'the vast interior of an empty industrial warehouse with exposed steel trusses, polished concrete floor, rolling steel shutter half-open letting a single blinding shaft in', paletteDescription: 'industrial grey, rust orange accents, warm blinding daylight shaft', paletteHex: '#786A5E', weatherAtmosphere: 'dusty atmospheric haze catching the daylight shaft, absolute silence mood', poseDirection: 'model stands dwarfed by the massive warehouse scale, silhouetted in the daylight shaft, arms at sides, oversized coat', lightingDescription: 'single hard raking shaft of daylight from the half-open shutter across the floor, 5500K neutral, near-silhouette contrast 10:1, cinematic' },
  { id: 'red-siren', label: 'Red Siren', mood: 'Alarm, dystopian, emergency', environmentDescription: 'a sealed industrial corridor awash in rotating red emergency lights, wet painted concrete walls, steel grated floor', paletteDescription: 'saturated alarm red wash over everything, deep black shadows, oily wet sheen', paletteHex: '#8E1C1C', weatherAtmosphere: 'heavy red-lit atmosphere with visible smoke swirling, oppressive close quarters', poseDirection: 'model stands in the corridor head-on, oversize outerwear, one hand slightly lifted toward camera, intense dead-calm gaze through the red haze', lightingDescription: 'rotating red emergency light as key creating strong colored wash and deep shadow falloff, 2200K extreme warm red, 6:1 contrast, dystopian' },
];

interface PressPalette {
  id: string;
  label: string;
  mood: string;
  backgroundDescription: string;
  backgroundHex: string;
  accentDescription: string;
}

const PRESS_PALETTES: PressPalette[] = [
  { id: 'ivory', label: 'Ivory Heritage', mood: 'Classic, archival, museum', backgroundDescription: 'warm ivory cream, soft and uniform, completely shadowless', backgroundHex: '#F4EFE6', accentDescription: 'deep warm charcoal ink for logo and rule line' },
  { id: 'sand', label: 'Warm Sand', mood: 'Earthy, mediterranean', backgroundDescription: 'soft warm sand stone neutral, subtle warm undertone', backgroundHex: '#E8DFCF', accentDescription: 'rich espresso brown for logo and rule line' },
  { id: 'dove', label: 'Dove Grey', mood: 'Modern, quiet, minimalist', backgroundDescription: 'cool dove grey neutral, museum-plate feel', backgroundHex: '#DCD9D2', accentDescription: 'soft graphite black for logo and rule line' },
  { id: 'blush', label: 'Blush Cream', mood: 'Romantic, feminine, soft', backgroundDescription: 'warm blush cream with subtle pink undertone', backgroundHex: '#F2E4DE', accentDescription: 'deep burgundy wine for logo and rule line' },
  { id: 'onyx', label: 'Onyx Luxe', mood: 'Dramatic, evening, bold', backgroundDescription: 'deep onyx black, rich and matte with subtle warmth', backgroundHex: '#1A1615', accentDescription: 'warm champagne gold for logo and rule line' },
  { id: 'champagne', label: 'Champagne Gold', mood: 'Opulent, gilded, celebration', backgroundDescription: 'warm champagne gold neutral with subtle metallic warmth', backgroundHex: '#E9D9B8', accentDescription: 'deep oxblood for logo and rule line' },
  { id: 'sage', label: 'Sage Mist', mood: 'Botanical, calm, fresh', backgroundDescription: 'muted sage green neutral, herbarium-quiet', backgroundHex: '#D4D9CB', accentDescription: 'deep forest green for logo and rule line' },
  { id: 'midnight', label: 'Midnight Navy', mood: 'Editorial, nocturnal, refined', backgroundDescription: 'deep midnight navy blue with very subtle sheen', backgroundHex: '#1C2536', accentDescription: 'soft ivory cream for logo and rule line' },
];

interface CampaignScene {
  id: string;
  label: string;
  mood: string;
  sceneDescription: string;
  heroElement: string;
  interaction: string;
  supportingElements: string;
}

const CAMPAIGN_SCENES: CampaignScene[] = [
  {
    id: 'street-hustle',
    label: 'Street Hustle',
    mood: 'Urban, gritty, confident',
    sceneDescription: 'raw urban street energy, graffiti culture, skate subculture',
    heroElement: 'an oversized skateboard shown from the side with visible wheels, deck, and trucks',
    interaction: 'model stands on top of the skateboard, one foot on the deck, posed mid-kickflip stance',
    supportingElements: 'graffiti-style tag marks, spray paint drips, concrete crack lines, small illustrated traffic cone'
  },
  {
    id: 'summer-heat',
    label: 'Summer Heat',
    mood: 'Sun-soaked, breezy, vacation',
    sceneDescription: 'tropical summer vibes, beach club energy, sunshine and salt air',
    heroElement: 'a massive beach umbrella with visible panels and a curved handle, or oversized sunglasses',
    interaction: 'model holds the umbrella handle with canopy tilted behind them, or wears giant sunglasses held up to face',
    supportingElements: 'palm frond silhouettes, small sun rays, wave swirls at ground, a tiny cocktail glass illustration'
  },
  {
    id: 'neon-nightlife',
    label: 'Neon Nightlife',
    mood: 'Electric, bold, after-dark',
    sceneDescription: 'nightclub energy, disco sparkle, dance floor drama',
    heroElement: 'an oversized disco ball with visible facets, or a giant cocktail glass with olive',
    interaction: 'model reaches up to touch the disco ball, or toasts the giant cocktail glass upward',
    supportingElements: 'sparkle bursts, light beam lines radiating outward, musical note marks, zigzag dance energy lines'
  },
  {
    id: 'retro-y2k',
    label: 'Retro Y2K',
    mood: 'Nostalgic, playful, 2000s throwback',
    sceneDescription: 'early 2000s pop energy, CD players, bubble tech, butterfly clips',
    heroElement: 'a massive 80s-90s boombox with twin speakers, cassette deck, antenna, and carrying handle',
    interaction: 'model carries the boombox on one shoulder, hand gripping the top handle, head tilted to the side',
    supportingElements: 'butterfly silhouettes, star bursts, swirl lines, a tiny flip phone illustration'
  },
  {
    id: 'studio-editorial',
    label: 'Studio Editorial',
    mood: 'Minimal, luxurious, high-fashion',
    sceneDescription: 'clean high-fashion editorial, Vogue cover energy, quiet luxury',
    heroElement: 'a giant open fashion magazine held mid-air with visible page spread, or an oversized luxury handbag with chain strap',
    interaction: 'model holds the open magazine in front of them reading, or slings the handbag chain over one shoulder',
    supportingElements: 'elegant thin squiggles, small star accents, minimal dash clusters, a tiny lipstick illustration'
  },
  {
    id: 'travel-wanderlust',
    label: 'Travel Wanderlust',
    mood: 'Wander, explore, airport-ready',
    sceneDescription: 'jetsetter vibes, airport runway, passport stamps and tickets',
    heroElement: 'a massive vintage hard-shell suitcase with clasps, stickers, and a carrying handle',
    interaction: 'model sits on top of the suitcase with legs crossed, or pulls it by the handle mid-stride',
    supportingElements: 'airplane silhouette, cloud puffs, tiny boarding pass illustration, dashed flight path lines'
  },
  {
    id: 'rooftop-sunset',
    label: 'Rooftop Sunset',
    mood: 'Golden hour, romantic, elevated',
    sceneDescription: 'rooftop golden hour energy, city skyline, champagne toast',
    heroElement: 'a giant champagne bottle with foil neck, or an oversized string-light bulb',
    interaction: 'model pops the cork of the champagne bottle above their head, or cradles the giant bulb',
    supportingElements: 'tiny city skyline outline at bottom, string light dashes, small star sparkles, fizz bubbles'
  },
  {
    id: 'sport-mode',
    label: 'Sport Mode',
    mood: 'Athletic, energetic, performance',
    sceneDescription: 'athletic performance energy, stadium tunnel vibe, training drive',
    heroElement: 'an enormous sneaker/trainer in side profile with prominent laces and chunky sole, or a giant basketball',
    interaction: 'model stands on top of the giant sneaker mid-lunge, or dribbles the oversized basketball beside them',
    supportingElements: 'speed dashes radiating outward, small motion-track arrows, sweat drop marks, tiny whistle illustration'
  },
  {
    id: 'cafe-chic',
    label: 'Cafe Chic',
    mood: 'Cozy, intellectual, morning light',
    sceneDescription: 'parisian cafe morning, newspaper-and-coffee intellectual energy',
    heroElement: 'an oversized takeaway coffee cup with domed lid, sleeve, and rising steam curls, or a giant open newspaper',
    interaction: 'model holds the giant coffee cup with both hands at chest height, or peeks over the top of the open newspaper',
    supportingElements: 'steam swirls, tiny croissant illustration, small saucer marks, subtle bistro chair outline'
  },
  {
    id: 'arcade-retro',
    label: 'Arcade Retro',
    mood: 'Playful, neon, 80s arcade',
    sceneDescription: 'neon arcade energy, joystick action, pixel nostalgia',
    heroElement: 'an oversized retro joystick with round ball top and base, or a giant CRT tv with visible screen and dials',
    interaction: 'model grips the giant joystick top with both hands mid-push, or leans against the CRT tv casually',
    supportingElements: 'small pixel block clusters, lightning bolt zaps, tiny coin illustration, zigzag energy dashes'
  },
  {
    id: 'gallery-art',
    label: 'Gallery Art',
    mood: 'Cultured, curated, museum quiet',
    sceneDescription: 'modern art gallery opening night, sculpted minimalism',
    heroElement: 'a giant picture frame (empty square frame, thick border), or an oversized sculpture pedestal',
    interaction: 'model poses inside the empty picture frame as if they are the artwork, or stands on top of the pedestal',
    supportingElements: 'tiny wine glass illustration, small paint splatter, minimal geometric dot cluster, thin plaque lines'
  },
  {
    id: 'garden-bloom',
    label: 'Garden Bloom',
    mood: 'Romantic, fresh, floral',
    sceneDescription: 'bloom garden romance, botanical soft energy',
    heroElement: 'a massive bouquet of flowers with visible stems and blooms, or a giant watering can with spout',
    interaction: 'model embraces the bouquet against their chest, or tilts the giant watering can as if pouring',
    supportingElements: 'small leaf sprigs, tiny butterfly illustration, water drop marks, curling vine squiggles'
  },
  {
    id: 'festival-rave',
    label: 'Festival Rave',
    mood: 'Ecstatic, celebration, crowd',
    sceneDescription: 'music festival main stage, crowd energy, celebration',
    heroElement: 'a giant speaker stack with visible cones, or an oversized microphone with cable',
    interaction: 'model jumps in front of the speaker with fist raised, or grips the giant microphone singing into it',
    supportingElements: 'confetti bursts, tiny hand-raised silhouettes, sound wave ripples, small lightning bolts'
  },
  {
    id: 'winter-cozy',
    label: 'Winter Cozy',
    mood: 'Warm, snowy, layered',
    sceneDescription: 'snowy winter morning, hot cocoa and wool, ski lodge',
    heroElement: 'a giant mug of hot cocoa with rising steam and marshmallow, or an oversized snowflake',
    interaction: 'model cups the giant mug with both hands sipping from it, or catches the giant snowflake on one finger',
    supportingElements: 'tiny snowflake clusters, small pine tree silhouettes, steam curls, knitted stitch dashes'
  },
  {
    id: 'romantic-date',
    label: 'Romantic Date',
    mood: 'Intimate, soft, love-letter',
    sceneDescription: 'romantic date night, candlelight and roses, paris balcony',
    heroElement: 'an oversized single long-stem rose, or a giant lit candle with tall flame',
    interaction: 'model holds the giant rose across their body as if presented, or cups one hand around the flame of the candle',
    supportingElements: 'tiny heart outlines, small envelope illustration, curling ribbon squiggles, soft spark dots'
  },
];



const MAX_PHOTOS_PER_ITEM = 5;

type Gender = 'women' | 'men';

type Ethnicity =
  | 'indian'
  | 'indo-american'
  | 'indo-spanish'
  | 'indo-european'
  | 'indo-east-asian'
  | 'indo-african'
  | 'indo-persian'
  | 'indo-brazilian';

interface EthnicityProfile {
  id: Ethnicity;
  label: string;
  shortLabel: string;
  description: string;
  womanDescriptor: string;
  manDescriptor: string;
  skinTone: string;
}

const ETHNICITY_PROFILES: EthnicityProfile[] = [
  {
    id: 'indian',
    label: 'Indian',
    shortLabel: 'Indian',
    description: 'Classic South Asian features, medium-brown skin',
    womanDescriptor: 'Indian woman of South Asian heritage with elegant South Asian features',
    manDescriptor: 'Indian man of South Asian heritage with sharp South Asian features',
    skinTone: 'medium-brown skin'
  },
  {
    id: 'indo-american',
    label: 'Indo-American',
    shortLabel: 'Indo-American',
    description: 'Indian + American mixed heritage, warm honey skin',
    womanDescriptor: 'Indian-American mixed-heritage woman with features blending South Asian and Caucasian-American (soft refined cheekbones, expressive eyes)',
    manDescriptor: 'Indian-American mixed-heritage man with features blending South Asian and Caucasian-American (strong jawline, refined bone structure)',
    skinTone: 'warm honey-tan skin with a gentle golden undertone'
  },
  {
    id: 'indo-spanish',
    label: 'Indo-Spanish',
    shortLabel: 'Indo-Latina',
    description: 'Indian + Spanish/Latin mixed heritage, warm olive-caramel skin',
    womanDescriptor: 'Indo-Latina mixed-heritage woman with features blending South Asian and Spanish/Latina (warm expressive eyes, sculpted cheekbones, softly arched brow)',
    manDescriptor: 'Indo-Latino mixed-heritage man with features blending South Asian and Spanish/Latin (warm dark eyes, strong brow, defined cheekbone)',
    skinTone: 'warm olive-caramel skin with subtle sun-kissed warmth'
  },
  {
    id: 'indo-european',
    label: 'Indo-European',
    shortLabel: 'Indo-European',
    description: 'Indian + European mixed heritage, light warm-tan skin',
    womanDescriptor: 'Indo-European mixed-heritage woman with features blending South Asian and European (refined bone structure, soft facial angles, subtle warm tone)',
    manDescriptor: 'Indo-European mixed-heritage man with features blending South Asian and European (refined jaw, softened South Asian features)',
    skinTone: 'light warm-tan skin with a subtle rosy undertone'
  },
  {
    id: 'indo-east-asian',
    label: 'Indo-East Asian',
    shortLabel: 'Indo-East Asian',
    description: 'Indian + East Asian mixed heritage, porcelain-tan skin',
    womanDescriptor: 'Indo-East Asian mixed-heritage woman with features blending South Asian and East Asian (softly almond-shaped eyes, high delicate cheekbones)',
    manDescriptor: 'Indo-East Asian mixed-heritage man with features blending South Asian and East Asian (sharp cheekbones, almond-shaped eyes, refined nose)',
    skinTone: 'warm porcelain-tan skin with a subtle peach undertone'
  },
  {
    id: 'indo-african',
    label: 'Indo-African',
    shortLabel: 'Indo-African',
    description: 'Indian + African mixed heritage, rich warm-brown skin',
    womanDescriptor: 'Indo-African mixed-heritage woman with features blending South Asian and African (full lips, expressive eyes, rich natural bone structure)',
    manDescriptor: 'Indo-African mixed-heritage man with features blending South Asian and African (strong jawline, expressive eyes, refined natural bone structure)',
    skinTone: 'rich warm-brown skin with a deep glow'
  },
  {
    id: 'indo-persian',
    label: 'Indo-Persian',
    shortLabel: 'Indo-Persian',
    description: 'Indian + Middle Eastern mixed heritage, tan-olive skin',
    womanDescriptor: 'Indo-Persian mixed-heritage woman with features blending South Asian and Middle Eastern (deep-set expressive eyes, strong arched brow, defined nose)',
    manDescriptor: 'Indo-Persian mixed-heritage man with features blending South Asian and Middle Eastern (deep-set eyes, strong brow, refined aristocratic nose)',
    skinTone: 'warm tan-olive skin with a golden undertone'
  },
  {
    id: 'indo-brazilian',
    label: 'Indo-Brazilian',
    shortLabel: 'Indo-Brazilian',
    description: 'Indian + Brazilian mixed heritage, sun-kissed bronze skin',
    womanDescriptor: 'Indo-Brazilian mixed-heritage woman with features blending South Asian and Brazilian (glowing sun-kissed skin, soft voluminous waves, expressive warm eyes)',
    manDescriptor: 'Indo-Brazilian mixed-heritage man with features blending South Asian and Brazilian (strong natural build, sun-warmed skin, tousled waves)',
    skinTone: 'sun-kissed warm bronze skin with a glowing undertone'
  },
];

// Helper: rewrites hardcoded "Indian woman/man" + "medium-brown skin" in a prompt
// snippet to match the selected ethnicity profile. Called from every generator.
function applyEthnicity(description: string, ethnicity: Ethnicity, gender: Gender): string {
  const profile = ETHNICITY_PROFILES.find(p => p.id === ethnicity) || ETHNICITY_PROFILES[0];
  if (profile.id === 'indian') return description;
  const descriptor = gender === 'women' ? profile.womanDescriptor : profile.manDescriptor;
  return description
    .replace(/Indian woman/g, descriptor)
    .replace(/Indian man/g, descriptor)
    .replace(/medium-brown skin/g, profile.skinTone);
}

const MODEL_PROMPTS: Record<Gender, { label: string; views: [string, string] }> = {
  women: {
    label: 'Women',
    views: [
      "A beautiful Indian woman with elegant features, medium-brown skin, styled dark hair, wearing this exact product. She is standing confidently facing the camera in a relaxed, contemporary commercial-catalog pose. Full body or three-quarter shot depending on the product. She looks sophisticated and modern. (The background and lighting are specified by the BACKGROUND block below -- follow that exactly. Do NOT invent a moody, dark, or atmospheric backdrop.)",
      "The same beautiful Indian woman now photographed from a different angle -- a candid three-quarter or side-profile pose that shows how the product looks in motion. Natural, relaxed posture. The focus is on how the product drapes, fits, and moves on the body. FRAMING (MANDATORY): the model's ENTIRE head must be fully inside the frame -- the top of the hair, the forehead, the eyes, the chin, and the jawline must ALL be visible with at least 8-10% headroom of empty backdrop above the top of the hair. Do NOT crop the forehead, hair, or face. If a full body cannot fit in a 1:1 square at this distance, pull the camera back or frame from mid-thigh up so the head is fully visible -- never sacrifice the head to show more legs. Frame the shot as a medium full shot or three-quarter shot, never an extreme close-up that cuts the head. (The background and lighting are specified by the BACKGROUND block below -- follow that exactly so this shot matches the front shot's backdrop. Do NOT invent a moody, dark, or atmospheric backdrop.)"
    ]
  },
  men: {
    label: 'Men',
    views: [
      "A handsome Indian man with sharp features, medium-brown skin, well-groomed hair, wearing this exact product. He is standing confidently facing the camera in a relaxed, contemporary commercial-catalog pose. Full body or three-quarter shot depending on the product. He looks refined and modern. (The background and lighting are specified by the BACKGROUND block below -- follow that exactly. Do NOT invent a moody, dark, or atmospheric backdrop.)",
      "The same handsome Indian man now photographed from a different angle -- a candid three-quarter or side-profile pose that shows how the product looks in motion. Natural, confident posture. The focus is on how the product fits and drapes on the body. FRAMING (MANDATORY): the model's ENTIRE head must be fully inside the frame -- the top of the hair, the forehead, the eyes, the chin, and the jawline must ALL be visible with at least 8-10% headroom of empty backdrop above the top of the hair. Do NOT crop the forehead, hair, or face. If a full body cannot fit in a 1:1 square at this distance, pull the camera back or frame from mid-thigh up so the head is fully visible -- never sacrifice the head to show more legs. Frame the shot as a medium full shot or three-quarter shot, never an extreme close-up that cuts the head. (The background and lighting are specified by the BACKGROUND block below -- follow that exactly so this shot matches the front shot's backdrop. Do NOT invent a moody, dark, or atmospheric backdrop.)"
    ]
  }
};

const PRODUCT_VIEW_TYPES = [
  "Hero Front",
  "Three-Quarter",
  "Detail Close-up"
];

const PRODUCT_VIEW_PROMPTS = [
  // Hero Front: garment on invisible mannequin form, dead-on perpendicular shot.
  "HERO FRONT VIEW. The garment is shown on an invisible mannequin/ghost form so it has full 3D body shape (filled-out shoulders, chest, sleeves draping naturally). Photographed perfectly straight-on at eye level, perfectly symmetrical, head-on perpendicular to camera, NO rotation, NO angle. Camera position: dead center. Soft warm key light from camera-left at 45 degrees creating a subtle gradient down the right side, gentle fill from the right. A small soft contact shadow drops directly below the garment on the floor. The product is centered and fills about 78% of the frame vertically. No props, no people, no hangers visible. Clean luxury ecommerce hero shot in the style of Net-a-Porter or Mr Porter cover product images. (Use the BACKGROUND specified below -- that exact backdrop must fill the frame; do NOT swap to a different color or tone.)",

  // Three-Quarter: rotated 35-40 degrees off-axis to make it visually distinct from front.
  "THREE-QUARTER ANGLE. The same garment shown on an invisible mannequin form, but ROTATED EXACTLY 35-40 DEGREES off-axis to the left so the right side seam, sleeve depth, and garment silhouette curve are clearly visible from this angled perspective. The viewer should clearly see this is NOT a head-on shot -- the rotation is unmistakable. Camera position: slightly elevated, looking down at a 5 degree downward tilt. Lighting from upper-left at 60 degrees, distinctly more dimensional than the front shot, with a visible shadow gradient across the front body of the garment, sculpting depth. The product fills 70% of frame slightly off-center to the right side. Small contact shadow at the base. NO props, NO people, NO hangers visible. Editorial ecommerce style emphasizing 3D form. (Use the BACKGROUND specified below -- that exact backdrop must fill the frame; do NOT swap to a different color or tone.)",

  // Detail Close-up: tight macro on a single distinctive feature, raking sidelight.
  "EXTREME MACRO DETAIL CLOSE-UP. Crop tightly into ONE distinctive feature of the garment -- the highest-craft element such as the print/graphic, the stitching, the fabric weave, the collar, the buttons, the hardware, or the brand label. Frame fills almost entirely with the texture and detail; only that detail is in focus. Shallow depth of field with creamy out-of-focus areas at the edges. Camera is angled slightly to catch the texture in raking light. Lighting: hard sharp directional light from the left raking across the surface to reveal every fiber, every stitch, every print pixel; deep micro-shadows in the textile weave. Macro product photography in the style of luxury fabric swatch books -- aspirational, tactile, almost touchable. (The blurred areas should still pick up the BACKGROUND tone specified below so this shot reads as part of the same set.)"
];

const getViewTypes = (gender: Gender) => [
  `On Model (${MODEL_PROMPTS[gender].label}) - Front`,
  `On Model (${MODEL_PROMPTS[gender].label}) - Lifestyle`,
  ...PRODUCT_VIEW_TYPES
];

const getViewPrompts = (gender: Gender, ethnicity: Ethnicity = 'indian') => [
  ...MODEL_PROMPTS[gender].views.map(v => applyEthnicity(v, ethnicity, gender)),
  ...PRODUCT_VIEW_PROMPTS
];

const BACKGROUND_STYLES = [
  { id: 'minimalist-white', name: 'Minimalist White', prompt: 'a calm, minimalist white luxury studio background' },
  { id: 'marble-grey', name: 'Marble Grey', prompt: 'a sophisticated grey marble luxury studio background' },
  { id: 'soft-sand', name: 'Soft Sand', prompt: 'a warm, minimalist soft sand luxury studio background' },
  { id: 'modern-slate', name: 'Modern Slate', prompt: 'a dark, modern slate luxury studio background' },
  { id: 'warm-oak', name: 'Warm Oak', prompt: 'a minimalist warm oak wood luxury studio background' },
  { id: 'minimalist-cream', name: 'Minimalist Cream', prompt: 'a calm, minimalist cream luxury studio background' }
];

// Aggregate every generated image for an apparel item into one flat array.
// Order matches the way sections render top-to-bottom in the UI.
function buildItemGallery(item: ApparelItem): GalleryImage[] {
  const gallery: GalleryImage[] = [];
  // Reference photos (originals)
  item.images.forEach((img, idx) => {
    gallery.push({ url: img.preview, label: img.label ? `Reference (${img.label})` : `Reference ${idx + 1}`, section: 'Reference' });
  });
  // Generated core views
  item.views.forEach(v => gallery.push({ url: v.url, label: v.type, section: 'Studio Views' }));
  // All style-collection buckets
  const buckets: { list?: { view: GeneratedView; label: string }[]; section: string }[] = [
    { list: item.campaignImages?.map(c => ({ view: c.view, label: c.objectLabel })), section: 'Campaign Scenes' },
    { list: item.pressImages?.map(c => ({ view: c.view, label: c.paletteLabel })), section: 'Press Release' },
    { list: item.editorialImages?.map(c => ({ view: c.view, label: c.settingLabel })), section: 'Editorial' },
    { list: item.heritageImages?.map(c => ({ view: c.view, label: c.paletteLabel })), section: 'Heritage' },
    { list: item.hermesImages?.map(c => ({ view: c.view, label: c.themeLabel })), section: 'Atelier' },
    { list: item.bottegaImages?.map(c => ({ view: c.view, label: c.themeLabel })), section: 'Quiet Luxury' },
    { list: item.saintLaurentImages?.map(c => ({ view: c.view, label: c.themeLabel })), section: 'Noir' },
    { list: item.pradaImages?.map(c => ({ view: c.view, label: c.themeLabel })), section: 'Conceptual' },
    { list: item.diorImages?.map(c => ({ view: c.view, label: c.themeLabel })), section: 'Couture' },
    { list: item.jacquemusImages?.map(c => ({ view: c.view, label: c.themeLabel })), section: 'Riviera' },
    { list: item.burberryImages?.map(c => ({ view: c.view, label: c.themeLabel })), section: 'Heritage UK' },
    { list: item.balenciagaImages?.map(c => ({ view: c.view, label: c.themeLabel })), section: 'Dystopia' },
  ];
  buckets.forEach(b => {
    b.list?.forEach(entry => gallery.push({ url: entry.view.url, label: entry.label, section: b.section }));
  });
  return gallery;
}

// Airbnb-style full-screen image gallery lightbox with prev/next navigation,
// 1/N counter, share and favorite actions, keyboard + swipe support.
function GalleryLightbox({
  images,
  startIndex,
  itemId,
  favorites,
  onToggleFavorite,
  onDownload,
  onClose,
  onNotify,
}: {
  images: GalleryImage[];
  startIndex: number;
  itemId: string;
  favorites: Record<string, boolean>;
  onToggleFavorite: (imageUrl: string) => void;
  onDownload: (url: string, filename: string) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [direction, setDirection] = useState(0);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const safeIndex = Math.max(0, Math.min(index, images.length - 1));
  const current: GalleryImage | undefined = images[safeIndex];

  const go = useCallback((delta: number) => {
    setDirection(delta);
    setIndex(i => {
      const next = i + delta;
      if (next < 0) return images.length - 1;
      if (next >= images.length) return 0;
      return next;
    });
  }, [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [go, onClose]);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>(`[data-thumb-idx="${safeIndex}"]`);
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [safeIndex]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  if (!current) return null;

  const handleShare = async () => {
    const shareData = {
      title: current.label,
      text: `${current.section} -- ${current.label}`,
      url: current.url,
    };
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(current.url);
        onNotify('Image link copied to clipboard');
      }
    } catch {
      /* share cancelled or failed -- silent */
    }
  };

  const isFavorite = !!favorites[current.url];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex flex-col"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 text-white flex-shrink-0">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
          aria-label="Close gallery"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <p className="text-xs text-white/50 uppercase tracking-wider">{current.section}</p>
          <p className="text-sm font-medium">{current.label}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="px-3 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-1.5 text-sm transition"
            aria-label="Share"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline underline">Share</span>
          </button>
          <button
            onClick={() => onToggleFavorite(current.url)}
            className="px-3 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-1.5 text-sm transition"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span className="hidden sm:inline underline">{isFavorite ? 'Saved' : 'Save'}</span>
          </button>
          <button
            onClick={() => onDownload(current.url, `VPPA_${itemId}_${current.section}_${current.label}`.replace(/\s+/g, '_') + '.png')}
            className="px-3 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-1.5 text-sm transition"
            aria-label="Download"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </div>

      {/* Main image area */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4 sm:px-20" onClick={onClose}>
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.img
            key={current.url}
            src={current.url}
            alt={current.label}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, x: direction > 0 ? 30 : direction < 0 ? -30 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction > 0 ? -30 : direction < 0 ? 30 : 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="max-h-full max-w-full object-contain select-none rounded-lg shadow-2xl"
          />
        </AnimatePresence>

        {/* Prev / next arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white hover:bg-gray-100 shadow-lg flex items-center justify-center transition"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5 text-gray-900" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); go(1); }}
              className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white hover:bg-gray-100 shadow-lg flex items-center justify-center transition"
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5 text-gray-900" />
            </button>
          </>
        )}
      </div>

      {/* Counter + thumbnail strip */}
      <div className="flex-shrink-0 pb-4 pt-2 px-4 sm:px-6">
        <div className="text-center text-white/80 text-sm mb-3 tabular-nums">
          {safeIndex + 1} / {images.length}
        </div>
        <div
          ref={thumbStripRef}
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin justify-start sm:justify-center"
          style={{ scrollbarWidth: 'thin' }}
        >
          {images.map((img, i) => (
            <button
              key={`${img.url}_${i}`}
              data-thumb-idx={i}
              onClick={() => { setDirection(i - safeIndex); setIndex(i); }}
              className={`flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden transition-all ${
                i === safeIndex ? 'ring-2 ring-white scale-105' : 'opacity-50 hover:opacity-80'
              }`}
              aria-label={`Go to image ${i + 1}`}
            >
              <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      if (email === 'fashionvppa@gmail.com' && password === 'Vppa@123') {
        sessionStorage.setItem('vppa_auth', '1');
        onLogin();
      } else {
        setError('Invalid email or password');
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-4 mesh-bg">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            VPPA <span className="font-serif italic font-normal text-gray-500">Fashions</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">Luxury Studio Engine</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full pl-10 pr-11 py-3 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-md shadow-indigo-500/20 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[10px] text-gray-300 mt-6">Authorized access only</p>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('vppa_auth') === '1');

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  return <StudioApp />;
}

function StudioApp() {
  const [logo, setLogo] = useState<{ file: File; preview: string } | null>(null);
  const [apparelItems, setApparelItems] = useState<ApparelItem[]>([]);
  const [selectedStyle, setSelectedStyle] = useState(BACKGROUND_STYLES[0]);
  const [selectedGender, setSelectedGender] = useState<Gender>('women');
  const [selectedEthnicity, setSelectedEthnicity] = useState<Ethnicity>('indian');
  const [selectedImageSize, setSelectedImageSize] = useState<'1K'>(() => {
    if (typeof window === 'undefined') return '1K';
    const saved = window.localStorage.getItem('vppa-image-size');
    return '1K';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('vppa-image-size', selectedImageSize);
    }
  }, [selectedImageSize]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCampaigns, setIsGeneratingCampaigns] = useState(false);
  const [isGeneratingPress, setIsGeneratingPress] = useState(false);
  const [isGeneratingEditorial, setIsGeneratingEditorial] = useState(false);
  const [isGeneratingHeritage, setIsGeneratingHeritage] = useState(false);
  const [isGeneratingHermes, setIsGeneratingHermes] = useState(false);
  const [isGeneratingBottega, setIsGeneratingBottega] = useState(false);
  const [isGeneratingSaintLaurent, setIsGeneratingSaintLaurent] = useState(false);
  const [isGeneratingPrada, setIsGeneratingPrada] = useState(false);
  const [isGeneratingDior, setIsGeneratingDior] = useState(false);
  const [isGeneratingJacquemus, setIsGeneratingJacquemus] = useState(false);
  const [isGeneratingBurberry, setIsGeneratingBurberry] = useState(false);
  const [isGeneratingBalenciaga, setIsGeneratingBalenciaga] = useState(false);
  const [campaignTab, setCampaignTab] = useState<'scenes' | 'press' | 'editorial' | 'heritage' | 'hermes' | 'bottega' | 'saintlaurent' | 'prada' | 'dior' | 'jacquemus' | 'burberry' | 'balenciaga'>('scenes');
  const [toast, setToast] = useState<{ kind: 'error' | 'info'; message: string } | null>(null);
  const [regeneratingViews, setRegeneratingViews] = useState<Set<string>>(new Set());
  const [zippingItems, setZippingItems] = useState<Set<string>>(new Set());

  const showToast = (kind: 'error' | 'info', message: string) => {
    setToast({ kind, message });
    setTimeout(() => setToast(prev => prev?.message === message ? null : prev), 7000);
  };

  // Wire the module-level fallback hook to this component's toast.
  onImageModelFallback = (msg: string) => showToast('info', msg);

  const describeError = (err: any): string => {
    const msg = typeof err?.message === 'string' ? err.message : '';
    if (/GEMINI_API_KEY|API_KEY_INVALID|API key not valid/i.test(msg)) return 'Invalid or missing GEMINI_API_KEY. Check .env and rebuild.';
    if (/RESOURCE_EXHAUSTED|"code":429|\b(429|rate ?limit|too many)\b/i.test(msg)) return 'Gemini quota/rate limit hit. Wait a minute or try again.';
    if (/SAFETY|blocked|safety/i.test(msg)) return 'Prompt was blocked by safety filters. Try a different theme.';
    return msg.slice(0, 200) || 'Image generation failed. Check browser console for details.';
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addPhotoInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const printedFrontRef = useRef<HTMLInputElement>(null);
  const printedBackRef = useRef<HTMLInputElement>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [pendingPrintedFront, setPendingPrintedFront] = useState<ReferenceImage | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogo({ file, preview: reader.result as string });
      };
      reader.readAsDataURL(file as Blob);
    }
  };

  const readFileAsPreview = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file as Blob);
    });
  };

  const handleNewApparelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const filesToAdd = files.slice(0, MAX_PHOTOS_PER_ITEM);

    const images: ReferenceImage[] = [];
    for (const file of filesToAdd) {
      const preview = await readFileAsPreview(file);
      images.push({ file, preview });
    }

    const heroColor = images.length ? await extractDominantColor(images[0].preview) : '#6366f1';

    setApparelItems(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        images,
        views: [],
        status: 'idle',
        uploadMode: 'standard',
        heroColor,
        campaignStatus: 'idle'
      }
    ]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddPhotosToItem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeItemId) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const item = apparelItems.find(i => i.id === activeItemId);
    if (!item) return;

    const remaining = MAX_PHOTOS_PER_ITEM - item.images.length;
    const filesToAdd = files.slice(0, remaining);

    const newImages: ReferenceImage[] = [];
    for (const file of filesToAdd) {
      const preview = await readFileAsPreview(file);
      newImages.push({ file, preview });
    }

    setApparelItems(prev => prev.map(i =>
      i.id === activeItemId ? { ...i, images: [...i.images, ...newImages] } : i
    ));
    setActiveItemId(null);
    if (addPhotoInputRef.current) addPhotoInputRef.current.value = '';
  };

  const handlePrintedFrontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = await readFileAsPreview(file);
    setPendingPrintedFront({ file, preview, label: 'front' });
    if (printedFrontRef.current) printedFrontRef.current.value = '';
    setTimeout(() => printedBackRef.current?.click(), 200);
  };

  const handlePrintedBackUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingPrintedFront) return;
    const preview = await readFileAsPreview(file);
    const backImage: ReferenceImage = { file, preview, label: 'back' };

    const heroColor = await extractDominantColor(pendingPrintedFront.preview);

    setApparelItems(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        images: [pendingPrintedFront, backImage],
        views: [],
        status: 'idle',
        uploadMode: 'printed',
        heroColor,
        campaignStatus: 'idle'
      }
    ]);
    setPendingPrintedFront(null);
    if (printedBackRef.current) printedBackRef.current.value = '';
  };

  const removePhotoFromItem = (itemId: string, photoIndex: number) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const newImages = i.images.filter((_, idx) => idx !== photoIndex);
      return { ...i, images: newImages };
    }).filter(i => i.images.length > 0));
  };

  const removeApparel = (id: string) => {
    setApparelItems(prev => prev.filter(f => f.id !== id));
  };

  const resetItemForRegeneration = (id: string) => {
    setApparelItems(prev => prev.map(f =>
      f.id === id ? { ...f, views: [], status: 'idle' as const, generatedStyleId: undefined, currentProcessingIndex: undefined } : f
    ));
  };

  const getMimeType = (file: File): string => {
    if (file.type) return file.type;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    };
    return mimeMap[ext] || 'image/jpeg';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file as Blob);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const extractDominantColor = (imageUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 80;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve('#6366f1');
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a < 128) continue;
            const brightness = (r + g + b) / 3;
            if (brightness > 235 || brightness < 25) continue;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max - min < 25) continue;
            const qr = Math.round(r / 24) * 24;
            const qg = Math.round(g / 24) * 24;
            const qb = Math.round(b / 24) * 24;
            const key = `${qr},${qg},${qb}`;
            const existing = buckets.get(key);
            if (existing) {
              existing.count++;
              existing.r += r;
              existing.g += g;
              existing.b += b;
            } else {
              buckets.set(key, { count: 1, r, g, b });
            }
          }

          let best = { count: 0, r: 99, g: 102, b: 241 };
          buckets.forEach((v) => { if (v.count > best.count) best = v; });
          const r = Math.round(best.r / best.count);
          const g = Math.round(best.g / best.count);
          const b = Math.round(best.b / best.count);
          const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
          resolve(hex);
        } catch {
          resolve('#6366f1');
        }
      };
      img.onerror = () => resolve('#6366f1');
      img.src = imageUrl;
    });
  };

  const darkenHex = (hex: string, percent: number): string => {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const factor = 1 - percent / 100;
    const nr = Math.max(0, Math.round(r * factor));
    const ng = Math.max(0, Math.round(g * factor));
    const nb = Math.max(0, Math.round(b * factor));
    return '#' + [nr, ng, nb].map(v => v.toString(16).padStart(2, '0')).join('');
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllAsZip = async (item: ApparelItem) => {
    if (!item.views.length) return;
    setZippingItems(prev => new Set(prev).add(item.id));
    try {
      const zip = new JSZip();
      const folder = zip.folder(`VPPA_${item.id}`) || zip;
      for (let i = 0; i < item.views.length; i++) {
        const v = item.views[i];
        const safeName = `${String(i + 1).padStart(2, '0')}_${(v.type || `view_${i + 1}`).replace(/\s+/g, '_')}.png`;
        const dataMatch = v.url.match(/^data:[^;]+;base64,(.+)$/);
        if (dataMatch) {
          folder.file(safeName, dataMatch[1], { base64: true });
        } else {
          const blob = await (await fetch(v.url)).blob();
          folder.file(safeName, blob);
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `VPPA_${item.id}_views.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      console.error('ZIP download failed:', e);
      showToast('error', `Download failed: ${describeError(e)}`);
    } finally {
      setZippingItems(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const regenerateView = async (itemId: string, viewIdx: number) => {
    const item = apparelItems.find(f => f.id === itemId);
    if (!item || item.images.length === 0) return;
    const key = `${itemId}:${viewIdx}`;
    if (regeneratingViews.has(key)) return;

    setRegeneratingViews(prev => new Set(prev).add(key));
    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;
      const imageDataParts: { data: string; mimeType: string }[] = [];
      for (const img of item.images) {
        const base64 = await fileToBase64(img.file);
        imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
      }

      const viewTypes = getViewTypes(selectedGender);
      const viewPrompts = getViewPrompts(selectedGender, selectedEthnicity);
      if (viewIdx < 0 || viewIdx >= viewPrompts.length) return;

      const analysis = item.analysis || '';
      const isPrinted = item.uploadMode === 'printed';
      const printedRule = isPrinted
        ? `\n- CRITICAL: This is a PRINTED garment. The FRONT and BACK have DIFFERENT prints/graphics. Image 1 is FRONT, Image 2 is BACK. Reproduce the EXACT prints on the correct sides. The prints must be clearly visible and accurate.`
        : '';
      const analysisContext = analysis
        ? `\n\nPRODUCT DETAILS (from analysis):\n${analysis}\n\nREPRODUCE THIS EXACT PRODUCT with all its specific colors, materials, prints, and details.`
        : '';
      const isModelShot = viewIdx < 2;

      const parts: any[] = imageDataParts.map(img => ({
        inlineData: { data: img.data, mimeType: img.mimeType }
      }));
      if (logoBase64) {
        parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
      }

      parts.push({
        text: isModelShot
          ? `Generate a professional luxury commercial-catalog photograph.

${viewPrompts[viewIdx]}
${analysisContext}

BACKGROUND (MANDATORY -- this exact backdrop must appear; ignore any "editorial / moody / dark" instincts):
- The backdrop is exclusively ${selectedStyle.prompt}.
- It must be a clean, evenly lit studio setting in this exact tone -- NOT dark, NOT black, NOT atmospheric, NOT vignetted, NOT a nightclub or photo-studio with dark seamless paper. The same flat backdrop tone fills the entire frame edge-to-edge.
- This SAME backdrop is used for the front, lifestyle, and all four product shots in this set, so the shots feel like one consistent photo session.

CRITICAL RULES:
- This must look like a real high-end commercial-catalog photograph, NOT a render or illustration.
- The model must be wearing THIS EXACT product from the reference images -- same colors, same materials, same details.${printedRule}
- Lighting: bright, soft, even key from camera-left at 45 degrees with a soft fill from the right. Daylight balanced 5500K. NO hard rim lighting. NO low-key chiaroscuro. NO single-light moody setup. NO atmospheric haze.
- The product must be clearly visible and recognizable on the model.
- ${logoBase64 ? 'The provided logo should appear subtly as a small brand mark in the bottom corner of the image, NOT on the product.' : 'No additional branding.'}
- Square 1:1 composition.

Also provide a one-sentence product description.`
          : `Generate a professional luxury ecommerce product photograph.

SHOT TYPE (FOLLOW THESE INSTRUCTIONS EXACTLY -- camera angle, framing, AND lighting are ALL specified by this shot type and override any defaults):
${viewPrompts[viewIdx]}

BACKGROUND (MANDATORY -- this exact backdrop must appear; ignore any "pure white" or other default in the SHOT TYPE):
- The backdrop is exclusively ${selectedStyle.prompt}.
- Clean, seamless, no textures or patterns on the background. The same flat backdrop tone fills the entire frame edge-to-edge.
- This SAME backdrop is used for the on-model shots and the four product shots in this set, so the shots feel like one consistent photo session and the model shots and product shots share the same backdrop tone.
${analysisContext}

CRITICAL RULES:
- This must look like a real photograph taken in a professional studio, NOT a render or illustration.
- Reproduce the EXACT product from the reference images -- same colors, same materials, same details, same branding.${printedRule}
- The SHOT TYPE block fully controls camera angle, framing, and per-subject lighting. Do NOT default to a generic catalog look -- follow the SHOT TYPE instructions literally so this shot is visually distinct from the other product shots.
- The BACKGROUND block fully controls backdrop color and tone -- if the SHOT TYPE block mentions a different background, IGNORE that and use the BACKGROUND block's backdrop instead.
- Product must be clean, crisp, and perfectly presented.
- NOTHING else in the frame -- no props, no text, no watermarks, no mannequins, no people.
- ${logoBase64 ? 'The provided logo should appear subtly as a small brand mark in the bottom corner of the image, NOT on the product.' : 'No additional branding.'}
- Square 1:1 composition.

Also provide a one-sentence product description.`,
      });

      const response = await callImageGenWithRetry({
        model: IMAGE_MODEL,
        contents: { parts },
        config: {
          imageConfig: { aspectRatio: "1:1", imageSize: viewIdx === 3 ? '1K' : selectedImageSize }
        }
      });

      let url = '';
      let desc = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) url = `data:image/png;base64,${part.inlineData.data}`;
        else if (part.text) desc = part.text;
      }

      if (!url) throw new Error('Empty response from image generator.');

      setApparelItems(prev => prev.map(f => {
        if (f.id !== itemId) return f;
        const newViews = [...f.views];
        const replacement: GeneratedView = {
          url,
          type: viewTypes[viewIdx],
          description: desc || newViews[viewIdx]?.description || `Luxury ${viewTypes[viewIdx]} shot.`
        };
        if (viewIdx < newViews.length) newViews[viewIdx] = replacement;
        else newViews.push(replacement);
        return { ...f, views: newViews };
      }));
    } catch (e) {
      console.error(`Regenerate view ${viewIdx} failed:`, e);
      showToast('error', `Regenerate failed: ${describeError(e)}`);
    } finally {
      setRegeneratingViews(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const generateImages = async () => {
    if (apparelItems.length === 0) return;

    setIsGenerating(true);
    
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const callWithRetry = async (fn: () => Promise<any>, maxRetries = 3, initialDelay = 2000) => {
      let retries = 0;
      while (retries < maxRetries) {
        try {
          return await fn();
        } catch (error: any) {
          const errorMsg = error?.message || String(error);
          const isQuotaError = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');
          
          if (isQuotaError && retries < maxRetries - 1) {
            const delay = initialDelay * Math.pow(2, retries);
            console.log(`Quota hit, retrying in ${delay}ms...`);
            await sleep(delay);
            retries++;
          } else {
            throw error;
          }
        }
      }
      throw new Error("Max retries exceeded");
    };

    const analyzeApparel = async (imageDataParts: { data: string; mimeType: string }[], isPrinted: boolean, labels?: ('front' | 'back' | undefined)[]): Promise<string> => {
      const parts: any[] = imageDataParts.map((img, i) => ({
        inlineData: { data: img.data, mimeType: img.mimeType }
      }));

      const printedContext = isPrinted && labels
        ? `\nIMPORTANT: Image 1 is the FRONT of the garment. Image 2 is the BACK of the garment. The front and back have DIFFERENT prints/designs. You MUST describe each side separately and in extreme detail.\n`
        : '';

      parts.push({
        text: `You are a luxury product photography director. Analyze ${imageDataParts.length} reference photo(s) of this product to prepare for a high-end ecommerce photoshoot.
${printedContext}
Describe:

1. PRODUCT: What exactly is this item? (e.g., printed cotton t-shirt, graphic hoodie, patterned silk shirt)
2. EXACT COLORS: List every color precisely -- base garment color AND all print/graphic colors
3. MATERIALS & TEXTURE: What is it made of and how does the surface look?
4. SHAPE & STRUCTURE: Describe the fit, cut, neckline, sleeve style, hem
5. HARDWARE & DETAILS: Every visible detail -- tags, labels, stitching color, buttons, zippers
${isPrinted ? `6. FRONT PRINT/DESIGN: Describe the FRONT graphic/print in extreme detail -- what does it depict, what colors, what position on the garment, how large is it, any text visible?
7. BACK PRINT/DESIGN: Describe the BACK graphic/print in extreme detail -- what does it depict, what colors, what position on the garment, how large is it, any text visible?
8. PRINT TECHNIQUE: Is it screen printed, sublimation, embroidered, DTG, vinyl? What is the finish -- matte, glossy, textured?` : `6. DISTINCTIVE FEATURES: What makes this product unique or recognizable? Any branding, patterns, embossing?`}
${isPrinted ? '9' : '7'}. SCALE: Approximate size category

Be EXTREMELY precise about the prints/graphics. Every detail matters -- the image generation model must reproduce the EXACT prints on the correct sides.`
      });

      const response = await callWithRetry(() => genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts }
      }));

      return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    };

    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;

      for (let i = 0; i < apparelItems.length; i++) {
        const item = apparelItems[i];
        const currentSettingsKey = `${selectedStyle.id}_${selectedGender}_${selectedEthnicity}`;
        const settingsChanged = item.generatedStyleId && item.generatedStyleId !== currentSettingsKey;
        if (item.status === 'completed' && !settingsChanged) continue;

        if (settingsChanged) {
          setApparelItems(prev => prev.map(f => f.id === item.id ? { ...f, views: [], status: 'idle', generatedStyleId: undefined } : f));
        }

        const viewTypes = getViewTypes(selectedGender);
        const viewPrompts = getViewPrompts(selectedGender, selectedEthnicity);

        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }

        // Step 1: Analyze all reference photos with Gemini Flash (text/vision)
        setApparelItems(prev => prev.map(f => f.id === item.id ? { ...f, status: 'analyzing' } : f));

        let analysis = item.analysis || '';
        if (!analysis) {
          try {
            analysis = await analyzeApparel(imageDataParts, item.uploadMode === 'printed', item.images.map(img => img.label));
            setApparelItems(prev => prev.map(f => f.id === item.id ? { ...f, analysis } : f));
            await sleep(1000);
          } catch (analysisError) {
            console.error('Analysis failed, proceeding with basic prompt:', analysisError);
          }
        }

        // Step 2: Generate views, feeding ALL reference images + analysis to image model
        setApparelItems(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing', currentProcessingIndex: 0 } : f));

        const existingViews = settingsChanged ? [] : item.views;
        const viewSlots: (GeneratedView | undefined)[] = new Array(viewPrompts.length);
        for (let v = 0; v < viewPrompts.length; v++) {
          if (existingViews[v]) viewSlots[v] = existingViews[v];
        }
        let viewsCompleted = viewSlots.filter(Boolean).length;

        await runWithConcurrency(viewPrompts.length, MAX_PARALLEL_IMAGE_GEN, async (v) => {
          if (viewSlots[v]) return;

          const parts: any[] = imageDataParts.map(img => ({
            inlineData: { data: img.data, mimeType: img.mimeType }
          }));

          if (logoBase64) {
            parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          }

          const isPrinted = item.uploadMode === 'printed';
          const printedRule = isPrinted
            ? `\n- CRITICAL: This is a PRINTED garment. The FRONT and BACK have DIFFERENT prints/graphics. Image 1 is FRONT, Image 2 is BACK. Reproduce the EXACT prints on the correct sides. The prints must be clearly visible and accurate.`
            : '';

          const analysisContext = analysis
            ? `\n\nPRODUCT DETAILS (from analysis):\n${analysis}\n\nREPRODUCE THIS EXACT PRODUCT with all its specific colors, materials, prints, and details.`
            : '';

          const isModelShot = v < 2;

          parts.push({
            text: isModelShot
              ? `Generate a professional luxury commercial-catalog photograph.

${viewPrompts[v]}
${analysisContext}

BACKGROUND (MANDATORY -- this exact backdrop must appear; ignore any "editorial / moody / dark" instincts):
- The backdrop is exclusively ${selectedStyle.prompt}.
- It must be a clean, evenly lit studio setting in this exact tone -- NOT dark, NOT black, NOT atmospheric, NOT vignetted, NOT a nightclub or photo-studio with dark seamless paper. The same flat backdrop tone fills the entire frame edge-to-edge.
- This SAME backdrop is used for the front, lifestyle, and all four product shots in this set, so the shots feel like one consistent photo session.

CRITICAL RULES:
- This must look like a real high-end commercial-catalog photograph, NOT a render or illustration.
- The model must be wearing THIS EXACT product from the reference images -- same colors, same materials, same details.${printedRule}
- Lighting: bright, soft, even key from camera-left at 45 degrees with a soft fill from the right. Daylight balanced 5500K. NO hard rim lighting. NO low-key chiaroscuro. NO single-light moody setup. NO atmospheric haze.
- The product must be clearly visible and recognizable on the model.
- ${logoBase64 ? 'The provided logo should appear subtly as a small brand mark in the bottom corner of the image, NOT on the product.' : 'No additional branding.'}
- Square 1:1 composition.

Also provide a one-sentence product description.`
              : `Generate a professional luxury ecommerce product photograph.

SHOT TYPE (FOLLOW THESE INSTRUCTIONS EXACTLY -- camera angle, framing, AND lighting are ALL specified by this shot type and override any defaults):
${viewPrompts[v]}

BACKGROUND (MANDATORY -- this exact backdrop must appear; ignore any "pure white" or other default in the SHOT TYPE):
- The backdrop is exclusively ${selectedStyle.prompt}.
- Clean, seamless, no textures or patterns on the background. The same flat backdrop tone fills the entire frame edge-to-edge.
- This SAME backdrop is used for the on-model shots and the four product shots in this set, so the shots feel like one consistent photo session and the model shots and product shots share the same backdrop tone.
${analysisContext}

CRITICAL RULES:
- This must look like a real photograph taken in a professional studio, NOT a render or illustration.
- Reproduce the EXACT product from the reference images -- same colors, same materials, same details, same branding.${printedRule}
- The SHOT TYPE block fully controls camera angle, framing, and per-subject lighting. Do NOT default to a generic catalog look -- follow the SHOT TYPE instructions literally so this shot is visually distinct from the other product shots.
- The BACKGROUND block fully controls backdrop color and tone -- if the SHOT TYPE block mentions a different background, IGNORE that and use the BACKGROUND block's backdrop instead.
- Product must be clean, crisp, and perfectly presented.
- NOTHING else in the frame -- no props, no text, no watermarks, no mannequins, no people.
- ${logoBase64 ? 'The provided logo should appear subtly as a small brand mark in the bottom corner of the image, NOT on the product.' : 'No additional branding.'}
- Square 1:1 composition.

Also provide a one-sentence product description.`,
          });

          try {
            const response = await callImageGenWithRetry({
              model: IMAGE_MODEL,
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: v === 3 ? '1K' : selectedImageSize }
              }
            });

            let url = '';
            let desc = '';
            for (const part of response.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData) url = `data:image/png;base64,${part.inlineData.data}`;
              else if (part.text) desc = part.text;
            }

            if (url) {
              viewSlots[v] = {
                url,
                type: viewTypes[v],
                description: desc || `Luxury ${viewTypes[v]} shot.`
              };
            }
          } catch (viewError) {
            console.error(`Failed to generate view ${v}:`, viewError);
            showToast('error', `View ${v + 1}: ${describeError(viewError)}`);
          } finally {
            viewsCompleted++;
            const cleaned = viewSlots.filter((g): g is GeneratedView => Boolean(g));
            setApparelItems(prev => prev.map(f => f.id === item.id ? {
              ...f,
              views: cleaned,
              currentProcessingIndex: viewsCompleted < viewPrompts.length ? viewsCompleted : undefined
            } : f));
          }
        });

        const finalViews = viewSlots.filter((g): g is GeneratedView => Boolean(g));
        setApparelItems(prev => prev.map(f => f.id === item.id ? {
          ...f,
          status: finalViews.length > 0 ? 'completed' : 'error',
          currentProcessingIndex: undefined,
          generatedStyleId: currentSettingsKey
        } : f));
      }
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateCampaignField = (itemId: string, field: 'heroColor', value: string) => {
    setApparelItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
  };

  const toggleCampaignScene = (itemId: string, sceneId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedCampaignObjects || [];
      const next = current.includes(sceneId)
        ? current.filter(s => s !== sceneId)
        : [...current, sceneId];
      return { ...i, selectedCampaignObjects: next };
    }));
  };

  const togglePressPalette = (itemId: string, paletteId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedPressPalettes || [];
      const next = current.includes(paletteId)
        ? current.filter(p => p !== paletteId)
        : [...current, paletteId];
      return { ...i, selectedPressPalettes: next };
    }));
  };

  const toggleEditorialSetting = (itemId: string, settingId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedEditorialSettings || [];
      const next = current.includes(settingId)
        ? current.filter(s => s !== settingId)
        : [...current, settingId];
      return { ...i, selectedEditorialSettings: next };
    }));
  };

  const toggleHeritagePalette = (itemId: string, paletteId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedHeritagePalettes || [];
      const next = current.includes(paletteId)
        ? current.filter(p => p !== paletteId)
        : [...current, paletteId];
      return { ...i, selectedHeritagePalettes: next };
    }));
  };

  const toggleHermesTheme = (itemId: string, themeId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedHermesThemes || [];
      const next = current.includes(themeId) ? current.filter(p => p !== themeId) : [...current, themeId];
      return { ...i, selectedHermesThemes: next };
    }));
  };

  const toggleBottegaTheme = (itemId: string, themeId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedBottegaThemes || [];
      const next = current.includes(themeId) ? current.filter(p => p !== themeId) : [...current, themeId];
      return { ...i, selectedBottegaThemes: next };
    }));
  };

  const toggleSaintLaurentTheme = (itemId: string, themeId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedSaintLaurentThemes || [];
      const next = current.includes(themeId) ? current.filter(p => p !== themeId) : [...current, themeId];
      return { ...i, selectedSaintLaurentThemes: next };
    }));
  };

  const togglePradaTheme = (itemId: string, themeId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedPradaThemes || [];
      const next = current.includes(themeId) ? current.filter(p => p !== themeId) : [...current, themeId];
      return { ...i, selectedPradaThemes: next };
    }));
  };

  const toggleDiorTheme = (itemId: string, themeId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedDiorThemes || [];
      const next = current.includes(themeId) ? current.filter(p => p !== themeId) : [...current, themeId];
      return { ...i, selectedDiorThemes: next };
    }));
  };

  const toggleJacquemusTheme = (itemId: string, themeId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedJacquemusThemes || [];
      const next = current.includes(themeId) ? current.filter(p => p !== themeId) : [...current, themeId];
      return { ...i, selectedJacquemusThemes: next };
    }));
  };

  const toggleBurberryTheme = (itemId: string, themeId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedBurberryThemes || [];
      const next = current.includes(themeId) ? current.filter(p => p !== themeId) : [...current, themeId];
      return { ...i, selectedBurberryThemes: next };
    }));
  };

  const toggleBalenciagaTheme = (itemId: string, themeId: string) => {
    setApparelItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const current = i.selectedBalenciagaThemes || [];
      const next = current.includes(themeId) ? current.filter(p => p !== themeId) : [...current, themeId];
      return { ...i, selectedBalenciagaThemes: next };
    }));
  };

  const generateCampaigns = async (targetItemId?: string) => {
    const targets = targetItemId
      ? apparelItems.filter(i => i.id === targetItemId)
      : apparelItems;
    const validTargets = targets.filter(i => (i.selectedCampaignObjects || []).length > 0);
    if (validTargets.length === 0) return;

    setIsGeneratingCampaigns(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;

      for (const item of validTargets) {
        const selectedIds = item.selectedCampaignObjects || [];
        const scenesToGenerate = CAMPAIGN_SCENES.filter(s => selectedIds.includes(s.id));

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          campaignStatus: 'generating',
          campaignImages: [],
          campaignProgress: { current: 0, total: scenesToGenerate.length }
        } : i));

        const hero = item.heroColor || '#6366f1';
        const heroDark = darkenHex(hero, 20);

        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }

        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 20-26, elegant features, medium-brown skin, styled dark hair, confident expression", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 20-26, sharp features, medium-brown skin, well-groomed hair, confident expression", selectedEthnicity, 'men');

        const campaignSlots: ({ objectId: string; objectLabel: string; view: GeneratedView } | undefined)[] = new Array(scenesToGenerate.length);
        let campaignsCompleted = 0;

        await runWithConcurrency(scenesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (si) => {
          const scene = scenesToGenerate[si];

          const parts: any[] = imageDataParts.map(img => ({
            inlineData: { data: img.data, mimeType: img.mimeType }
          }));

          if (logoBase64) {
            parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          }

          const campaignPrompt = `You are a Mixed-Media Campaign Art Director creating a high-impact campaign for VPPA Fashions. Produce a single 1:1 square mixed-media campaign image combining a real photographic cutout of a model with flat white hand-drawn 2D illustration.

SCENE CONCEPT: "${scene.label}" -- ${scene.mood}. Evoke the feeling of ${scene.sceneDescription}.

CANVAS & COLOR SYSTEM:
- 1:1 square format.
- Background: flat saturated ${hero} color field. Absolutely NO gradients, NO texture, NO photographic background.
- Overlay: 3-4 organic amoeba-like blob shapes in ${heroDark} (20% darker than the base). Smooth irregular edges, scattered asymmetrically, some bleeding off-frame.
- Feel is hand-painted but cleanly executed.

MODEL (REAL PHOTOGRAPHIC CUTOUT):
- ${modelDescription}.
- The model is a clean photographic cutout -- zero fringing, sharp edges.
- She/he is wearing the EXACT apparel shown in the reference images -- reproduce the garment faithfully in color, cut, prints, and details.
- Pose is active, caught mid-action. The body position and energy must match the "${scene.label}" scene mood.

HERO ILLUSTRATED ELEMENT (HAND-DRAWN 2D):
- Draw: ${scene.heroElement}.
- Drawn in pure white (#FFFFFF) only. Flat 2D illustration, brush-pen marker line quality, 3-5px line weight, slightly imperfect organic edges (hand-drawn feel). NO shading, NO gradients, flat white fill only.
- SCALE: this hero element must be MASSIVE -- at least 40% of canvas height. Monumental oversized scale.
- DEPTH LAYERING is critical: parts of the hero element sit BEHIND the model, parts come IN FRONT of the model. The model's real hands or feet make contact at the intersection point.
- INTERACTION: ${scene.interaction}. The relationship must be instantly readable in 2 seconds. Caught mid-action, alive.

SCENE-SPECIFIC SUPPORTING ILLUSTRATIONS (all white, flat, brush-pen line style, same visual language):
- Scatter these scene elements across the composition to build the "${scene.label}" mood: ${scene.supportingElements}.
- Mix small and medium sizes. Some behind the model, some in front. Keep them loose and hand-drawn.

BRAND STAMP:
- One small "VPPA" wordmark naturally embedded on the surface of the hero illustrated element -- as if printed, engraved, or stitched -- rendered in ${heroDark}. Subtle, not dominant.
${logoBase64 ? '- Use the provided VPPA logo for the brand stamp and supporting marks, rendered in flat white line form.' : ''}

UNIVERSAL SUPPORTING ELEMENTS (always included):
- A large VPPA logo mark in the upper-left corner, about 15% of canvas width.
- A medium VPPA mark in the opposite corner, about 10% of canvas width.
- 2-3 manga-style exclamation dash clusters near the point of contact between the model and hero element.
- 2-4 curved speed/motion lines tapered at the ends, radiating from the hero element or the model's most active body part; some cross behind the model and some in front for depth.
- A ground-line effect at the base of the scene using the scene-specific supporting elements where possible.
- 1-2 loose organic white squiggles floating near the model's torso for visual rhythm.
${item.price?.trim() ? `- PRICE TAG: In the bottom-right corner (or a clean safe zone), add a small hand-drawn white ticket/price tag illustration containing the price "₹${item.price.trim().replace(/^₹\\s*/, '')}". The rupee symbol (₹) MUST be clearly legible and properly drawn. The tag looks like a small white brush-pen drawn ribbon or rectangular label with a clean sans-serif price inside, sized so the text is readable but the tag occupies under 10% of canvas.` : ''}

LIGHTING ON THE MODEL:
- Studio strobe, high-key, even and clean, 5500K neutral. No dramatic shadows on the model. Soft contact shadow at the feet at about 15% opacity.
- The photography should read as natural and real against the graphic illustrated environment.

STRICT TECH RULES:
- Exactly 3 colors in the composition: ${hero} light base, ${heroDark} darker blobs, and pure white illustration. The only additional colors permitted are the model's natural skin tones and the actual fabric colors of the garment.
- Aesthetic references: Y2K comic energy, Japanese streetwear magazine, brush marker illustration.
- Asymmetric, dynamic composition. The interaction point between the model and hero element is the visual center of gravity; everything else orbits around it.
- NO text. NO wordmarks beyond the small embedded VPPA stamp and logo icons already described. NO watermarks.
- Mood: the model is not posing WITH the element -- the model is IN THE MIDDLE of the "${scene.label}" moment, caught mid-action.

Reproduce the EXACT apparel from the provided reference images on the model. Output one image only.`;

          parts.push({ text: campaignPrompt });

          try {
            const response = await callImageGenWithRetry({
              model: IMAGE_MODEL,
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize }
              }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              campaignSlots[si] = {
                objectId: scene.id,
                objectLabel: scene.label,
                view: { url, type: scene.label, description: desc || `VPPA x ${scene.label}` }
              };
            }
          } catch (err) {
            console.error(`Campaign generation failed for ${scene.label}:`, err);
            showToast('error', `${scene.label}: ${describeError(err)}`);
          } finally {
            campaignsCompleted++;
            const cleaned = campaignSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? {
              ...i,
              campaignImages: cleaned,
              campaignProgress: { current: campaignsCompleted, total: scenesToGenerate.length }
            } : i));
          }
        });

        const finalCampaigns = campaignSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          campaignStatus: finalCampaigns.length > 0 ? 'completed' : 'error',
          campaignProgress: undefined
        } : i));
      }
    } finally {
      setIsGeneratingCampaigns(false);
    }
  };

  const generatePressImages = async (targetItemId?: string) => {
    const targets = targetItemId
      ? apparelItems.filter(i => i.id === targetItemId)
      : apparelItems;
    const validTargets = targets.filter(i => (i.selectedPressPalettes || []).length > 0);
    if (validTargets.length === 0) return;

    setIsGeneratingPress(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;

      for (const item of validTargets) {
        const selectedIds = item.selectedPressPalettes || [];
        const palettesToGenerate = PRESS_PALETTES.filter(p => selectedIds.includes(p.id));

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          pressStatus: 'generating',
          pressImages: [],
          pressProgress: { current: 0, total: palettesToGenerate.length }
        } : i));

        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }

        const pressSlots: ({ paletteId: string; paletteLabel: string; view: GeneratedView } | undefined)[] = new Array(palettesToGenerate.length);
        let pressCompleted = 0;

        await runWithConcurrency(palettesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const palette = palettesToGenerate[pi];

          const parts: any[] = imageDataParts.map(img => ({
            inlineData: { data: img.data, mimeType: img.mimeType }
          }));

          if (logoBase64) {
            parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          }

          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';
          const pressPrompt = `You are a Senior Luxury Fashion Art Director and Studio Photographer for VPPA Fashions, specializing in high-end press imagery, flagship campaign key visuals, and e-commerce hero content. Produce a single 1:1 square key visual that could sit inside an official VPPA press kit or flagship e-commerce hero slot. Mood reference: Louis Vuitton, Bottega Veneta, and Celine official campaign and e-commerce photography standards.

FORMAT: 1:1 square aspect ratio.

BACKGROUND (Canvas):
- Single flat uniform field of ${palette.backgroundDescription}. Target tone approximately ${palette.backgroundHex}.
- Absolutely no gradients, no vignette, no texture, no shadows across the background plane. Perfectly uniform corner-to-corner.
- Apply a tone-on-tone VPPA monogram watermark across the entire canvas. The monogram is a large repeating "VPPA" wordmark motif, each instance spanning 18-22% of canvas width, tiled in a diagonal or offset grid pattern. Render the watermark as a ghost pattern with a value shift of ~10% from the background tone (slightly darker on light palettes, slightly lighter on dark palettes), at 12-15% opacity. Soft edges, feels embossed or tone-on-tone woven -- never printed, never hard-edged. The watermark must recede fully behind all other elements.

LOGO (top of frame):
- Reproduce the VPPA logo with full fidelity${logoBase64 ? ' -- use the provided VPPA logo faithfully for letterforms and icon' : ''}.
- Place the logo centered horizontally in the upper third of the frame (top 28% of canvas).
- Logo scale: approximately 42-48% of canvas width.
- Logo rendering: flat 2D, no extrusion, no chrome, no 3D effects.
- Logo color: use ${palette.accentDescription}. Apply VPPA brand colorway consistently.
- Directly below the main logo mark, place the full "VPPA" wordmark in spaced capital letters -- clean geometric sans-serif, letter-spacing roughly +250 tracking, same accent color, optical size about 55% of the logo height. No decorative elements between logo and wordmark.

PRODUCT (the apparel in the reference images):
- Render the exact garment from the provided reference images as a photorealistic studio object with maximum material fidelity.
- Show visible weave of the fabric, stitching thread, accurate print/graphic reproduction, realistic edge hems, and any hardware (buttons, zippers) with true metallic micro-reflections.
- If the garment has prints or graphics, reproduce them with perfect accuracy and legibility.
- Placement: the garment enters the frame from the bottom-right corner at a natural 25-35 degree angle, as if casually laid down or captured mid-motion. Feels intentional and editorial, not accidental.
- Crop the garment so only 60-75% of it is visible within the frame. The product occupies roughly the lower 55-65% of the canvas.
- The garment must feel physically present -- cast an extremely soft, barely visible contact shadow (opacity 8-12%) on the canvas beneath the nearest edge. No hard drop shadows. No floating look.

LIGHTING:
- Simulated large north-facing studio window light. Soft, directional, shadowless on the background.
- Color temperature 5500-6000K, neutral daylight with a slightly cool cast.
- Key light: large softbox from upper-left, even fill across the entire product surface. Minimal contrast ratio 1.2:1 to 1.5:1.
- Fill: large bounce from the right, eliminating harsh shadows.
- No rim light. No dramatic contrast. No specular hotspots on fabric -- only subtle micro-reflections on any metal hardware. The philosophy: the product sells itself, light only reveals.
- Global illumination enabled for subtle inter-reflections between product surfaces.

BOTTOM FINISHING:
- A thin 1px horizontal rule line in ${palette.accentDescription}, 80% of canvas width, centered horizontally, placed roughly 10% from the bottom edge.
- Below the rule line, a single centered line of micro-copy in clean sans-serif, small-caps, minimal tracking, accent color: "vppa fashions ${palette.mood.toLowerCase().split(',')[0].trim()} collection". Subtle, understated.
${priceCopy ? `- PRICE DISPLAY: Below the collection label, add one more line centered with the price "${priceCopy}" rendered in the same sans-serif small-caps style as the label, same accent color, roughly the same size. The rupee symbol (₹) MUST be clearly legible and properly drawn. Keep spacing clean and editorial.` : ''}
- No other text anywhere in the composition.

TECH RULES:
- Photorealistic CGI product visualization, Keyshot / Octane aesthetic.
- f/16 equivalent depth of field: everything tack-sharp, zero bokeh.
- Tone mapping: clean and true-to-life. No filmic crush, no vignette, no film grain.
- Neutral color grade faithful to the real product. Slight warmth only in the ${palette.label.toLowerCase()} background, not on the product.
- No AI-plastic smoothing on fabric. Microscopic surface imperfection maps required on any leather, denim, or textured fabric.
- No reflections on the background. No environmental reflections. Studio-only lighting.
- The final image must feel clean enough to be used as an official VPPA press image.

Reproduce the EXACT apparel from the provided reference images with full material and print fidelity. Output one image only.`;

          parts.push({ text: pressPrompt });

          try {
            const response = await callImageGenWithRetry({
              model: IMAGE_MODEL,
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize }
              }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              pressSlots[pi] = {
                paletteId: palette.id,
                paletteLabel: palette.label,
                view: { url, type: palette.label, description: desc || `VPPA press · ${palette.label}` }
              };
            }
          } catch (err) {
            console.error(`Press generation failed for ${palette.label}:`, err);
            showToast('error', `${palette.label}: ${describeError(err)}`);
          } finally {
            pressCompleted++;
            const cleaned = pressSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? {
              ...i,
              pressImages: cleaned,
              pressProgress: { current: pressCompleted, total: palettesToGenerate.length }
            } : i));
          }
        });

        const finalPress = pressSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          pressStatus: finalPress.length > 0 ? 'completed' : 'error',
          pressProgress: undefined
        } : i));
      }
    } finally {
      setIsGeneratingPress(false);
    }
  };

  const generateEditorialImages = async (targetItemId?: string) => {
    const targets = targetItemId
      ? apparelItems.filter(i => i.id === targetItemId)
      : apparelItems;
    const validTargets = targets.filter(i => (i.selectedEditorialSettings || []).length > 0);
    if (validTargets.length === 0) return;

    setIsGeneratingEditorial(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;

      for (const item of validTargets) {
        const selectedIds = item.selectedEditorialSettings || [];
        const settingsToGenerate = EDITORIAL_SETTINGS.filter(s => selectedIds.includes(s.id));

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          editorialStatus: 'generating',
          editorialImages: [],
          editorialProgress: { current: 0, total: settingsToGenerate.length }
        } : i));

        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }

        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 20-26, elegant features, medium-brown skin, styled dark hair, natural beauty, understated confidence", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 20-26, sharp features, medium-brown skin, well-groomed hair, quiet confidence", selectedEthnicity, 'men');

        const editorialSlots: ({ settingId: string; settingLabel: string; view: GeneratedView } | undefined)[] = new Array(settingsToGenerate.length);
        let editorialCompleted = 0;

        await runWithConcurrency(settingsToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (si) => {
          const setting = settingsToGenerate[si];

          const parts: any[] = imageDataParts.map(img => ({
            inlineData: { data: img.data, mimeType: img.mimeType }
          }));

          if (logoBase64) {
            parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          }

          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';

          const editorialPrompt = `You are a minimalist editorial fashion photographer shooting a lookbook for VPPA Fashions in the style of Zara / Massimo Dutti / Arket / COS official campaign photography. The mood is effortless, quiet, modern, and intentionally understated.

FORMAT: 1:1 square. The frame feels like a stopped moment, not a posed photo.

SETTING: "${setting.label}" -- ${setting.mood}. The environment is ${setting.location}. No additional props, no clutter, negative space everywhere.

MODEL: ${modelDescription}. ${setting.pose}. Expression is calm and distant, never smiling for the camera. Wearing the EXACT apparel from the reference images -- reproduce the garment faithfully in cut, color, print, and fit.

COMPOSITION: Intentionally asymmetric and off-center. The model occupies about 55-70% of the frame height; the rest is clean negative space that shows the architecture or environment. Crop feels editorial -- sometimes the top of the head or a limb is partially cut off. Avoid centering.

LIGHTING: ${setting.lighting}. Low contrast, matte rendering, no harsh shadows. Natural highlights only. No studio strobe look, no dramatic key light, no rim. Feels like available light.

PALETTE: Muted, desaturated, low-saturation neutrals. Dusty tones. The apparel keeps its real colors but the overall image feels earthy and cool. No punchy saturation. No colored gels.

BRANDING: Absolutely subtle VPPA branding. A small VPPA logo mark in the lower-right corner at about 4% of canvas width, in a muted neutral color that blends with the setting. No wordmark, no large logo, no watermark. This reads like a campaign image, not an advertisement.
${priceCopy ? `\nPRICE: Place a single line of micro-copy "${priceCopy}" in a very small sans-serif directly below or beside the tiny VPPA mark, same muted neutral tone, lowercase style. The rupee symbol (₹) MUST be clearly legible.` : ''}

TECH: Natural photography quality, matte finish, neutral color grade with slight coolness. Subtle film grain. f/4 equivalent aperture with very gentle focus falloff on the background, model fully sharp. Avoid AI-plastic skin or fabric smoothness.

STRICT RULES: No text beyond the tiny VPPA mark${priceCopy ? ' and the price line' : ''}. No additional people. No dramatic poses. No studio sweep. No fake beauty retouching. The apparel must be reproduced EXACTLY as shown in the reference images.

MOOD REFERENCE: Zara SS/AW Studio campaigns, Massimo Dutti lookbook, Arket ensemble imagery, COS editorial. Quiet luxury. Effortless.`;

          parts.push({ text: editorialPrompt });

          try {
            const response = await callImageGenWithRetry({
              model: IMAGE_MODEL,
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize }
              }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              editorialSlots[si] = {
                settingId: setting.id,
                settingLabel: setting.label,
                view: { url, type: setting.label, description: desc || `VPPA editorial · ${setting.label}` }
              };
            }
          } catch (err) {
            console.error(`Editorial generation failed for ${setting.label}:`, err);
            showToast('error', `${setting.label}: ${describeError(err)}`);
          } finally {
            editorialCompleted++;
            const cleaned = editorialSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? {
              ...i,
              editorialImages: cleaned,
              editorialProgress: { current: editorialCompleted, total: settingsToGenerate.length }
            } : i));
          }
        });

        const finalEditorial = editorialSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          editorialStatus: finalEditorial.length > 0 ? 'completed' : 'error',
          editorialProgress: undefined
        } : i));
      }
    } finally {
      setIsGeneratingEditorial(false);
    }
  };

  const generateHeritageImages = async (targetItemId?: string) => {
    const targets = targetItemId
      ? apparelItems.filter(i => i.id === targetItemId)
      : apparelItems;
    const validTargets = targets.filter(i => (i.selectedHeritagePalettes || []).length > 0);
    if (validTargets.length === 0) return;

    setIsGeneratingHeritage(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;

      for (const item of validTargets) {
        const selectedIds = item.selectedHeritagePalettes || [];
        const palettesToGenerate = HERITAGE_PALETTES.filter(p => selectedIds.includes(p.id));

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          heritageStatus: 'generating',
          heritageImages: [],
          heritageProgress: { current: 0, total: palettesToGenerate.length }
        } : i));

        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }

        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 22-28, refined features, medium-brown skin, elegantly styled dark hair, sophisticated editorial expression", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 22-28, aristocratic features, medium-brown skin, perfectly groomed hair, sophisticated editorial expression", selectedEthnicity, 'men');

        const heritageSlots: ({ paletteId: string; paletteLabel: string; view: GeneratedView } | undefined)[] = new Array(palettesToGenerate.length);
        let heritageCompleted = 0;

        await runWithConcurrency(palettesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const palette = palettesToGenerate[pi];

          const parts: any[] = imageDataParts.map(img => ({
            inlineData: { data: img.data, mimeType: img.mimeType }
          }));

          if (logoBase64) {
            parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          }

          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';

          const heritagePrompt = `You are a Senior Heritage Brand Art Director creating a flagship campaign key visual for VPPA Fashions in the style of Louis Vuitton / Gucci / Burberry / Hermes heritage campaigns. The mood is timeless, archival, opulent, and sophisticated.

FORMAT: 1:1 square.

HERITAGE PALETTE: "${palette.label}" -- ${palette.mood}. Overall tones: ${palette.paletteDescription}.

MONOGRAM BACKDROP:
- Fill the entire background with a repeating VPPA monogram pattern -- ${palette.monogramDescription}.
- Classic heritage monogram layout: each "VPPA" wordmark-and-icon motif arranged in an elegant diagonal grid or damier/checkerboard rhythm.
- Each monogram instance spans about 14-18% of canvas width.
- The monogram pattern is clearly visible across the canvas but sits as a rich decorative backdrop, softer in value than the hero subject. Roughly 30-45% contrast against the base palette so it reads as a woven/printed heritage canvas, not a watermark.
- No hard edges -- feels printed on textured canvas or woven into heavy fabric.

MODEL:
- ${modelDescription}.
- Sophisticated editorial pose: seated on an antique leather-trimmed trunk or leaning against an ornate gold-edged surface, OR standing three-quarter with one hand on a heritage accessory.
- The body language is poised, classical, slow.
- Wearing the EXACT apparel from the reference images -- reproduce the garment faithfully in cut, color, print, drape, and fabric.

PRODUCT HERO:
- The garment is the dramatic focal point. Rich fabric texture is visible -- weave, stitching, hardware, any prints or embroidery shown clearly.
- The product and the model together form the visual center of gravity against the monogram backdrop.

LIGHTING:
- Dramatic Rembrandt-style key light from the upper-left at ~45 degrees, warm golden key, color temperature 4200-4800K.
- Deep cinematic shadow on the opposite side. Contrast ratio approximately 3:1.
- Gentle fill bounce on the shadow side to preserve detail. No harsh highlights on fabric, but hardware can show small specular micro-reflections.
- Global illumination is on, so warmth bounces subtly between the model, garment, and backdrop.
- The lighting feels classical and editorial, like an archival campaign photograph.

COMPOSITION: Center-weighted with classical balance. Model slightly off-center following the rule of thirds. Rich monogram backdrop visible above, beside, and behind the model. Feels like a framed heritage portrait.

BRANDING:
- A prominent VPPA logo in the upper third of the canvas, centered horizontally, ~32% of canvas width, in ${palette.accentDescription}${logoBase64 ? ' -- use the provided VPPA logo faithfully' : ''}.
- Directly below the logo mark, render "VPPA FASHIONS" in spaced uppercase letters, clean geometric sans-serif, tracking about +250, same accent color, optical size ~50% of the logo height.
- Subtle thin 1px horizontal rule line in the accent color spanning 70% of canvas width, placed roughly 10% from the bottom.
- Below the rule: a centered micro-copy line in small-caps, same accent color: "vppa maison · ${palette.label.toLowerCase()} collection".
${priceCopy ? `- Below the collection label, add one more centered line "${priceCopy}" in the same accent color and small-caps style. The rupee symbol (₹) MUST be clearly legible.` : ''}

LUXURY DETAIL: Brass/gold/silver hardware micro-reflections. Rich fabric sheen where appropriate. Antique leather texture if the scene uses a trunk. Feels like an archive editorial.

TECH: Photorealistic, cinematic tone mapping, rich warm color grade, f/5.6 equivalent with gentle depth falloff behind the subject. No plastic AI finish. Microscopic surface imperfection on leather and fabric. No reflections on the backdrop beyond the monogram itself.

STRICT RULES: No text other than the VPPA logo, wordmark, collection label${priceCopy ? ', and price line' : ''}. No additional people. No modern tech products. No watermarks beyond the monogram backdrop.

MOOD REFERENCE: Louis Vuitton monogram campaigns, Gucci Aria editorial, Burberry heritage, Hermes archival.

Reproduce the EXACT apparel from the provided reference images. Output one image only.`;

          parts.push({ text: heritagePrompt });

          try {
            const response = await callImageGenWithRetry({
              model: IMAGE_MODEL,
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize }
              }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              heritageSlots[pi] = {
                paletteId: palette.id,
                paletteLabel: palette.label,
                view: { url, type: palette.label, description: desc || `VPPA heritage · ${palette.label}` }
              };
            }
          } catch (err) {
            console.error(`Heritage generation failed for ${palette.label}:`, err);
            showToast('error', `${palette.label}: ${describeError(err)}`);
          } finally {
            heritageCompleted++;
            const cleaned = heritageSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? {
              ...i,
              heritageImages: cleaned,
              heritageProgress: { current: heritageCompleted, total: palettesToGenerate.length }
            } : i));
          }
        });

        const finalHeritage = heritageSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          heritageStatus: finalHeritage.length > 0 ? 'completed' : 'error',
          heritageProgress: undefined
        } : i));
      }
    } finally {
      setIsGeneratingHeritage(false);
    }
  };

  const generateHermesImages = async (targetItemId?: string) => {
    const targets = targetItemId ? apparelItems.filter(i => i.id === targetItemId) : apparelItems;
    const validTargets = targets.filter(i => (i.selectedHermesThemes || []).length > 0);
    if (validTargets.length === 0) return;

    setIsGeneratingHermes(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;

      for (const item of validTargets) {
        const selectedIds = item.selectedHermesThemes || [];
        const themesToGenerate = HERMES_THEMES.filter(p => selectedIds.includes(p.id));

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          hermesStatus: 'generating',
          hermesImages: [],
          hermesProgress: { current: 0, total: themesToGenerate.length }
        } : i));

        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }

        const hermesSlots: ({ themeId: string; themeLabel: string; view: GeneratedView } | undefined)[] = new Array(themesToGenerate.length);
        let hermesCompleted = 0;

        await runWithConcurrency(themesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const theme = themesToGenerate[pi];

          const parts: any[] = imageDataParts.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } }));
          if (logoBase64) parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });

          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';

          const hermesPrompt = `You are a Senior Atelier Art Director creating a hand-crafted campaign poster for VPPA Fashions in the spirit of Hermes silk-scarf illustrations and Linda Merad's hand-drawn campaigns. Anti-AI, anti-CGI -- this must feel HAND-DRAWN, analog, and human-made.

FORMAT: 1:1 square.

THEME: "${theme.label}" -- ${theme.mood}.

BACKGROUND:
- A flat painted background of ${theme.backgroundDescription}.
- The background fills the entire canvas, no gradient, no vignette.
- Very subtle paper-grain texture as if printed on heavyweight cotton paper.

HERO SUBJECT:
- The garment from the reference images is the centerpiece, presented as a clean photographic still life of the apparel itself (NOT worn by a model). Center-weighted on the canvas, occupying roughly 50-60% of the canvas height.
- The garment can be elegantly laid flat, gently floating, or softly draped on an invisible form. It must look like the EXACT product from the references -- preserve cut, color, print, fabric, drape, stitching, and all distinctive details.
- A single subtle natural drop shadow underneath grounds the garment.

HAND-DRAWN MARGINALIA (signature Hermes element):
- Around the garment, scattered loose pen-and-ink illustrations rendered in ${theme.illustrationColor}.
- Motif: ${theme.illustrationMotif}.
- All marginalia is visibly HAND-DRAWN with a real pen -- visible line weight variations, slight wobble, organic imperfections, occasional ink blots, NO digital perfection.
- Drawings are scattered around the four corners and along the sides, framing the garment without crowding it. Each illustration is small to medium scale (5-15% of canvas dimension), playful, and full of life.
- Style: loose continuous-line ink drawing, occasional cross-hatching for shadow, no fills (line work only), think vintage scientific or fashion-house atelier sketches.

LOGO ONLY:
- Place the VPPA logo mark only (no wordmark, no extra text), small, in the bottom-right corner at ~7% of canvas width, in the same ${theme.illustrationColor} so it sits as a subtle stamp${logoBase64 ? ' -- use the provided VPPA logo faithfully' : ''}.
${priceCopy ? `- A small hand-written-style price tag near the garment showing "${priceCopy}" in casual handwritten script style, same ${theme.illustrationColor}, looks like it was added by the atelier.` : ''}

LIGHTING ON THE GARMENT: Soft natural daylight, even shadowless illumination, 5500K, photographic but gentle. The product looks fresh and clean against the painted ground.

COMPOSITION: Garment centered with marginalia framing it. Generous breathing room. Feels like a beautifully designed art print or atelier journal page.

STRICT RULES:
- NO model, NO mannequin, NO human figure visible -- only the garment and the hand-drawn marginalia.
- NO additional text other than the small VPPA logo${priceCopy ? ' and the small price tag' : ''}.
- NO digital sharpness on the marginalia -- they MUST look hand-drawn with real ink.
- NO additional shadows on the background besides the garment's natural ground shadow.

MOOD REFERENCE: Hermes silk scarves, Linda Merad illustrations, vintage atelier sketchbooks, hand-painted department-store posters from the 1950s.

Reproduce the EXACT apparel from the provided reference images. Output one image only.`;

          parts.push({ text: hermesPrompt });

          try {
            const response = await callImageGenWithRetry({
              model: IMAGE_MODEL,
              contents: { parts },
              config: { imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize } }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              hermesSlots[pi] = { themeId: theme.id, themeLabel: theme.label, view: { url, type: theme.label, description: desc || `VPPA atelier · ${theme.label}` } };
            }
          } catch (err) {
            console.error(`Hermes generation failed for ${theme.label}:`, err);
            showToast('error', `${theme.label}: ${describeError(err)}`);
          } finally {
            hermesCompleted++;
            const cleaned = hermesSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? {
              ...i,
              hermesImages: cleaned,
              hermesProgress: { current: hermesCompleted, total: themesToGenerate.length }
            } : i));
          }
        });

        const finalHermes = hermesSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          hermesStatus: finalHermes.length > 0 ? 'completed' : 'error',
          hermesProgress: undefined
        } : i));
      }
    } finally {
      setIsGeneratingHermes(false);
    }
  };

  const generateBottegaImages = async (targetItemId?: string) => {
    const targets = targetItemId ? apparelItems.filter(i => i.id === targetItemId) : apparelItems;
    const validTargets = targets.filter(i => (i.selectedBottegaThemes || []).length > 0);
    if (validTargets.length === 0) return;

    setIsGeneratingBottega(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;

      for (const item of validTargets) {
        const selectedIds = item.selectedBottegaThemes || [];
        const themesToGenerate = BOTTEGA_THEMES.filter(p => selectedIds.includes(p.id));

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          bottegaStatus: 'generating',
          bottegaImages: [],
          bottegaProgress: { current: 0, total: themesToGenerate.length }
        } : i));

        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }

        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 22-28, refined natural features, medium-brown skin, undone tousled hair, no visible makeup, gaze quiet and unposed", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 22-28, natural features, medium-brown skin, slightly tousled hair, gaze quiet and unposed", selectedEthnicity, 'men');

        const bottegaSlots: ({ themeId: string; themeLabel: string; view: GeneratedView } | undefined)[] = new Array(themesToGenerate.length);
        let bottegaCompleted = 0;

        await runWithConcurrency(themesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const theme = themesToGenerate[pi];

          const parts: any[] = imageDataParts.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } }));
          if (logoBase64) parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });

          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';

          const bottegaPrompt = `You are a Senior Quiet-Luxury Art Director creating a campaign image for VPPA Fashions in the spirit of Bottega Veneta and Loro Piana -- the no-logo, craft-first, quiet-luxury aesthetic. The image must be restrained, tactile, and feel like fine craftsmanship.

FORMAT: 1:1 square.

THEME: "${theme.label}" -- ${theme.mood}.

BACKGROUND:
- A clean painted backdrop of ${theme.backgroundDescription}.
- Fully uniform background, no gradient, no shadows on the wall except whatever is naturally cast by the model.

SETTING:
- The scene includes ${theme.surfaceDescription}.
- ${theme.craftDetail}.
- Otherwise the frame is bare -- no extra props, no clutter, no architectural detail.

MODEL:
- ${modelDescription}.
- Pose: model stands or leans casually, body slightly turned, body language soft and at-ease, almost candid. NOT looking at camera directly -- gaze drifts off-frame.
- Wearing the EXACT apparel from the reference images -- reproduce the garment faithfully in cut, color, print, drape, fabric, stitching, hardware. Every craft detail must be preserved.

PRODUCT FOCUS:
- The garment is the hero. Fabric weave, hand-stitching, leather grain, hardware, and intrecciato weave (where present) are visible in tack-sharp detail.
- Composition is generous with negative space, the garment occupying roughly 35-45% of the frame, never overwhelming.

LIGHTING:
- Soft natural daylight from a single large diffused source (north-facing window quality), 5500-5800K.
- Very low contrast, ratio about 1.5:1, almost shadowless. Gentle directionality from camera-left.
- Light feels expensive, slow, like an atelier on a quiet morning.

COMPOSITION: Off-center model with luxurious negative space. Architectural restraint. Feels like a fine-art still life that happens to include a person.

LOGO ONLY (NO LOUD BRANDING):
- Place the VPPA logo mark only (no wordmark, no rule lines, no collection labels) at the bottom-right corner, very small at ~5% of canvas width, in a tone-on-tone color barely darker than the background so it sits as a discreet maker's mark${logoBase64 ? ' -- use the provided VPPA logo faithfully' : ''}.
${priceCopy ? `- A single tiny price line "${priceCopy}" placed directly below the small logo, in the same tone-on-tone color, optical size ~40% of the logo height.` : ''}
- ABSOLUTELY no text, no wordmark, no slogans anywhere else in the frame.

TECH: Photorealistic, fine-grain medium-format quality, f/4 with creamy soft falloff, microscopic surface texture detail in fabric and leather. No plastic AI smoothing.

STRICT RULES:
- Quiet luxury energy: restraint above all. NEVER add visible logos to the garment, the surface, or the backdrop.
- No additional people. No clutter. No outdoor scenes -- always interior atelier mood.
- The image must feel CALM and CONFIDENT.

MOOD REFERENCE: Bottega Veneta "Craft is our Language" campaign by Jack Davison, Loro Piana lookbooks, The Row campaigns.

Reproduce the EXACT apparel from the provided reference images. Output one image only.`;

          parts.push({ text: bottegaPrompt });

          try {
            const response = await callImageGenWithRetry({
              model: IMAGE_MODEL,
              contents: { parts },
              config: { imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize } }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              bottegaSlots[pi] = { themeId: theme.id, themeLabel: theme.label, view: { url, type: theme.label, description: desc || `VPPA quiet · ${theme.label}` } };
            }
          } catch (err) {
            console.error(`Bottega generation failed for ${theme.label}:`, err);
            showToast('error', `${theme.label}: ${describeError(err)}`);
          } finally {
            bottegaCompleted++;
            const cleaned = bottegaSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? {
              ...i,
              bottegaImages: cleaned,
              bottegaProgress: { current: bottegaCompleted, total: themesToGenerate.length }
            } : i));
          }
        });

        const finalBottega = bottegaSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          bottegaStatus: finalBottega.length > 0 ? 'completed' : 'error',
          bottegaProgress: undefined
        } : i));
      }
    } finally {
      setIsGeneratingBottega(false);
    }
  };

  const generateSaintLaurentImages = async (targetItemId?: string) => {
    const targets = targetItemId ? apparelItems.filter(i => i.id === targetItemId) : apparelItems;
    const validTargets = targets.filter(i => (i.selectedSaintLaurentThemes || []).length > 0);
    if (validTargets.length === 0) return;

    setIsGeneratingSaintLaurent(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;

      for (const item of validTargets) {
        const selectedIds = item.selectedSaintLaurentThemes || [];
        const themesToGenerate = SAINTLAURENT_THEMES.filter(p => selectedIds.includes(p.id));

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          saintLaurentStatus: 'generating',
          saintLaurentImages: [],
          saintLaurentProgress: { current: 0, total: themesToGenerate.length }
        } : i));

        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }

        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 22-28, sharp angular features, medium-brown skin, slick dark hair, smoky-eye attitude, defiant editorial gaze", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 22-28, sharp angular features, medium-brown skin, slick dark hair, brooding rock-noir attitude", selectedEthnicity, 'men');

        const saintLaurentSlots: ({ themeId: string; themeLabel: string; view: GeneratedView } | undefined)[] = new Array(themesToGenerate.length);
        let saintLaurentCompleted = 0;

        await runWithConcurrency(themesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const theme = themesToGenerate[pi];

          const parts: any[] = imageDataParts.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } }));
          if (logoBase64) parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });

          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';
          const isDarkBg = ['pure-noir', 'crushed-shadow', 'high-flash', 'silver-rain', 'velvet-couture'].includes(theme.id);
          const logoColor = isDarkBg ? 'pure white' : 'pure black';

          const ysPrompt = `You are a Senior Rock-Noir Art Director creating a high-fashion campaign image for VPPA Fashions in the spirit of Saint Laurent under Hedi Slimane and Anthony Vaccarello -- monochrome, defiant, cinematic, raw. Black-and-white attitude with a single rock-and-roll edge.

FORMAT: 1:1 square.

THEME: "${theme.label}" -- ${theme.mood}.

BACKGROUND: ${theme.backgroundDescription}.

LIGHTING: ${theme.lightingDescription}.

MODEL:
- ${modelDescription}.
- Pose direction: ${theme.poseDirection}.
- Wearing the EXACT apparel from the reference images -- reproduce the garment faithfully in cut, color, print, drape, fabric, hardware, and stitching. Sharp shadows reveal every fold and contour.

PRODUCT FOCUS:
- The garment is the hero of the image, sharply lit and tightly cropped to maximize impact. Even though the lighting is dramatic, the product silhouette and details remain clearly readable.
- Composition is tight, often cropped to chest-up or hip-up to emphasize the garment.

COLOR TREATMENT:
- The image is desaturated to feel almost monochrome. Skin tones still natural but cool. Garment colors are muted but recognizable as the original.
- Rich deep blacks (true 0,0,0 in shadows) and bright clean highlights. NO mid-grey muddiness.

COMPOSITION: Tight, asymmetric, slightly dangerous energy. Off-center subject. Large negative space of pure background. Fashion-week front-row urgency.

LOGO ONLY (rock-noir minimalism):
- Place the VPPA logo mark only (no wordmark, no slogans), small at ~6% of canvas width, in the bottom-left corner, in ${logoColor}${logoBase64 ? ' -- use the provided VPPA logo faithfully' : ''}.
${priceCopy ? `- A single line "${priceCopy}" in clean condensed sans-serif, ${logoColor}, very small (~40% of logo height), placed directly under the logo.` : ''}
- ABSOLUTELY no text anywhere else in the frame.

TECH: Photorealistic, 35mm film grain, hard edges, deep contrast, shot on a fast prime lens at f/2.8 with subtle motion energy. No plastic skin smoothing -- preserve pores and natural skin texture. Slight halation around bright highlights.

STRICT RULES:
- Strictly one model, no extras.
- Strictly monochrome / desaturated -- absolutely no warm sunny mood.
- The garment must remain the focal hero even with high-contrast shadows.
- No props beyond what the lighting setup naturally implies.

MOOD REFERENCE: Saint Laurent campaigns by Hedi Slimane, Anthony Vaccarello editorial work, Helmut Newton noir portraits, Glen Luchford Saint Laurent winter campaigns.

Reproduce the EXACT apparel from the provided reference images. Output one image only.`;

          parts.push({ text: ysPrompt });

          try {
            const response = await callImageGenWithRetry({
              model: IMAGE_MODEL,
              contents: { parts },
              config: { imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize } }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              saintLaurentSlots[pi] = { themeId: theme.id, themeLabel: theme.label, view: { url, type: theme.label, description: desc || `VPPA noir · ${theme.label}` } };
            }
          } catch (err) {
            console.error(`SaintLaurent generation failed for ${theme.label}:`, err);
            showToast('error', `${theme.label}: ${describeError(err)}`);
          } finally {
            saintLaurentCompleted++;
            const cleaned = saintLaurentSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? {
              ...i,
              saintLaurentImages: cleaned,
              saintLaurentProgress: { current: saintLaurentCompleted, total: themesToGenerate.length }
            } : i));
          }
        });

        const finalSaintLaurent = saintLaurentSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          saintLaurentStatus: finalSaintLaurent.length > 0 ? 'completed' : 'error',
          saintLaurentProgress: undefined
        } : i));
      }
    } finally {
      setIsGeneratingSaintLaurent(false);
    }
  };

  const generatePradaImages = async (targetItemId?: string) => {
    const targets = targetItemId ? apparelItems.filter(i => i.id === targetItemId) : apparelItems;
    const validTargets = targets.filter(i => (i.selectedPradaThemes || []).length > 0);
    if (validTargets.length === 0) return;
    setIsGeneratingPrada(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;
      for (const item of validTargets) {
        const selectedIds = item.selectedPradaThemes || [];
        const themesToGenerate = PRADA_THEMES.filter(p => selectedIds.includes(p.id));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, pradaStatus: 'generating', pradaImages: [], pradaProgress: { current: 0, total: themesToGenerate.length } } : i));
        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }
        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 22-28, sharp intellectual features, medium-brown skin, severe minimalist hair, no smile, deadpan editorial gaze", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 22-28, sharp intellectual features, medium-brown skin, severe combed hair, deadpan editorial gaze", selectedEthnicity, 'men');
        const pradaSlots: ({ themeId: string; themeLabel: string; view: GeneratedView } | undefined)[] = new Array(themesToGenerate.length);
        let pradaCompleted = 0;
        await runWithConcurrency(themesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const theme = themesToGenerate[pi];
          const parts: any[] = imageDataParts.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } }));
          if (logoBase64) parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';
          const prompt = `You are a Senior Conceptual Art Director creating a campaign image for VPPA Fashions in the spirit of Prada / Miu Miu under Raf Simons -- avant-garde, intellectual, surreal, color-blocked, minimal but provocative.

FORMAT: 1:1 square.
THEME: "${theme.label}" -- ${theme.mood}.
BACKGROUND: ${theme.backgroundDescription}.
SET: ${theme.setSetting}.

MODEL:
- ${modelDescription}.
- Pose: ${theme.poseDirection}.
- Wearing the EXACT apparel from the reference images -- reproduce the garment faithfully in cut, color, print, drape, fabric, hardware, stitching.

LIGHTING: Flat institutional studio softbox light, very even, low contrast (1.5:1), 5500K neutral, almost shadowless. Feels like a museum or laboratory. Hard-edged garment silhouette readable at all times.

COMPOSITION: Severe geometric balance, generous negative space, model centered or precisely off-center on a strong vertical axis. The image should feel like a designed object, not a photograph -- conceptual, deliberate.

LOGO ONLY: Place the VPPA logo mark only (no wordmark, no text), tiny at ~5% canvas width, in the bottom-right corner, in a discreet color${logoBase64 ? ' -- use the provided VPPA logo faithfully' : ''}.
${priceCopy ? `- A single tiny price line "${priceCopy}" directly below the logo, optical size ~40% of logo height.` : ''}

STRICT RULES: No additional text, no slogans, no decoration. One model only. No props beyond the set described. Garment colors stay true.

TECH: Photorealistic, sharp medium-format clarity, micro-grain, f/8 deep DOF, slight cool-cast institutional grade.

MOOD REFERENCE: Prada SS24 / Miu Miu Pre-Spring campaigns, Steven Meisel for Prada, Raf Simons era institutional art-direction.

Reproduce the EXACT apparel from the provided reference images. Output one image only.`;
          parts.push({ text: prompt });
          try {
            const response = await callImageGenWithRetry({ model: IMAGE_MODEL, contents: { parts }, config: { imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize } } });
            let url = ''; let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }
            if (url) {
              pradaSlots[pi] = { themeId: theme.id, themeLabel: theme.label, view: { url, type: theme.label, description: desc || `VPPA conceptual · ${theme.label}` } };
            }
          } catch (err) {
            console.error(`Prada generation failed for ${theme.label}:`, err);
            showToast('error', `${theme.label}: ${describeError(err)}`);
          } finally {
            pradaCompleted++;
            const cleaned = pradaSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, pradaImages: cleaned, pradaProgress: { current: pradaCompleted, total: themesToGenerate.length } } : i));
          }
        });
        const finalPrada = pradaSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, pradaStatus: finalPrada.length > 0 ? 'completed' : 'error', pradaProgress: undefined } : i));
      }
    } finally { setIsGeneratingPrada(false); }
  };

  const generateDiorImages = async (targetItemId?: string) => {
    const targets = targetItemId ? apparelItems.filter(i => i.id === targetItemId) : apparelItems;
    const validTargets = targets.filter(i => (i.selectedDiorThemes || []).length > 0);
    if (validTargets.length === 0) return;
    setIsGeneratingDior(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;
      for (const item of validTargets) {
        const selectedIds = item.selectedDiorThemes || [];
        const themesToGenerate = DIOR_THEMES.filter(p => selectedIds.includes(p.id));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, diorStatus: 'generating', diorImages: [], diorProgress: { current: 0, total: themesToGenerate.length } } : i));
        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }
        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 22-28, refined romantic features, medium-brown skin, softly styled dark hair, painterly haute couture beauty, subtle warm makeup", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 22-28, classical aristocratic features, medium-brown skin, softly styled dark hair, painterly couture refinement", selectedEthnicity, 'men');
        const diorSlots: ({ themeId: string; themeLabel: string; view: GeneratedView } | undefined)[] = new Array(themesToGenerate.length);
        let diorCompleted = 0;
        await runWithConcurrency(themesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const theme = themesToGenerate[pi];
          const parts: any[] = imageDataParts.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } }));
          if (logoBase64) parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';
          const prompt = `You are a Senior Couture Art Director creating a romantic painterly campaign for VPPA Fashions in the spirit of Dior haute couture campaigns by Steven Meisel and Mert & Marcus -- painterly, romantic, classical, dreamy.

FORMAT: 1:1 square.
THEME: "${theme.label}" -- ${theme.mood}.
LOCATION: ${theme.locationDescription}.
PALETTE: ${theme.paletteDescription}.

MODEL:
- ${modelDescription}.
- Pose: ${theme.poseDirection}.
- Wearing the EXACT apparel from the reference images -- preserve every couture detail, fabric drape, embroidery, embellishment, color, print.

LIGHTING: ${theme.lightingDescription}.

GRADE: Painterly, soft warm color-grade evoking Renaissance oil painting -- creamy highlights, gentle warm shadows, fine film grain. Skin glows softly. Fabric reads as luxurious couture material.

COMPOSITION: Classical balance, often slightly off-center, with the location framing the model like a Renaissance portrait. Generous breathing room. Romantic stillness.

LOGO ONLY: Place the VPPA logo mark only (no wordmark, no text), small at ~6% canvas width, in the bottom-right corner, tone-on-tone discreet${logoBase64 ? ' -- use the provided VPPA logo faithfully' : ''}.
${priceCopy ? `- A single tiny price line "${priceCopy}" directly below the logo in elegant serif small-caps, optical size ~40% of logo height.` : ''}

STRICT RULES: No additional text or slogans. One model only. No anachronistic objects (phones, modern tech). Couture mood throughout.

TECH: Photorealistic medium-format quality, painterly post grade, f/2.8 with soft creamy bokeh in backgrounds, microscopic skin and fabric texture preserved.

MOOD REFERENCE: Dior haute couture campaigns, Steven Meisel for Dior, Lady Dior campaigns, classical Renaissance portraiture.

Reproduce the EXACT apparel from the provided reference images. Output one image only.`;
          parts.push({ text: prompt });
          try {
            const response = await callImageGenWithRetry({ model: IMAGE_MODEL, contents: { parts }, config: { imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize } } });
            let url = ''; let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }
            if (url) {
              diorSlots[pi] = { themeId: theme.id, themeLabel: theme.label, view: { url, type: theme.label, description: desc || `VPPA couture · ${theme.label}` } };
            }
          } catch (err) {
            console.error(`Dior generation failed for ${theme.label}:`, err);
            showToast('error', `${theme.label}: ${describeError(err)}`);
          } finally {
            diorCompleted++;
            const cleaned = diorSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, diorImages: cleaned, diorProgress: { current: diorCompleted, total: themesToGenerate.length } } : i));
          }
        });
        const finalDior = diorSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, diorStatus: finalDior.length > 0 ? 'completed' : 'error', diorProgress: undefined } : i));
      }
    } finally { setIsGeneratingDior(false); }
  };

  const generateJacquemusImages = async (targetItemId?: string) => {
    const targets = targetItemId ? apparelItems.filter(i => i.id === targetItemId) : apparelItems;
    const validTargets = targets.filter(i => (i.selectedJacquemusThemes || []).length > 0);
    if (validTargets.length === 0) return;
    setIsGeneratingJacquemus(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;
      for (const item of validTargets) {
        const selectedIds = item.selectedJacquemusThemes || [];
        const themesToGenerate = JACQUEMUS_THEMES.filter(p => selectedIds.includes(p.id));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, jacquemusStatus: 'generating', jacquemusImages: [], jacquemusProgress: { current: 0, total: themesToGenerate.length } } : i));
        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }
        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 22-28, sun-kissed glowing features, medium-brown skin tanned warm, natural undone hair, fresh natural look", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 22-28, sun-kissed features, medium-brown skin tanned warm, tousled natural hair, easy mediterranean charm", selectedEthnicity, 'men');
        const jacquemusSlots: ({ themeId: string; themeLabel: string; view: GeneratedView } | undefined)[] = new Array(themesToGenerate.length);
        let jacquemusCompleted = 0;
        await runWithConcurrency(themesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const theme = themesToGenerate[pi];
          const parts: any[] = imageDataParts.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } }));
          if (logoBase64) parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';
          const prompt = `You are a Senior Mediterranean Lifestyle Art Director creating a sun-drenched campaign for VPPA Fashions in the spirit of Jacquemus -- south of France, surreal oversized props, golden warm light, joyful pastel summer.

FORMAT: 1:1 square.
THEME: "${theme.label}" -- ${theme.mood}.
LOCATION: ${theme.locationDescription}.
PALETTE: ${theme.palette}.

MODEL:
- ${modelDescription}.
- Pose: ${theme.poseDirection}.
- Wearing the EXACT apparel from the reference images -- preserve every detail of cut, color, print, drape, fabric.

SURREAL OVERSIZE PROP (signature Jacquemus element):
- ${theme.surrealProp}. The prop is exaggerated in scale -- 2-5x normal size -- giving the image a playful surrealist quality. The prop must look photorealistic, hand-held or naturally interacted with.

LIGHTING: Warm golden-hour Mediterranean sun, 4500-5200K, soft directional sidelight from camera-left, warm shadows, gentle haze in the air. Sun-kissed skin glow.

COMPOSITION: Slightly off-center, often using the surreal prop as a strong graphic element. Generous breathing room. Joyful, cinematic, carefree.

LOGO ONLY: Place the VPPA logo mark only (no wordmark, no text), tiny at ~5% canvas width, bottom-right corner, in soft cream tone${logoBase64 ? ' -- use the provided VPPA logo faithfully' : ''}.
${priceCopy ? `- A single tiny price line "${priceCopy}" directly below the logo, optical size ~40% of logo height.` : ''}

STRICT RULES: No additional text or slogans. One model only. The surreal oversized prop MUST be present and obviously larger-than-life.

TECH: Photorealistic 35mm film quality, slight warm grain, f/4 with creamy soft falloff, Kodak Portra 400 warmth, golden honey grade.

MOOD REFERENCE: Jacquemus campaigns by Simon Porte Jacquemus, "Le Bambino" oversize prop campaigns, south of France lifestyle editorial.

Reproduce the EXACT apparel from the provided reference images. Output one image only.`;
          parts.push({ text: prompt });
          try {
            const response = await callImageGenWithRetry({ model: IMAGE_MODEL, contents: { parts }, config: { imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize } } });
            let url = ''; let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }
            if (url) {
              jacquemusSlots[pi] = { themeId: theme.id, themeLabel: theme.label, view: { url, type: theme.label, description: desc || `VPPA riviera · ${theme.label}` } };
            }
          } catch (err) {
            console.error(`Jacquemus generation failed for ${theme.label}:`, err);
            showToast('error', `${theme.label}: ${describeError(err)}`);
          } finally {
            jacquemusCompleted++;
            const cleaned = jacquemusSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, jacquemusImages: cleaned, jacquemusProgress: { current: jacquemusCompleted, total: themesToGenerate.length } } : i));
          }
        });
        const finalJacquemus = jacquemusSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, jacquemusStatus: finalJacquemus.length > 0 ? 'completed' : 'error', jacquemusProgress: undefined } : i));
      }
    } finally { setIsGeneratingJacquemus(false); }
  };

  const generateBurberryImages = async (targetItemId?: string) => {
    const targets = targetItemId ? apparelItems.filter(i => i.id === targetItemId) : apparelItems;
    const validTargets = targets.filter(i => (i.selectedBurberryThemes || []).length > 0);
    if (validTargets.length === 0) return;
    setIsGeneratingBurberry(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;
      for (const item of validTargets) {
        const selectedIds = item.selectedBurberryThemes || [];
        const themesToGenerate = BURBERRY_THEMES.filter(p => selectedIds.includes(p.id));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, burberryStatus: 'generating', burberryImages: [], burberryProgress: { current: 0, total: themesToGenerate.length } } : i));
        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }
        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 22-28, refined natural features, medium-brown skin, wind-tousled dark hair, no smile, stoic British editorial gaze", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 22-28, refined natural features, medium-brown skin, wind-tousled dark hair, stoic British editorial gaze", selectedEthnicity, 'men');
        const burberrySlots: ({ themeId: string; themeLabel: string; view: GeneratedView } | undefined)[] = new Array(themesToGenerate.length);
        let burberryCompleted = 0;
        await runWithConcurrency(themesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const theme = themesToGenerate[pi];
          const parts: any[] = imageDataParts.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } }));
          if (logoBase64) parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';
          const prompt = `You are a Senior British Heritage Art Director creating a campaign for VPPA Fashions in the spirit of Burberry -- British weather, trench-coat heritage, atmospheric countryside, cinematic landscape.

FORMAT: 1:1 square.
THEME: "${theme.label}" -- ${theme.mood}.
LOCATION: ${theme.locationDescription}.
PALETTE: ${theme.paletteDescription}.
WEATHER / ATMOSPHERE: ${theme.weatherAtmosphere}.

MODEL:
- ${modelDescription}.
- Pose: ${theme.poseDirection}.
- Wearing the EXACT apparel from the reference images -- preserve every detail of cut, color, fabric, drape, lining, hardware, stitching.

LIGHTING: Soft natural British overcast diffusion, 5800-6500K cool, low contrast 1.5:1 with gentle directional shadow. Atmospheric haze where weather permits, occasionally a warm golden shaft breaking through clouds.

COMPOSITION: Wide environmental shot showing the model integrated into the landscape. Often using rule-of-thirds with the model on one side and the dramatic landscape filling the rest. Cinematic mood.

LOGO ONLY: Place the VPPA logo mark only (no wordmark, no text), small at ~6% canvas width, bottom-right corner, in a tone that complements the scene${logoBase64 ? ' -- use the provided VPPA logo faithfully' : ''}.
${priceCopy ? `- A single tiny price line "${priceCopy}" directly below the logo in clean serif small-caps, optical size ~40% of logo height.` : ''}

STRICT RULES: No additional text or slogans. One model only. The British weather/landscape MUST be the second hero of the image. No anachronistic modern objects.

TECH: Photorealistic, slight cool British grade, fine 35mm grain, f/4 medium-format quality, atmospheric depth, microscopic fabric detail.

MOOD REFERENCE: Burberry campaigns by Mario Testino and Christopher Bailey era, "Brit" Burberry heritage, cinematic British countryside editorials.

Reproduce the EXACT apparel from the provided reference images. Output one image only.`;
          parts.push({ text: prompt });
          try {
            const response = await callImageGenWithRetry({ model: IMAGE_MODEL, contents: { parts }, config: { imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize } } });
            let url = ''; let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }
            if (url) {
              burberrySlots[pi] = { themeId: theme.id, themeLabel: theme.label, view: { url, type: theme.label, description: desc || `VPPA heritage UK · ${theme.label}` } };
            }
          } catch (err) {
            console.error(`Burberry generation failed for ${theme.label}:`, err);
            showToast('error', `${theme.label}: ${describeError(err)}`);
          } finally {
            burberryCompleted++;
            const cleaned = burberrySlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, burberryImages: cleaned, burberryProgress: { current: burberryCompleted, total: themesToGenerate.length } } : i));
          }
        });
        const finalBurberry = burberrySlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, burberryStatus: finalBurberry.length > 0 ? 'completed' : 'error', burberryProgress: undefined } : i));
      }
    } finally { setIsGeneratingBurberry(false); }
  };

  const generateBalenciagaImages = async (targetItemId?: string) => {
    const targets = targetItemId ? apparelItems.filter(i => i.id === targetItemId) : apparelItems;
    const validTargets = targets.filter(i => (i.selectedBalenciagaThemes || []).length > 0);
    if (validTargets.length === 0) return;
    setIsGeneratingBalenciaga(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;
      for (const item of validTargets) {
        const selectedIds = item.selectedBalenciagaThemes || [];
        const themesToGenerate = BALENCIAGA_THEMES.filter(p => selectedIds.includes(p.id));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, balenciagaStatus: 'generating', balenciagaImages: [], balenciagaProgress: { current: 0, total: themesToGenerate.length } } : i));
        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }
        const modelDescription = selectedGender === 'women'
          ? applyEthnicity("a single young Indian woman, age 22-28, severe angular features, medium-brown skin, slick straight dark hair pulled back, dead-calm dystopian gaze", selectedEthnicity, 'women')
          : applyEthnicity("a single young Indian man, age 22-28, severe angular features, medium-brown skin, slick straight dark hair, dead-calm dystopian gaze", selectedEthnicity, 'men');
        const balenciagaSlots: ({ themeId: string; themeLabel: string; view: GeneratedView } | undefined)[] = new Array(themesToGenerate.length);
        let balenciagaCompleted = 0;
        await runWithConcurrency(themesToGenerate.length, MAX_PARALLEL_IMAGE_GEN, async (pi) => {
          const theme = themesToGenerate[pi];
          const parts: any[] = imageDataParts.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } }));
          if (logoBase64) parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
          const priceCopy = item.price?.trim() ? `₹${item.price.trim().replace(/^₹\s*/, '')}` : '';
          const prompt = `You are a Senior Dystopian Art Director creating a campaign for VPPA Fashions in the spirit of Balenciaga under Demna -- brutalist, dystopian, post-apocalyptic, oversized silhouettes, cold and cinematic.

FORMAT: 1:1 square.
THEME: "${theme.label}" -- ${theme.mood}.
ENVIRONMENT: ${theme.environmentDescription}.
PALETTE: ${theme.paletteDescription}.
WEATHER / ATMOSPHERE: ${theme.weatherAtmosphere}.

MODEL:
- ${modelDescription}.
- Pose: ${theme.poseDirection}.
- Wearing the EXACT apparel from the reference images -- preserve every detail of cut, color, drape, fabric, hardware. Where possible the silhouette should read OVERSIZED and dramatic against the environment.

LIGHTING: ${theme.lightingDescription}.

GRADE: Cool desaturated dystopian color grade, crushed blacks, slightly raised mid-greens, slight teal-orange split-tone where weather permits, cinematic letterboxed mood.

COMPOSITION: Wide environmental shot establishing the dystopian scale. Model often centered or symmetrically placed making the scene feel staged, monumental, surreal. Negative space is heavy.

LOGO ONLY: Place the VPPA logo mark only (no wordmark, no text), small at ~6% canvas width, bottom-right corner, in a tone that just barely reads against the scene${logoBase64 ? ' -- use the provided VPPA logo faithfully' : ''}.
${priceCopy ? `- A single tiny price line "${priceCopy}" directly below the logo in industrial mono small-caps, optical size ~40% of logo height.` : ''}

STRICT RULES: No additional text, no slogans. One model only. Dystopian / post-apocalyptic atmosphere MUST dominate. No bright cheerful colors. No anachronistic glamour.

TECH: Photorealistic cinematic CCTV-aesthetic quality, deep grain, f/2.8-f/4 with subtle depth falloff, motion-implied stillness.

MOOD REFERENCE: Balenciaga campaigns by Demna Gvasalia, "Snow" and "Mud" runways, post-apocalyptic editorial work, Vetements early campaigns.

Reproduce the EXACT apparel from the provided reference images. Output one image only.`;
          parts.push({ text: prompt });
          try {
            const response = await callImageGenWithRetry({ model: IMAGE_MODEL, contents: { parts }, config: { imageConfig: { aspectRatio: "1:1", imageSize: selectedImageSize } } });
            let url = ''; let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }
            if (url) {
              balenciagaSlots[pi] = { themeId: theme.id, themeLabel: theme.label, view: { url, type: theme.label, description: desc || `VPPA dystopia · ${theme.label}` } };
            }
          } catch (err) {
            console.error(`Balenciaga generation failed for ${theme.label}:`, err);
            showToast('error', `${theme.label}: ${describeError(err)}`);
          } finally {
            balenciagaCompleted++;
            const cleaned = balenciagaSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
            setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, balenciagaImages: cleaned, balenciagaProgress: { current: balenciagaCompleted, total: themesToGenerate.length } } : i));
          }
        });
        const finalBalenciaga = balenciagaSlots.filter((g): g is NonNullable<typeof g> => Boolean(g));
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, balenciagaStatus: finalBalenciaga.length > 0 ? 'completed' : 'error', balenciagaProgress: undefined } : i));
      }
    } finally { setIsGeneratingBalenciaga(false); }
  };

  const totalViews = apparelItems.reduce((acc, i) => acc + i.views.length, 0);
  const currentViewTypes = getViewTypes(selectedGender);
  const totalExpected = apparelItems.length * currentViewTypes.length;

  // Airbnb-style gallery lightbox state
  const [galleryState, setGalleryState] = useState<{ itemId: string; startIndex: number } | null>(null);
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('vppa_gallery_favs') : null;
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('vppa_gallery_favs', JSON.stringify(favorites)); } catch { /* ignore quota */ }
  }, [favorites]);
  const toggleFavorite = (url: string) => {
    setFavorites(prev => {
      const next = { ...prev };
      if (next[url]) delete next[url]; else next[url] = true;
      return next;
    });
  };
  const openGallery = (item: ApparelItem, imageUrl: string) => {
    const gallery = buildItemGallery(item);
    const idx = Math.max(0, gallery.findIndex(g => g.url === imageUrl));
    setGalleryState({ itemId: item.id, startIndex: idx });
  };
  const activeGalleryItem = galleryState ? apparelItems.find(i => i.id === galleryState.itemId) : null;
  const activeGalleryImages = activeGalleryItem ? buildItemGallery(activeGalleryItem) : [];

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-gray-900 font-sans selection:bg-indigo-500/20 mesh-bg">
      <input type="file" ref={addPhotoInputRef} onChange={handleAddPhotosToItem} accept="image/*" multiple className="hidden" />
      <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
      <input type="file" ref={fileInputRef} onChange={handleNewApparelUpload} accept="image/*" multiple className="hidden" />
      <input type="file" ref={printedFrontRef} onChange={handlePrintedFrontUpload} accept="image/*" className="hidden" />
      <input type="file" ref={printedBackRef} onChange={handlePrintedBackUpload} accept="image/*" className="hidden" />

      {/* Header */}
      <header className="sticky top-0 z-50 glass-strong">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                VPPA <span className="font-serif italic font-normal text-gray-500">Fashions</span>
              </h1>
              <p className="text-[10px] text-gray-400 tracking-wide">AI Studio Engine</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Pipeline Badge */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200/60">
              <Zap className="w-3 h-3 text-indigo-500" />
              <span className="text-[10px] text-gray-500">Flash Analysis + Nano Banana 2</span>
            </div>

            {/* Logo Upload */}
            <button
              onClick={() => logoInputRef.current?.click()}
              className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm transition-all duration-300 ${
                logo
                  ? 'bg-indigo-50 border border-indigo-200 text-indigo-700'
                  : 'bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {logo ? (
                <img src={logo.preview} alt="Logo" className="w-5 h-5 object-contain rounded" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              <span className="text-xs font-medium">{logo ? 'Logo Set' : 'Brand Logo'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 pt-8 pb-20">
        {/* Top Bar: Upload + Style + Generate */}
        {/* Two Upload Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Standard Upload */}
          <div className="glass rounded-2xl p-5">
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3 block">
              Standard Upload
            </label>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating}
              className="w-full py-8 rounded-xl border border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all duration-300 flex flex-col items-center justify-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 group-hover:bg-indigo-50 flex items-center justify-center transition-all">
                <Plus className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
              </div>
              <p className="text-sm text-gray-500 group-hover:text-gray-700 font-medium transition-colors">New Apparel Item</p>
              <p className="text-[10px] text-gray-300">Select 1-5 photos of the same product</p>
            </button>
          </div>

          {/* Printed Shirt Upload */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                Printed / Graphic Shirt
              </label>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-500 font-medium">Front + Back</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => printedFrontRef.current?.click()}
                disabled={isGenerating || !!pendingPrintedFront}
                className="flex-1 py-8 rounded-xl border border-dashed border-gray-200 hover:border-violet-300 hover:bg-violet-50/50 transition-all duration-300 flex flex-col items-center justify-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pendingPrintedFront ? (
                  <>
                    <img src={pendingPrintedFront.preview} alt="Front" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                    <span className="text-[10px] text-emerald-500 font-medium">Front ready</span>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-lg bg-gray-50 group-hover:bg-violet-50 flex items-center justify-center transition-all">
                      <Upload className="w-4 h-4 text-gray-300 group-hover:text-violet-500 transition-colors" />
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">1. Front View</span>
                  </>
                )}
              </button>
              <button
                onClick={() => pendingPrintedFront && printedBackRef.current?.click()}
                disabled={isGenerating || !pendingPrintedFront}
                className="flex-1 py-8 rounded-xl border border-dashed border-gray-200 hover:border-violet-300 hover:bg-violet-50/50 transition-all duration-300 flex flex-col items-center justify-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-50 group-hover:bg-violet-50 flex items-center justify-center transition-all">
                  <Upload className="w-4 h-4 text-gray-300 group-hover:text-violet-500 transition-colors" />
                </div>
                <span className="text-[10px] text-gray-400 font-medium">2. Back View</span>
              </button>
            </div>
            {pendingPrintedFront && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <span className="text-[10px] text-gray-400">Front uploaded. Now select the back view.</span>
                <button onClick={() => setPendingPrintedFront(null)} className="text-[10px] text-red-400 hover:text-red-500">Cancel</button>
              </div>
            )}
          </div>
        </div>

        {/* Settings Bar */}
        <div className="glass rounded-2xl p-5 mb-8">
          <div className="flex flex-col lg:flex-row gap-5 items-start lg:items-end">
            {/* Style Selector */}
            <div className="flex-1">
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3 block">
                Studio Backdrop
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {BACKGROUND_STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style)}
                    className={`px-2.5 py-2 rounded-lg text-[10px] font-medium transition-all duration-200 ${
                      selectedStyle.id === style.id
                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                        : 'bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {style.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Gender Toggle */}
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3 block">
                Model
              </label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['women', 'men'] as Gender[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setSelectedGender(g)}
                    className={`px-5 py-2.5 text-xs font-semibold transition-all duration-200 ${
                      selectedGender === g
                        ? 'bg-indigo-500 text-white'
                        : 'bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {g === 'women' ? 'Women' : 'Men'}
                  </button>
                ))}
              </div>
            </div>

            {/* Ethnicity Selector */}
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3 block">
                Ethnicity
              </label>
              <div className="relative">
                <select
                  value={selectedEthnicity}
                  onChange={(e) => setSelectedEthnicity(e.target.value as Ethnicity)}
                  className="appearance-none pl-4 pr-9 py-2.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 cursor-pointer transition-all min-w-[160px]"
                  title={ETHNICITY_PROFILES.find(p => p.id === selectedEthnicity)?.description}
                >
                  {ETHNICITY_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <p className="text-[9px] text-gray-400 mt-1.5 max-w-[200px] leading-relaxed">
                {ETHNICITY_PROFILES.find(p => p.id === selectedEthnicity)?.description}
              </p>
            </div>

            {/* Resolution Toggle */}
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3 block">
                Resolution
              </label>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {(['1K'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedImageSize(size)}
                      className={`px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
                        selectedImageSize === size
                          ? 'bg-indigo-500 text-white'
                          : 'bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                      }`}
                      title="1024x1024 - sharper, ~$0.08/image"
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-gray-400 mt-1.5 leading-relaxed">
                  1024x1024, sharper
                </p>
              </div>

            {/* Generate */}
            <div className="lg:w-auto w-full">
              <button
                onClick={generateImages}
                disabled={apparelItems.length === 0 || isGenerating}
                className="w-full lg:w-auto px-8 py-4 rounded-xl font-semibold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-2.5 disabled:opacity-20 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Status Bar */}
          {apparelItems.length > 0 && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span className="text-[11px] text-gray-400">{apparelItems.length} item{apparelItems.length > 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                <span className="text-[11px] text-gray-400">{apparelItems.reduce((a, i) => a + i.images.length, 0)} photo{apparelItems.reduce((a, i) => a + i.images.length, 0) > 1 ? 's' : ''}</span>
              </div>
              {totalViews > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[11px] text-gray-400">{totalViews}/{totalExpected} views</span>
                </div>
              )}
              {logo && (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-[11px] text-gray-400">Logo active</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content Area */}
        <AnimatePresence mode="popLayout">
          {apparelItems.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-32"
            >
              <div className="w-20 h-20 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-6">
                <ImageIcon className="w-8 h-8 text-gray-200" />
              </div>
              <p className="text-gray-300 text-lg font-serif italic mb-2">No apparel uploaded yet</p>
              <p className="text-gray-300 text-sm">Upload reference photos to get started</p>
            </motion.div>
          ) : (
            <div className="space-y-6">
              {apparelItems.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-2xl overflow-hidden"
                >
                  {/* Item Header */}
                  <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        item.status === 'completed' ? 'bg-emerald-400' :
                        item.status === 'analyzing' ? 'bg-blue-400 animate-pulse' :
                        item.status === 'processing' ? 'bg-indigo-400 animate-pulse' :
                        item.status === 'error' ? 'bg-red-400' :
                        'bg-gray-300'
                      }`} />
                      <span className="text-sm font-medium text-gray-600">
                        {item.images.length} reference{item.images.length > 1 ? 's' : ''}
                      </span>
                      {item.uploadMode === 'printed' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 font-medium">Printed</span>
                      )}
                      {item.status === 'analyzing' && (
                        <span className="text-[10px] text-blue-500 animate-pulse flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Analyzing...
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span className="text-[10px] text-indigo-500 animate-pulse flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Generating view {(item.currentProcessingIndex || 0) + 1}/{currentViewTypes.length}
                        </span>
                      )}
                      {item.analysis && item.status !== 'analyzing' && (
                        <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Analyzed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {item.status === 'completed' && item.views.length > 0 && (
                        <button
                          onClick={() => downloadAllAsZip(item)}
                          disabled={zippingItems.has(item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {zippingItems.has(item.id) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Archive className="w-3 h-3" />
                          )}
                          {zippingItems.has(item.id) ? 'Zipping...' : 'Download all'}
                        </button>
                      )}
                      {item.status === 'completed' && !isGenerating && (
                        <button
                          onClick={() => resetItemForRegeneration(item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Regenerate
                        </button>
                      )}
                      {!isGenerating && (
                        <button
                          onClick={() => removeApparel(item.id)}
                          className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Reference Photos */}
                  <div className="px-5 py-4 flex gap-2.5 overflow-x-auto border-b border-gray-100">
                    {item.images.map((img, imgIdx) => (
                      <div key={imgIdx} className="relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-gray-200 group">
                        <img src={img.preview} alt={`Ref ${imgIdx + 1}`} onClick={() => openGallery(item, img.preview)} className="w-full h-full object-cover cursor-pointer" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                        {img.label && (
                          <div className="absolute bottom-1 left-1">
                            <span className="text-[7px] uppercase font-semibold bg-white/90 text-gray-600 px-1.5 py-0.5 rounded shadow-sm">{img.label}</span>
                          </div>
                        )}
                        {!isGenerating && (
                          <button
                            onClick={() => removePhotoFromItem(item.id, imgIdx)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-md bg-white/90 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3 text-gray-500" />
                          </button>
                        )}
                      </div>
                    ))}
                    {item.images.length < MAX_PHOTOS_PER_ITEM && !isGenerating && (
                      <button
                        onClick={() => {
                          setActiveItemId(item.id);
                          addPhotoInputRef.current?.click();
                        }}
                        className="flex-shrink-0 w-20 h-20 rounded-xl border border-dashed border-gray-200 hover:border-indigo-300 flex flex-col items-center justify-center gap-1 transition-all hover:bg-indigo-50/50"
                      >
                        <Plus className="w-4 h-4 text-gray-300" />
                        <span className="text-[8px] text-gray-300">{item.images.length}/{MAX_PHOTOS_PER_ITEM}</span>
                      </button>
                    )}
                  </div>

                  {/* Generated Views Grid */}
                  <div className="p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {currentViewTypes.map((type, idx) => {
                        const view = item.views[idx];
                        const isAnalyzing = item.status === 'analyzing';
                        const isProcessing = item.status === 'processing' && item.currentProcessingIndex === idx;
                        const isWaiting = (item.status === 'processing' && (item.currentProcessingIndex || 0) < idx) || isAnalyzing;

                        return (
                          <div key={type} className="group">
                            <div className={`aspect-square rounded-xl overflow-hidden relative transition-all duration-300 ${
                              view ? 'border border-gray-200 hover:border-gray-300' : 'border border-gray-100 bg-gray-50/50'
                            } ${isProcessing ? 'ring-1 ring-indigo-300' : ''}`}>
                              {view ? (
                                <>
                                  <img src={view.url} alt={type} onClick={() => openGallery(item, view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                  {regeneratingViews.has(`${item.id}:${idx}`) && (
                                    <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-1.5">
                                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                      <span className="text-[9px] font-medium text-indigo-600">Regenerating...</span>
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2.5 gap-1.5">
                                    <button
                                      onClick={() => downloadImage(view.url, `VPPA_${item.id}_${type.replace(/\s+/g, '_')}.png`)}
                                      className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 transition-colors shadow-sm"
                                    >
                                      <Download className="w-3 h-3" />
                                      Save
                                    </button>
                                    <button
                                      onClick={() => regenerateView(item.id, idx)}
                                      disabled={regeneratingViews.has(`${item.id}:${idx}`) || isGenerating}
                                      className="w-full py-1.5 rounded-lg bg-indigo-500 text-white text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-indigo-600 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                      <RefreshCw className={`w-3 h-3 ${regeneratingViews.has(`${item.id}:${idx}`) ? 'animate-spin' : ''}`} />
                                      Regenerate
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
                                  {isProcessing ? (
                                    <>
                                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                      <div className="w-8 h-0.5 rounded-full bg-indigo-100 overflow-hidden">
                                        <div className="h-full bg-indigo-400 rounded-full shimmer" style={{ width: '60%' }} />
                                      </div>
                                    </>
                                  ) : isWaiting ? (
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" />
                                  ) : (
                                    <div className="w-5 h-5 rounded-lg bg-gray-100 flex items-center justify-center">
                                      <ImageIcon className="w-3 h-3 text-gray-300" />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <p className={`text-[9px] mt-1.5 text-center font-medium truncate ${
                              view ? 'text-gray-500' : isProcessing ? 'text-indigo-500' : 'text-gray-300'
                            }`}>
                              {type}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Brand Campaigns Section */}
        {SHOW_BRAND_CAMPAIGNS && apparelItems.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-16 pt-10 border-t border-gray-200"
          >
            <div className="flex items-end justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-gradient-to-r from-indigo-100 to-violet-100 text-indigo-700 font-semibold uppercase tracking-wider">New</span>
                  <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
                    Brand <span className="font-serif italic font-normal text-gray-500">Campaigns</span>
                  </h2>
                </div>
                <p className="text-sm text-gray-400">
                  {campaignTab === 'scenes' && 'Mixed-media campaign scenes -- pick one or many moods, hit generate, and get a poster for every scene'}
                  {campaignTab === 'press' && 'Luxury press-release key visuals -- 1:1 square, photorealistic product with VPPA monogram watermark'}
                  {campaignTab === 'editorial' && 'Zara / Arket / COS style minimalist lookbook -- effortless, quiet, modern editorial'}
                  {campaignTab === 'heritage' && 'Louis Vuitton / Gucci style heritage campaign -- rich monogram backdrop, cinematic lighting, archival luxury'}
                  {campaignTab === 'hermes' && 'Hermes atelier style -- product still life on flat painted ground with hand-drawn ink marginalia, anti-AI craft'}
                  {campaignTab === 'bottega' && 'Bottega Veneta / Loro Piana / The Row quiet luxury -- restraint, craft focus, no loud branding, soft natural light'}
                  {campaignTab === 'saintlaurent' && 'Saint Laurent rock-noir -- monochrome high-contrast cinema, hard light, defiant attitude'}
                  {campaignTab === 'prada' && 'Prada / Miu Miu conceptual -- avant-garde, surreal, color-blocked, intellectual provocation'}
                  {campaignTab === 'dior' && 'Dior couture romance -- painterly Renaissance haute couture, classical settings, dreamy soft light'}
                  {campaignTab === 'jacquemus' && 'Jacquemus riviera -- sun-drenched south of France with surreal oversized props, joyful pastel summer'}
                  {campaignTab === 'burberry' && 'Burberry British heritage -- foggy moors, rainy cobblestones, trench coat heritage, atmospheric British countryside'}
                  {campaignTab === 'balenciaga' && 'Balenciaga dystopian -- brutalist post-apocalyptic, oversized silhouettes, cinematic dystopia'}
                </p>
              </div>
              {(() => {
                if (campaignTab === 'scenes') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedCampaignObjects?.length || 0), 0);
                  return (
                    <button
                      onClick={() => generateCampaigns()}
                      disabled={totalSelected === 0 || isGeneratingCampaigns || isGenerating}
                      className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-fuchsia-500 to-rose-500 hover:from-fuchsia-600 hover:to-rose-600 text-white shadow-md shadow-fuchsia-500/20"
                    >
                      {isGeneratingCampaigns ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'press') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedPressPalettes?.length || 0), 0);
                  return (
                    <button
                      onClick={() => generatePressImages()}
                      disabled={totalSelected === 0 || isGeneratingPress || isGenerating}
                      className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-amber-500/20"
                    >
                      {isGeneratingPress ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'editorial') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedEditorialSettings?.length || 0), 0);
                  return (
                    <button
                      onClick={() => generateEditorialImages()}
                      disabled={totalSelected === 0 || isGeneratingEditorial || isGenerating}
                      className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-900 hover:to-gray-800 text-white shadow-md shadow-gray-500/20"
                    >
                      {isGeneratingEditorial ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'heritage') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedHeritagePalettes?.length || 0), 0);
                  return (
                    <button
                      onClick={() => generateHeritageImages()}
                      disabled={totalSelected === 0 || isGeneratingHeritage || isGenerating}
                      className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-yellow-700 to-amber-700 hover:from-yellow-800 hover:to-amber-800 text-white shadow-md shadow-yellow-700/20"
                    >
                      {isGeneratingHeritage ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'hermes') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedHermesThemes?.length || 0), 0);
                  return (
                    <button
                      onClick={() => generateHermesImages()}
                      disabled={totalSelected === 0 || isGeneratingHermes || isGenerating}
                      className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-md shadow-orange-500/20"
                    >
                      {isGeneratingHermes ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'bottega') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedBottegaThemes?.length || 0), 0);
                  return (
                    <button
                      onClick={() => generateBottegaImages()}
                      disabled={totalSelected === 0 || isGeneratingBottega || isGenerating}
                      className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-700 to-green-700 hover:from-emerald-800 hover:to-green-800 text-white shadow-md shadow-emerald-700/20"
                    >
                      {isGeneratingBottega ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'saintlaurent') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedSaintLaurentThemes?.length || 0), 0);
                  return (
                    <button
                      onClick={() => generateSaintLaurentImages()}
                      disabled={totalSelected === 0 || isGeneratingSaintLaurent || isGenerating}
                      className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-black to-gray-800 hover:from-black hover:to-gray-900 text-white shadow-md shadow-gray-900/30"
                    >
                      {isGeneratingSaintLaurent ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'prada') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedPradaThemes?.length || 0), 0);
                  return (
                    <button onClick={() => generatePradaImages()} disabled={totalSelected === 0 || isGeneratingPrada || isGenerating} className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-lime-500 to-yellow-500 hover:from-lime-600 hover:to-yellow-600 text-white shadow-md shadow-lime-500/20">
                      {isGeneratingPrada ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'dior') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedDiorThemes?.length || 0), 0);
                  return (
                    <button onClick={() => generateDiorImages()} disabled={totalSelected === 0 || isGeneratingDior || isGenerating} className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-rose-300 to-pink-400 hover:from-rose-400 hover:to-pink-500 text-white shadow-md shadow-rose-300/30">
                      {isGeneratingDior ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'jacquemus') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedJacquemusThemes?.length || 0), 0);
                  return (
                    <button onClick={() => generateJacquemusImages()} disabled={totalSelected === 0 || isGeneratingJacquemus || isGenerating} className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-yellow-400 to-amber-400 hover:from-yellow-500 hover:to-amber-500 text-white shadow-md shadow-yellow-400/30">
                      {isGeneratingJacquemus ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                if (campaignTab === 'burberry') {
                  const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedBurberryThemes?.length || 0), 0);
                  return (
                    <button onClick={() => generateBurberryImages()} disabled={totalSelected === 0 || isGeneratingBurberry || isGenerating} className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-stone-600 to-stone-700 hover:from-stone-700 hover:to-stone-800 text-white shadow-md shadow-stone-500/20">
                      {isGeneratingBurberry ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                    </button>
                  );
                }
                const totalSelected = apparelItems.reduce((sum, i) => sum + (i.selectedBalenciagaThemes?.length || 0), 0);
                return (
                  <button onClick={() => generateBalenciagaImages()} disabled={totalSelected === 0 || isGeneratingBalenciaga || isGenerating} className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-zinc-700 to-zinc-900 hover:from-zinc-800 hover:to-black text-white shadow-md shadow-zinc-900/30">
                    {isGeneratingBalenciaga ? (<><Loader2 className="w-4 h-4 animate-spin" />Creating all...</>) : (<><Sparkles className="w-4 h-4" />Generate All {totalSelected > 0 ? `(${totalSelected})` : ''}</>)}
                  </button>
                );
              })()}
            </div>

            {/* Campaign Type Tabs */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <button
                onClick={() => setCampaignTab('scenes')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'scenes' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Mixed-Media Scenes
                <span className="text-[9px] text-gray-400 font-normal">1:1</span>
              </button>
              <button
                onClick={() => setCampaignTab('press')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'press' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Press Release
                <span className="text-[9px] text-gray-400 font-normal">LV style</span>
              </button>
              <button
                onClick={() => setCampaignTab('editorial')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'editorial' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Editorial Lookbook
                <span className="text-[9px] text-gray-400 font-normal">Zara style</span>
              </button>
              <button
                onClick={() => setCampaignTab('heritage')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'heritage' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Heritage Luxury
                <span className="text-[9px] text-gray-400 font-normal">LV / Gucci</span>
              </button>
              <button
                onClick={() => setCampaignTab('hermes')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'hermes' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Atelier Hand-Drawn
                <span className="text-[9px] text-gray-400 font-normal">Hermes</span>
              </button>
              <button
                onClick={() => setCampaignTab('bottega')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'bottega' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Quiet Luxury
                <span className="text-[9px] text-gray-400 font-normal">Bottega / Loro Piana</span>
              </button>
              <button
                onClick={() => setCampaignTab('saintlaurent')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'saintlaurent' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Rock Noir
                <span className="text-[9px] text-gray-400 font-normal">Saint Laurent</span>
              </button>
              <button
                onClick={() => setCampaignTab('prada')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'prada' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Conceptual
                <span className="text-[9px] text-gray-400 font-normal">Prada / Miu Miu</span>
              </button>
              <button
                onClick={() => setCampaignTab('dior')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'dior' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Couture Romance
                <span className="text-[9px] text-gray-400 font-normal">Dior</span>
              </button>
              <button
                onClick={() => setCampaignTab('jacquemus')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'jacquemus' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Riviera
                <span className="text-[9px] text-gray-400 font-normal">Jacquemus</span>
              </button>
              <button
                onClick={() => setCampaignTab('burberry')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'burberry' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                British Heritage
                <span className="text-[9px] text-gray-400 font-normal">Burberry</span>
              </button>
              <button
                onClick={() => setCampaignTab('balenciaga')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  campaignTab === 'balenciaga' ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Dystopian
                <span className="text-[9px] text-gray-400 font-normal">Balenciaga</span>
              </button>
            </div>

            {campaignTab === 'scenes' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const hero = item.heroColor || '#6366f1';
                const selectedProps = item.selectedCampaignObjects || [];
                const hasSelection = selectedProps.length > 0;
                const isItemGenerating = item.campaignStatus === 'generating';
                const campaignImages = item.campaignImages || [];
                return (
                  <div key={`campaign-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Campaign Posters</span>
                          {item.uploadMode === 'printed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedProps.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-fuchsia-300 focus-within:ring-2 focus-within:ring-fuchsia-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.price || ''}
                            onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))}
                            placeholder="Price"
                            className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none"
                          />
                        </div>
                        <input
                          type="color"
                          value={hero}
                          onChange={(e) => updateCampaignField(item.id, 'heroColor', e.target.value)}
                          className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer"
                          title="Hero color"
                        />
                        <button
                          onClick={() => generateCampaigns(item.id)}
                          disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingCampaigns}
                          className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-fuchsia-500 to-rose-500 hover:from-fuchsia-600 hover:to-rose-600 text-white shadow-sm"
                        >
                          {isItemGenerating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {item.campaignProgress ? `${item.campaignProgress.current + 1}/${item.campaignProgress.total}` : 'Creating'}
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              Generate {hasSelection ? `(${selectedProps.length})` : ''}
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Scene Selection */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Scenes (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedCampaignObjects: CAMPAIGN_SCENES.map(s => s.id) } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Select all
                          </button>
                          <span className="text-gray-200">·</span>
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedCampaignObjects: [] } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {CAMPAIGN_SCENES.map(scene => {
                          const isSelected = selectedProps.includes(scene.id);
                          return (
                            <button
                              key={scene.id}
                              onClick={() => toggleCampaignScene(item.id, scene.id)}
                              disabled={isItemGenerating}
                              className={`px-3 py-2 rounded-lg text-left transition-all duration-200 border disabled:opacity-50 ${
                                isSelected
                                  ? 'bg-fuchsia-500 text-white border-fuchsia-500 shadow-sm'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-fuchsia-200'
                              }`}
                            >
                              <p className="text-[11px] font-semibold truncate">{scene.label}</p>
                              <p className={`text-[9px] truncate mt-0.5 ${isSelected ? 'text-fuchsia-100' : 'text-gray-400'}`}>{scene.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Results */}
                    <div className="p-5">
                      {campaignImages.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-gray-300" />
                          </div>
                          <p className="text-xs text-gray-400">Select one or more scenes, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedSceneDefs = CAMPAIGN_SCENES.filter(s => selectedProps.includes(s.id));
                            const total = isItemGenerating && item.campaignProgress ? item.campaignProgress.total : selectedSceneDefs.length;
                            const currentIdx = item.campaignProgress?.current ?? -1;
                            return selectedSceneDefs.slice(0, Math.max(total, campaignImages.length)).map((scene, idx) => {
                              const generated = campaignImages.find(c => c.objectId === scene.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={scene.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${
                                    generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'
                                  } ${isCurrent ? 'ring-1 ring-fuchsia-300' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={scene.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button
                                            onClick={() => downloadImage(generated.view.url, `VPPA_Campaign_${scene.id}_${item.id}.png`)}
                                            className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"
                                          >
                                            <Download className="w-3 h-3" />
                                            Save
                                          </button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
                                        <Loader2 className="w-5 h-5 animate-spin text-fuchsia-500" />
                                        <div className="w-8 h-0.5 rounded-full bg-fuchsia-100 overflow-hidden">
                                          <div className="h-full bg-fuchsia-400 rounded-full shimmer" style={{ width: '60%' }} />
                                        </div>
                                      </div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" />
                                      </div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                                          <ImageIcon className="w-3 h-3 text-gray-300" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${
                                    generated ? 'text-gray-500' : isCurrent ? 'text-fuchsia-500' : 'text-gray-300'
                                  }`}>
                                    {scene.label}
                                  </p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
            {campaignTab === 'press' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedPalettes = item.selectedPressPalettes || [];
                const hasSelection = selectedPalettes.length > 0;
                const isItemGenerating = item.pressStatus === 'generating';
                const pressImages = item.pressImages || [];
                return (
                  <div key={`press-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Press Release Key Visuals</span>
                          {item.uploadMode === 'printed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedPalettes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · 1:1 square</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.price || ''}
                            onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))}
                            placeholder="Price"
                            className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={() => generatePressImages(item.id)}
                          disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingPress}
                          className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
                        >
                          {isItemGenerating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {item.pressProgress ? `${item.pressProgress.current + 1}/${item.pressProgress.total}` : 'Creating'}
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              Generate {hasSelection ? `(${selectedPalettes.length})` : ''}
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Palette Selection */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Palettes (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedPressPalettes: PRESS_PALETTES.map(p => p.id) } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Select all
                          </button>
                          <span className="text-gray-200">·</span>
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedPressPalettes: [] } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        {PRESS_PALETTES.map(palette => {
                          const isSelected = selectedPalettes.includes(palette.id);
                          return (
                            <button
                              key={palette.id}
                              onClick={() => togglePressPalette(item.id, palette.id)}
                              disabled={isItemGenerating}
                              className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${
                                isSelected
                                  ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-amber-200'
                              }`}
                            >
                              <div className="w-full aspect-square rounded-md mb-1.5 border" style={{ backgroundColor: palette.backgroundHex, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }} />
                              <p className="text-[10px] font-semibold truncate">{palette.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{palette.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Results */}
                    <div className="p-5">
                      {pressImages.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-gray-300" />
                          </div>
                          <p className="text-xs text-gray-400">Select one or more palettes, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                          {(() => {
                            const selectedDefs = PRESS_PALETTES.filter(p => selectedPalettes.includes(p.id));
                            const total = isItemGenerating && item.pressProgress ? item.pressProgress.total : selectedDefs.length;
                            const currentIdx = item.pressProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, pressImages.length)).map((palette, idx) => {
                              const generated = pressImages.find(c => c.paletteId === palette.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={palette.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${
                                    generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100'
                                  } ${isCurrent ? 'ring-1 ring-amber-300' : ''}`} style={{ backgroundColor: generated ? 'transparent' : palette.backgroundHex }}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={palette.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button
                                            onClick={() => downloadImage(generated.view.url, `VPPA_Press_${palette.id}_${item.id}.png`)}
                                            className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"
                                          >
                                            <Download className="w-3 h-3" />
                                            Save
                                          </button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
                                        <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                                        <div className="w-8 h-0.5 rounded-full bg-amber-100 overflow-hidden">
                                          <div className="h-full bg-amber-400 rounded-full shimmer" style={{ width: '60%' }} />
                                        </div>
                                      </div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" />
                                      </div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center opacity-30">
                                        <ImageIcon className="w-4 h-4 text-gray-400" />
                                      </div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${
                                    generated ? 'text-gray-500' : isCurrent ? 'text-amber-500' : 'text-gray-300'
                                  }`}>
                                    {palette.label}
                                  </p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'editorial' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedSettings = item.selectedEditorialSettings || [];
                const hasSelection = selectedSettings.length > 0;
                const isItemGenerating = item.editorialStatus === 'generating';
                const editorialImages = item.editorialImages || [];
                return (
                  <div key={`editorial-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Editorial Lookbook</span>
                          {item.uploadMode === 'printed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedSettings.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · Zara / COS / Arket aesthetic</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-gray-400 focus-within:ring-2 focus-within:ring-gray-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.price || ''}
                            onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))}
                            placeholder="Price"
                            className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={() => generateEditorialImages(item.id)}
                          disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingEditorial}
                          className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-900 hover:to-gray-800 text-white shadow-sm"
                        >
                          {isItemGenerating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {item.editorialProgress ? `${item.editorialProgress.current + 1}/${item.editorialProgress.total}` : 'Creating'}
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              Generate {hasSelection ? `(${selectedSettings.length})` : ''}
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Setting Selection */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Locations (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedEditorialSettings: EDITORIAL_SETTINGS.map(s => s.id) } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Select all
                          </button>
                          <span className="text-gray-200">·</span>
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedEditorialSettings: [] } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {EDITORIAL_SETTINGS.map(setting => {
                          const isSelected = selectedSettings.includes(setting.id);
                          return (
                            <button
                              key={setting.id}
                              onClick={() => toggleEditorialSetting(item.id, setting.id)}
                              disabled={isItemGenerating}
                              className={`px-3 py-2 rounded-lg text-left transition-all duration-200 border disabled:opacity-50 ${
                                isSelected
                                  ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                              }`}
                            >
                              <p className="text-[11px] font-semibold truncate">{setting.label}</p>
                              <p className={`text-[9px] truncate mt-0.5 ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{setting.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Results */}
                    <div className="p-5">
                      {editorialImages.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                            <Camera className="w-5 h-5 text-gray-300" />
                          </div>
                          <p className="text-xs text-gray-400">Select one or more locations, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = EDITORIAL_SETTINGS.filter(s => selectedSettings.includes(s.id));
                            const total = isItemGenerating && item.editorialProgress ? item.editorialProgress.total : selectedDefs.length;
                            const currentIdx = item.editorialProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, editorialImages.length)).map((setting, idx) => {
                              const generated = editorialImages.find(c => c.settingId === setting.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={setting.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${
                                    generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'
                                  } ${isCurrent ? 'ring-1 ring-gray-400' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={setting.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button
                                            onClick={() => downloadImage(generated.view.url, `VPPA_Editorial_${setting.id}_${item.id}.png`)}
                                            className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"
                                          >
                                            <Download className="w-3 h-3" />
                                            Save
                                          </button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
                                        <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
                                        <div className="w-8 h-0.5 rounded-full bg-gray-200 overflow-hidden">
                                          <div className="h-full bg-gray-500 rounded-full shimmer" style={{ width: '60%' }} />
                                        </div>
                                      </div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" />
                                      </div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                                          <ImageIcon className="w-3 h-3 text-gray-300" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${
                                    generated ? 'text-gray-500' : isCurrent ? 'text-gray-700' : 'text-gray-300'
                                  }`}>
                                    {setting.label}
                                  </p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'heritage' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedPalettes = item.selectedHeritagePalettes || [];
                const hasSelection = selectedPalettes.length > 0;
                const isItemGenerating = item.heritageStatus === 'generating';
                const heritageImages = item.heritageImages || [];
                return (
                  <div key={`heritage-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Heritage Luxury</span>
                          {item.uploadMode === 'printed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedPalettes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · LV / Gucci monogram aesthetic</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-yellow-600 focus-within:ring-2 focus-within:ring-yellow-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.price || ''}
                            onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))}
                            placeholder="Price"
                            className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={() => generateHeritageImages(item.id)}
                          disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingHeritage}
                          className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-yellow-700 to-amber-700 hover:from-yellow-800 hover:to-amber-800 text-white shadow-sm"
                        >
                          {isItemGenerating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {item.heritageProgress ? `${item.heritageProgress.current + 1}/${item.heritageProgress.total}` : 'Creating'}
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              Generate {hasSelection ? `(${selectedPalettes.length})` : ''}
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Palette Selection */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Heritage Palettes (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedHeritagePalettes: HERITAGE_PALETTES.map(p => p.id) } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Select all
                          </button>
                          <span className="text-gray-200">·</span>
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedHeritagePalettes: [] } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                        {HERITAGE_PALETTES.map(palette => {
                          const isSelected = selectedPalettes.includes(palette.id);
                          const previewBg = palette.id === 'classic-monogram' ? '#8B6F47' :
                                            palette.id === 'forest-heritage' ? '#2D4A3A' :
                                            palette.id === 'bordeaux-wine' ? '#5E1A2E' :
                                            palette.id === 'midnight-sapphire' ? '#1C2536' :
                                            palette.id === 'ivory-champagne' ? '#EFE4CA' :
                                            palette.id === 'black-onyx-gold' ? '#1A1615' :
                                            palette.id === 'burnt-terracotta' ? '#9E4A2E' :
                                            '#A8B0A0';
                          return (
                            <button
                              key={palette.id}
                              onClick={() => toggleHeritagePalette(item.id, palette.id)}
                              disabled={isItemGenerating}
                              className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${
                                isSelected
                                  ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
                              }`}
                            >
                              <div className="w-full aspect-square rounded-md mb-1.5 border relative overflow-hidden" style={{ backgroundColor: previewBg, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }}>
                                <div className="absolute inset-0 opacity-30 flex items-center justify-center">
                                  <span className="text-[8px] font-bold tracking-wider" style={{ color: palette.id === 'ivory-champagne' ? '#8B6F47' : '#E9D9B8' }}>V·P·P·A</span>
                                </div>
                              </div>
                              <p className="text-[10px] font-semibold truncate">{palette.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{palette.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Results */}
                    <div className="p-5">
                      {heritageImages.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-gray-300" />
                          </div>
                          <p className="text-xs text-gray-400">Select one or more heritage palettes, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = HERITAGE_PALETTES.filter(p => selectedPalettes.includes(p.id));
                            const total = isItemGenerating && item.heritageProgress ? item.heritageProgress.total : selectedDefs.length;
                            const currentIdx = item.heritageProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, heritageImages.length)).map((palette, idx) => {
                              const generated = heritageImages.find(c => c.paletteId === palette.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={palette.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${
                                    generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'
                                  } ${isCurrent ? 'ring-1 ring-amber-400' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={palette.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button
                                            onClick={() => downloadImage(generated.view.url, `VPPA_Heritage_${palette.id}_${item.id}.png`)}
                                            className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"
                                          >
                                            <Download className="w-3 h-3" />
                                            Save
                                          </button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
                                        <Loader2 className="w-5 h-5 animate-spin text-amber-700" />
                                        <div className="w-8 h-0.5 rounded-full bg-amber-100 overflow-hidden">
                                          <div className="h-full bg-amber-500 rounded-full shimmer" style={{ width: '60%' }} />
                                        </div>
                                      </div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" />
                                      </div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                                          <ImageIcon className="w-3 h-3 text-gray-300" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${
                                    generated ? 'text-gray-500' : isCurrent ? 'text-amber-700' : 'text-gray-300'
                                  }`}>
                                    {palette.label}
                                  </p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'hermes' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedThemes = item.selectedHermesThemes || [];
                const hasSelection = selectedThemes.length > 0;
                const isItemGenerating = item.hermesStatus === 'generating';
                const hermesImages = item.hermesImages || [];
                return (
                  <div key={`hermes-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Atelier Hand-Drawn</span>
                          {item.uploadMode === 'printed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedThemes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · Hermes silk-scarf hand-drawn aesthetic · logo only</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.price || ''}
                            onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))}
                            placeholder="Price"
                            className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={() => generateHermesImages(item.id)}
                          disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingHermes}
                          className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-sm"
                        >
                          {isItemGenerating ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" />{item.hermesProgress ? `${item.hermesProgress.current + 1}/${item.hermesProgress.total}` : 'Creating'}</>
                          ) : (
                            <><Sparkles className="w-3.5 h-3.5" />Generate {hasSelection ? `(${selectedThemes.length})` : ''}</>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Atelier Themes (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedHermesThemes: HERMES_THEMES.map(p => p.id) } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Select all
                          </button>
                          <span className="text-gray-200">·</span>
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedHermesThemes: [] } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {HERMES_THEMES.map(theme => {
                          const isSelected = selectedThemes.includes(theme.id);
                          return (
                            <button
                              key={theme.id}
                              onClick={() => toggleHermesTheme(item.id, theme.id)}
                              disabled={isItemGenerating}
                              className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${
                                isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                              }`}
                            >
                              <div className="w-full aspect-square rounded-md mb-1.5 border" style={{ backgroundColor: theme.backgroundHex, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }} />
                              <p className="text-[10px] font-semibold truncate">{theme.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{theme.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-5">
                      {hermesImages.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-gray-300" />
                          </div>
                          <p className="text-xs text-gray-400">Select one or more atelier themes, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = HERMES_THEMES.filter(p => selectedThemes.includes(p.id));
                            const total = isItemGenerating && item.hermesProgress ? item.hermesProgress.total : selectedDefs.length;
                            const currentIdx = item.hermesProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, hermesImages.length)).map((theme, idx) => {
                              const generated = hermesImages.find(c => c.themeId === theme.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={theme.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${
                                    generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'
                                  } ${isCurrent ? 'ring-1 ring-orange-400' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={theme.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button
                                            onClick={() => downloadImage(generated.view.url, `VPPA_Atelier_${theme.id}_${item.id}.png`)}
                                            className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"
                                          >
                                            <Download className="w-3 h-3" />
                                            Save
                                          </button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
                                        <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                                        <div className="w-8 h-0.5 rounded-full bg-orange-100 overflow-hidden">
                                          <div className="h-full bg-orange-500 rounded-full shimmer" style={{ width: '60%' }} />
                                        </div>
                                      </div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" />
                                      </div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                                          <ImageIcon className="w-3 h-3 text-gray-300" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${
                                    generated ? 'text-gray-500' : isCurrent ? 'text-orange-600' : 'text-gray-300'
                                  }`}>{theme.label}</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'bottega' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedThemes = item.selectedBottegaThemes || [];
                const hasSelection = selectedThemes.length > 0;
                const isItemGenerating = item.bottegaStatus === 'generating';
                const bottegaImages = item.bottegaImages || [];
                return (
                  <div key={`bottega-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Quiet Luxury</span>
                          {item.uploadMode === 'printed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedThemes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · Bottega / Loro Piana / The Row · logo only, restraint</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.price || ''}
                            onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))}
                            placeholder="Price"
                            className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={() => generateBottegaImages(item.id)}
                          disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingBottega}
                          className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-700 to-green-700 hover:from-emerald-800 hover:to-green-800 text-white shadow-sm"
                        >
                          {isItemGenerating ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" />{item.bottegaProgress ? `${item.bottegaProgress.current + 1}/${item.bottegaProgress.total}` : 'Creating'}</>
                          ) : (
                            <><Sparkles className="w-3.5 h-3.5" />Generate {hasSelection ? `(${selectedThemes.length})` : ''}</>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Backdrops (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedBottegaThemes: BOTTEGA_THEMES.map(p => p.id) } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Select all
                          </button>
                          <span className="text-gray-200">·</span>
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedBottegaThemes: [] } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {BOTTEGA_THEMES.map(theme => {
                          const isSelected = selectedThemes.includes(theme.id);
                          return (
                            <button
                              key={theme.id}
                              onClick={() => toggleBottegaTheme(item.id, theme.id)}
                              disabled={isItemGenerating}
                              className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${
                                isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                              }`}
                            >
                              <div className="w-full aspect-square rounded-md mb-1.5 border" style={{ backgroundColor: theme.backgroundHex, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }} />
                              <p className="text-[10px] font-semibold truncate">{theme.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{theme.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-5">
                      {bottegaImages.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                            <Layers className="w-5 h-5 text-gray-300" />
                          </div>
                          <p className="text-xs text-gray-400">Select one or more backdrops, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = BOTTEGA_THEMES.filter(p => selectedThemes.includes(p.id));
                            const total = isItemGenerating && item.bottegaProgress ? item.bottegaProgress.total : selectedDefs.length;
                            const currentIdx = item.bottegaProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, bottegaImages.length)).map((theme, idx) => {
                              const generated = bottegaImages.find(c => c.themeId === theme.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={theme.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${
                                    generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'
                                  } ${isCurrent ? 'ring-1 ring-emerald-400' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={theme.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button
                                            onClick={() => downloadImage(generated.view.url, `VPPA_Quiet_${theme.id}_${item.id}.png`)}
                                            className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"
                                          >
                                            <Download className="w-3 h-3" />
                                            Save
                                          </button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
                                        <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
                                        <div className="w-8 h-0.5 rounded-full bg-emerald-100 overflow-hidden">
                                          <div className="h-full bg-emerald-500 rounded-full shimmer" style={{ width: '60%' }} />
                                        </div>
                                      </div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" />
                                      </div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                                          <ImageIcon className="w-3 h-3 text-gray-300" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${
                                    generated ? 'text-gray-500' : isCurrent ? 'text-emerald-700' : 'text-gray-300'
                                  }`}>{theme.label}</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'saintlaurent' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedThemes = item.selectedSaintLaurentThemes || [];
                const hasSelection = selectedThemes.length > 0;
                const isItemGenerating = item.saintLaurentStatus === 'generating';
                const slImages = item.saintLaurentImages || [];
                return (
                  <div key={`sl-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Rock Noir</span>
                          {item.uploadMode === 'printed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>
                          )}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedThemes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · Saint Laurent monochrome cinema · logo only</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-gray-700 focus-within:ring-2 focus-within:ring-gray-200 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.price || ''}
                            onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))}
                            placeholder="Price"
                            className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none"
                          />
                        </div>
                        <button
                          onClick={() => generateSaintLaurentImages(item.id)}
                          disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingSaintLaurent}
                          className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-black to-gray-800 hover:from-black hover:to-gray-900 text-white shadow-sm"
                        >
                          {isItemGenerating ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" />{item.saintLaurentProgress ? `${item.saintLaurentProgress.current + 1}/${item.saintLaurentProgress.total}` : 'Creating'}</>
                          ) : (
                            <><Sparkles className="w-3.5 h-3.5" />Generate {hasSelection ? `(${selectedThemes.length})` : ''}</>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Noir Themes (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedSaintLaurentThemes: SAINTLAURENT_THEMES.map(p => p.id) } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Select all
                          </button>
                          <span className="text-gray-200">·</span>
                          <button
                            onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedSaintLaurentThemes: [] } : i))}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {SAINTLAURENT_THEMES.map(theme => {
                          const isSelected = selectedThemes.includes(theme.id);
                          return (
                            <button
                              key={theme.id}
                              onClick={() => toggleSaintLaurentTheme(item.id, theme.id)}
                              disabled={isItemGenerating}
                              className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${
                                isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-700'
                              }`}
                            >
                              <div className="w-full aspect-square rounded-md mb-1.5 border" style={{ backgroundColor: theme.backgroundHex, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }} />
                              <p className="text-[10px] font-semibold truncate">{theme.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{theme.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-5">
                      {slImages.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-gray-300" />
                          </div>
                          <p className="text-xs text-gray-400">Select one or more noir themes, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = SAINTLAURENT_THEMES.filter(p => selectedThemes.includes(p.id));
                            const total = isItemGenerating && item.saintLaurentProgress ? item.saintLaurentProgress.total : selectedDefs.length;
                            const currentIdx = item.saintLaurentProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, slImages.length)).map((theme, idx) => {
                              const generated = slImages.find(c => c.themeId === theme.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={theme.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${
                                    generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'
                                  } ${isCurrent ? 'ring-1 ring-gray-700' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={theme.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button
                                            onClick={() => downloadImage(generated.view.url, `VPPA_Noir_${theme.id}_${item.id}.png`)}
                                            className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"
                                          >
                                            <Download className="w-3 h-3" />
                                            Save
                                          </button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
                                        <Loader2 className="w-5 h-5 animate-spin text-gray-800" />
                                        <div className="w-8 h-0.5 rounded-full bg-gray-200 overflow-hidden">
                                          <div className="h-full bg-gray-800 rounded-full shimmer" style={{ width: '60%' }} />
                                        </div>
                                      </div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" />
                                      </div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
                                          <ImageIcon className="w-3 h-3 text-gray-300" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${
                                    generated ? 'text-gray-500' : isCurrent ? 'text-gray-800' : 'text-gray-300'
                                  }`}>{theme.label}</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'prada' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedThemes = item.selectedPradaThemes || [];
                const hasSelection = selectedThemes.length > 0;
                const isItemGenerating = item.pradaStatus === 'generating';
                const images = item.pradaImages || [];
                return (
                  <div key={`prada-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Conceptual</span>
                          {item.uploadMode === 'printed' && (<span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>)}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedThemes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · Prada / Miu Miu avant-garde · logo only</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-lime-500 focus-within:ring-2 focus-within:ring-lime-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input type="text" inputMode="decimal" value={item.price || ''} onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))} placeholder="Price" className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none" />
                        </div>
                        <button onClick={() => generatePradaImages(item.id)} disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingPrada} className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-lime-500 to-yellow-500 hover:from-lime-600 hover:to-yellow-600 text-white shadow-sm">
                          {isItemGenerating ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />{item.pradaProgress ? `${item.pradaProgress.current + 1}/${item.pradaProgress.total}` : 'Creating'}</>) : (<><Sparkles className="w-3.5 h-3.5" />Generate {hasSelection ? `(${selectedThemes.length})` : ''}</>)}
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Conceptual Themes (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedPradaThemes: PRADA_THEMES.map(p => p.id) } : i))} className="text-gray-400 hover:text-gray-600">Select all</button>
                          <span className="text-gray-200">·</span>
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedPradaThemes: [] } : i))} className="text-gray-400 hover:text-gray-600">Clear</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {PRADA_THEMES.map(theme => {
                          const isSelected = selectedThemes.includes(theme.id);
                          return (
                            <button key={theme.id} onClick={() => togglePradaTheme(item.id, theme.id)} disabled={isItemGenerating} className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-lime-400'}`}>
                              <div className="w-full aspect-square rounded-md mb-1.5 border" style={{ backgroundColor: theme.backgroundHex, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }} />
                              <p className="text-[10px] font-semibold truncate">{theme.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{theme.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="p-5">
                      {images.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center"><Layers className="w-5 h-5 text-gray-300" /></div>
                          <p className="text-xs text-gray-400">Select one or more conceptual themes, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = PRADA_THEMES.filter(p => selectedThemes.includes(p.id));
                            const total = isItemGenerating && item.pradaProgress ? item.pradaProgress.total : selectedDefs.length;
                            const currentIdx = item.pradaProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, images.length)).map((theme, idx) => {
                              const generated = images.find(c => c.themeId === theme.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={theme.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'} ${isCurrent ? 'ring-1 ring-lime-400' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={theme.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button onClick={() => downloadImage(generated.view.url, `VPPA_Conceptual_${theme.id}_${item.id}.png`)} className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"><Download className="w-3 h-3" />Save</button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5"><Loader2 className="w-5 h-5 animate-spin text-lime-600" /><div className="w-8 h-0.5 rounded-full bg-lime-100 overflow-hidden"><div className="h-full bg-lime-500 rounded-full shimmer" style={{ width: '60%' }} /></div></div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" /></div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center"><ImageIcon className="w-3 h-3 text-gray-300" /></div></div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${generated ? 'text-gray-500' : isCurrent ? 'text-lime-700' : 'text-gray-300'}`}>{theme.label}</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'dior' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedThemes = item.selectedDiorThemes || [];
                const hasSelection = selectedThemes.length > 0;
                const isItemGenerating = item.diorStatus === 'generating';
                const images = item.diorImages || [];
                return (
                  <div key={`dior-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Couture Romance</span>
                          {item.uploadMode === 'printed' && (<span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>)}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedThemes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · Dior haute couture painterly · logo only</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-rose-300 focus-within:ring-2 focus-within:ring-rose-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input type="text" inputMode="decimal" value={item.price || ''} onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))} placeholder="Price" className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none" />
                        </div>
                        <button onClick={() => generateDiorImages(item.id)} disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingDior} className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-rose-300 to-pink-400 hover:from-rose-400 hover:to-pink-500 text-white shadow-sm">
                          {isItemGenerating ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />{item.diorProgress ? `${item.diorProgress.current + 1}/${item.diorProgress.total}` : 'Creating'}</>) : (<><Sparkles className="w-3.5 h-3.5" />Generate {hasSelection ? `(${selectedThemes.length})` : ''}</>)}
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Couture Locations (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedDiorThemes: DIOR_THEMES.map(p => p.id) } : i))} className="text-gray-400 hover:text-gray-600">Select all</button>
                          <span className="text-gray-200">·</span>
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedDiorThemes: [] } : i))} className="text-gray-400 hover:text-gray-600">Clear</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {DIOR_THEMES.map(theme => {
                          const isSelected = selectedThemes.includes(theme.id);
                          return (
                            <button key={theme.id} onClick={() => toggleDiorTheme(item.id, theme.id)} disabled={isItemGenerating} className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'}`}>
                              <div className="w-full aspect-square rounded-md mb-1.5 border" style={{ backgroundColor: theme.paletteHex, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }} />
                              <p className="text-[10px] font-semibold truncate">{theme.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{theme.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="p-5">
                      {images.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center"><Sparkles className="w-5 h-5 text-gray-300" /></div>
                          <p className="text-xs text-gray-400">Select one or more couture locations, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = DIOR_THEMES.filter(p => selectedThemes.includes(p.id));
                            const total = isItemGenerating && item.diorProgress ? item.diorProgress.total : selectedDefs.length;
                            const currentIdx = item.diorProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, images.length)).map((theme, idx) => {
                              const generated = images.find(c => c.themeId === theme.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={theme.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'} ${isCurrent ? 'ring-1 ring-rose-300' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={theme.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button onClick={() => downloadImage(generated.view.url, `VPPA_Couture_${theme.id}_${item.id}.png`)} className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"><Download className="w-3 h-3" />Save</button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5"><Loader2 className="w-5 h-5 animate-spin text-rose-400" /><div className="w-8 h-0.5 rounded-full bg-rose-100 overflow-hidden"><div className="h-full bg-rose-400 rounded-full shimmer" style={{ width: '60%' }} /></div></div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" /></div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center"><ImageIcon className="w-3 h-3 text-gray-300" /></div></div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${generated ? 'text-gray-500' : isCurrent ? 'text-rose-500' : 'text-gray-300'}`}>{theme.label}</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'jacquemus' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedThemes = item.selectedJacquemusThemes || [];
                const hasSelection = selectedThemes.length > 0;
                const isItemGenerating = item.jacquemusStatus === 'generating';
                const images = item.jacquemusImages || [];
                return (
                  <div key={`jacquemus-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Riviera</span>
                          {item.uploadMode === 'printed' && (<span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>)}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedThemes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · Jacquemus south of France · logo only</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-yellow-400 focus-within:ring-2 focus-within:ring-yellow-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input type="text" inputMode="decimal" value={item.price || ''} onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))} placeholder="Price" className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none" />
                        </div>
                        <button onClick={() => generateJacquemusImages(item.id)} disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingJacquemus} className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-yellow-400 to-amber-400 hover:from-yellow-500 hover:to-amber-500 text-white shadow-sm">
                          {isItemGenerating ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />{item.jacquemusProgress ? `${item.jacquemusProgress.current + 1}/${item.jacquemusProgress.total}` : 'Creating'}</>) : (<><Sparkles className="w-3.5 h-3.5" />Generate {hasSelection ? `(${selectedThemes.length})` : ''}</>)}
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Riviera Locations (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedJacquemusThemes: JACQUEMUS_THEMES.map(p => p.id) } : i))} className="text-gray-400 hover:text-gray-600">Select all</button>
                          <span className="text-gray-200">·</span>
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedJacquemusThemes: [] } : i))} className="text-gray-400 hover:text-gray-600">Clear</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {JACQUEMUS_THEMES.map(theme => {
                          const isSelected = selectedThemes.includes(theme.id);
                          return (
                            <button key={theme.id} onClick={() => toggleJacquemusTheme(item.id, theme.id)} disabled={isItemGenerating} className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-yellow-400'}`}>
                              <div className="w-full aspect-square rounded-md mb-1.5 border" style={{ backgroundColor: theme.paletteHex, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }} />
                              <p className="text-[10px] font-semibold truncate">{theme.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{theme.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="p-5">
                      {images.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center"><Camera className="w-5 h-5 text-gray-300" /></div>
                          <p className="text-xs text-gray-400">Select one or more riviera locations, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = JACQUEMUS_THEMES.filter(p => selectedThemes.includes(p.id));
                            const total = isItemGenerating && item.jacquemusProgress ? item.jacquemusProgress.total : selectedDefs.length;
                            const currentIdx = item.jacquemusProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, images.length)).map((theme, idx) => {
                              const generated = images.find(c => c.themeId === theme.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={theme.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'} ${isCurrent ? 'ring-1 ring-yellow-400' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={theme.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button onClick={() => downloadImage(generated.view.url, `VPPA_Riviera_${theme.id}_${item.id}.png`)} className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"><Download className="w-3 h-3" />Save</button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5"><Loader2 className="w-5 h-5 animate-spin text-yellow-500" /><div className="w-8 h-0.5 rounded-full bg-yellow-100 overflow-hidden"><div className="h-full bg-yellow-500 rounded-full shimmer" style={{ width: '60%' }} /></div></div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" /></div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center"><ImageIcon className="w-3 h-3 text-gray-300" /></div></div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${generated ? 'text-gray-500' : isCurrent ? 'text-yellow-600' : 'text-gray-300'}`}>{theme.label}</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'burberry' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedThemes = item.selectedBurberryThemes || [];
                const hasSelection = selectedThemes.length > 0;
                const isItemGenerating = item.burberryStatus === 'generating';
                const images = item.burberryImages || [];
                return (
                  <div key={`burberry-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">British Heritage</span>
                          {item.uploadMode === 'printed' && (<span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>)}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedThemes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · Burberry trench-coat heritage · logo only</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-stone-500 focus-within:ring-2 focus-within:ring-stone-100 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input type="text" inputMode="decimal" value={item.price || ''} onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))} placeholder="Price" className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none" />
                        </div>
                        <button onClick={() => generateBurberryImages(item.id)} disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingBurberry} className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-stone-600 to-stone-700 hover:from-stone-700 hover:to-stone-800 text-white shadow-sm">
                          {isItemGenerating ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />{item.burberryProgress ? `${item.burberryProgress.current + 1}/${item.burberryProgress.total}` : 'Creating'}</>) : (<><Sparkles className="w-3.5 h-3.5" />Generate {hasSelection ? `(${selectedThemes.length})` : ''}</>)}
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select British Locations (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedBurberryThemes: BURBERRY_THEMES.map(p => p.id) } : i))} className="text-gray-400 hover:text-gray-600">Select all</button>
                          <span className="text-gray-200">·</span>
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedBurberryThemes: [] } : i))} className="text-gray-400 hover:text-gray-600">Clear</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {BURBERRY_THEMES.map(theme => {
                          const isSelected = selectedThemes.includes(theme.id);
                          return (
                            <button key={theme.id} onClick={() => toggleBurberryTheme(item.id, theme.id)} disabled={isItemGenerating} className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-stone-500'}`}>
                              <div className="w-full aspect-square rounded-md mb-1.5 border" style={{ backgroundColor: theme.paletteHex, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }} />
                              <p className="text-[10px] font-semibold truncate">{theme.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{theme.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="p-5">
                      {images.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center"><Camera className="w-5 h-5 text-gray-300" /></div>
                          <p className="text-xs text-gray-400">Select one or more British landscapes, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = BURBERRY_THEMES.filter(p => selectedThemes.includes(p.id));
                            const total = isItemGenerating && item.burberryProgress ? item.burberryProgress.total : selectedDefs.length;
                            const currentIdx = item.burberryProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, images.length)).map((theme, idx) => {
                              const generated = images.find(c => c.themeId === theme.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={theme.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'} ${isCurrent ? 'ring-1 ring-stone-500' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={theme.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button onClick={() => downloadImage(generated.view.url, `VPPA_Heritage_UK_${theme.id}_${item.id}.png`)} className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"><Download className="w-3 h-3" />Save</button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5"><Loader2 className="w-5 h-5 animate-spin text-stone-700" /><div className="w-8 h-0.5 rounded-full bg-stone-200 overflow-hidden"><div className="h-full bg-stone-600 rounded-full shimmer" style={{ width: '60%' }} /></div></div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" /></div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center"><ImageIcon className="w-3 h-3 text-gray-300" /></div></div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${generated ? 'text-gray-500' : isCurrent ? 'text-stone-700' : 'text-gray-300'}`}>{theme.label}</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}

            {campaignTab === 'balenciaga' && (
            <div className="space-y-6">
              {apparelItems.map((item) => {
                const selectedThemes = item.selectedBalenciagaThemes || [];
                const hasSelection = selectedThemes.length > 0;
                const isItemGenerating = item.balenciagaStatus === 'generating';
                const images = item.balenciagaImages || [];
                return (
                  <div key={`balenciaga-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-11 h-11 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Dystopian</span>
                          {item.uploadMode === 'printed' && (<span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>)}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{selectedThemes.length} selected</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''} · Balenciaga / Demna brutalist · logo only</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 focus-within:border-zinc-700 focus-within:ring-2 focus-within:ring-zinc-200 transition-all">
                          <span className="text-xs font-semibold text-gray-400">₹</span>
                          <input type="text" inputMode="decimal" value={item.price || ''} onChange={(e) => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, price: e.target.value.replace(/[^\d.,]/g, '') } : i))} placeholder="Price" className="w-20 text-xs text-gray-700 placeholder:text-gray-300 bg-transparent focus:outline-none" />
                        </div>
                        <button onClick={() => generateBalenciagaImages(item.id)} disabled={!hasSelection || isItemGenerating || isGenerating || isGeneratingBalenciaga} className="px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-zinc-700 to-zinc-900 hover:from-zinc-800 hover:to-black text-white shadow-sm">
                          {isItemGenerating ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" />{item.balenciagaProgress ? `${item.balenciagaProgress.current + 1}/${item.balenciagaProgress.total}` : 'Creating'}</>) : (<><Sparkles className="w-3.5 h-3.5" />Generate {hasSelection ? `(${selectedThemes.length})` : ''}</>)}
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Select Dystopian Environments (multiple)</label>
                        <div className="flex gap-2 text-[10px]">
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedBalenciagaThemes: BALENCIAGA_THEMES.map(p => p.id) } : i))} className="text-gray-400 hover:text-gray-600">Select all</button>
                          <span className="text-gray-200">·</span>
                          <button onClick={() => setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, selectedBalenciagaThemes: [] } : i))} className="text-gray-400 hover:text-gray-600">Clear</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {BALENCIAGA_THEMES.map(theme => {
                          const isSelected = selectedThemes.includes(theme.id);
                          return (
                            <button key={theme.id} onClick={() => toggleBalenciagaTheme(item.id, theme.id)} disabled={isItemGenerating} className={`p-2 rounded-lg transition-all duration-200 border disabled:opacity-50 text-left ${isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-zinc-700'}`}>
                              <div className="w-full aspect-square rounded-md mb-1.5 border" style={{ backgroundColor: theme.paletteHex, borderColor: isSelected ? 'rgba(255,255,255,0.2)' : '#e5e7eb' }} />
                              <p className="text-[10px] font-semibold truncate">{theme.label}</p>
                              <p className={`text-[8px] truncate ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>{theme.mood}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="p-5">
                      {images.length === 0 && !isItemGenerating ? (
                        <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
                          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center"><Zap className="w-5 h-5 text-gray-300" /></div>
                          <p className="text-xs text-gray-400">Select one or more dystopian environments, then hit Generate</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {(() => {
                            const selectedDefs = BALENCIAGA_THEMES.filter(p => selectedThemes.includes(p.id));
                            const total = isItemGenerating && item.balenciagaProgress ? item.balenciagaProgress.total : selectedDefs.length;
                            const currentIdx = item.balenciagaProgress?.current ?? -1;
                            return selectedDefs.slice(0, Math.max(total, images.length)).map((theme, idx) => {
                              const generated = images.find(c => c.themeId === theme.id);
                              const isCurrent = isItemGenerating && idx === currentIdx;
                              const isWaiting = isItemGenerating && idx > currentIdx && !generated;
                              return (
                                <div key={theme.id} className="group">
                                  <div className={`aspect-square rounded-xl overflow-hidden relative border transition-all ${generated ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 bg-gray-50/50'} ${isCurrent ? 'ring-1 ring-zinc-700' : ''}`}>
                                    {generated ? (
                                      <>
                                        <img src={generated.view.url} alt={theme.label} onClick={() => openGallery(item, generated.view.url)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2">
                                          <button onClick={() => downloadImage(generated.view.url, `VPPA_Dystopia_${theme.id}_${item.id}.png`)} className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 shadow-sm"><Download className="w-3 h-3" />Save</button>
                                        </div>
                                      </>
                                    ) : isCurrent ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5"><Loader2 className="w-5 h-5 animate-spin text-zinc-800" /><div className="w-8 h-0.5 rounded-full bg-zinc-200 overflow-hidden"><div className="h-full bg-zinc-800 rounded-full shimmer" style={{ width: '60%' }} /></div></div>
                                    ) : isWaiting ? (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-gray-200 animate-pulse" /></div>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center"><ImageIcon className="w-3 h-3 text-gray-300" /></div></div>
                                    )}
                                  </div>
                                  <p className={`text-[10px] mt-1.5 text-center font-medium truncate ${generated ? 'text-gray-500' : isCurrent ? 'text-zinc-800' : 'text-gray-300'}`}>{theme.label}</p>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </motion.section>
        )}
      </main>

      <AnimatePresence>
        {galleryState && activeGalleryItem && activeGalleryImages.length > 0 && (
          <GalleryLightbox
            images={activeGalleryImages}
            startIndex={galleryState.startIndex}
            itemId={activeGalleryItem.id}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onDownload={downloadImage}
            onClose={() => setGalleryState(null)}
            onNotify={(msg) => showToast('info', msg)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-[100] max-w-md"
          >
            <div className={`rounded-2xl shadow-2xl px-5 py-4 flex items-start gap-3 border backdrop-blur-xl ${
              toast.kind === 'error'
                ? 'bg-red-50/95 border-red-200 text-red-800'
                : 'bg-indigo-50/95 border-indigo-200 text-indigo-800'
            }`}>
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold mb-0.5">{toast.kind === 'error' ? 'Generation failed' : 'Heads up'}</p>
                <p className="text-xs leading-relaxed break-words">{toast.message}</p>
              </div>
              <button
                onClick={() => setToast(null)}
                className="p-1 rounded-md hover:bg-black/5 transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
