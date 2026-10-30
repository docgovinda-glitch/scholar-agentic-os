/**
 * slideMutationService.ts
 *
 * Dual-layer AI mutation service for slide editing:
 * 1. Quick-action deterministic transforms:
 *    - ⚡ Make More Concise (6x6 Rule: max 6 bullets, max 6 words per bullet)
 *    - 🖼 Convert to Split Image (Image dropzone / 2D sketch + contextual points)
 *    - 📊 Highlight as Big Metric (High-contrast stat callout + context label)
 *    - ⚖️ Change to 2-Column Comparison (Side-by-side comparative analysis)
 *    - ✍️ Strengthen Active Voice (Convert passive/generic headlines to decisive assertions)
 * 2. Natural language prompt processing with online REST API call and offline client-side fallback.
 * 3. Reference screenshot replication integration.
 */

import type {
  SlideCard,
  SlideBlock,
  ActionHeaderBlock,
  BulletListBlock,
  TwoColumnBlock,
  MetricCalloutBlock,
  ImageBlock,
} from '../types/slides';
import type { CustomTheme } from '../types/themes';
import { condenseToSixWords } from './semanticSlideExtractor';
import { replicateSlideFromScreenshot } from './slideReplicaService';

export type SlideMutationAction =
  | 'make-concise'
  | 'convert-to-split-image'
  | 'highlight-as-big-metric'
  | 'change-to-two-column'
  | 'strengthen-active-voice';

export interface SlidePromptOptions {
  currentSlide: SlideCard;
  prompt: string;
  deckId?: string;
  deckTopic?: string;
  referenceImage?: string;
  cloneTheme?: boolean;
}

export interface SlidePromptResult {
  mutatedSlide: SlideCard;
  message: string;
  customTheme?: CustomTheme;
}

/**
 * ⚡ Make More Concise (6x6 Rule):
 * Condenses bullet lists to at most 6 bullets, and each bullet to at most 6 words.
 */
export function makeMoreConcise(slide: SlideCard): SlideCard {
  const blocks: SlideBlock[] = slide.blocks.map((block) => {
    if (block.type === 'bullet-list') {
      const items = block.items
        .slice(0, 6)
        .map((item) => condenseToSixWords(item))
        .filter(Boolean);
      return {
        ...block,
        items,
      };
    }
    if (block.type === 'two-column') {
      const leftPoints = (block.leftPoints || [])
        .slice(0, 4)
        .map((p) => condenseToSixWords(p));
      const rightPoints = (block.rightPoints || [])
        .slice(0, 4)
        .map((p) => condenseToSixWords(p));
      return {
        ...block,
        leftPoints,
        rightPoints,
      };
    }
    return block;
  });

  return {
    ...slide,
    blocks,
    summary: slide.summary ? condenseToSixWords(slide.summary) : slide.summary,
  };
}

/**
 * 🖼 Convert to Split Image:
 * Switches layout to 'image-split', ensuring an ImageBlock is present alongside text/bullets.
 */
export function convertToSplitImage(slide: SlideCard, imageUrl?: string): SlideCard {
  const blocks: SlideBlock[] = [...slide.blocks];

  // Ensure an ImageBlock is in the blocks array
  const hasImage = blocks.some((b) => b.type === 'image');
  if (!hasImage) {
    const newImageBlock: ImageBlock = {
      type: 'image',
      imageUrl: imageUrl || '',
      caption: '',
    };
    // Place right after header if possible
    const headerIdx = blocks.findIndex((b) => b.type === 'action-header');
    if (headerIdx >= 0) {
      blocks.splice(headerIdx + 1, 0, newImageBlock);
    } else {
      blocks.push(newImageBlock);
    }
  }

  // The text half keeps the slide's own points; none are invented.

  return {
    ...slide,
    layoutType: 'image-split',
    blocks,
  };
}

/**
 * 📊 Highlight as Big Metric:
 * Switches layout to 'metric-focus', generating or elevating a high-contrast metric callout.
 */
