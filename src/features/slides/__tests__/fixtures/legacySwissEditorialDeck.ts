/**
 * A deck exactly as an earlier version's "Swiss Editorial" generator produced
 * it (fictional bird-survey content). Test-only: it checks that decks users
 * saved in that shape still load and render. The app no longer creates it.
 */
import { generateSlideDeck, type DecomposeInput } from '../../services/slideGenerator';
import type { SlideCard, SlideDeck } from '../../types/slides';
import { condenseToSixWords } from '../../services/semanticSlideExtractor';

export function legacySwissEditorialDeck(input: DecomposeInput = {}): SlideDeck {
  const baseDeck = generateSlideDeck(input);
  const cleanTopic = baseDeck.topic || 'Qing Plover: Migratory Bird Season';

  const swissSlides: SlideCard[] = [
    {
      id: 'swiss-slide-1',
      order: 1,
      actionHeadline: `${cleanTopic}: Protected Coastal Habitats`,
      layoutType: 'cover',
      beatPhase: 'beat-1-action-hook',
      framework: input.framework || 'Standard-Narrative',
      frameworkPhase: 'Action Hook',
      swissCover: {
        seasonTag: '// RESEARCH DISPATCH 2026',
        latinName: 'Charadrius alexandrinus',
        heroNumber: '7',
        heroUnit: 'DAYS ON TIDAL FLATS',
        heroLead: 'A field report on coastal habitat preservation and verified ecological surveys.',
        locationTag: 'Yellow Sea Intertidal Shoreline',
        metaPairs: [
          { label: 'COORDINATES', value: '34°12′N 120°28′E' },
          { label: 'SURVEY COHORT', value: '14,800 Individuals' },
          { label: 'ECOLOGY STATUS', value: 'Critically Preserved' },
        ],
      },
      blocks: [
        {
          type: 'action-header',
          headline: `${cleanTopic}: Protected Coastal Habitats`,
          category: 'Editorial Cover',
        },
      ],
      speakerNotes: `Welcome. Today we examine ecological field research on ${cleanTopic}, focusing on tidal wetland preservation and rigorous survey methods.`,
      footnote: `Scholar OS · Swiss Editorial · Slide 1 of 5`,
    },
    {
      id: 'swiss-slide-2',
      order: 2,
      actionHeadline: 'Tidal Flat Carrying Capacity Reaches Peak Threshold with 74% Coastal Concentration',
      layoutType: 'metrics',
      beatPhase: 'beat-2-tension-context',
      framework: input.framework || 'Standard-Narrative',
      frameworkPhase: 'Context & Tension',
      ratioComparison: {
        percentA: 74.2,
        labelA: 'Core Protected Tidal Habitat',
        percentB: 25.8,
        labelB: 'Urban Coastal Buffer Zone',
        ratio: '3:1',
        insight: 'Overwintering shorebirds concentrate heavily along the seaward tidal margins, avoiding artificial embankments.',
      },
      blocks: [
        {
          type: 'action-header',
          headline: 'Tidal Flat Carrying Capacity Reaches Peak Threshold with 74% Coastal Concentration',
          category: 'Ratio Metrics',
        },
      ],
      speakerNotes: `Our telemetry data reveals a decisive 3-to-1 concentration in undisturbed tidal mudflats compared to artificial buffer zones.`,
      footnote: `Scholar OS · Swiss Editorial · Slide 2 of 5`,
    },
    {
      id: 'swiss-slide-3',
      order: 3,
      actionHeadline: 'Three Foundational Pillars Secure Sustainable Multi-Species Coastal Coexistence',
      layoutType: 'categories',
      beatPhase: 'beat-3-mechanical-principle',
      framework: input.framework || 'Standard-Narrative',
      frameworkPhase: 'Core Principles',
      pillars: [
        {
          id: 'p1',
          title: 'HABITAT SANCTUARY',
          tag: '// PILLAR 01',
          accentColor: 'red',
          points: [
            '14.8 km² tidal mudflat protection',
            'Zero-construction coastal zoning',
            'Benthic crustacean seeding',
          ],
          stat: '14,800 Hectares',
        },
        {
          id: 'p2',
          title: 'AUTONOMOUS SENSING',
          tag: '// PILLAR 02',
          accentColor: 'blue',
          points: [
            '24/7 Acoustic monitoring stations',
            'Autonomous thermal LiDAR drones',
            'Sub-second telemetry logging',
          ],
          stat: '99.4% Uptime',
        },
        {
          id: 'p3',
          title: 'COMMUNITY GUARDIANS',
          tag: '// PILLAR 03',
          accentColor: 'black',
          points: [
            '66 Active ranger patrol corridors',
            'Local fisheries eco-certification',
            'Monthly public transparency reports',
          ],
          stat: '66 Patrol Paths',
        },
      ],
      blocks: [
        {
          type: 'action-header',
          headline: 'Three Foundational Pillars Secure Sustainable Multi-Species Coastal Coexistence',
          category: 'Conservation Pillars',
        },
      ],
      speakerNotes: `Conservation resilience rests on three coordinated pillars: physical sanctuary designation, autonomous telemetry, and local community stewardship.`,
      footnote: `Scholar OS · Swiss Editorial · Slide 3 of 5`,
    },
    {
      id: 'swiss-slide-4',
      order: 4,
      actionHeadline: 'Autonomous Sensors Achieve 99.4% Uptime Across Four Seasons',
      layoutType: 'metric-focus',
      beatPhase: 'beat-4-empirical-proof',
      framework: input.framework || 'Standard-Narrative',
      frameworkPhase: 'Empirical Evidence',
      blocks: [
        {
          type: 'action-header',
          headline: 'Autonomous Sensors Achieve 99.4% Uptime Across Four Seasons',
          category: 'Analysis & Evidence',
        },
        {
          type: 'metric-callout',
          value: '99.4%',
          metric: '99.4%',
          label: 'Continuous Telemetry Uptime',
          context: 'Continuous acoustic and visual monitoring across 12 consecutive months of tidal surges',
          trend: 'up',
        },
      ],
      speakerNotes: `Empirical uptime reached 99.4% throughout four seasonal migrations, confirming solar-backed autonomous station reliability.`,
      footnote: `Scholar OS · Swiss Editorial · Slide 4 of 5`,
    },
    {
      id: 'swiss-slide-5',
      order: 5,
      actionHeadline: 'Strategic Horizon: Expanding the Protected Flyway Corridor',
      layoutType: 'bullets',
      beatPhase: 'beat-5-strategic-horizon',
      framework: input.framework || 'Standard-Narrative',
      frameworkPhase: 'Strategic Synthesis',
      blocks: [
        {
          type: 'action-header',
          headline: 'Strategic Horizon: Expanding the Protected Flyway Corridor',
          category: 'Strategic Synthesis',
        },
        {
          type: 'bullet-list',
          items: [
            'Connecting 4 regional flyway estuaries',
            'Bilateral cross-border conservation pact',
            'Real-time public bird migration dashboard',
            'School ecology partnership programs',
            'Permanent statutory sanctuary status',
          ].map(condenseToSixWords),
        },
      ],
      speakerNotes: `In conclusion, our strategic priority is linking regional flyway estuaries into a contiguous protected corridor. Thank you.`,
      footnote: `Scholar OS · Swiss Editorial · Slide 5 of 5`,
    },
  ];

  return {
    ...baseDeck,
    themeId: 'swiss-editorial',
    slides: swissSlides,
  };
}
