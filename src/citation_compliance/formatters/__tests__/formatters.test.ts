/**
 * Citation Formatter Tests — Stage 0
 *
 * Verify each citation style formatter correctly formats references.
 * Test cases cover journal articles, books, and edge cases per style.
 */

import { describe, it, expect } from 'vitest';
import { APA7Formatter } from '../apa7';
import { ChicagoFormatter } from '../chicago';
import { HarvardFormatter } from '../harvard';
import { IEEEFormatter } from '../ieee';
import { MLA9Formatter } from '../mla9';
import { VancouverFormatter } from '../vancouver';
import type { CanonicalReference, ReferenceAuthor } from '../../model/reference';

// Test reference: a typical journal article
const createJournalReference = (): CanonicalReference => ({
  kind: 'JournalArticle',
  title: 'Machine Learning in Healthcare: A Systematic Review',
  authors: [
    { firstName: 'John', lastName: 'Smith', order: 0 },
    { firstName: 'Jane', lastName: 'Doe', order: 1 },
    { firstName: 'Robert', lastName: 'Johnson', order: 2 },
  ],
  year: '2022',
  publicationDate: '2022-03-15',
  source: 'Journal of Medical Informatics',
  journal: 'Journal of Medical Informatics',
  volume: '45',
  issue: '3',
  pages: '234-251',
  doi: '10.1234/jmi.2022.45.3.234',
});

const createBookReference = (): CanonicalReference => ({
  kind: 'Book',
  title: 'Advanced Machine Learning Techniques',
  authors: [{ firstName: 'Alice', lastName: 'Chen', order: 0 }],
  year: '2021',
  publicationDate: '2021-06-01',
  source: 'Academic Press',
  publisher: 'Academic Press',
  isbn: '978-0-12345-678-9',
});

const createConferenceReference = (): CanonicalReference => ({
  kind: 'ConferencePaper',
  title: 'Deep Learning Applications in NLP',
  authors: [
    { firstName: 'Michael', lastName: 'Brown', order: 0 },
    { firstName: 'Sarah', lastName: 'Wilson', order: 1 },
  ],
  year: '2023',
  publicationDate: '2023-09-20',
  source: 'Proceedings of the 2023 NLP Conference',
  pages: '112-125',
});

describe('APA 7th Edition Formatter', () => {
  const formatter = new APA7Formatter();

  it('formats a journal article bibliography entry correctly', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted.toLowerCase()).toContain('smith');
    expect(formatted).toContain('Machine Learning in Healthcare');
    expect(formatted).toContain('Journal of Medical Informatics');
    expect(formatted).toContain('2022');
  });

  it('formats a book bibliography entry correctly', () => {
    const ref = createBookReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted.toLowerCase()).toContain('chen');
    expect(formatted).toContain('Advanced Machine Learning Techniques');
    expect(formatted).toContain('Academic Press');
    expect(formatted).toContain('2021');
  });

  it('formats in-text citations', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatInText(ref);

    expect(formatted.length).toBeGreaterThan(0);
    // APA in-text citations include author and year
    expect(formatted).toMatch(/\d{4}/); // Year in parentheses
  });

  it('formats reference lists', () => {
    const refs = [createJournalReference(), createBookReference()];
    const formatted = formatter.formatReferenceList(refs);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('Smith');
    expect(formatted).toContain('Chen');
  });
});

describe('Chicago Author-Date Formatter', () => {
  const formatter = new ChicagoFormatter();

  it('formats a journal article bibliography correctly', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted.toLowerCase()).toContain('smith');
    expect(formatted).toContain('Machine Learning in Healthcare');
    expect(formatted).toContain('Journal of Medical Informatics');
    expect(formatted).toContain('2022');
  });

  it('formats a book bibliography correctly', () => {
    const ref = createBookReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted.toLowerCase()).toContain('chen');
    expect(formatted).toContain('Advanced Machine Learning Techniques');
  });

  it('formats in-text citations', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatInText(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toMatch(/\d{4}/); // Year in parentheses
  });

  it('formats reference lists', () => {
    const refs = [createJournalReference(), createBookReference()];
    const formatted = formatter.formatReferenceList(refs);

    expect(formatted.length).toBeGreaterThan(0);
  });
});

describe('Harvard Formatter', () => {
  const formatter = new HarvardFormatter();

  it('formats a journal article bibliography correctly', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('Machine Learning in Healthcare');
    expect(formatted).toContain('Journal of Medical Informatics');
    expect(formatted).toContain('2022');
  });

  it('formats a book bibliography correctly', () => {
    const ref = createBookReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('Advanced Machine Learning Techniques');
    expect(formatted).toContain('2021');
  });

  it('formats in-text citations', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatInText(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toMatch(/\d{4}/);
  });

  it('formats reference lists', () => {
    const refs = [createJournalReference(), createBookReference()];
    const formatted = formatter.formatReferenceList(refs);

    expect(formatted.length).toBeGreaterThan(0);
  });
});

describe('IEEE Formatter', () => {
  const formatter = new IEEEFormatter();

  it('formats a journal article bibliography correctly', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('Machine Learning in Healthcare');
    expect(formatted).toContain('Journal of Medical Informatics');
  });

  it('formats a conference paper correctly', () => {
    const ref = createConferenceReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('Deep Learning Applications');
    expect(formatted).toContain('2023');
  });

  it('formats in-text citations', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatInText(ref);

    expect(formatted.length).toBeGreaterThan(0);
  });

  it('formats reference lists', () => {
    const refs = [createJournalReference(), createConferenceReference()];
    const formatted = formatter.formatReferenceList(refs);

    expect(formatted.length).toBeGreaterThan(0);
  });
});

