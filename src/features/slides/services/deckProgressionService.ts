import type {
  SlideDeck,
  SlideCard,
  SlideBlock,
  SlideLayoutType,
  ActionHeaderBlock,
  TwoColumnBlock,
  MetricCalloutBlock,
  BulletListBlock,
  ImageBlock,
} from '../types/slides';
import { SLIDE_THEMES, type SlideThemeId, type CustomTheme, resolveSlideTheme } from '../types/themes';
import { BEST_100_SLIDE_DESIGNS, type BestSlideDesign } from '../data/bestSlideDesigns100';

export interface DeckProgressionBeat {
  index: number;
  layoutType: SlideLayoutType;
  beatName: string;
  category: string;
  defaultHeadline: string;
  defaultSubheadline: string;
  roleDescription: string;
}

export const CANVA_GAMMA_5_BEATS: DeckProgressionBeat[] = [
  {
    index: 0,
    layoutType: 'cover',
    beatName: 'Cover Hero',
    category: 'EXECUTIVE BRIEFING',
    defaultHeadline: 'Strategic Transformation & Knowledge Grounding',
    defaultSubheadline: 'Verified empirical methodology and executive decision architecture',
    roleDescription: 'Hero typography, category kicker badge, and institutional provenance',
  },
  {
    index: 1,
    layoutType: 'two-column',
    beatName: 'Executive Synthesis',
    category: 'PROBLEM VS SOLUTION',
    defaultHeadline: 'Legacy Friction Mandates Shift to Deterministic Consensus',
    defaultSubheadline: 'Contrasting systemic constraints against strategic target architecture',
    roleDescription: '2-column comparative layout with contrasting cards',
  },
  {
    index: 2,
    layoutType: 'framework',
    beatName: '2D Signature Framework',
    category: 'SIGNATURE FRAMEWORK',
    defaultHeadline: 'Three-Tier Governance Model Anchors Strategic Execution',
    defaultSubheadline: 'Bespoke consulting matrix and vector illustration enforcing MECE rigor',
    roleDescription: 'Authentic 2D vector sketch illustration with analytical takeaways',
  },
  {
    index: 3,
    layoutType: 'metric-focus',
    beatName: 'Quantitative Proof',
    category: 'QUANTITATIVE IMPACT',
    defaultHeadline: 'Controlled Trial Validates +84.2% Retention Gain Across Cohorts',
    defaultSubheadline: 'Double-blind empirical evaluation with zero hallucination drift',
    roleDescription: 'High-conviction metric callout with context and statistical significance',
  },
  {
    index: 4,
    layoutType: 'categories',
    beatName: 'Strategic Roadmap',
    category: 'STRATEGIC HORIZON',
    defaultHeadline: 'Phased Multi-Quarter Execution Roadmap From Ingestion to Scale',
    defaultSubheadline: 'Clear milestone governance across foundation, validation, and scaled rollout',
    roleDescription: 'Three-phase sequential horizon with milestone deliverables',
  },
];

/**
 * Returns specific 2D sketch / framework metadata for a given theme ID.
 */
