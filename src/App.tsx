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
  campaignObject?: string;
  campaignImage?: GeneratedView;
  campaignStatus?: 'idle' | 'generating' | 'completed' | 'error';
}



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

  const pickCampaignObject = async (imageDataParts: { data: string; mimeType: string }[], gender: Gender): Promise<{ object: string; interaction: string }> => {
    const parts: any[] = imageDataParts.map(img => ({
      inlineData: { data: img.data, mimeType: img.mimeType }
    }));

    parts.push({
      text: `You are a streetwear campaign art director for VPPA Fashions (an apparel brand for men and women).

Look at this garment in the reference images. You need to pick ONE iconic, large, tangible fashion/lifestyle object that will be illustrated in flat white brush-pen 2D style next to a real model wearing this apparel.

Rules for picking the object:
1. It must PAIR visually and culturally with this type of garment (e.g., streetwear tee -> boombox/skateboard/sneaker; summer dress -> beach umbrella/surfboard/shopping bag; formal -> luxury handbag/perfume bottle/polaroid; hoodie -> vintage camera/record player)
2. It must be LARGE enough for a human to interact with at full scale
3. It must allow a clear, physical, mid-action interaction (holding, riding, leaning against, standing on, emerging from)
4. NO animals. NO logos. NO another piece of clothing. Pick a real tangible object.
5. The model is a ${gender === 'women' ? 'young woman' : 'young man'} - pick something that matches their energy.

Respond in EXACTLY this format (no extra text, no markdown):
OBJECT: [one line describing the physical object in detail, e.g. "a massive 80s boombox with two large round speakers, cassette deck in the center, carrying handle, antenna"]
INTERACTION: [one line describing how the model physically interacts with it, e.g. "model carries the boombox on their shoulder, one hand gripping the top handle"]`
    });

    try {
      const response = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts }
      });
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const objectMatch = text.match(/OBJECT:\s*(.+)/i);
      const interactionMatch = text.match(/INTERACTION:\s*(.+)/i);
      return {
        object: objectMatch?.[1]?.trim() || 'an oversized luxury shopping bag with rope handles',
        interaction: interactionMatch?.[1]?.trim() || 'model holds the bag by its handles in front of their body'
      };
    } catch {
      return {
        object: 'an oversized luxury shopping bag with rope handles',
        interaction: 'model holds the bag by its handles in front of their body'
      };
    }
  };

  const generateCampaigns = async (targetItemId?: string) => {
    const targets = targetItemId
      ? apparelItems.filter(i => i.id === targetItemId)
      : apparelItems;
    if (targets.length === 0) return;

    setIsGeneratingCampaigns(true);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    try {
      const logoBase64 = logo ? await fileToBase64(logo.file) : null;

      for (const item of targets) {
        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, campaignStatus: 'generating' } : i));

        const hero = item.heroColor || '#6366f1';
        const heroDark = darkenHex(hero, 20);

        const imageDataParts: { data: string; mimeType: string }[] = [];
        for (const img of item.images) {
          const base64 = await fileToBase64(img.file);
          imageDataParts.push({ data: base64, mimeType: getMimeType(img.file) });
        }

        // Step 1: AI autonomously picks the best fashion object + interaction for this garment
        const { object: pickedObject, interaction: pickedInteraction } = await pickCampaignObject(imageDataParts, selectedGender);

        setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, campaignObject: pickedObject } : i));

        const parts: any[] = imageDataParts.map(img => ({
          inlineData: { data: img.data, mimeType: img.mimeType }
        }));

        if (logoBase64) {
          parts.push({ inlineData: { data: logoBase64, mimeType: getMimeType(logo!.file) } });
        }

        const modelDescription = selectedGender === 'women'
          ? "a single young Indian woman, age 20-26, elegant features, medium-brown skin, styled dark hair, confident expression"
          : "a single young Indian man, age 20-26, sharp features, medium-brown skin, well-groomed hair, confident expression";

        const campaignPrompt = `You are a Mixed-Media Campaign Art Director creating a high-impact streetwear campaign for VPPA Fashions. Produce a single 1:1 square mixed-media campaign image combining a real photographic cutout of a model with flat white hand-drawn 2D illustration.

CANVAS & COLOR SYSTEM:
- 1:1 square format.
- Background: flat saturated ${hero} color field. Absolutely NO gradients, NO texture, NO photographic background.
- Overlay: 3-4 organic amoeba-like blob shapes in ${heroDark} (20% darker than the base). Smooth irregular edges, scattered asymmetrically, some bleeding off-frame.
- Feel is hand-painted but cleanly executed.

MODEL (REAL PHOTOGRAPHIC CUTOUT):
- ${modelDescription}.
- The model is a clean photographic cutout -- zero fringing, sharp edges.
- She/he is wearing the EXACT apparel shown in the reference images -- reproduce the garment faithfully in color, cut, prints, and details.
- Pose is active, caught mid-action. The body position must make the physical interaction with the illustrated object feel natural and real.

ILLUSTRATED OBJECT (HAND-DRAWN 2D):
- Object: ${pickedObject}.
- Drawn in pure white (#FFFFFF) only. Flat 2D illustration, brush-pen marker line quality, 3-5px line weight, slightly imperfect organic edges (hand-drawn feel, not vector-perfect). NO shading, NO gradients, flat white fill only.
- SCALE: the object must be MASSIVE -- at least 40% of canvas height. Monumental oversized scale is encouraged.
- DEPTH LAYERING is critical: parts of the object sit BEHIND the model, parts come IN FRONT of the model. The model's real hands or feet make contact at the intersection point so the scene reads as integrated, not collaged.
- INTERACTION: ${pickedInteraction}. The relationship must be instantly readable in 2 seconds. Caught mid-action, alive.

BRAND STAMP:
- One small "VPPA" wordmark naturally embedded on the surface of the illustrated object -- as if printed, engraved, or stitched -- rendered in ${heroDark}. Subtle, not dominant.
${logoBase64 ? '- Use the provided VPPA logo for the brand stamp and supporting marks, rendered in flat white line form.' : ''}

SUPPORTING ILLUSTRATION SYSTEM (all white, flat, brush-pen line style, same visual language as the hero object):
- A large VPPA logo mark in the upper-left corner, about 15% of canvas width.
- A medium VPPA mark in the opposite corner, about 10% of canvas width.
- 2-3 manga-style exclamation dash clusters near the point of contact between the model and the object.
- 2-4 curved speed/motion lines tapered at the ends, radiating from the object or the model's most active body part; some should cross behind the model and some in front for depth.
- Ground effect at the base of the scene: sparkle stars, short speed dashes, or object-specific effect (splash if cup, dust clouds if sneaker, wheel tracks if skateboard).
- 1-2 loose organic white squiggles floating near the model's torso for visual rhythm.

LIGHTING ON THE MODEL:
- Studio strobe, high-key, even and clean, 5500K neutral. No dramatic shadows on the model. Soft contact shadow at the feet at about 15% opacity.
- The photography should read as natural and real against the graphic illustrated environment.

STRICT TECH RULES:
- Exactly 3 colors in the composition: ${hero} light base, ${heroDark} darker blobs, and pure white illustration. The only additional colors permitted are the model's natural skin tones and the actual fabric colors of the garment.
- Aesthetic references: Y2K comic energy, Japanese streetwear magazine, brush marker illustration.
- Asymmetric, dynamic composition. The interaction point between the model and object is the visual center of gravity; everything else orbits around it.
- NO text. NO wordmarks beyond the small embedded VPPA stamp and logo icons already described. NO watermarks.
- Mood: the model is not posing WITH the object -- the model is IN THE MIDDLE of using it, caught mid-action.

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
          for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) url = `data:image/png;base64,${part.inlineData.data}`;
            else if (part.text) desc = part.text;
          }

          if (url) {
            setApparelItems(prev => prev.map(i => i.id === item.id ? {
              ...i,
              campaignImage: { url, type: 'Campaign', description: desc || 'VPPA brand campaign' },
              campaignStatus: 'completed'
            } : i));
          } else {
            setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, campaignStatus: 'error' } : i));
          }

          await sleep(1000);
        } catch (err) {
          console.error('Campaign generation failed:', err);
          setApparelItems(prev => prev.map(i => i.id === item.id ? { ...i, campaignStatus: 'error' } : i));
        }
      }
    } finally {
      setIsGeneratingCampaigns(false);
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
                <p className="text-sm text-gray-400">Mixed-media streetwear posters -- real model photography meets hand-drawn 2D illustration</p>
              </div>
              <button
                onClick={() => generateCampaigns()}
                disabled={apparelItems.length === 0 || isGeneratingCampaigns || isGenerating}
                className="px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-fuchsia-500 to-rose-500 hover:from-fuchsia-600 hover:to-rose-600 text-white shadow-md shadow-fuchsia-500/20"
              >
                {isGeneratingCampaigns ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate All Campaigns
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {apparelItems.map((item) => {
                const hero = item.heroColor || '#6366f1';
                const heroDark = darkenHex(hero, 20);
                return (
                  <div key={`campaign-${item.id}`} className="glass rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                      <img src={item.images[0].preview} alt="ref" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 truncate">Campaign Poster</span>
                          {item.uploadMode === 'printed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">Printed</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400">{item.images.length} reference{item.images.length > 1 ? 's' : ''}</p>
                      </div>
                      {item.campaignStatus === 'generating' && (
                        <span className="text-[10px] text-fuchsia-500 flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Creating
                        </span>
                      )}
                      {item.campaignStatus === 'completed' && (
                        <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </span>
                      )}
                      {item.campaignStatus === 'error' && (
                        <span className="text-[10px] text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                    </div>

                    <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                      <div>
                        <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 block">Hero Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={hero}
                            onChange={(e) => updateCampaignField(item.id, 'heroColor', e.target.value)}
                            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                          />
                          <div className="flex-1 flex items-center gap-2 px-2 py-2 rounded-lg bg-white border border-gray-200">
                            <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: hero }} />
                            <span className="text-[11px] font-mono text-gray-600 uppercase">{hero}</span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="w-4 h-4 rounded-sm border border-gray-200" style={{ backgroundColor: hero }} title="Base" />
                            <div className="w-4 h-4 rounded-sm border border-gray-200" style={{ backgroundColor: heroDark }} title="Blob (20% darker)" />
                          </div>
                        </div>
                        <p className="text-[9px] text-gray-300 mt-1.5">Auto-detected from apparel</p>
                      </div>
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-fuchsia-50/60 border border-fuchsia-100">
                        <Sparkles className="w-3.5 h-3.5 text-fuchsia-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-fuchsia-700 uppercase tracking-wider">AI Picks the Prop</p>
                          {item.campaignObject ? (
                            <p className="text-[11px] text-gray-600 mt-0.5 leading-snug line-clamp-2">{item.campaignObject}</p>
                          ) : (
                            <p className="text-[11px] text-gray-400 mt-0.5">Will be chosen automatically based on your apparel + model gender</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="aspect-square rounded-xl overflow-hidden relative border border-gray-200 group" style={{ backgroundColor: item.campaignImage ? 'transparent' : hero + '20' }}>
                        {item.campaignImage ? (
                          <>
                            <img src={item.campaignImage.url} alt="Campaign" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-center p-4 gap-2">
                              <button
                                onClick={() => downloadImage(item.campaignImage!.url, `VPPA_Campaign_${item.id}.png`)}
                                className="px-4 py-2 rounded-lg bg-white text-gray-800 text-xs font-semibold flex items-center gap-1.5 hover:bg-gray-50 shadow-sm"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Save
                              </button>
                              <button
                                onClick={() => generateCampaigns(item.id)}
                                disabled={isGeneratingCampaigns}
                                className="px-4 py-2 rounded-lg bg-fuchsia-500 text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-fuchsia-600 shadow-sm disabled:opacity-60"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Regenerate
                              </button>
                            </div>
                          </>
                        ) : item.campaignStatus === 'generating' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-fuchsia-500" />
                            <p className="text-[10px] text-fuchsia-600 font-medium uppercase tracking-wider">Composing campaign...</p>
                            <div className="w-24 h-0.5 rounded-full bg-fuchsia-100 overflow-hidden">
                              <div className="h-full bg-fuchsia-400 rounded-full shimmer" style={{ width: '60%' }} />
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                            <div className="w-12 h-12 rounded-xl bg-white/70 flex items-center justify-center shadow-sm">
                              <Sparkles className="w-6 h-6" style={{ color: heroDark }} />
                            </div>
                            <p className="text-xs font-medium" style={{ color: heroDark }}>Ready to generate</p>
                            <button
                              onClick={() => generateCampaigns(item.id)}
                              disabled={isGeneratingCampaigns || isGenerating}
                              className="mt-1 px-4 py-2 rounded-lg bg-white/90 border border-gray-200 text-[11px] font-semibold text-gray-700 hover:bg-white flex items-center gap-1.5 disabled:opacity-40"
                            >
                              <Sparkles className="w-3 h-3" />
                              Create Poster
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>
        )}
      </main>
    </div>
  );
}
