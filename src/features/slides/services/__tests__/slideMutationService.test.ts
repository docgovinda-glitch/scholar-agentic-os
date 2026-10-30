import { describe, it, expect } from 'vitest';
import {
  makeMoreConcise,
  convertToSplitImage,
  highlightAsBigMetric,
  changeToTwoColumn,
  strengthenActiveVoice,
  applyQuickMutation,
  executeSlidePrompt,
} from '../slideMutationService';
import type { SlideCard } from '../../types/slides';

describe('slideMutationService', () => {
  const sampleSlide: SlideCard = {
    id: 'slide-101',
    order: 1,
    actionHeadline: 'Introduction to Organizational Culture and Leadership Dynamics',
    summary: 'A detailed overview of how leadership behaviors impact workplace culture and employee retention across companies.',
    layoutType: 'bullets',
    framework: 'Standard-Narrative',
    blocks: [
      {
        type: 'action-header',
        headline: 'Introduction to Organizational Culture and Leadership Dynamics',
        category: 'ORGANIZATIONAL CULTURE',
        subheadline: 'Initial findings on employee values',
      },
      {
        type: 'bullet-list',
        items: [
          'First long bullet point detailing why organizational values matter in corporate environments today',
          'Second lengthy bullet point describing how Schein identifies artifacts as visible markers of culture',
          'Third comprehensive point explaining why perks and free lunches fail to alter underlying assumptions',
          'Fourth descriptive point covering how leadership interventions must target shared core habits and beliefs',
          'Fifth point exploring why structured interviews reveal whether candidates align with foundational values',
          'Sixth extra point explaining how retention rates drop when corporate rhetoric conflicts with daily actions',
          'Seventh redundant point that should be pruned under the strict 6x6 rule',
          'Eighth unnecessary bullet point that exceeds standard presentation density rules',
        ],
      },
    ],
    speakerNotes: 'Walk the audience through the cultural baseline.',
  };

  it('⚡ Make More Concise: enforces 6x6 rule (max 6 bullets, max 6 words per bullet)', () => {
    const concise = makeMoreConcise(sampleSlide);

    const bulletBlock = concise.blocks.find((b) => b.type === 'bullet-list');
    expect(bulletBlock).toBeDefined();
    if (bulletBlock && bulletBlock.type === 'bullet-list') {
      // Must have at most 6 bullets
      expect(bulletBlock.items.length).toBeLessThanOrEqual(6);
      // Every bullet must have at most 6 words
      bulletBlock.items.forEach((item) => {
        const words = item.split(/\s+/).filter(Boolean);
        expect(words.length).toBeLessThanOrEqual(6);
      });
    }
  });

  it('🖼 Convert to Split Image: switches layout to image-split and ensures ImageBlock', () => {
    const split = convertToSplitImage(sampleSlide);

    expect(split.layoutType).toBe('image-split');
    const imageBlock = split.blocks.find((b) => b.type === 'image');
    expect(imageBlock).toBeDefined();
  });

  it('📊 Highlight as Big Metric: switches layout to metric-focus with high-contrast stat', () => {
    const metricSlide = highlightAsBigMetric(sampleSlide, '+84.2%', 'Retention Lift');

    expect(metricSlide.layoutType).toBe('metric-focus');
    const metricBlock = metricSlide.blocks.find((b) => b.type === 'metric-callout');
    expect(metricBlock).toBeDefined();
    if (metricBlock && metricBlock.type === 'metric-callout') {
      expect(metricBlock.value).toBe('+84.2%');
      expect(metricBlock.label).toBe('Retention Lift');
    }
  });

  it('⚖️ Change to 2-Column Comparison: splits content into comparative analysis cards', () => {
    const twoColSlide = changeToTwoColumn(sampleSlide);

    expect(twoColSlide.layoutType).toBe('two-column');
    const twoColBlock = twoColSlide.blocks.find((b) => b.type === 'two-column');
    expect(twoColBlock).toBeDefined();
    if (twoColBlock && twoColBlock.type === 'two-column') {
      expect(twoColBlock.leftPoints?.length).toBeGreaterThan(0);
      expect(twoColBlock.rightPoints?.length).toBeGreaterThan(0);
    }
  });

  it('✍️ Strengthen Active Voice: sharpens passive headline into decisive action assertion', () => {
    const active = strengthenActiveVoice(sampleSlide);

    expect(active.actionHeadline).not.toContain('Introduction to');
    expect(active.actionHeadline.length).toBeGreaterThan(5);

    const headerBlock = active.blocks.find((b) => b.type === 'action-header');
    expect(headerBlock).toBeDefined();
    if (headerBlock && headerBlock.type === 'action-header') {
      expect(headerBlock.headline).toBe(active.actionHeadline);
    }
  });

  it('applies quick mutations through applyQuickMutation dispatcher', () => {
    const concise = applyQuickMutation(sampleSlide, 'make-concise');
    expect(concise.blocks.find((b) => b.type === 'bullet-list')).toBeDefined();

    const split = applyQuickMutation(sampleSlide, 'convert-to-split-image');
    expect(split.layoutType).toBe('image-split');

    const metric = applyQuickMutation(sampleSlide, 'highlight-as-big-metric');
    expect(metric.layoutType).toBe('metric-focus');

    const twoCol = applyQuickMutation(sampleSlide, 'change-to-two-column');
    expect(twoCol.layoutType).toBe('two-column');

    const active = applyQuickMutation(sampleSlide, 'strengthen-active-voice');
    expect(active.actionHeadline).not.toContain('Introduction to');
  });

  it('executes slide prompt with intelligent client-side keyword routing', async () => {
    const conciseRes = await executeSlidePrompt({
      currentSlide: sampleSlide,
      prompt: 'Make this concise using 6x6 rule',
    });
    expect(conciseRes.message).toContain('6x6');

    const imageRes = await executeSlidePrompt({
      currentSlide: sampleSlide,
      prompt: 'Convert to split image layout with visual',
    });
    expect(imageRes.mutatedSlide.layoutType).toBe('image-split');

    const metricRes = await executeSlidePrompt({
      currentSlide: sampleSlide,
      prompt: 'Highlight key metric stat',
    });
    expect(metricRes.mutatedSlide.layoutType).toBe('metric-focus');

    const compareRes = await executeSlidePrompt({
      currentSlide: sampleSlide,
      prompt: 'Change to 2-column comparison',
    });
    expect(compareRes.mutatedSlide.layoutType).toBe('two-column');
  });

  describe('never invents slide content', () => {
    const emptySlide: SlideCard = {
      id: 'slide-empty',
      order: 1,
      actionHeadline: 'A study on rural clinic wait times',
      layoutType: 'bullets',
      framework: 'Standard-Narrative',
      blocks: [{ type: 'action-header', headline: 'A study on rural clinic wait times', category: '', subheadline: '' }],
    } as SlideCard;

    it('headline editing strips weak openers without adding claims', () => {
      const out = strengthenActiveVoice(emptySlide);
      expect(out.actionHeadline).toBe('Rural clinic wait times');
      expect(out.actionHeadline).not.toMatch(/proves|drives|verifiable/i);
    });

    it('2-column with too few points invents no comparison', () => {
      const out = changeToTwoColumn(emptySlide);
      const col = out.blocks.find((b) => b.type === 'two-column');
      expect(col && col.type === 'two-column' ? [...col.leftPoints, ...col.rightPoints] : null).toEqual([]);
    });

    it('split image adds no stock bullets or caption', () => {
      const out = convertToSplitImage(emptySlide);
      expect(out.blocks.some((b) => b.type === 'bullet-list')).toBe(false);
      const img = out.blocks.find((b) => b.type === 'image');
      expect(img && img.type === 'image' ? img.caption : null).toBe('');
    });
  });
});
