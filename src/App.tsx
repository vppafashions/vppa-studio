/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Upload, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle, Sparkles, Trash2, Plus, X, Download, Camera, Layers, Zap, RotateCcw, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini API
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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

const MODEL_PROMPTS: Record<Gender, { label: string; views: [string, string] }> = {
  women: {
    label: 'Women',
    views: [
      "A beautiful Indian woman with elegant features, medium-brown skin, styled dark hair, wearing this exact product. She is standing confidently facing the camera in a high-end fashion editorial pose. Clean, minimal studio background. Professional fashion photography with soft beauty lighting. Full body or three-quarter shot depending on the product. She looks sophisticated and modern.",
      "The same beautiful Indian woman now photographed from a different angle -- a candid side-profile or walking pose that shows how the product looks in motion. Natural, relaxed posture. Same clean studio background. Soft editorial lighting. The focus is on how the product drapes, fits, and moves on the body."
    ]
  },
  men: {
    label: 'Men',
    views: [
      "A handsome Indian man with sharp features, medium-brown skin, well-groomed hair, wearing this exact product. He is standing confidently facing the camera with a strong editorial pose. Clean, minimal studio background. Professional fashion photography with soft lighting. Full body or three-quarter shot depending on the product. He looks refined and modern.",
      "The same handsome Indian man now photographed from a different angle -- a candid side-profile or walking pose that shows how the product looks in motion. Natural, confident posture. Same clean studio background. Soft editorial lighting. The focus is on how the product fits and drapes on the body."
    ]
  }
};

const PRODUCT_VIEW_TYPES = [
  "Hero Front",
  "Three-Quarter",
  "Detail Close-up",
  "Flat Lay"
];

const PRODUCT_VIEW_PROMPTS = [
  "Front-facing product shot. Product perfectly centered on a pure white seamless background. Soft, even studio lighting with no harsh shadows. Clean, minimal, high-end ecommerce catalog style. The product fills about 80% of the frame.",
  "Three-quarter angle product shot, slightly rotated to show depth and dimension. Pure white seamless background. Soft diffused studio lighting. Professional ecommerce photography. Product is the only element in frame.",
  "Close-up detail shot focusing on the most distinctive feature -- texture, hardware, stitching, or material quality. Shallow depth of field. White background. Macro product photography style.",
  "Top-down flat lay on a pure white surface. Product neatly arranged, perfectly symmetrical. Overhead studio lighting casting a very subtle, soft shadow. Clean catalog photography."
];

const getViewTypes = (gender: Gender) => [
  `On Model (${MODEL_PROMPTS[gender].label}) - Front`,
  `On Model (${MODEL_PROMPTS[gender].label}) - Lifestyle`,
  ...PRODUCT_VIEW_TYPES
];

