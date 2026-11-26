import { describe, it, expect, vi, afterEach } from 'vitest';
import { createBlankSheetDeck } from '../blankSheetService';
import { extractFromClientHtml, recreateDeckFromFile } from '../deckRecreatorService';
import type { SlideDeck } from '../../types/slides';

describe('blankSheetService', () => {
  it('creates a clean 5-slide presentation deck with minimal theme', () => {
    const deck = createBlankSheetDeck(null, 'light');

    expect(deck.slides).toHaveLength(5);
    expect(deck.themeId).toBe('minimal-slate');
    expect(deck.customTheme).toBeDefined();
    expect(deck.customTheme?.canvasBg).toBe('#F8FAFC');
    expect(deck.customTheme?.cardBg).toBe('#FFFFFF');
    expect(deck.customTheme?.accentColor).toBe('#2563EB');

    // Slide 1 is Cover
    expect(deck.slides[0].layoutType).toBe('cover');
    expect(deck.slides[0].frameworkPhase).toBe('01 COVER');

    // Slide 2 is Context
    expect(deck.slides[1].layoutType).toBe('two-column');
    expect(deck.slides[1].frameworkPhase).toBe('02 CONTEXT');

    // Slide 3 is Framework
    expect(deck.slides[2].layoutType).toBe('framework');
    expect(deck.slides[2].frameworkPhase).toBe('03 FRAMEWORK');

    // Slide 4 is Metrics
    expect(deck.slides[3].layoutType).toBe('metric-focus');
    expect(deck.slides[3].frameworkPhase).toBe('04 METRICS');

    // Slide 5 is Roadmap
    expect(deck.slides[4].layoutType).toBe('categories');
    expect(deck.slides[4].frameworkPhase).toBe('05 ROADMAP');
  });

  it('supports dark mode blank sheet canvas', () => {
    const deck = createBlankSheetDeck(null, 'dark');

    expect(deck.slides).toHaveLength(5);
    expect(deck.themeId).toBe('obsidian-aurora');
    expect(deck.customTheme?.mode).toBe('dark');
    expect(deck.customTheme?.canvasBg).toBe('#0A0A0C');
    expect(deck.customTheme?.cardBg).toBe('#161618');
    expect(deck.customTheme?.textPrimary).toBe('#F8FAFC');
  });

  it('preserves existing custom title if provided', () => {
    const existing: SlideDeck = {
      id: 'existing-123',
      title: 'Revolutionary Quantum Computing Thesis',
      topic: 'Quantum',
      slides: [],
    };

    const blankDeck = createBlankSheetDeck(existing, 'light');
    expect(blankDeck.title).toBe('Revolutionary Quantum Computing Thesis');
    expect(blankDeck.slides[0].actionHeadline).toBe('Revolutionary Quantum Computing Thesis');
  });
});

