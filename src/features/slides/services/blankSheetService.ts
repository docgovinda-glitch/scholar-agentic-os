import type { SlideDeck, SlideCard } from '../types/slides';
import type { CustomTheme } from '../types/themes';

/**
 * Creates a clean, distraction-free "Blank Sheet" presentation deck.
 * For users who want complete creative freedom to design their slides
 * freely by themselves in the Canvas Studio, rather than being boxed
 * into rigid presets or manual hex color codes.
 */
export function createBlankSheetDeck(
  existingDeck?: SlideDeck | null,
  mode: 'light' | 'dark' = 'light'
): SlideDeck {
  const isDark = mode === 'dark';

  const customTheme: CustomTheme = {
    name: isDark ? 'Blank Sheet (Dark Canvas)' : 'Blank Sheet (Pristine Light)',
    accentColor: isDark ? '#38BDF8' : '#2563EB',
    fontPairing: 'Inter',
    surfaceTreatment: 'elevated',
    contrastRatio: isDark ? 8.2 : 5.8,
    isValidWcagAA: true,
    visualMotif: 'minimal-frame',
    canvasBg: isDark ? '#0A0A0C' : '#F8FAFC',
    cardBg: isDark ? '#161618' : '#FFFFFF',
    textPrimary: isDark ? '#F8FAFC' : '#0F172A',
    textSecondary: isDark ? '#94A3B8' : '#64748B',
    mode,
    swatch: isDark ? ['#0A0A0C', '#161618', '#38BDF8'] : ['#F8FAFC', '#FFFFFF', '#2563EB'],
    source: 'custom',
  };

  const title =
    existingDeck?.title && existingDeck.title !== 'Untitled Presentation'
      ? existingDeck.title
      : 'Untitled Presentation (Blank Sheet)';

  const blankSlides: SlideCard[] = [
    {
      id: `slide-blank-1-${Date.now()}`,
      order: 1,
      actionHeadline: title,
      summary: 'Add an executive summary or subtitle to anchor your presentation.',
      layoutType: 'cover',
      framework: 'Standard-Narrative',
      frameworkPhase: '01 COVER',
      blocks: [
        {
          type: 'action-header',
          headline: title,
          subheadline: 'Click to add your subtitle, thesis statement, or author name.',
        },
      ],
      speakerNotes: 'Welcome your audience. State the purpose of this presentation.',
      targetDurationSeconds: 120,
    },
    {
      id: `slide-blank-2-${Date.now()}`,
      order: 2,
      actionHeadline: 'Executive Context & Strategic Synthesis',
      summary: 'Synthesize the opportunity, background tension, or problem space.',
      layoutType: 'two-column',
      framework: 'Standard-Narrative',
      frameworkPhase: '02 CONTEXT',
      blocks: [
        {
          type: 'action-header',
          headline: 'Executive Context & Strategic Synthesis',
          subheadline: 'Click to formulate your core thesis statement.',
        },
        {
          type: 'two-column',
          leftTitle: 'Strategic Problem / Context',
          leftContent: 'Click to describe the market background, friction, or research question.',
          rightTitle: 'Proposed Breakthrough',
          rightContent: 'Click to describe the methodology, unique approach, or core thesis.',
        },
      ],
      speakerNotes: 'Walk through the core context and contrasting perspectives.',
      targetDurationSeconds: 120,
    },
    {
      id: `slide-blank-3-${Date.now()}`,
      order: 3,
      actionHeadline: 'Architectural Framework & Methodology',
      summary: 'Present your visual architecture, model, or structured process.',
      layoutType: 'framework',
      framework: 'Standard-Narrative',
      frameworkPhase: '03 FRAMEWORK',
      blocks: [
        {
          type: 'action-header',
          headline: 'Architectural Framework & Methodology',
          subheadline: 'Interactive framework canvas ready for diagrams, pillars, or flow.',
        },
        {
          type: 'bullet-list',
          items: [
            'Click to describe Layer 1: Core Foundation',
            'Click to describe Layer 2: Execution Mechanism',
            'Click to describe Layer 3: Strategic Outcomes',
          ],
        },
      ],
      speakerNotes: 'Explain the visual framework and operational mechanisms.',
      targetDurationSeconds: 120,
    },
    {
      id: `slide-blank-4-${Date.now()}`,
      order: 4,
      actionHeadline: 'Quantitative Impact & Key Metrics',
      summary: 'Demonstrate measurable results with clear high-signal data points.',
      layoutType: 'metric-focus',
      framework: 'Standard-Narrative',
      frameworkPhase: '04 METRICS',
      blocks: [
        {
          type: 'action-header',
          headline: 'Quantitative Impact & Key Metrics',
          subheadline: 'Key performance indicators and empirical proof points.',
        },
        {
          type: 'metric-callout',
          metric: '100%',
          label: 'Primary Measurable Metric',
          context: 'Click to edit metric value and descriptive context.',
          trend: 'up',
        },
      ],
      speakerNotes: 'Highlight the empirical proof and quantitative metrics.',
      targetDurationSeconds: 120,
    },
    {
      id: `slide-blank-5-${Date.now()}`,
      order: 5,
      actionHeadline: 'Strategic Roadmap & Forward Action',
      summary: 'Provide clear, actionable next steps and execution milestones.',
      layoutType: 'categories',
      framework: 'Standard-Narrative',
      frameworkPhase: '05 ROADMAP',
      blocks: [
        {
          type: 'action-header',
          headline: 'Strategic Roadmap & Forward Action',
          subheadline: 'Phased deliverables and immediate milestones.',
        },
        {
          type: 'bullet-list',
          items: [
            'Phase 1: Immediate mobilization and setup',
            'Phase 2: Execution and empirical validation',
            'Phase 3: Scale, delivery, and review',
          ],
        },
      ],
      speakerNotes: 'Close with concrete next steps and strategic horizon.',
      targetDurationSeconds: 120,
    },
  ];

  return {
    id: existingDeck?.id || `deck-blank-${Date.now()}`,
    title,
    topic: existingDeck?.topic || 'Custom Blank Presentation',
    framework: 'Universal-5Beat',
    themeId: isDark ? 'obsidian-aurora' : 'minimal-slate',
    customTheme,
    slides: blankSlides,
    activeSlideIndex: 0,
    sourceModule: 'presentation-studio',
    createdAt: existingDeck?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