export function highlightAsBigMetric(
  slide: SlideCard,
  metricValue?: string,
  metricLabel?: string
): SlideCard {
  const blocks: SlideBlock[] = [...slide.blocks];

  // Look for existing metric in blocks or generate intelligent default
  const existingMetricIdx = blocks.findIndex((b) => b.type === 'metric-callout');
  // Never invent figures: use the caller's metric or a number already in the text.
  let chosenMetric = metricValue || '';
  let chosenLabel = metricLabel || 'Key figure';
  const chosenContext: string | undefined = undefined;

  if (!metricValue) {
    const textCorpus = [
      slide.actionHeadline,
      ...blocks
        .filter((b): b is BulletListBlock => b.type === 'bullet-list')
        .flatMap((b) => b.items),
    ].join(' ');

    const numMatch = textCorpus.match(/(\+?-?\d+(?:\.\d+)?%|\$?\d+(?:,\d{3})*(?:\.\d+)?[xXkKmMbB]?)/);
    if (numMatch) {
      chosenMetric = numMatch[1];
      chosenLabel = metricLabel || 'Key figure';
    }
  }

  if (!chosenMetric) {
    // No figure in the slide: show its points as big numbered cards instead.
    return { ...slide, layoutType: 'stats' };
  }

  const metricBlock: MetricCalloutBlock = {
    type: 'metric-callout',
    value: chosenMetric,
    metric: chosenMetric,
    label: chosenLabel,
    context: chosenContext,
    trend: chosenMetric.startsWith('-') ? 'down' : 'up',
  };

  if (existingMetricIdx >= 0) {
    blocks[existingMetricIdx] = metricBlock;
  } else {
    // Insert after header
    const headerIdx = blocks.findIndex((b) => b.type === 'action-header');
    if (headerIdx >= 0) {
      blocks.splice(headerIdx + 1, 0, metricBlock);
    } else {
      blocks.push(metricBlock);
    }
  }

  return {
    ...slide,
    layoutType: 'metric-focus',
    blocks,
  };
}

/**
 * ⚖️ Change to 2-Column Comparison:
 * Splits content into side-by-side comparative analysis (Problem vs Solution, Legacy vs Target).
 */
export function changeToTwoColumn(slide: SlideCard): SlideCard {
  const blocks: SlideBlock[] = [...slide.blocks];

  // Extract existing bullet items if available
  const existingBullets = blocks
    .filter((b): b is BulletListBlock => b.type === 'bullet-list')
    .flatMap((b) => b.items);

  let leftPoints: string[] = [];
  let rightPoints: string[] = [];

  if (existingBullets.length >= 2) {
    const mid = Math.ceil(existingBullets.length / 2);
    leftPoints = existingBullets.slice(0, mid);
    rightPoints = existingBullets.slice(mid);
  } else {
    // Too few points to split: keep what there is and leave the other column for the user.
    leftPoints = existingBullets;
    rightPoints = [];
  }

  const twoColBlock: TwoColumnBlock = {
    type: 'two-column',
    leftTitle: '',
    leftPoints,
    rightTitle: '',
    rightPoints,
  };

  // Replace existing bullets or append
  const bulletIdx = blocks.findIndex((b) => b.type === 'bullet-list');
  const twoColIdx = blocks.findIndex((b) => b.type === 'two-column');

  if (twoColIdx >= 0) {
    blocks[twoColIdx] = twoColBlock;
  } else if (bulletIdx >= 0) {
    blocks[bulletIdx] = twoColBlock;
  } else {
    blocks.push(twoColBlock);
  }

  return {
    ...slide,
    layoutType: 'two-column',
    blocks,
  };
}

/**
 * ✍️ Strengthen Active Voice:
 * Replaces passive or weak headlines with decisive executive action statements.
 */
export function strengthenActiveVoice(slide: SlideCard): SlideCard {
  const headline = slide.actionHeadline || '';

  // Strip weak topic openers so the headline leads with the subject. It never
  // adds a claim ("proves", "drives outcomes") the user did not make.
  const weakOpeners = /^(an?\s+)?(overview of|introduction to|background on|analysis of|study on|study of)\s+/i;
  let strengthened = headline.replace(weakOpeners, '').trim();
  if (strengthened.length > 0) {
    strengthened = strengthened.charAt(0).toUpperCase() + strengthened.slice(1);
  }

  // Synchronize across ActionHeaderBlock
  const blocks = slide.blocks.map((b) => {
    if (b.type === 'action-header') {
      return {
        ...b,
        headline: strengthened,
      };
    }
    return b;
  });

  return {
    ...slide,
    actionHeadline: strengthened,
    blocks,
  };
}

/**
 * Executes a deterministic quick-action mutation.
 */
export function applyQuickMutation(
  slide: SlideCard,
  action: SlideMutationAction
): SlideCard {
  switch (action) {
    case 'make-concise':
      return makeMoreConcise(slide);
    case 'convert-to-split-image':
      return convertToSplitImage(slide);
    case 'highlight-as-big-metric':
      return highlightAsBigMetric(slide);
    case 'change-to-two-column':
      return changeToTwoColumn(slide);
    case 'strengthen-active-voice':
      return strengthenActiveVoice(slide);
    default:
      return slide;
  }
}