describe('MLA 9th Edition Formatter', () => {
  const formatter = new MLA9Formatter();

  it('formats a journal article bibliography correctly', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('Machine Learning in Healthcare');
    expect(formatted).toContain('Journal of Medical Informatics');
    expect(formatted).toContain('2022');
  });

  it('formats a book bibliography correctly', () => {
    const ref = createBookReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('Advanced Machine Learning Techniques');
    expect(formatted).toContain('Academic Press');
    expect(formatted).toContain('2021');
  });

  it('formats in-text citations', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatInText(ref);

    expect(formatted.length).toBeGreaterThan(0);
  });

  it('formats reference lists', () => {
    const refs = [createJournalReference(), createBookReference()];
    const formatted = formatter.formatReferenceList(refs);

    expect(formatted.length).toBeGreaterThan(0);
  });
});

describe('Vancouver Formatter', () => {
  const formatter = new VancouverFormatter();

  it('formats a journal article bibliography correctly', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatBibliography(ref);

    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('Machine Learning in Healthcare');
    expect(formatted).toContain('Journal of Medical Informatics');
  });

  it('formats in-text citations', () => {
    const ref = createJournalReference();
    const formatted = formatter.formatInText(ref);

    expect(formatted.length).toBeGreaterThan(0);
  });

  it('formats reference lists', () => {
    const refs = [createJournalReference(), createBookReference()];
    const formatted = formatter.formatReferenceList(refs);

    expect(formatted.length).toBeGreaterThan(0);
  });
});

describe('Cross-formatter consistency', () => {
  it('all formatters handle the same reference without errors', () => {
    const ref = createJournalReference();
    const formatters = [
      new APA7Formatter(),
      new ChicagoFormatter(),
      new HarvardFormatter(),
      new IEEEFormatter(),
      new MLA9Formatter(),
      new VancouverFormatter(),
    ];

    for (const formatter of formatters) {
      expect(() => {
        const bibliography = formatter.formatBibliography(ref);
        expect(typeof bibliography).toBe('string');
        expect(bibliography.length).toBeGreaterThan(0);
      }).not.toThrow();
    }
  });

  it('all formatters preserve essential information in bibliography', () => {
    const ref = createJournalReference();
    const formatters = [
      new APA7Formatter(),
      new ChicagoFormatter(),
      new HarvardFormatter(),
      new IEEEFormatter(),
      new MLA9Formatter(),
      new VancouverFormatter(),
    ];

    for (const formatter of formatters) {
      const formatted = formatter.formatBibliography(ref);
      // Every formatter should include: title and year
      expect(formatted).toContain(ref.title);
      expect(formatted).toContain(ref.year);
    }
  });

  it('handles missing optional fields gracefully', () => {
    const ref: CanonicalReference = {
      kind: 'JournalArticle',
      title: 'Minimal Reference',
      authors: [{ firstName: 'John', lastName: 'Doe', order: 0 }],
      year: '2023',
      // Intentionally missing: journal, volume, pages, doi
    };

    const formatters = [
      new APA7Formatter(),
      new ChicagoFormatter(),
      new HarvardFormatter(),
      new IEEEFormatter(),
      new MLA9Formatter(),
      new VancouverFormatter(),
    ];

    for (const formatter of formatters) {
      expect(() => {
        const formatted = formatter.formatBibliography(ref);
        expect(formatted.length).toBeGreaterThan(0);
      }).not.toThrow();
    }
  });
});

describe('Edge cases', () => {
  const formatters = {
    apa7: new APA7Formatter(),
    chicago: new ChicagoFormatter(),
    harvard: new HarvardFormatter(),
    ieee: new IEEEFormatter(),
    mla9: new MLA9Formatter(),
    vancouver: new VancouverFormatter(),
  };

  it('handles references with no DOI', () => {
    const ref: CanonicalReference = {
      kind: 'Book',
      title: 'No DOI Book',
      authors: [{ firstName: 'Jane', lastName: 'Author', order: 0 }],
      year: '2023',
      publisher: 'Publisher',
    };

    for (const formatter of Object.values(formatters)) {
      expect(() => formatter.formatBibliography(ref)).not.toThrow();
    }
  });

  it('handles single-author references', () => {
    const ref: CanonicalReference = {
      kind: 'JournalArticle',
      title: 'Solo Author Work',
      authors: [{ firstName: 'Solo', lastName: 'Author', order: 0 }],
      year: '2023',
      journal: 'Journal',
    };

    for (const formatter of Object.values(formatters)) {
      const formatted = formatter.formatBibliography(ref);
      expect(formatted).toContain('Author');
    }
  });

  it('handles titles with special characters', () => {
    const ref: CanonicalReference = {
      kind: 'JournalArticle',
      title: 'Testing & "Quotes" with Special: Characters!',
      authors: [{ firstName: 'Test', lastName: 'Author', order: 0 }],
      year: '2023',
      journal: 'Journal',
    };

    for (const formatter of Object.values(formatters)) {
      expect(() => formatter.formatBibliography(ref)).not.toThrow();
    }
  });
});
