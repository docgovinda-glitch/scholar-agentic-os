/**
 * Browser harness for scripts/slide-parity/run.mjs (loaded through the Vite
 * dev server). Renders one card per layout × theme from fixed sample content
 * and exposes a function that builds the matching .pptx in the same page, so
 * both outputs come from the same geometry code the app ships.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GammaSlide } from '../../src/features/slides/gamma/GammaCard';
import { GAMMA_LAYOUTS, writeCardContent } from '../../src/features/slides/gamma/content';
import { resolveDeckTheme } from '../../src/features/slides/gamma/theme';
import { buildDeckPptx } from '../../src/features/slides/gamma/pptxExport';
import type { CardContent, GammaLayout, SlideCard, SlideDeck } from '../../src/features/slides/types/slides';

const SAMPLE: CardContent = {
  eyebrow: 'Evidence',
  headline: 'Remote work moved housing demand outward',
  lede: 'Demand shifted from city cores to the commuter belt.',
  items: [
    { title: 'Space over proximity', body: 'Households trade commute time for a spare room.' },
    { title: 'Wage arbitrage', body: 'City salaries spent in lower-cost regions.' },
    { title: 'Hybrid anchoring', body: 'Two office days keep buyers within reach.' },
    { title: 'Supply lag', body: 'Construction trails demand by years.' },
  ],
  stats: [
    { value: '60%', label: 'of price growth', detail: 'Mondragon & Wieland (2022)' },
    { value: '10%', label: 'city-centre rents fell' },
    { value: '7%', label: 'suburban rents rose' },
  ],
  columns: [
    { title: 'Convert offices', points: ['Adds central supply', 'Costly retrofits'] },
    { title: 'Densify the belt', points: ['Matches demand', 'Needs transit'] },
  ],
  quote: { text: 'Working from home is here to stay.', attribution: 'Nicholas Bloom' },
  takeaway: 'Demand moved; it did not disappear.',
};

export const THEMES = ['scholar-paper', 'scholar-ink'];
export const LAYOUTS = GAMMA_LAYOUTS.map((l) => l.id) as GammaLayout[];

function card(layout: GammaLayout, i: number): SlideCard {
  const base: SlideCard = { id: `${layout}`, order: i + 1, actionHeadline: SAMPLE.headline, blocks: [], speakerNotes: `Notes for ${layout}`, framework: 'Standard-Narrative' };
  return writeCardContent(base, SAMPLE, layout);
}

function deckFor(themeId: string): SlideDeck {
  return { id: `parity-${themeId}`, title: `Parity ${themeId}`, themeId, activeSlideIndex: 0, slides: LAYOUTS.map(card) };
}

function Harness() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 20, background: '#888' }}>
      {THEMES.flatMap((t) =>
        LAYOUTS.map((l, i) => (
          <div key={`${t}-${l}`} data-parity={`${t}--${l}`} style={{ width: 1280 }}>
            {/* index i+1 keeps page numbers identical to the exported deck (slide i+1). */}
            <GammaSlide slide={card(l, i)} index={i} theme={resolveDeckTheme(t)} scale={1} rounded={false} />
          </div>
        )),
      )}
    </div>
  );
}

declare global {
  interface Window {
    __parity: { themes: string[]; layouts: string[]; pptx: (themeId: string) => Promise<string> };
  }
}

window.__parity = {
  themes: THEMES,
  layouts: LAYOUTS,
  // Returns the .pptx as base64 so the runner can write it to disk.
  pptx: async (themeId: string) => {
    const pptx = await buildDeckPptx(deckFor(themeId));
    return (await pptx.write({ outputType: 'base64' })) as string;
  },
};

document.body.innerHTML = '<div id="parity-root"></div>';
createRoot(document.getElementById('parity-root')!).render(<Harness />);