describe('deckRecreatorService', () => {
  it('extractFromClientHtml cleans tags and extracts title and accent', () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>NextGen AI Infrastructure</title>
          <style>
            :root { --brand-color: #0D9488; }
            body { background: #FFFFFF; color: #0F172A; }
          </style>
        </head>
        <body>
          <h1>NextGen AI Infrastructure</h1>
          <p>Autonomous intelligence drives exponential efficiency across distributed computing nodes.</p>
          <h2>Key Scalability Metrics</h2>
          <ul>
            <li>Latency reduced by 40ms</li>
            <li>Throughput increased 3x</li>
          </ul>
        </body>
      </html>
    `;

    const extracted = extractFromClientHtml(sampleHtml);
    expect(extracted.title).toBe('NextGen AI Infrastructure');
    expect(extracted.detectedAccent).toBe('#0D9488');
    expect(extracted.text).toContain('NextGen AI Infrastructure');
    expect(extracted.text).toContain('Latency reduced by 40ms');
  });

  it('recreates a 5-beat deck from HTML file', async () => {
    const htmlContent = `
      <h1>Autonomous Energy Grids</h1>
      <p>Decentralized renewable energy microgrids reduce transmission losses and optimize distribution.</p>
      <h2>Market Context</h2>
      <p>Fossil generation suffers from 65% thermodynamic waste.</p>
      <h2>Grid Architecture</h2>
      <p>Peer-to-peer micro-transactions balance localized load surges in real time.</p>
      <h2>Empirical Proof</h2>
      <p>Tested across 10,000 homes with 99.99% uptime.</p>
      <h2>Deployment Roadmap</h2>
      <p>Rollout across metropolitan utility networks by Q4.</p>
    `;

    const file = new File([htmlContent], 'energy_presentation.html', { type: 'text/html' });
    const result = await recreateDeckFromFile(file);

    expect(result.deck).toBeDefined();
    expect(result.deck.slides).toHaveLength(5);
    expect(result.recreatedTheme).toBeDefined();
    expect(result.customTheme.accentColor).toBeDefined();
    expect(result.fileName).toBe('energy_presentation.html');
  });

  it('recreates a deck from markdown / text file using only its sections', async () => {
    const mdContent = `
# Autonomous Supply Chain Architecture

## Strategic Imperative
Global logistical bottlenecks require predictive neural dispatching.

## Multi-Modal Routing Engine
Dynamic re-routing across maritime, rail, and air corridors reduces transit dwell time.

## Quantitative Validation
94.2% on-time delivery across peak holiday distribution cycles.

## Phased Global Deployment
Phase 1 port integrations followed by regional depot automation.
    `;

    const file = new File([mdContent], 'supply_chain_deck.md', { type: 'text/markdown' });
    const result = await recreateDeckFromFile(file);

    // One slide per section of the user's file, built from their own text.
    expect(result.deck.slides).toHaveLength(4);
    const deckText = JSON.stringify(result.deck.slides);
    expect(deckText).toContain('Multi-Modal Routing Engine');
    expect(deckText).not.toMatch(/Molecular Purity|12,450|84\.2%/);
    expect(result.summary).toContain('created 4 slides');
    expect(result.detectedTitle).toBe('Autonomous Supply Chain Architecture');
    expect(result.customTheme).toBeDefined();
  });
});

describe('recreateDeckFromFile writes nothing the file did not give', () => {
  afterEach(() => vi.unstubAllGlobals());
  const existing = { id: 'deck-1', title: 'My talk', topic: '', framework: 'Standard-Narrative', slides: [{ id: 's1', order: 1, title: 'Mine', blocks: [] }], activeSlideIndex: 0, createdAt: '', updatedAt: '' } as unknown as SlideDeck;

  it('takes only the palette from an image and leaves the slides as they are', async () => {
    const result = await recreateDeckFromFile(new File([new Uint8Array([137, 80, 78, 71])], 'Screenshot 1.png', { type: 'image/png' }), existing);
    expect(result.deck.slides).toEqual(existing.slides);
    expect(result.deck.title).toBe('My talk');
    expect(result.wordCount).toBe(0);
    expect(result.summary).toContain('your slides are unchanged');
    expect(JSON.stringify(result)).not.toMatch(/Executive Synthesis|Strategic Outcomes|roadmap/i);
  });

  it('makes no slides from an image when there is no deck yet', async () => {
    const result = await recreateDeckFromFile(new File([new Uint8Array([1, 2, 3])], 'brand.png', { type: 'image/png' }), null);
    expect(result.deck.slides).toHaveLength(0);
    expect(result.summary).toContain('no slides were made');
  });

  it('reports a server that cannot be reached instead of inventing a deck', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(recreateDeckFromFile(new File(['x'], 'talk.pptx'))).rejects.toThrow(/could not be reached/);
  });

  it("shows the server's own reason when it cannot read the file", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'We could not read text from this file.' }) }));
    await expect(recreateDeckFromFile(new File(['x'], 'scan.pdf'))).rejects.toThrow('We could not read text from this file.');
  });

  it('refuses a file that gave no text, rather than making slides from a placeholder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: '   ', detectedTitle: 'x' }) }));
    await expect(recreateDeckFromFile(new File(['x'], 'empty.pptx'))).rejects.toThrow('Could not extract readable text');
  });
});