function getThemeFrameworkDetails(themeId: string): { title: string; bullets: string[] } {
  const tid = themeId.toLowerCase();

  if (tid.includes('mckinsey') || tid.includes('pyramid')) {
    return {
      title: 'McKinsey Pyramid Principle Architecture',
      bullets: [
        'Governing Thought: Lead with singular core synthesis',
        'Key Line Arguments: Logically distinct supporting tiers',
        'MECE Foundation: Mutually exclusive, collectively exhaustive data',
      ],
    };
  }

  if (tid.includes('bcg') || tid.includes('matrix')) {
    return {
      title: 'BCG Growth-Share Matrix Portfolio Trajectory',
      bullets: [
        'High Growth Stars: Accelerate capital reinvestment',
        'Cash Cows: Harvest operational margin for R&D',
        'Strategic Selection: Reallocate resources from low-share assets',
      ],
    };
  }

  if (tid.includes('bain') || tid.includes('horizon')) {
    return {
      title: 'Bain Strategic 3-Horizon Expansion Model',
      bullets: [
        'Horizon 1: Defend and optimize core operational cashflow',
        'Horizon 2: Scale emerging capabilities and partner channels',
        'Horizon 3: Seed next-generation breakthrough architectures',
      ],
    };
  }

  if (tid.includes('apple') || tid.includes('cupertino') || tid.includes('minimal')) {
    return {
      title: 'Cupertino Integrated System Stack',
      bullets: [
        'Hardware Silicon: Sub-millisecond neural execution',
        'OS Framework: Seamless cryptographic security layer',
        'User Experience: Zero-friction human interface elegance',
      ],
    };
  }

  if (tid.includes('deloitte') || tid.includes('transformation')) {
    return {
      title: 'Deloitte Enterprise Digital Mesh',
      bullets: [
        'Cloud Core: Unified multi-cloud microservices fabric',
        'Data Governance: Real-time compliance and telemetry',
        'Workforce Enablement: AI-augmented workflow velocity',
      ],
    };
  }

  if (tid.includes('oxford') || tid.includes('scholastic') || tid.includes('cambridge')) {
    return {
      title: 'Oxford Scholastic Peer-Review Taxonomy',
      bullets: [
        'Primary Source Ingestion: Rigorous double-blind curation',
        'Triangulated Critique: Multi-agent adversarial debate',
        'Archival Provenance: Immutable citation trace to original DOI',
      ],
    };
  }

  if (tid.includes('biorender') || tid.includes('genom') || tid.includes('cell')) {
    return {
      title: 'BioRender Cellular Consensus Cascade',
      bullets: [
        'Receptor Binding: High-affinity molecular targeting',
        'Signal Transduction: Amplified intracellular pathways',
        'Downstream Transcription: Verified phenotypic gene expression',
      ],
    };
  }

  return {
    title: 'Collaborative Multi-Tier Strategic Model',
    bullets: [
      'Empirical Foundation: Verified ground truth data sources',
      'Consensus Protocol: Multi-agent debate eliminates errors',
      'Actionable Delivery: High-conviction operational takeaways',
    ],
  };
}

/**
 * Transforms any presentation deck into the Canva/Gamma 5-slide progression:
 * 1: Cover Hero
 * 2: Executive Synthesis (2-Column Comparative)
 * 3: Signature 2D Vector Framework & Human Sketch
 * 4: Quantitative Proof (Metric Focus)
 * 5: Strategic Phased Roadmap (3 Pillars)
 *
 * Preserves the user's topic, title, and key arguments wherever available!
 */
