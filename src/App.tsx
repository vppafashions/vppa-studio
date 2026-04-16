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
  const [uploadMode, setUploadMode] = useState<UploadMode>('standard');
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

    setApparelItems(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        images,
        views: [],
        status: 'idle',
        uploadMode: 'standard'
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

    setApparelItems(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        images: [pendingPrintedFront, backImage],
        views: [],
        status: 'idle',
        uploadMode: 'printed'
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
        <div className="glass rounded-2xl p-5 mb-8">
          <div className="flex flex-col lg:flex-row gap-5 items-start lg:items-end">
            {/* Upload */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  Upload References
                </label>
                <div className="flex rounded-md border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setUploadMode('standard')}
                    className={`px-3 py-1 text-[10px] font-medium transition-all ${
                      uploadMode === 'standard' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    onClick={() => setUploadMode('printed')}
                    className={`px-3 py-1 text-[10px] font-medium transition-all ${
                      uploadMode === 'printed' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    Printed Shirt
                  </button>
                </div>
              </div>
              {uploadMode === 'standard' ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  className="w-full py-6 rounded-xl border border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all duration-300 flex items-center justify-center gap-3 group disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-50 group-hover:bg-indigo-50 flex items-center justify-center transition-all">
                    <Plus className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm text-gray-500 group-hover:text-gray-700 font-medium transition-colors">New Apparel Item</p>
                    <p className="text-[10px] text-gray-300">Select 1-5 photos of the same garment</p>
                  </div>
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => printedFrontRef.current?.click()}
                    disabled={isGenerating || !!pendingPrintedFront}
                    className="flex-1 py-6 rounded-xl border border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all duration-300 flex flex-col items-center justify-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {pendingPrintedFront ? (
                      <>
                        <img src={pendingPrintedFront.preview} alt="Front" className="w-12 h-12 rounded-lg object-cover" />
                        <span className="text-[10px] text-emerald-500 font-medium">Front uploaded</span>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 rounded-lg bg-gray-50 group-hover:bg-indigo-50 flex items-center justify-center transition-all">
                          <Plus className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium">Front View</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => pendingPrintedFront && printedBackRef.current?.click()}
                    disabled={isGenerating || !pendingPrintedFront}
                    className="flex-1 py-6 rounded-xl border border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all duration-300 flex flex-col items-center justify-center gap-2 group disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-50 group-hover:bg-indigo-50 flex items-center justify-center transition-all">
                      <Plus className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">Back View</span>
                  </button>
                </div>
              )}
            </div>

            {/* Style Selector */}
            <div className="lg:w-[340px]">
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3 block">
                Studio Backdrop
              </label>
              <div className="grid grid-cols-3 gap-1.5">
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
      </main>
    </div>
  );
}
