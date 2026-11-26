import type {
  SlideTheme,
  VisualMotif,
  LayoutArchetype,
  SlideThemeId,
  ThemeCategory,
  ThemeMode,
} from '../types/themes';

export interface ExtractedThemeResult {
  name: string;
  tagline: string;
  category: ThemeCategory;
  mode: ThemeMode;
  visualMotif: VisualMotif;
  layoutArchetype: LayoutArchetype;
  headerStamp: string;
  canvasBg: string;
  cardBg: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  previewKpis?: Array<{ value: string; label: string; sub?: string }>;
}

const STORAGE_KEY = 'scholar_os_custom_slide_themes';

const HEX_COLOUR = /^#[0-9a-f]{3,8}$/i;

/** A stored entry that can be shown and applied: an id, a name and the three colours as hex. */
function isUsableTheme(v: unknown): v is SlideTheme {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === 'string' && t.id !== '' &&
    typeof t.name === 'string' &&
    [t.canvasBg, t.cardBg, t.accent].every((c) => typeof c === 'string' && HEX_COLOUR.test(c))
  );
}

/**
 * Retrieves all user-created themes saved to localStorage. Anything in storage that is not a usable
 * theme (a damaged save, an older format, a hand edit) is left out instead of breaking the library.
 */
export function getStoredCustomThemes(): SlideTheme[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isUsableTheme) : [];
  } catch {
    return [];
  }
}

/**
 * Persists a user-created theme to localStorage. Returns whether it was saved: storage can be full,
 * blocked or switched off (private windows), and the caller must not say "Saved" then.
 */
export function saveCustomThemeToStorage(theme: SlideTheme): boolean {
  try {
    const filtered = getStoredCustomThemes().filter((t) => t.id !== theme.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([theme, ...filtered]));
    return true;
  } catch (err) {
    console.error('Failed to save custom theme to storage:', err);
    return false;
  }
}

/** Removes a saved theme. Returns whether storage accepted the change. */
export function removeCustomThemeFromStorage(id: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getStoredCustomThemes().filter((t) => t.id !== id)));
    return true;
  } catch (err) {
    console.error('Failed to remove custom theme from storage:', err);
    return false;
  }
}

const THEME_MODES = ['light', 'dark'] as const;
const THEME_FONTS = ['sans', 'serif', 'mono'] as const;
const THEME_MOTIFS = ['topographic', 'golden-waves', 'blueprint-grid', 'polar-compass', 'cyber-hud', 'radar-rings', 'mesh-aura', 'swiss-cut', 'editorial-split', 'minimal-frame', 'retro-poster-cut'] as const;
const THEME_CATEGORIES = ['academic', 'minimal', 'dark', 'vibrant', 'editorial', 'executive', 'apple-keynote', 'scientific', 'conference'] as const;
const COLOUR_FIELDS = ['canvasBg', 'cardBg', 'accent', 'textPrimary', 'textSecondary'] as const;
const SIX_OR_THREE_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export interface ImportedTheme {
  name: string;
  accent: string;
  mode?: (typeof THEME_MODES)[number];
  fontFamily?: (typeof THEME_FONTS)[number];
  visualMotif?: (typeof THEME_MOTIFS)[number];
  category?: (typeof THEME_CATEGORIES)[number];
  canvasBg?: string;
  cardBg?: string;
  textPrimary?: string;
  textSecondary?: string;
}

/**
 * Theme JSON pasted into the studio (shared by a teammate or a client). Nothing from it is applied
 * unless every field it names is valid: colours as hex, and mode, font, motif and category from the
 * lists this app knows. Otherwise the error says which field is wrong.
 */
