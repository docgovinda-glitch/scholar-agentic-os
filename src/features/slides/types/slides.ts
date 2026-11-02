/**
 * Core data structures for Scholar OS Presentation Studio.
 * Enforces 1-idea-per-slide, structured presentation outline breakdown,
 * 6x6 bullet constraints, and dual-mode stage/leave-behind consumption.
 */

import type { SlideThemeId, CustomTheme } from './themes';

export type SlideBlockType =
  | 'action-header'
  | 'metric-callout'
  | 'bullet-list'
  | 'two-column'
  | 'quote-evidence'
  | 'image';

/**
 * Gamma-style card layouts rendered by src/features/slides/gamma. The same
 * content reflows into any of them, on the web canvas and in .pptx export.
 */
export type GammaLayout =
  | 'title'
  | 'bento'
  | 'stats'
  | 'timeline'
  | 'comparison'
  | 'list'
  | 'quote'
  | 'split'
  | 'statement';

export interface CardItem {
  title: string;
  body?: string;
}

export interface CardStat {
  value: string;
  label: string;
  detail?: string;
}

export interface CardColumn {
  title: string;
  points: string[];
}

/** Layout-independent content of one card. */
export interface CardContent {
  eyebrow?: string;
  headline: string;
  lede?: string;
  items: CardItem[];
  stats: CardStat[];
  columns?: [CardColumn, CardColumn];
  quote?: { text: string; attribution?: string };
  image?: { url: string; alt?: string; caption?: string };
  takeaway?: string;
}

export type SlideLayoutType =
  | GammaLayout
  | 'bullets'
  | 'image-split'
  | 'image-hero'
  | 'metric-focus'
  | 'two-column'
  | 'quote-evidence'
  | 'cover'
  | 'metrics'
  | 'categories'
  | 'framework';

export interface ActionHeaderBlock {
  type: 'action-header';
  headline: string;
  category?: string;
  subheadline?: string;
}

export interface MetricCalloutBlock {
  type: 'metric-callout';
  metric?: string;
  value?: string; // alias for metric
  label: string;
  context?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface BulletListBlock {
  type: 'bullet-list';
  /**
   * Enforces the 6x6 rule:
   * Maximum 6 bullets per list, maximum 6 words per bullet.
   */
  items: string[];
}

export interface TwoColumnBlock {
  type: 'two-column';
  leftTitle?: string;
  leftHeader?: string;
  leftContent?: string | string[];
  leftPoints?: string[];
  rightTitle?: string;
  rightHeader?: string;
  rightContent?: string | string[];
  rightPoints?: string[];
}

export interface QuoteEvidenceBlock {
  type: 'quote-evidence';
  quote: string;
  attribution?: string;
  citation?: string;
  context?: string;
}

export interface ImageBlock {
  type: 'image';
  imageUrl: string;
  caption?: string;
  layout?: 'split' | 'hero' | 'card';
  alt?: string;
  aspectRatio?: '16:9' | '4:3';
}

export type SlideBlock =
  | ActionHeaderBlock
  | MetricCalloutBlock
  | BulletListBlock
  | TwoColumnBlock
  | QuoteEvidenceBlock
  | ImageBlock;

export type NarrativeFramework = 'Standard-Narrative' | 'SCR' | 'WhatIsCouldBe' | 'ABT' | 'visual-storytelling' | (string & {});

export type PresentationStyleId =
  | 'narrative'
  | 'problem-solution'
  | 'case-study'
  | 'executive-pitch'
  | 'visual-storytelling'
  | 'Standard-Narrative'
  | 'SCR'
  | 'WhatIsCouldBe';

export interface PresentationStyleProfile {
  id: 'narrative' | 'problem-solution' | 'case-study' | 'executive-pitch' | 'visual-storytelling' | 'presentation_slides';
  label: string;
  writingTone: string;
  bulletRule: 'strict-6x6' | 'conversational-brief' | 'data-led' | 'one-line-impact';
  layoutDistribution: {
    heroMetricRatio: number; // e.g. 0.2 = 20% of slides feature big metric callouts
    twoColumnRatio: number;   // e.g. 0.4 = 40% comparative blocks
    splitMediaRatio: number;  // e.g. 0.2 = 20% image-split slides
  };
  narrativeScaffolding: 'SCR' | 'WhatIsCouldBe' | 'EmpiricalCase' | 'Standard-Narrative' | 'VisualNarrative';
  systemInstruction: string;
}

export interface PresentationScopeBoundaries {
  summaryBanner: string;
  covers: string[];
  avoids: string[];
}

export type SlideOutlinePhase =
  | 'overview-action-hook'
  | 'tension-context'
  | 'mechanical-principle'
  | 'empirical-proof'
  | 'strategic-horizon'
  | 'beat-1-action-hook'
  | 'beat-2-tension-context'
  | 'beat-3-mechanical-principle'
  | 'beat-4-empirical-proof'
  | 'beat-5-strategic-horizon';

export type Universal5BeatPhase = SlideOutlinePhase;

export interface RatioComparisonData {
  labelA: string;
  percentA: number;
  labelB: string;
  percentB: number;
  ratio?: string;
  insight?: string;
}

export interface ColorBlockedPillar {
  id: string;
  title: string;
  tag?: string;
  points: string[];
  accentColor?: 'red' | 'blue' | 'black' | 'slate';
  stat?: string;
}

export interface SlideCard {
  id: string;
  order: number;
  actionHeadline: string;
  summary?: string; // 1-sentence analytical takeaway for outline pill cards
  blocks: SlideBlock[];
  speakerNotes: string;
  framework: NarrativeFramework;
  frameworkPhase?: string;
  beatPhase?: Universal5BeatPhase;
  layoutType?: SlideLayoutType;
  // Academic Context & Leave-Behind metadata
  methodologyNote?: string;
  citations?: string[];
  footnote?: string;
  targetDurationSeconds?: number;

