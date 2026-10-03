import { describe, it, expect } from 'vitest';
import { replicateSlideFromScreenshot } from '../slideReplicaService';
import type { SlideCard } from '../../types/slides';

describe('slideReplicaService', () => {
  const baseSlide: SlideCard = {
    id: 'slide-test-1',
    order: 1,
    actionHeadline: 'Why Zappos Pays New Hires to Quit',
    speakerNotes: 'Discuss culture fit and self-selection mechanism.',
    framework: 'Standard-Narrative',
    layoutType: 'bullets',
    blocks: [
      {
        type: 'action-header',
        headline: 'Why Zappos Pays New Hires to Quit',
      },
      {
        type: 'bullet-list',
        items: ['Initial training period', 'Offer of $2,000 bonus', 'Self-selection filter'],
      },
    ],
  };

  const sampleMockDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('replicates a slide into image-split layout using attached reference screenshot', async () => {
    const result = await replicateSlideFromScreenshot({
      referenceImage: sampleMockDataUrl,
      currentSlide: baseSlide,
      deckTopic: 'Organizational Culture',
      cloneTheme: false,
    });

    expect(result.detectedLayout).toBe('image-split');
    expect(result.replicatedSlide.layoutType).toBe('image-split');
    expect(result.replicatedSlide.imageUrl).toBe(sampleMockDataUrl);

    // Verify blocks contain image block and structured bullet points
    const imageBlock = result.replicatedSlide.blocks.find((b) => b.type === 'image');
    expect(imageBlock).toBeDefined();
    expect((imageBlock as any).imageUrl).toBe(sampleMockDataUrl);

    const bulletBlock = result.replicatedSlide.blocks.find((b) => b.type === 'bullet-list');
    expect(bulletBlock).toBeDefined();
    expect((bulletBlock as any).items.length).toBeGreaterThan(0);
  });

  it('adapts to 2-column comparative layout when prompt specifies comparison', async () => {
    const result = await replicateSlideFromScreenshot({
      referenceImage: sampleMockDataUrl,
      currentSlide: baseSlide,
      prompt: 'Replicate as 2-column comparison structure',
      deckTopic: 'Culture Change Mechanisms',
      cloneTheme: false,
    });

    expect(result.detectedLayout).toBe('two-column');
    expect(result.replicatedSlide.layoutType).toBe('two-column');
    const twoColBlock = result.replicatedSlide.blocks.find((b) => b.type === 'two-column');
    expect(twoColBlock).toBeDefined();
    expect((twoColBlock as any).leftPoints.length).toBeGreaterThan(0);
    expect((twoColBlock as any).rightPoints.length).toBeGreaterThan(0);
  });

  it('adapts to metric-focus layout when prompt specifies metric focus', async () => {
    const result = await replicateSlideFromScreenshot({
      referenceImage: sampleMockDataUrl,
      currentSlide: baseSlide,
      prompt: 'Focus on big metric callout from screenshot',
      deckTopic: 'Employee Retention',
      cloneTheme: false,
    });

    expect(result.detectedLayout).toBe('metric-focus');
    expect(result.replicatedSlide.layoutType).toBe('metric-focus');
    const metricBlock = result.replicatedSlide.blocks.find((b) => b.type === 'metric-callout');
    expect(metricBlock).toBeDefined();
    expect((metricBlock as any).metric).toBeDefined();
  });

  it('preserves user headline and creates editable footnote', async () => {
    const result = await replicateSlideFromScreenshot({
      referenceImage: sampleMockDataUrl,
      currentSlide: {
        ...baseSlide,
        actionHeadline: 'Schein’s 3 Levels of Culture',
      },
      deckTopic: 'Schein Framework',
      cloneTheme: false,
    });

    expect(result.replicatedSlide.actionHeadline).toBe('Schein’s 3 Levels of Culture');
    expect(result.replicatedSlide.footnote).toContain('Slide replicated from attached reference screenshot');
  });
});