export function parseThemeJson(text: string): { ok: true; theme: ImportedTheme } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That is not valid JSON.' };
  }
  const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  const data = root && root.theme && typeof root.theme === 'object' && !Array.isArray(root.theme) ? (root.theme as Record<string, unknown>) : root;
  if (!data) return { ok: false, error: 'The JSON must describe one theme.' };

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name || name.length > 80) return { ok: false, error: 'The theme needs a name of 1 to 80 characters.' };
  const out: ImportedTheme = { name, accent: '' };

  for (const field of COLOUR_FIELDS) {
    const v = data[field];
    if (v === undefined || v === null || v === '') {
      if (field === 'accent') return { ok: false, error: 'The theme needs an accent colour (accent), such as #2563EB.' };
      continue;
    }
    if (typeof v !== 'string' || !SIX_OR_THREE_HEX.test(v.trim())) return { ok: false, error: `"${field}" must be a hex colour such as #2563EB.` };
    out[field] = v.trim();
  }

  const choose = <K extends 'mode' | 'fontFamily' | 'visualMotif' | 'category'>(field: K, allowed: readonly NonNullable<ImportedTheme[K]>[]): string | null => {
    const v = data[field];
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) return `"${field}" must be one of: ${allowed.join(', ')}.`;
    out[field] = v as ImportedTheme[K];
    return null;
  };
  const problem = choose('mode', THEME_MODES) ?? choose('fontFamily', THEME_FONTS) ?? choose('visualMotif', THEME_MOTIFS) ?? choose('category', THEME_CATEGORIES);
  if (problem) return { ok: false, error: problem };
  return { ok: true, theme: out };
}

/**
 * Converts RGB components to hex string.
 */
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Calculates RGB luminance (0 = black, 1 = white).
 */
function getRgbLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Calculates color saturation (0 to 1).
 */
function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/**
 * Extracts design theme (palette, motif, archetype, typography) from an image file
 * using in-browser HTML5 canvas pixel clustering and color quantization.
 */
