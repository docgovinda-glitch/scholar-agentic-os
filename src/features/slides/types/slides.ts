/**
 * Core data structures for Scholar OS Presentation Studio.
 * Enforces 1-idea-per-slide, Universal 5-Beat cognitive breakdown,
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

export type SlideLayoutType =
  | 'bullets'
  | 'image-split'
  | 'image-hero'
  | 'metric-focus'
  | 'two-column'
  | 'quote-evidence'
  | 'cover'
  | 'metrics'
  | 'categories';

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

export type NarrativeFramework = 'Universal-5Beat' | 'SCR' | 'WhatIsCouldBe' | 'ABT';

export type Universal5BeatPhase =
  | 'beat-1-action-hook'
  | 'beat-2-tension-context'
  | 'beat-3-mechanical-principle'
  | 'beat-4-empirical-proof'
  | 'beat-5-strategic-horizon';

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

  // Image Media Extensions
  imageUrl?: string;
  imageCaption?: string;
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