const getViewPrompts = (gender: Gender) => [
  ...MODEL_PROMPTS[gender].views,
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCampaigns, setIsGeneratingCampaigns] = useState(false);
  const [isGeneratingPress, setIsGeneratingPress] = useState(false);
  const [isGeneratingEditorial, setIsGeneratingEditorial] = useState(false);
  const [isGeneratingHeritage, setIsGeneratingHeritage] = useState(false);
  const [campaignTab, setCampaignTab] = useState<'scenes' | 'press' | 'editorial' | 'heritage'>('scenes');

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
        const currentSettingsKey = `${selectedStyle.id}_${selectedGender}`;
        const settingsChanged = item.generatedStyleId && item.generatedStyleId !== currentSettingsKey;
        if (item.status === 'completed' && !settingsChanged) continue;

        if (settingsChanged) {
          setApparelItems(prev => prev.map(f => f.id === item.id ? { ...f, views: [], status: 'idle', generatedStyleId: undefined } : f));
        }

        const viewTypes = getViewTypes(selectedGender);
        const viewPrompts = getViewPrompts(selectedGender);

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
        const generatedViews: GeneratedView[] = [];

        for (let v = 0; v < viewPrompts.length; v++) {
          if (existingViews[v]) {
            generatedViews.push(existingViews[v]);
            continue;
          }

          setApparelItems(prev => prev.map(f => f.id === item.id ? { ...f, currentProcessingIndex: v } : f));

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
              ? `Generate a professional luxury fashion editorial photograph.

${viewPrompts[v]}
${analysisContext}

CRITICAL RULES:
- This must look like a real high-end fashion photograph, NOT a render or illustration.
- The model must be wearing THIS EXACT product from the reference images -- same colors, same materials, same details.${printedRule}
- BACKGROUND: ${selectedStyle.prompt}. Clean studio setting.
- Professional fashion photography lighting -- soft, flattering beauty lighting.
- The product must be clearly visible and recognizable on the model.
- ${logoBase64 ? 'The provided logo should appear subtly as a small brand mark in the bottom corner of the image, NOT on the product.' : 'No additional branding.'}
- Square 1:1 composition.

Also provide a one-sentence product description.`
              : `Generate a professional luxury ecommerce product photograph.

SHOT TYPE: ${viewPrompts[v]}

BACKGROUND: ${selectedStyle.prompt}. Clean, seamless, no textures or patterns on the background.
${analysisContext}

CRITICAL RULES:
- This must look like a real photograph taken in a professional studio, NOT a render or illustration.
- Reproduce the EXACT product from the reference images -- same colors, same materials, same details, same branding.${printedRule}
- Soft, diffused studio lighting. No harsh shadows. Subtle contact shadow only.
- Product must be clean, crisp, and perfectly presented.
- NOTHING else in the frame -- no props, no text, no watermarks, no mannequins, no people.
- ${logoBase64 ? 'The provided logo should appear subtly as a small brand mark in the bottom corner of the image, NOT on the product.' : 'No additional branding.'}
- Square 1:1 composition.

Also provide a one-sentence product description.`,
          });

          try {
            const response = await callWithRetry(() => genAI.models.generateContent({
              model: 'gemini-3.1-flash-image-preview',
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
              }
            }));

            let url = '';
            let desc = '';
            for (const part of response.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData) url = `data:image/png;base64,${part.inlineData.data}`;
              else if (part.text) desc = part.text;
            }

            if (url) {
              generatedViews.push({
                url,
                type: viewTypes[v],
                description: desc || `Luxury ${viewTypes[v]} shot.`
              });
              
              setApparelItems(prev => prev.map(f => f.id === item.id ? { ...f, views: [...generatedViews] } : f));
            }
            
            await sleep(1000);
            
          } catch (viewError) {
            console.error(`Failed to generate view ${v}:`, viewError);
          }
        }

        setApparelItems(prev => prev.map(f => f.id === item.id ? { 
          ...f, 
          status: generatedViews.length > 0 ? 'completed' : 'error',
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
          ? "a single young Indian woman, age 20-26, elegant features, medium-brown skin, styled dark hair, confident expression"
          : "a single young Indian man, age 20-26, sharp features, medium-brown skin, well-groomed hair, confident expression";

        const generatedCampaigns: { objectId: string; objectLabel: string; view: GeneratedView }[] = [];

        for (let si = 0; si < scenesToGenerate.length; si++) {
          const scene = scenesToGenerate[si];

          setApparelItems(prev => prev.map(i => i.id === item.id ? {
            ...i,
            campaignProgress: { current: si, total: scenesToGenerate.length }
          } : i));

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
            const response = await genAI.models.generateContent({
              model: 'gemini-3.1-flash-image-preview',
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
              }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              generatedCampaigns.push({
                objectId: scene.id,
                objectLabel: scene.label,
                view: { url, type: scene.label, description: desc || `VPPA x ${scene.label}` }
              });
              setApparelItems(prev => prev.map(i => i.id === item.id ? {
                ...i,
                campaignImages: [...generatedCampaigns]
              } : i));
            }

            await sleep(1000);
          } catch (err) {
            console.error(`Campaign generation failed for ${scene.label}:`, err);
          }
        }

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          campaignStatus: generatedCampaigns.length > 0 ? 'completed' : 'error',
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

        const generatedPress: { paletteId: string; paletteLabel: string; view: GeneratedView }[] = [];

        for (let pi = 0; pi < palettesToGenerate.length; pi++) {
          const palette = palettesToGenerate[pi];

          setApparelItems(prev => prev.map(i => i.id === item.id ? {
            ...i,
            pressProgress: { current: pi, total: palettesToGenerate.length }
          } : i));

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
            const response = await genAI.models.generateContent({
              model: 'gemini-3.1-flash-image-preview',
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
              }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              generatedPress.push({
                paletteId: palette.id,
                paletteLabel: palette.label,
                view: { url, type: palette.label, description: desc || `VPPA press · ${palette.label}` }
              });
              setApparelItems(prev => prev.map(i => i.id === item.id ? {
                ...i,
                pressImages: [...generatedPress]
              } : i));
            }

            await sleep(1000);
          } catch (err) {
            console.error(`Press generation failed for ${palette.label}:`, err);
          }
        }

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          pressStatus: generatedPress.length > 0 ? 'completed' : 'error',
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
          ? "a single young Indian woman, age 20-26, elegant features, medium-brown skin, styled dark hair, natural beauty, understated confidence"
          : "a single young Indian man, age 20-26, sharp features, medium-brown skin, well-groomed hair, quiet confidence";

        const generatedEditorial: { settingId: string; settingLabel: string; view: GeneratedView }[] = [];

        for (let si = 0; si < settingsToGenerate.length; si++) {
          const setting = settingsToGenerate[si];

          setApparelItems(prev => prev.map(i => i.id === item.id ? {
            ...i,
            editorialProgress: { current: si, total: settingsToGenerate.length }
          } : i));

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
            const response = await genAI.models.generateContent({
              model: 'gemini-3.1-flash-image-preview',
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
              }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              generatedEditorial.push({
                settingId: setting.id,
                settingLabel: setting.label,
                view: { url, type: setting.label, description: desc || `VPPA editorial · ${setting.label}` }
              });
              setApparelItems(prev => prev.map(i => i.id === item.id ? {
                ...i,
                editorialImages: [...generatedEditorial]
              } : i));
            }

            await sleep(1000);
          } catch (err) {
            console.error(`Editorial generation failed for ${setting.label}:`, err);
          }
        }

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          editorialStatus: generatedEditorial.length > 0 ? 'completed' : 'error',
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
          ? "a single young Indian woman, age 22-28, refined features, medium-brown skin, elegantly styled dark hair, sophisticated editorial expression"
          : "a single young Indian man, age 22-28, aristocratic features, medium-brown skin, perfectly groomed hair, sophisticated editorial expression";

        const generatedHeritage: { paletteId: string; paletteLabel: string; view: GeneratedView }[] = [];

        for (let pi = 0; pi < palettesToGenerate.length; pi++) {
          const palette = palettesToGenerate[pi];

          setApparelItems(prev => prev.map(i => i.id === item.id ? {
            ...i,
            heritageProgress: { current: pi, total: palettesToGenerate.length }
          } : i));

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
            const response = await genAI.models.generateContent({
              model: 'gemini-3.1-flash-image-preview',
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
              }
            });

            let url = '';
            let desc = '';
            for (const p of response.candidates?.[0]?.content?.parts || []) {
              if (p.inlineData) url = `data:image/png;base64,${p.inlineData.data}`;
              else if (p.text) desc = p.text;
            }

            if (url) {
              generatedHeritage.push({
                paletteId: palette.id,
                paletteLabel: palette.label,
                view: { url, type: palette.label, description: desc || `VPPA heritage · ${palette.label}` }
              });
              setApparelItems(prev => prev.map(i => i.id === item.id ? {
                ...i,
                heritageImages: [...generatedHeritage]
              } : i));
            }

            await sleep(1000);
          } catch (err) {
            console.error(`Heritage generation failed for ${palette.label}:`, err);
          }
        }

        setApparelItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          heritageStatus: generatedHeritage.length > 0 ? 'completed' : 'error',
          heritageProgress: undefined
        } : i));
      }
    } finally {
      setIsGeneratingHeritage(false);
    }
  };

  const totalViews = apparelItems.reduce((acc, i) => acc + i.views.length, 0);
  const currentViewTypes = getViewTypes(selectedGender);
  const totalExpected = apparelItems.length * currentViewTypes.length;

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
                        <img src={img.preview} alt={`Ref ${imgIdx + 1}`} className="w-full h-full object-cover" />
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
                                  <img src={view.url} alt={type} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2.5">
                                    <button
                                      onClick={() => downloadImage(view.url, `VPPA_${item.id}_${type.replace(/\s+/g, '_')}.png`)}
                                      className="w-full py-1.5 rounded-lg bg-white text-gray-700 text-[9px] font-semibold flex items-center justify-center gap-1 hover:bg-gray-50 transition-colors shadow-sm"
                                    >
                                      <Download className="w-3 h-3" />
                                      Save
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
        {apparelItems.length > 0 && (
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
                                        <img src={generated.view.url} alt={scene.label} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
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
                                        <img src={generated.view.url} alt={palette.label} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
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
                                        <img src={generated.view.url} alt={setting.label} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
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
                                        <img src={generated.view.url} alt={palette.label} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
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
          </motion.section>
        )}
      </main>
    </div>
  );
}