export async function extractThemeFromImage(fileOrDataUrl: File | string): Promise<ExtractedThemeResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context unavailable');
        }

        // Downscale for fast & efficient pixel sampling
        const width = 120;
        const height = 80;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height).data;
        const totalPixels = width * height;

        // Sample corner pixels to detect ground canvas background (60%)
        const cornerColors: Array<[number, number, number]> = [];
        const cornerCoords = [
          [2, 2],
          [width - 3, 2],
          [2, height - 3],
          [width - 3, height - 3],
          [10, 10],
          [width - 10, 10],
        ];

        for (const [cx, cy] of cornerCoords) {
          const idx = (cy * width + cx) * 4;
          cornerColors.push([imgData[idx], imgData[idx + 1], imgData[idx + 2]]);
        }

        // Average corner colors to deduce ground canvas
        let avgR = 0, avgG = 0, avgB = 0;
        for (const [r, g, b] of cornerColors) {
          avgR += r;
          avgG += g;
          avgB += b;
        }
        avgR = Math.round(avgR / cornerColors.length);
        avgG = Math.round(avgG / cornerColors.length);
        avgB = Math.round(avgB / cornerColors.length);

        const groundHex = rgbToHex(avgR, avgG, avgB);
        const groundLum = getRgbLuminance(avgR, avgG, avgB);
        const isDark = groundLum < 0.45;

        // Sample center pixels to deduce surface card (30%)
        let centerR = 0, centerG = 0, centerB = 0;
        let centerCount = 0;
        for (let y = Math.floor(height * 0.3); y < Math.floor(height * 0.7); y += 2) {
          for (let x = Math.floor(width * 0.3); x < Math.floor(width * 0.7); x += 2) {
            const idx = (y * width + x) * 4;
            centerR += imgData[idx];
            centerG += imgData[idx + 1];
            centerB += imgData[idx + 2];
            centerCount++;
          }
        }
        centerR = Math.round(centerR / centerCount);
        centerG = Math.round(centerG / centerCount);
        centerB = Math.round(centerB / centerCount);

        let cardHex = rgbToHex(centerR, centerG, centerB);

        // Ensure distinct 60/30 elevation separation
        if (Math.abs(getRgbLuminance(centerR, centerG, centerB) - groundLum) < 0.1) {
          cardHex = isDark ? '#1C1C1E' : '#FFFFFF';
        }

        // Find highest saturation pixel to deduce signal accent (10%)
        let bestAccent: [number, number, number] = [37, 99, 235]; // Default cobalt
        let maxSatScore = -1;

        for (let i = 0; i < totalPixels; i += 4) {
          const r = imgData[i * 4];
          const g = imgData[i * 4 + 1];
          const b = imgData[i * 4 + 2];
          const sat = getSaturation(r, g, b);
          const lum = getRgbLuminance(r, g, b);

          // Discard pure blacks, whites, or washed grays
          if (sat > 0.35 && lum > 0.15 && lum < 0.85) {
            const score = sat * (1 - Math.abs(lum - 0.5));
            if (score > maxSatScore) {
              maxSatScore = score;
              bestAccent = [r, g, b];
            }
          }
        }

        const accentHex = rgbToHex(bestAccent[0], bestAccent[1], bestAccent[2]);

        // Infer Visual Motif based on color temperature and saturation
        let motif: VisualMotif = 'minimal-frame';
        let archetype: LayoutArchetype = 'standard-card';
        let name = 'Custom Cloned Theme';
        let headerStamp = 'SCHOLAR OS // CLONED VISUAL ARCHETYPE';

        const [ar, ag, ab] = bestAccent;
        const isWarmGold = ar > 180 && ag > 140 && ab < 80;
        const isCyanViolet = (ag > 150 && ab > 180) || (ar > 140 && ab > 180);
        const isForestGreen = ag > ar && ag > ab && ag > 100;
        const isRedOrange = ar > 180 && ag < 120 && ab < 100;

        if (isDark) {
          if (isWarmGold) {
            motif = 'golden-waves';
            archetype = 'data-ledger';
            name = 'Cloned Black Gold (Kimi Style)';
            headerStamp = 'VC MONITORING REPORT // QUARTERLY ASSET LEDGER';
          } else if (isCyanViolet) {
            motif = 'cyber-hud';
            archetype = 'split-hero';
            name = 'Cloned Cyber Quantum (Gamma Style)';
            headerStamp = 'AUTONOMOUS FLEET // HUD TELEMETRY REPORT';
          } else if (isForestGreen) {
            motif = 'golden-waves';
            archetype = 'standard-card';
            name = 'Cloned Obsidian Aurora';
            headerStamp = 'EMPIRICAL BENCHMARK // QUANTUM PROTOCOL';
          } else {
            motif = 'blueprint-grid';
            archetype = 'standard-card';
            name = 'Cloned Dark Blueprint';
            headerStamp = 'RESEARCH WORKSHOP // DECISION RULE ARCHITECTURE';
          }
        } else {
          if (isForestGreen) {
            motif = 'topographic';
            archetype = 'standard-card';
            name = 'Cloned Paper Courseware (Kimi Style)';
            headerStamp = 'ACADEMIC COURSEWARE // MODULE 02 METHODOLOGY';
          } else if (isRedOrange) {
            motif = 'retro-poster-cut';
            archetype = 'swiss-editorial';
            name = 'Swiss Retro-Poster (Editorial)';
            headerStamp = 'QINGDAO NATURE SOCIETY // WETLAND CONSERVATION PARK';
          } else if (isCyanViolet || ab > ar) {
            motif = 'blueprint-grid';
            archetype = 'derivation-schematic';
            name = 'Cloned Pastel Derivation';
            headerStamp = 'CONTINUOUS GENERATIVE MODEL // DERIVATION';
          } else {
            motif = 'swiss-cut';
            archetype = 'data-ledger';
            name = 'Cloned Swiss Modernist';
            headerStamp = 'OPERATIONS REPORT // STRATEGIC DIRECTIVE';
          }
        }

        // Determine typography & text colors
        const fontFamily: 'sans' | 'serif' | 'mono' =
          motif === 'golden-waves' || motif === 'retro-poster-cut' ? 'serif' : motif === 'cyber-hud' ? 'mono' : 'sans';

        const textPrimary = isDark ? '#FFFFFF' : '#0F172A';
        const textSecondary = isDark ? '#D4D4D8' : '#334155';
        const textMuted = isDark ? '#A1A1AA' : '#64748B';

        resolve({
          name,
          tagline: `Extracted from screenshot · ${isDark ? 'Dark Mode' : 'Light Mode'} · Motif: ${motif}`,
          category: isDark ? (motif === 'golden-waves' ? 'vibrant' : 'dark') : (motif === 'topographic' ? 'academic' : 'minimal'),
          mode: isDark ? 'dark' : 'light',
          visualMotif: motif,
          layoutArchetype: archetype,
          headerStamp,
          canvasBg: groundHex,
          cardBg: cardHex,
          accent: accentHex,
          textPrimary,
          textSecondary,
          textMuted,
          fontFamily,
          // No sample KPIs: an extracted theme carries colours and type only.
          previewKpis: undefined,
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for visual analysis'));
    };

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string' && e.target.result) img.src = e.target.result;
        else reject(new Error('The image could not be read.'));
      };
      // Without these the promise never settled and the screen sat on its "extracting" spinner.
      reader.onerror = () => reject(new Error('The image could not be read.'));
      reader.onabort = () => reject(new Error('Reading the image was cancelled.'));
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

