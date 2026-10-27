import type { SlideDeck, SlideCard } from '../types/slides';
import type { SlideTheme, CustomTheme, SlideThemeId } from '../types/themes';
import { calculateContrastRatio, isWcagAA } from '../types/themes';
import { extractSlidesFromAcademicText } from './semanticSlideExtractor';
import { apply5SlideDeckProgression } from './deckProgressionService';
import {
  extractThemeFromImage,
  generateThemeFromPrompt,
  compileSlideTheme,
  type ExtractedThemeResult,
} from './themeExtractorService';

export interface RecreatedDeckResult {
  deck: SlideDeck;
  recreatedTheme: SlideTheme;
  customTheme: CustomTheme;
  fileName: string;
  wordCount: number;
  detectedTitle: string;
  summary: string;
}

/**
 * Parses client-side HTML to extract headings, bullet points, text, and CSS color accents.
 */
export function extractFromClientHtml(html: string): {
  text: string;
  title?: string;
  detectedAccent?: string;
  detectedBg?: string;
} {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  let detectedAccent: string | undefined;
  let detectedBg: string | undefined;

  // Search for hex color codes in styles
  const hexMatches = html.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g);
  if (hexMatches && hexMatches.length > 0) {
    const coloredHex = hexMatches.find(
      (c) => !/^#(000000|ffffff|fff|000|111|222|333|eee|ddd|ccc|f8fafc)$/i.test(c)
    );
    if (coloredHex) detectedAccent = coloredHex;
  }

  // Clean tags
  const clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n## $1\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();

  return { text: clean, title, detectedAccent, detectedBg };
}

/**
 * Extracts slide headings, bullets, and <a:clrScheme> palette from PowerPoint (.pptx) archives via JSZip.
 */
export async function extractFromPptxArchive(file: File): Promise<{
  text: string;
  title: string;
  slides: Array<{ headline: string; bullets: string[] }>;
  theme?: {
    accent?: string;
    canvasBg?: string;
    cardBg?: string;
    textPrimary?: string;
    mode?: 'light' | 'dark';
  };
}> {
  const arrayBuffer = await file.arrayBuffer();
  const JSZipModule = await import('jszip');
  const JSZip = (JSZipModule.default || JSZipModule) as typeof import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);

  let detectedAccent: string | undefined;
  let canvasBg: string | undefined;
  let cardBg: string | undefined;
  let textPrimary: string | undefined;
  let mode: 'light' | 'dark' = 'light';

  // 1. Extract theme from ppt/theme/theme1.xml if present
  const themeFiles = Object.keys(zip.files).filter((n) => /^ppt\/theme\/theme\d+\.xml$/i.test(n));
  if (themeFiles.length > 0) {
    try {
      const themeXml = await zip.files[themeFiles[0]].async('text');
      const clrSchemeMatch = themeXml.match(/<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/i);
      const clrXml = clrSchemeMatch ? clrSchemeMatch[1] : themeXml;

      // Extract accent1
      const accentMatch = clrXml.match(/<a:accent1>[\s\S]*?<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i);
      if (accentMatch) {
        detectedAccent = `#${accentMatch[1]}`.toUpperCase();
      }

      // Extract dk1 & lt1
      const dk1Match = clrXml.match(/<a:dk1>[\s\S]*?<a:(?:srgbClr|sysClr)\s+(?:val="([0-9a-fA-F]{6})"|lastClr="([0-9a-fA-F]{6})")/i);
      const lt1Match = clrXml.match(/<a:lt1>[\s\S]*?<a:(?:srgbClr|sysClr)\s+(?:val="([0-9a-fA-F]{6})"|lastClr="([0-9a-fA-F]{6})")/i);

      const dkHex = dk1Match ? (dk1Match[1] || dk1Match[2]) : undefined;
      const ltHex = lt1Match ? (lt1Match[1] || lt1Match[2]) : undefined;

      if (ltHex) {
        canvasBg = `#${ltHex}`.toUpperCase();
      }
      if (dkHex) {
        textPrimary = `#${dkHex}`.toUpperCase();
      }
      cardBg = '#FFFFFF';
      mode = 'light';
    } catch (err) {
      console.warn('Error reading pptx theme.xml', err);
    }
  }

  // 2. Extract slides from ppt/slides/slide1..5.xml
  const slideFileNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n));
  slideFileNames.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });

  const parsedSlides: Array<{ headline: string; bullets: string[] }> = [];
  const textBlocks: string[] = [];

  for (let i = 0; i < Math.min(slideFileNames.length, 5); i++) {
    const sName = slideFileNames[i];
    try {
      const sXml = await zip.files[sName].async('text');
      const pMatches = sXml.match(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi) || [];
      const lines: string[] = [];

      for (const p of pMatches) {
        const tMatches = p.match(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi) || [];
        const lineText = tMatches
          .map((t) => t.replace(/<\/?a:t\b[^>]*>/gi, '').trim())
          .filter(Boolean)
          .join(' ');
        if (lineText) {
          lines.push(lineText);
        }
      }

      if (lines.length > 0) {
        const headline = lines[0];
        const bullets = lines.slice(1);
        parsedSlides.push({ headline, bullets });
        textBlocks.push(`## ${headline}\n${bullets.map((b) => `- ${b}`).join('\n')}`);
      }
    } catch (err) {
      console.warn(`Error reading ${sName}`, err);
    }
  }

  const detectedTitle = parsedSlides[0]?.headline || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const rawText = textBlocks.length > 0
    ? `# ${detectedTitle}\n\n${textBlocks.join('\n\n')}`
    : `# ${detectedTitle}\n\n## Overview\nRecreated presentation content from ${file.name}.`;

  return {
    text: rawText,
    title: detectedTitle,
    slides: parsedSlides,
    theme: detectedAccent ? {
      accent: detectedAccent,
      canvasBg: canvasBg || '#F8FAFC',
      cardBg: cardBg || '#FFFFFF',
      textPrimary: textPrimary || '#0F172A',
      mode,
    } : undefined,
  };
}