export function apply5SlideDeckProgression(
  deck: SlideDeck,
  themeId?: SlideThemeId,
  customTheme?: CustomTheme
): SlideDeck {
  const activeThemeId = themeId || deck.themeId || 'sand-academic';
  const effectiveTheme = resolveSlideTheme(activeThemeId, customTheme || deck.customTheme);
  const deckTitle = deck.title || deck.topic || 'Strategic Transformation & Synthesis';
  const frameworkMeta = getThemeFrameworkDetails(activeThemeId);

  // Extract any existing headlines or points from current slides to preserve user work
  const existingSlides = deck.slides || [];
  const existingHeadline1 = existingSlides[0]?.actionHeadline;
  const existingHeadline2 = existingSlides[1]?.actionHeadline;
  const existingHeadline3 = existingSlides[2]?.actionHeadline;
  const existingHeadline4 = existingSlides[3]?.actionHeadline;
  const existingHeadline5 = existingSlides[4]?.actionHeadline;

  // Category-specific default content generation
  const cat = (effectiveTheme.category || 'executive').toLowerCase();

  // Slide 1 Category Defaults
  const cat1Headline =
    cat === 'academic'
      ? `${deckTitle}: Dissertation Inquiry & Empirical Consensus`
      : cat === 'apple-keynote'
      ? `${deckTitle}: Next-Generation Architecture & Intelligence`
      : cat === 'editorial'
      ? `${deckTitle}: An Inquiry Into Structural Trust & Governance`
      : cat === 'scientific'
      ? `${deckTitle}: Spatial Transcriptomics & Molecular Topology`
      : cat === 'conference'
      ? `${deckTitle}: What If Every Decision Was Grounded in Verifiable Truth?`
      : `${deckTitle}: Executive Strategic Synthesis`;

  const cat1Sub =
    cat === 'academic'
      ? 'Doctoral Faculty Committee Defense · Double-Blind Peer Reviewed'
      : cat === 'apple-keynote'
      ? 'Pro Architecture · 3nm Silicon · Designed in California'
      : cat === 'editorial'
      ? 'The Empirical Chronicle · Autumn Monograph · Vol. LXXVIII'
      : cat === 'scientific'
      ? 'Orbital Telemetry & Cryo-EM Resolution [Protocol: 8092-B]'
      : cat === 'conference'
      ? 'TED Global Stage Keynote · Live Main Stage Auditorium'
      : 'McKinsey / BCG Strategic Advisory Practice · Board Briefing';

  // Slide 2 Category Defaults
  const cat2Headline =
    cat === 'academic'
      ? 'Hypothesis Formulation & Empirical Falsification Criteria'
      : cat === 'apple-keynote'
      ? 'Hardware, Silicon & Software Unified Stack'
      : cat === 'editorial'
      ? 'The Anatomy of Institutional Fracture & Structural Renewal'
      : cat === 'scientific'
      ? 'Spectral Calibration & Error Boundary Verification Protocol'
      : cat === 'conference'
      ? 'Complexity Is the Enemy of Execution. Clarity Is Courage.'
      : 'Legacy System Friction Mandates Structured Strategic Shift';

  const cat2LeftTitle =
    cat === 'academic'
      ? 'H₀: Null Hypothesis'
      : cat === 'apple-keynote'
      ? 'Legacy Fragmentation'
      : cat === 'editorial'
      ? 'Structural Inertia'
      : cat === 'scientific'
      ? 'Signal Clipping & Drift'
      : cat === 'conference'
      ? 'Cognitive Fog'
      : 'Legacy Baseline Inertia';

  const cat2LeftContent =
    cat === 'academic'
      ? [
          'Stochastic drift in unanchored parametric models',
          'Susceptibility to adversarial distributed Byzantine faults',
          'Irreversible latency divergence across peer nodes',
        ]
      : cat === 'apple-keynote'
      ? [
          'Siloed co-processors with high memory latency',
          'Redundant data copies across GPU/CPU boundaries',
          'Thermal throttling in continuous heavy workloads',
        ]
      : cat === 'editorial'
      ? [
          'Silent buildup of bureaucratic inertia across legacy institutions',
          'Opacity in algorithmic attribution and audit trails',
          'Erosion of public trust due to ungrounded claims',
        ]
      : cat === 'scientific'
      ? [
          'Thermal drift exceeding 0.05nm during Cryo-EM scans',
          'Spectral clipping and baseline noise in high-frequency bands',
          'Sample degradation from manual pipetting latency',
        ]
      : cat === 'conference'
      ? [
          'Information overload without verifiable truth',
          'Paralysis by analysis across multi-stakeholder committees',
          'Cynicism born of unfulfilled algorithmic promises',
        ]
      : [
          'Stochastic drift in unanchored workflows',
          'Siloed operational data and manual handoffs',
          'High latency overhead in post-hoc reviews',
        ];

  const cat2RightTitle =
    cat === 'academic'
      ? 'H₁: Alternate Paradigm'
      : cat === 'apple-keynote'
      ? 'Unified Silicon Architecture'
      : cat === 'editorial'
      ? 'Verified Analytical Restraint'
      : cat === 'scientific'
      ? 'Locked Calibration Protocol'
      : cat === 'conference'
      ? 'Courageous Clarity'
      : 'Target Strategic Breakthrough';

  const cat2RightContent =
    cat === 'academic'
      ? [
          'Deterministic consensus guarantees mathematical convergence',
          'Formal verification of invariant properties with zero drift',
          'Sub-second consensus confirmation with archival provenance',
        ]
      : cat === 'apple-keynote'
      ? [
          'Zero-copy unified memory architecture across neural cores',
          'Hardware-isolated cryptographic enclave security',
          'Sub-millisecond on-device inference with ultra-low thermal dissipation',
        ]
      : cat === 'editorial'
      ? [
          'Rigorous editorial provenance grounded in verified primary data',
          'Double-blind peer critique before narrative dissemination',
          'Restoration of institutional confidence through radical transparency',
        ]
      : cat === 'scientific'
      ? [
          'Automated drift compensation maintaining <0.002nm stability',
          'Cryo-EM spatial resolution down to 0.18 Å',
          'Continuous 2.4 GHz deep-space telemetry carrier lock',
        ]
      : cat === 'conference'
      ? [
          'Single governing conviction that unifies diverse coalitions',
          'Actionable moral imperative grounded in undeniable evidence',
          'Transformational human flourishing across global communities',
        ]
      : [
          'Deterministic protocol with continuous validation',
          'Unified architecture and automated multi-agent consensus',
          'Sub-second execution with verified audit provenance',
        ];

  // Slide 4 Category Defaults (Metric Focus)
  const cat4Headline =
    cat === 'academic'
      ? 'Double-Blind Trial Validates Statistical Significance (p < 0.001)'
      : cat === 'apple-keynote'
      ? 'Next-Gen Architecture Delivers 50 Billion Transistors & 3.8x Throughput'
      : cat === 'editorial'
      ? 'Macroeconomic Indicators Show +14.8% Institutional Diffusion Alpha'
      : cat === 'scientific'
      ? 'Assay Validates 99.99% Molecular Purity at 0.18 Å Resolution'
      : cat === 'conference'
      ? 'Global Pilot Demonstrates 1 in 3 Individuals Transformed'
      : 'Controlled Trial Validates +84.2% Core Retention Across Workflows';

  const cat4Metric =
    cat === 'academic'
      ? 'p < 0.001'
      : cat === 'apple-keynote'
      ? '50B'
      : cat === 'editorial'
      ? '+14.8%'
      : cat === 'scientific'
      ? '99.99%'
      : cat === 'conference'
      ? '1 in 3'
      : '+84.2%';

  const cat4Label =
    cat === 'academic'
      ? 'Statistical Significance (95% CI: [0.84, 0.92])'
      : cat === 'apple-keynote'
      ? 'Transistors on 3nm Process Architecture'
      : cat === 'editorial'
      ? 'Macroeconomic Diffusion Alpha Index'
      : cat === 'scientific'
      ? 'Molecular Assay Purity (0.18 Å Cryo-EM)'
      : cat === 'conference'
      ? 'Individuals Positively Impacted'
      : 'Core Synthesis Retention';

  const cat4Context =
    cat === 'academic'
      ? 'Empirical cohort validation across n=12,450 randomized trials with zero hallucination drift'
      : cat === 'apple-keynote'
      ? '3.8x faster Neural Engine speed with sub-1.2ms P99 inference latency'
      : cat === 'editorial'
      ? 'Cross-border institutional capital flow of £1.8B with 94.2 institutional confidence rating'
      : cat === 'scientific'
      ? 'Cryo-EM spatial resolution down to 0.18 Å over 2.4 GHz telemetry carrier lock'
      : cat === 'conference'
      ? 'Over 100,000 lives transformed with 0% margin for unverified or hallucinated evidence'
      : 'Double-blind verified trial comparing active model against legacy baseline (p < 0.001)';

  // Slide 5 Category Defaults (Roadmap)
  const cat5Headline =
    cat === 'academic'
      ? 'Dissertation Publication & Archival Defense Chronology'
      : cat === 'apple-keynote'
      ? 'Worldwide Developer Release & Ecosystem Ship Schedule'
      : cat === 'editorial'
      ? 'Three-Part Investigative Dispatch Chronology'
      : cat === 'scientific'
      ? 'Mission Flight & Assay Trajectory Milestones'
      : cat === 'conference'
      ? 'The Moral Imperative for Action & Transformation'
      : 'Three-Phase Execution Roadmap From Ingestion to Enterprise Scale';

  const cat5Items =
    cat === 'academic'
      ? [
          'I. Prolegomena: Epistemological axioms & comprehensive literature review',
          'II. Empirical Trials: Controlled laboratory experimentation & cohort analysis',
          'III. Doctoral Defense: Faculty oral examination & archival library deposit',
        ]
      : cat === 'apple-keynote'
      ? [
          'WWDC Keynote: Silicon architecture reveal & developer beta seed',
          'Developer Beta: Global ecosystem SDK, hardware sandboxes & partner integration',
          'Worldwide Launch: Commercial availability across 180 countries',
        ]
      : cat === 'editorial'
      ? [
          'Dispatch I: The Roots of Systemic Inertia in Modern Institutions',
          'Dispatch II: The Turning Point of Verified Algorithmic Proof',
          'Dispatch III: The Architecture of Sustainable Governance',
        ]
      : cat === 'scientific'
      ? [
          'T-0 Ingestion: Sensor telemetry calibration & specimen alignment lock',
          'Phase I: Real-time Cryo-EM spectrogram assay & protein mapping',
          'Phase II: Autonomous deep-space data telemetry & cruise validation',
        ]
      : cat === 'conference'
      ? [
          'Awaken Conviction: Name the unseen crisis with undeniable clarity',
          'Mobilize Coalition: Unify builders, scholars, and executive leaders',
          'Transform Tomorrow: Commit to verifiable human flourishing',
        ]
      : [
          'Phase 01: Ingestion, schema mapping, and baseline consensus',
          'Phase 02: Model deployment, real-time telemetry, and cohort testing',
          'Phase 03: Scaled production rollout, audit trails, and multi-agent coordination',
        ];

  // -------------------------------------------------------------------------
  // SLIDE 1: Cover Hero Slide
  // -------------------------------------------------------------------------
  const slide1: SlideCard = {
    id: existingSlides[0]?.id || `slide-1-${Date.now()}`,
    order: 1,
    actionHeadline: existingHeadline1 && existingHeadline1.length > 8
      ? existingHeadline1
      : cat1Headline,
    summary: 'Singular strategic thesis and operational scope.',
    layoutType: 'cover',
    beatPhase: 'beat-1-action-hook',
    framework: deck.framework || 'Standard-Narrative',
    frameworkPhase: 'Action Hook',
    blocks: [
      {
        type: 'action-header',
        headline: existingHeadline1 && existingHeadline1.length > 8
          ? existingHeadline1
          : cat1Headline,
        category: cat === 'academic' ? 'ACADEMIC DISSERTATION' : cat === 'apple-keynote' ? 'PRO ARCHITECTURE' : cat === 'editorial' ? 'EDITORIAL ESSAY' : cat === 'scientific' ? 'SCIENTIFIC BRIEFING' : cat === 'conference' ? 'KEYNOTE ADDRESS' : 'EXECUTIVE BRIEFING',
        subheadline: cat1Sub,
      },
    ],
    speakerNotes: `Welcome everyone. Today we are presenting "${deckTitle}". We will walk through our strategic synthesis, the core analytical framework, verified benchmark metrics, and our phased execution roadmap.`,
    methodologyNote: `Derived from Scholar OS verified presentation protocol under ${effectiveTheme.name} design system.`,
    footnote: `Scholar OS · ${effectiveTheme.name} · Slide 01 of 05`,
  };

  // -------------------------------------------------------------------------
  // SLIDE 2: Executive Synthesis (2-Column Comparative)
  // -------------------------------------------------------------------------
  const slide2: SlideCard = {
    id: existingSlides[1]?.id || `slide-2-${Date.now()}`,
    order: 2,
    actionHeadline: existingHeadline2 && existingHeadline2.length > 8
      ? existingHeadline2
      : cat2Headline,
    summary: 'Direct contrast between legacy inertia and proposed strategic breakthrough.',
    layoutType: 'two-column',
    beatPhase: 'beat-2-tension-context',
    framework: deck.framework || 'Standard-Narrative',
    frameworkPhase: 'Synthesis',
    blocks: [
      {
        type: 'action-header',
        headline: existingHeadline2 && existingHeadline2.length > 8
          ? existingHeadline2
          : cat2Headline,
        category: 'PROBLEM VS SOLUTION',
        subheadline: 'Comparing baseline operational constraints against verified target capabilities',
      },
      {
        type: 'two-column',
        leftHeader: cat2LeftTitle,
        leftContent: cat2LeftContent,
        leftPoints: cat2LeftContent,
        rightHeader: cat2RightTitle,
        rightContent: cat2RightContent,
        rightPoints: cat2RightContent,
      },
    ],
    speakerNotes: 'Examining the current landscape: traditional approaches suffer from manual drift and fragmented silos. By contrast, our target model establishes continuous automated validation.',
    methodologyNote: 'Comparative operational analysis based on empirical benchmark tests.',
    footnote: `Scholar OS · ${effectiveTheme.name} · Slide 02 of 05`,
  };

  // -------------------------------------------------------------------------
  // SLIDE 3: Signature 2D Vector Framework & Human Sketch
  // -------------------------------------------------------------------------
  const slide3: SlideCard = {
    id: existingSlides[2]?.id || `slide-3-${Date.now()}`,
    order: 3,
    actionHeadline: existingHeadline3 && existingHeadline3.length > 8
      ? existingHeadline3
      : `${frameworkMeta.title}`,
    summary: 'Core mechanical model illustrating strategic tiers and governance.',
    layoutType: 'framework',
    beatPhase: 'beat-3-mechanical-principle',
    framework: deck.framework || 'Standard-Narrative',
    frameworkPhase: 'Core Framework',
    blocks: [
      {
        type: 'action-header',
        headline: existingHeadline3 && existingHeadline3.length > 8
          ? existingHeadline3
          : `${frameworkMeta.title}`,
        category: 'SIGNATURE 2D FRAMEWORK',
        subheadline: 'Systematic architectural model and governance principles',
      },
      {
        type: 'image',
        imageUrl: '', // Empty imageUrl triggers SlideCreativeSketchIllustration
        caption: `${effectiveTheme.name} 2D Signature Framework`,
        layout: 'split',
      },
      {
        type: 'bullet-list',
        items: frameworkMeta.bullets,
      },
    ],
    speakerNotes: `Here is our signature framework. As shown in the diagram, every tier is strictly governed: from the top-level governing objective down to the supporting foundational proof.`,
    methodologyNote: `Architectural framework model adapted for ${effectiveTheme.name}.`,
    footnote: `Scholar OS · ${effectiveTheme.name} · Slide 03 of 05`,
  };

  // -------------------------------------------------------------------------
  // SLIDE 4: Quantitative Proof & KPI Metrics
  // -------------------------------------------------------------------------
  const slide4: SlideCard = {
    id: existingSlides[3]?.id || `slide-4-${Date.now()}`,
    order: 4,
    actionHeadline: existingHeadline4 && existingHeadline4.length > 8
      ? existingHeadline4
      : cat4Headline,
    summary: 'High-conviction empirical evidence and statistical validation.',
    layoutType: 'metric-focus',
    beatPhase: 'beat-4-empirical-proof',
    framework: deck.framework || 'Standard-Narrative',
    frameworkPhase: 'Quantitative Proof',
    blocks: [
      {
        type: 'action-header',
        headline: existingHeadline4 && existingHeadline4.length > 8
          ? existingHeadline4
          : cat4Headline,
        category: 'QUANTITATIVE IMPACT',
        subheadline: 'Empirical benchmark results across controlled test cohorts',
      },
      {
        type: 'metric-callout',
        value: cat4Metric,
        metric: cat4Metric,
        label: cat4Label,
        context: cat4Context,
        trend: 'up',
      },
    ],
    speakerNotes: `Turning to the quantitative proof: across our verified testing protocol, our approach delivered an undeniable lift with zero regression.`,
    methodologyNote: `Empirical benchmark protocol under ${effectiveTheme.name}.`,
    footnote: `Scholar OS · ${effectiveTheme.name} · Slide 04 of 05`,
  };

  // -------------------------------------------------------------------------
  // SLIDE 5: Strategic Phased Roadmap
  // -------------------------------------------------------------------------
  const slide5: SlideCard = {
    id: existingSlides[4]?.id || `slide-5-${Date.now()}`,
    order: 5,
    actionHeadline: existingHeadline5 && existingHeadline5.length > 8
      ? existingHeadline5
      : cat5Headline,
    summary: 'Sequential milestone commitments across three delivery horizons.',
    layoutType: 'categories',
    beatPhase: 'beat-5-strategic-horizon',
    framework: deck.framework || 'Standard-Narrative',
    frameworkPhase: 'Strategic Roadmap',
    blocks: [
      {
        type: 'action-header',
        headline: existingHeadline5 && existingHeadline5.length > 8
          ? existingHeadline5
          : cat5Headline,
        category: 'STRATEGIC ROADMAP',
        subheadline: 'Structured delivery trajectory with concrete ownership milestones',
      },
      {
        type: 'bullet-list',
        items: cat5Items,
      },
    ],
    pillars: [
      {
        id: 'p-1',
        title: 'Phase 01: Foundation',
        tag: 'Q1 Launch',
        stat: '30 Days',
        points: ['Data ingestion pipelines', 'Baseline consensus protocol', 'Security & RBAC setup'],
      },
      {
        id: 'p-2',
        title: 'Phase 02: Validation',
        tag: 'Q2 Rollout',
        stat: '60 Days',
        points: ['Multi-agent cross check', 'Double-blind cohort trial', 'Automated telemetry'],
      },
      {
        id: 'p-3',
        title: 'Phase 03: Scale',
        tag: 'Q3 Enterprise',
        stat: '90 Days',
        points: ['Universal API integration', 'Autonomous referee simulator', 'Governance lock'],
      },
    ],
    speakerNotes: 'Finally, our execution roadmap: we commence in Phase 1 with foundational data mapping, expand in Phase 2 with full validation, and achieve enterprise scale in Phase 3.',
    methodologyNote: 'Implementation timeline and architectural scalability projections.',
    footnote: `Scholar OS · ${effectiveTheme.name} · Slide 05 of 05`,
  };

  return {
    ...deck,
    title: deckTitle,
    themeId: activeThemeId,
    customTheme: customTheme || deck.customTheme,
    slides: [slide1, slide2, slide3, slide4, slide5],
    activeSlideIndex: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Checks whether a deck strictly adheres to the 5-slide narrative progression.
 */
export function is5SlideProgression(deck: SlideDeck): boolean {
  if (!deck.slides || deck.slides.length !== 5) return false;
  return (
    deck.slides[0].layoutType === 'cover' &&
    deck.slides[1].layoutType === 'two-column' &&
    (deck.slides[2].layoutType === 'framework' || deck.slides[2].layoutType === 'image-split') &&
    deck.slides[3].layoutType === 'metric-focus' &&
    deck.slides[4].layoutType === 'categories'
  );
}