/**
 * Generates a complete design theme from a descriptive prompt (e.g. "Kimi Black Gold Ledger" or "Gamma Cyber Neon").
 */
export function generateThemeFromPrompt(prompt: string): ExtractedThemeResult {
  const p = prompt.toLowerCase();

  if (
    p.includes('swiss') ||
    p.includes('poster') ||
    p.includes('retro') ||
    p.includes('bird') ||
    p.includes('plover') ||
    p.includes('migratory') ||
    p.includes('hard-edge') ||
    (p.includes('editorial') && (p.includes('poster') || p.includes('retro') || p.includes('swiss')))
  ) {
    return {
      name: 'Swiss Retro-Poster (AI Generated)',
      tagline: 'Warm cream canvas with sharp geometric tomato-red, cobalt blue, angled banners, and dark bottom summary bar',
      category: 'minimal',
      mode: 'light',
      visualMotif: 'retro-poster-cut',
      layoutArchetype: 'swiss-editorial',
      headerStamp: 'QINGDAO NATURE SOCIETY // WETLAND CONSERVATION PARK',
      canvasBg: '#F7F5F0',
      cardBg: '#FFFFFF',
      accent: '#EB4424',
      textPrimary: '#18181B',
      textSecondary: '#3F3F46',
      textMuted: '#71717A',
      fontFamily: 'serif',
    };
  }

  if (p.includes('black gold') || p.includes('gold') || p.includes('ledger') || p.includes('luxury')) {
    return {
      name: 'Black Gold Ledger (AI Generated)',
      tagline: 'Deep black obsidian ground with luxury golden waves and 3-stat VC metric ledger',
      category: 'vibrant',
      mode: 'dark',
      visualMotif: 'golden-waves',
      layoutArchetype: 'data-ledger',
      headerStamp: 'EMBODIED AI SECTOR // QUARTERLY VC MONITORING REPORT',
      canvasBg: '#0D0C0B',
      cardBg: '#171614',
      accent: '#EAB308',
      textPrimary: '#FFFFFF',
      textSecondary: '#D4D4D8',
      textMuted: '#A1A1AA',
      fontFamily: 'serif',
    };
  }

  if (p.includes('apricot') || p.includes('m&a') || p.includes('due diligence') || p.includes('brief')) {
    return {
      name: 'Apricot White Brief (AI Generated)',
      tagline: 'Warm academic linen canvas with editorial split architectural photo panel & red due-diligence tags',
      category: 'academic',
      mode: 'light',
      visualMotif: 'editorial-split',
      layoutArchetype: 'split-hero',
      headerStamp: 'M&A DUE DILIGENCE // INVESTMENT COMMITTEE FINAL REPORT',
      canvasBg: '#F3EFE6',
      cardBg: '#FFFDF9',
      accent: '#C25E34',
      textPrimary: '#1C1917',
      textSecondary: '#44403C',
      textMuted: '#78716C',
      fontFamily: 'serif',
    };
  }

  if (p.includes('courseware') || p.includes('topographic') || p.includes('paper white') || p.includes('sage')) {
    return {
      name: 'Paper White Courseware (AI Generated)',
      tagline: 'Warm academic paper with topographic contour curves and cobalt signal',
      category: 'academic',
      mode: 'light',
      visualMotif: 'topographic',
      layoutArchetype: 'standard-card',
      headerStamp: 'COURSEWARE MODULE 02 // METHODOLOGY',
      canvasBg: '#F7F5F0',
      cardBg: '#FFFFFF',
      accent: '#2563EB',
      textPrimary: '#0F172A',
      textSecondary: '#334155',
      textMuted: '#64748B',
      fontFamily: 'sans',
    };
  }

  if (p.includes('cyber') || p.includes('violet') || p.includes('electric') || p.includes('neon') || p.includes('hud')) {
    return {
      name: 'Electric Violet Business (AI Generated)',
      tagline: 'Dark electric violet ground with cyber grid, autonomous tech graphics, and neon KPI cards',
      category: 'dark',
      mode: 'dark',
      visualMotif: 'cyber-hud',
      layoutArchetype: 'split-hero',
      headerStamp: 'AUTONOMOUS FLEET OPERATIONS // Q4 ACTION REPORT',
      canvasBg: '#070B14',
      cardBg: '#0F172A',
      accent: '#06B6D4',
      textPrimary: '#FFFFFF',
      textSecondary: '#CBD5E1',
      textMuted: '#64748B',
      fontFamily: 'sans',
    };
  }

  if (p.includes('derivation') || p.includes('blueprint') || p.includes('math') || p.includes('formula')) {
    return {
      name: 'Pastel Derivation (AI Generated)',
      tagline: 'Ice-blue technical blueprint with precision grid, formula notation p0 -> p1, and scientific flux nodes',
      category: 'minimal',
      mode: 'light',
      visualMotif: 'blueprint-grid',
      layoutArchetype: 'derivation-schematic',
      headerStamp: 'DROPLET MICROFLUIDIC SORTING // CONTINUOUS-TIME GENERATIVE MODEL',
      canvasBg: '#F8FAFC',
      cardBg: '#FFFFFF',
      accent: '#2563EB',
      textPrimary: '#0F172A',
      textSecondary: '#334155',
      textMuted: '#64748B',
      fontFamily: 'sans',
    };
  }

  // Default intelligent synthesis
  return {
    name: 'Custom AI Synthesis',
    tagline: `Generated style based on "${prompt}"`,
    category: 'academic',
    mode: 'light',
    visualMotif: 'topographic',
    layoutArchetype: 'split-hero',
    headerStamp: 'SCHOLAR OS // SYNTHESIS WORKSPACE',
    canvasBg: '#FAF8F5',
    cardBg: '#FFFFFF',
    accent: '#2563EB',
    textPrimary: '#0F172A',
    textSecondary: '#334155',
    textMuted: '#64748B',
    fontFamily: 'sans',
  };
}