  // Swiss Hard-Edge Retro-Poster Editorial Extensions
  subheadline?: string;
  angledBanner?: string;
  headerTag?: string;
  dateBadge?: string;
  calloutRibbon?: string;
  summaryBar?: string;
  ratioComparison?: RatioComparisonData;
  pillars?: ColorBlockedPillar[];
  swissCover?: Record<string, any>;

  // Image Media Extensions
  imageUrl?: string;
  imageCaption?: string;

  /**
   * Canonical card content written by the Gamma studio. Legacy `blocks` are
   * regenerated from it on every edit; `contentFingerprint` records which
   * blocks it produced so an outside edit to `blocks` (copilot, Ask Scholar)
   * is detected and wins.
   */
  content?: CardContent;
  contentFingerprint?: string;
}

export interface SlideDeck {
  id: string;
  title: string;
  topic?: string;
  sourceModule?: 'presentation-studio' | 'coursework' | 'ac' | 'journal';
  framework?: NarrativeFramework;
  themeId?: SlideThemeId;
  customTheme?: CustomTheme | null;
  slides: SlideCard[];
  activeSlideIndex: number;
  createdAt?: string;
  updatedAt?: string;
  /** The talk the deck is for: its length in minutes (drives rehearsal pacing). */
  talkMinutes?: number;
  /** The one thing the audience should remember. */
  keyMessage?: string;
  /** The points the presenter wants to make, in order (one card each). */
  talkPoints?: string[];
}

export type SlideViewMode = 'stage' | 'standalone';

export interface PresentationControlsState {
  isFullscreen: boolean;
  isPresenterOpen: boolean;
  elapsedSeconds: number;
  isTimerRunning: boolean;
  viewMode: SlideViewMode;
}

/**
 * Backward compatibility alias for any existing references
 */
export type KeynoteControlsState = PresentationControlsState;

export interface CopilotMutationRequest {
  deckId: string;
  slideIndex: number;
  prompt: string;
  currentSlide: SlideCard;
}

export interface CopilotMutationResponse {
  success: boolean;
  mutatedSlide: SlideCard;
  appliedPrompt: string;
}

export type PresentationStudioStep =
  | 'understand'
  | 'themes'
  | 'design'
  | 'studio'
  | 'delivery'
  | 'scaffolding';