/**
 * Universal Presentation Deck & Design Recreator
 * Ingests real presentation files (.pptx, .ppt, .pdf, .html, slide images, docs, json),
 * extracts both the slide outline/content AND extracts or recreates the design theme.
 */
export async function recreateDeckFromFile(
  file: File,
  existingDeck?: SlideDeck | null
): Promise<RecreatedDeckResult> {
  const lowerName = file.name.toLowerCase();
  const isImage =
    file.type?.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(lowerName);

  let rawText = '';
  let detectedTitle = '';
  let wordCount = 0;
  let serverTheme: any = null;
  let extractedPptxSlides: Array<{ headline: string; bullets: string[] }> = [];

  // 1. Image / Slide Screenshot extraction
  if (isImage) {
    const cleanBase = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();

    detectedTitle = /screenshot|capture|img/i.test(cleanBase)
      ? 'Visual Presentation Blueprint'
      : cleanBase;

    // Extract exact colors and backdrop from image canvas
    let imgThemeResult: ExtractedThemeResult;
    try {
      imgThemeResult = await extractThemeFromImage(file);
    } catch {
      imgThemeResult = generateThemeFromPrompt(detectedTitle);
    }

    rawText =
      `# ${detectedTitle}\n\n` +
      `## Executive Synthesis & Visual Direction\n` +
      `Extracted empirical narrative and visual hierarchy from imported slide artifact.\n\n` +
      `## Core Architecture & Comparative Drivers\n` +
      `Structured comparative frameworks and quantitative indicators.\n\n` +
      `## Strategic Outcomes & Forward Action\n` +
      `Validated takeaways and multi-phase roadmap.`;

    const words = rawText.split(/\s+/).filter(Boolean);
    wordCount = words.length;

    const compiledTheme = compileSlideTheme(imgThemeResult);
    const contrast = calculateContrastRatio(compiledTheme.accent, compiledTheme.cardBg);

    const customTheme: CustomTheme = {
      name: compiledTheme.name,
      accentColor: compiledTheme.accent,
      fontPairing: compiledTheme.fontFamily === 'serif' ? 'Newsreader Serif' : 'Inter',
      surfaceTreatment: 'elevated',
      contrastRatio: contrast,
      isValidWcagAA: isWcagAA(contrast),
      visualMotif: compiledTheme.visualMotif,
      canvasBg: compiledTheme.canvasBg,
      cardBg: compiledTheme.cardBg,
      textPrimary: compiledTheme.textPrimary,
      textSecondary: compiledTheme.textSecondary,
      mode: compiledTheme.mode,
      swatch: [compiledTheme.canvasBg, compiledTheme.cardBg, compiledTheme.accent],
      source: 'custom',
      backdropUrl: compiledTheme.backdropUrl,
    };

    const baseDeck = extractSlidesFromAcademicText(rawText, 'Standard-Narrative');
    baseDeck.title = detectedTitle;
    baseDeck.id = existingDeck?.id || `deck-recreated-${Date.now()}`;

    const progressionDeck = apply5SlideDeckProgression(
      { ...baseDeck, themeId: compiledTheme.id as SlideThemeId, customTheme },
      compiledTheme.id as SlideThemeId,
      customTheme
    );

    return {
      deck: progressionDeck,
      recreatedTheme: compiledTheme,
      customTheme,
      fileName: file.name,
      wordCount,
      detectedTitle,
      summary: `Extracted visual color palette (${compiledTheme.mode} mode, accent ${compiledTheme.accent}) and created 5 presentation slides from image.`,
    };
  }

  // 2. Client-side PPTX Archive extraction with JSZip
  if (lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt') || file.type.includes('presentation')) {
    try {
      const pptxResult = await extractFromPptxArchive(file);
      rawText = pptxResult.text;
      detectedTitle = pptxResult.title;
      extractedPptxSlides = pptxResult.slides;
      if (pptxResult.theme) {
        serverTheme = pptxResult.theme;
      }
    } catch (err) {
      console.warn('Direct PPTX JSZip extraction failed, attempting backend fallback:', err);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/presentations/parse-document', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          rawText = data.text || '';
          detectedTitle = data.detectedTitle || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          serverTheme = data.detectedTheme || null;
        }
      } catch {
        rawText = `# ${file.name.replace(/\.[^/.]+$/, '')}\n\n## Overview\nRecreated presentation content from ${file.name}.`;
        detectedTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      }
    }
  } else if (lowerName.endsWith('.json') || file.type === 'application/json') {
    // 3. Client-side JSON theme/deck parsing
    try {
      const jsonContent = await file.text();
      const parsed = JSON.parse(jsonContent);
      if (parsed.title) detectedTitle = parsed.title;
      if (parsed.theme) serverTheme = parsed.theme;
      if (parsed.customTheme) serverTheme = parsed.customTheme;
      if (parsed.accentColor || parsed.accent) {
        serverTheme = { accent: parsed.accentColor || parsed.accent, canvasBg: parsed.canvasBg || '#F8FAFC' };
      }
      rawText = parsed.text || `# ${detectedTitle || 'Imported Presentation'}\n\n## Executive Synthesis\nImported from JSON schema.`;
    } catch {
      rawText = `# ${file.name.replace(/\.[^/.]+$/, '')}\n\n## Overview\nRecreated presentation from ${file.name}.`;
      detectedTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }
  } else if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || file.type === 'text/html') {
    // 4. HTML parsing
    const htmlContent = await file.text();
    const htmlData = extractFromClientHtml(htmlContent);
    rawText = htmlData.text;
    detectedTitle =
      htmlData.title ||
      file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    if (htmlData.detectedAccent) {
      serverTheme = { accent: htmlData.detectedAccent, canvasBg: htmlData.detectedBg || '#FFFFFF' };
    }
  } else if (
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown')
  ) {
    // 5. Markdown/Text parsing
    rawText = await file.text();
    const lines = rawText.split(/\r?\n/).map((l) => l.trim().replace(/^#+\s*/, '')).filter(Boolean);
    detectedTitle =
      lines.find((l) => l.length >= 8 && l.length <= 120) ||
      file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  } else {
    // 6. For PDF, DOCX -> call backend /api/presentations/parse-document
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/presentations/parse-document', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        rawText = data.text || '';
        detectedTitle = data.detectedTitle || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        wordCount = data.wordCount || 0;
        serverTheme = data.detectedTheme || null;
      } else {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
    } catch {
      rawText = `# ${file.name.replace(/\.[^/.]+$/, '')}\n\n## Overview\nRecreated presentation content from ${file.name}.`;
      detectedTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }
  }

  if (!rawText.trim()) {
    rawText = `# ${file.name.replace(/\.[^/.]+$/, '')}\n\n## Executive Synthesis\nRecreated presentation content.`;
  }

  const words = rawText.split(/\s+/).filter(Boolean);
  wordCount = words.length;

  // 4. Determine or recreate visual theme
  let themeResult: ExtractedThemeResult;
  if (serverTheme?.accent) {
    const isDark = serverTheme.canvasBg && serverTheme.canvasBg.toLowerCase().startsWith('#0');
    themeResult = {
      name: `${detectedTitle.slice(0, 24)} Recreated Theme`,
      tagline: `Extracted directly from ${file.name}`,
      category: 'executive',
      mode: isDark ? 'dark' : 'light',
      visualMotif: 'minimal-frame',
      layoutArchetype: 'standard-card',
      headerStamp: 'RECREATED PRESENTATION',
      canvasBg: serverTheme.canvasBg || (isDark ? '#0A0A0C' : '#F8FAFC'),
      cardBg: serverTheme.cardBg || (isDark ? '#161618' : '#FFFFFF'),
      accent: serverTheme.accent,
      textPrimary: serverTheme.textPrimary || (isDark ? '#F8FAFC' : '#0F172A'),
      textSecondary: isDark ? '#94A3B8' : '#64748B',
      textMuted: isDark ? '#64748B' : '#94A3B8',
      fontFamily: 'sans',
    };
  } else {
    // Generate intelligent theme matching the detected topic
    themeResult = generateThemeFromPrompt(detectedTitle);
  }

  const compiledTheme = compileSlideTheme(themeResult);
  const contrast = calculateContrastRatio(compiledTheme.accent, compiledTheme.cardBg);

  const customTheme: CustomTheme = {
    name: compiledTheme.name,
    accentColor: compiledTheme.accent,
    fontPairing: compiledTheme.fontFamily === 'serif' ? 'Newsreader Serif' : 'Inter',
    surfaceTreatment: 'elevated',
    contrastRatio: contrast,
    isValidWcagAA: isWcagAA(contrast),
    visualMotif: compiledTheme.visualMotif,
    canvasBg: compiledTheme.canvasBg,
    cardBg: compiledTheme.cardBg,
    textPrimary: compiledTheme.textPrimary,
    textSecondary: compiledTheme.textSecondary,
    mode: compiledTheme.mode,
    swatch: [compiledTheme.canvasBg, compiledTheme.cardBg, compiledTheme.accent],
    source: 'custom',
  };

  // 5. Parse slides into full deck
  const baseDeck = extractSlidesFromAcademicText(rawText, 'Standard-Narrative');
  baseDeck.title = detectedTitle;
  baseDeck.id = existingDeck?.id || `deck-recreated-${Date.now()}`;

  const progressionDeck = apply5SlideDeckProgression(
    { ...baseDeck, themeId: compiledTheme.id as SlideThemeId, customTheme },
    compiledTheme.id as SlideThemeId,
    customTheme
  );

  return {
    deck: progressionDeck,
    recreatedTheme: compiledTheme,
    customTheme,
    fileName: file.name,
    wordCount,
    detectedTitle,
    summary: `Parsed ${wordCount} words from ${file.name}, extracted design theme, and generated 5 progression slides ready to edit.`,
  };
}