/**
 * Builds a valid SlideTheme object from an ExtractedThemeResult and unique ID.
 */
export function compileSlideTheme(result: ExtractedThemeResult, id?: string): SlideTheme {
  const themeId = (id || `custom-theme-${Date.now()}`) as SlideThemeId;
  const isDark = result.mode === 'dark';

  return {
    id: themeId,
    name: result.name,
    tagline: result.tagline,
    category: result.category,
    mode: result.mode,
    visualMotif: result.visualMotif,
    layoutArchetype: result.layoutArchetype,
    headerStamp: result.headerStamp,
    previewKpis: result.previewKpis,
    swatch: [result.canvasBg, result.cardBg, result.accent],
    canvasBg: result.canvasBg,
    canvasClass: `transition-colors duration-300`,
    cardBg: result.cardBg,
    cardClass: `transition-all duration-300 border ${isDark ? 'border-white/10' : 'border-black/10'} shadow-2xl`,
    cardBorder: isDark ? 'border-white/10' : 'border-neutral-200',
    accent: result.accent,
    accentBadgeBg: isDark ? 'bg-white/10' : 'bg-black/5',
    accentBadgeText: isDark ? 'text-white font-bold' : 'text-neutral-900 font-bold',
    accentBadgeBorder: isDark ? 'border-white/20' : 'border-black/10',
    metricColor: result.accent,
    metricBg: isDark ? 'bg-white/5' : 'bg-neutral-50',
    metricBorder: isDark ? 'border-white/10' : 'border-neutral-200',
    textPrimary: isDark ? 'text-white' : 'text-neutral-900',
    textSecondary: isDark ? 'text-neutral-300' : 'text-neutral-700',
    textMuted: isDark ? 'text-neutral-400' : 'text-neutral-500',
    fontFamily: result.fontFamily,
    bulletColor: result.accent,
    quoteBorder: result.accent,
    bottomSummaryBar: result.layoutArchetype === 'swiss-editorial',
    secondaryAccent: result.layoutArchetype === 'swiss-editorial' ? '#2563EB' : undefined,
  };
}
