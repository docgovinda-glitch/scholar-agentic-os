// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { SlideDeck } from '../../types/slides';
import { GAMMA_LAYOUTS, writeCardContent } from '../content';
import { buildDeckPptx } from '../pptxExport';

const ch = (...codes: number[]) => String.fromCharCode(...codes);
// What real pasted text carries: a form feed from a PDF page break, a vertical tab from Word, stray control codes.
const dirty = `Sleep${ch(0x0c)}and memory ${ch(1)}A&B ${ch(0x0b)}<tag> "q" ${ch(0xd83d)} ${ch(0)}end`;

describe('.pptx export of text with control characters', () => {
  it('writes well-formed XML in every part, so PowerPoint opens the file without repair', async () => {
    const content = {
      eyebrow: dirty, headline: dirty, lede: dirty,
      items: [1, 2, 3].map((i) => ({ title: `${dirty} ${i}`, body: dirty })),
      stats: [{ value: '4', label: dirty, detail: dirty }],
      columns: [{ title: dirty, points: [dirty] }, { title: 'R', points: [dirty] }],
      quote: { text: dirty, attribution: dirty }, takeaway: dirty,
      table: { header: [dirty, 'B'], rows: [[dirty, 'x']] },
    };
    const slides = GAMMA_LAYOUTS.map((l, i) =>
      writeCardContent({ id: `s${i}`, order: i + 1, actionHeadline: 'h', blocks: [], speakerNotes: `Notes ${dirty}`, framework: 'Standard-Narrative' } as never, content as never, l.id),
    );
    const pptx = await buildDeckPptx({ id: 'd', title: `Deck ${dirty}`, topic: dirty, themeId: 'scholar-paper', slides } as unknown as SlideDeck);
    const zip = await JSZip.loadAsync((await pptx.write({ outputType: 'nodebuffer' })) as Buffer);
    const parts = Object.keys(zip.files).filter((n) => /\.(xml|rels)$/.test(n));
    expect(parts.length).toBeGreaterThan(15);
    for (const name of parts) {
      const xml = await zip.file(name)!.async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length, name).toBe(0);
    }
    const first = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(first).toContain('Sleep');
    expect(first).toContain('A&amp;B');
  });
});