/**
 * Main prompt dispatcher: handles natural language input, REST API integration,
 * and client-side fallback logic.
 */
export async function executeSlidePrompt({
  currentSlide,
  prompt,
  deckId,
  deckTopic,
  referenceImage,
  cloneTheme = false,
}: SlidePromptOptions): Promise<SlidePromptResult> {
  const cleanPrompt = prompt.trim();

  // 1. If reference screenshot provided, perform exact layout/style replication
  if (referenceImage) {
    const replica = await replicateSlideFromScreenshot({
      referenceImage,
      currentSlide,
      prompt: cleanPrompt || 'Replicate slide layout, structure, and visual hierarchy from reference screenshot',
      deckTopic,
      cloneTheme,
    });
    return {
      mutatedSlide: replica.replicatedSlide,
      message: '✨ Replicated slide from reference screenshot',
      customTheme: replica.customTheme,
    };
  }

  // 2. Try online REST API endpoint if deckId is present
  if (deckId && cleanPrompt) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const { isSupabaseConfigured, getSupabaseClient } = await import('../../../services/supabaseClient');
        if (isSupabaseConfigured()) {
          const { data } = await getSupabaseClient().auth.getSession();
          if (data?.session?.access_token) {
            headers['Authorization'] = `Bearer ${data.session.access_token}`;
          }
        }
      } catch {}

      const response = await fetch(`/api/presentations/${deckId}/copilot`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: cleanPrompt,
          slideIndex: currentSlide.order ? currentSlide.order - 1 : 0,
          currentSlide,
        }),
      });

      if (response.status === 400) {
        // The server declined (e.g. no figure given for a metric callout): say why, change nothing.
        const data = await response.json().catch(() => ({}));
        return {
          mutatedSlide: currentSlide,
          message: (data as { error?: string }).error || 'This change needs more content on the slide first.',
        };
      }
      if (response.ok) {
        const data = await response.json();
        if (data.mutatedSlide) {
          return {
            mutatedSlide: data.mutatedSlide,
            message: data.message || '✨ Slide updated via AI Copilot',
            customTheme: data.customTheme,
          };
        }
      }
    } catch {
      // Offline fallback: fall through to deterministic client-side logic
    }
  }

  // 3. Intelligent client-side pattern matching
  const lower = cleanPrompt.toLowerCase();

  if (
    lower.includes('concise') ||
    lower.includes('6x6') ||
    lower.includes('shorten') ||
    lower.includes('condense') ||
    lower.includes('brief')
  ) {
    return {
      mutatedSlide: makeMoreConcise(currentSlide),
      message: '⚡ Applied 6x6 rule: bullets condensed to concise assertions',
    };
  }

  if (
    lower.includes('split') ||
    lower.includes('image') ||
    lower.includes('photo') ||
    lower.includes('visual') ||
    lower.includes('picture')
  ) {
    return {
      mutatedSlide: convertToSplitImage(currentSlide),
      message: '🖼 Converted layout to Split Image + Text',
    };
  }

  if (
    lower.includes('metric') ||
    lower.includes('number') ||
    lower.includes('stat') ||
    lower.includes('callout') ||
    lower.includes('percent')
  ) {
    return {
      mutatedSlide: highlightAsBigMetric(currentSlide),
      message: '📊 Elevated key quantitative proof metric',
    };
  }

  if (
    lower.includes('2-column') ||
    lower.includes('two column') ||
    lower.includes('compare') ||
    lower.includes('versus') ||
    lower.includes('vs') ||
    lower.includes('contrast')
  ) {
    return {
      mutatedSlide: changeToTwoColumn(currentSlide),
      message: '⚖️ Converted layout to 2-Column Comparison',
    };
  }

  if (
    lower.includes('active voice') ||
    lower.includes('headline') ||
    lower.includes('strengthen') ||
    lower.includes('action verb')
  ) {
    return {
      mutatedSlide: strengthenActiveVoice(currentSlide),
      message: '✍️ Strengthened headline into active voice assertion',
    };
  }

  // Fallback: Default to making more concise and sharpening headline
  let evolved = makeMoreConcise(currentSlide);
  evolved = strengthenActiveVoice(evolved);
  return {
    mutatedSlide: evolved,
    message: '✨ Transformed slide based on prompt',
  };
}
