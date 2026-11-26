// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateThemeFromPrompt,
  compileSlideTheme,
  getStoredCustomThemes,
  saveCustomThemeToStorage,
  removeCustomThemeFromStorage,
  extractThemeFromImage,
  parseThemeJson,
  type ExtractedThemeResult,
} from '../themeExtractorService';

describe('themeExtractorService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('generateThemeFromPrompt', () => {
    it('generates a dark luxury theme for Kimi black gold style prompt', () => {
      const result = generateThemeFromPrompt('Luxury Kimi Black Gold ledger with amber signal');
      expect(result.name).toBe('Black Gold Ledger (AI Generated)');
      expect(result.mode).toBe('dark');
      expect(result.visualMotif).toBe('golden-waves');
      expect(result.layoutArchetype).toBe('data-ledger');
      expect(result.accent).toBe('#EAB308');
    });

    it('generates an electric neon cyber theme for Gamma electric violet prompt', () => {
      const result = generateThemeFromPrompt('Gamma vibrant electric violet neon cyan split visual');
      expect(result.name).toBe('Electric Violet Business (AI Generated)');
      expect(result.mode).toBe('dark');
      expect(result.visualMotif).toBe('cyber-hud');
      expect(result.layoutArchetype).toBe('split-hero');
      expect(result.accent).toBe('#06B6D4');
    });

    it('generates an academic courseware theme for paper white prompt', () => {
      const result = generateThemeFromPrompt('Minimal light paper white editorial academic clean');
      expect(result.mode).toBe('light');
      expect(result.visualMotif).toBe('topographic');
      expect(result.layoutArchetype).toBe('standard-card');
    });
  });

  describe('compileSlideTheme', () => {
    it('compiles an extraction result into a valid SlideTheme object', () => {
      const extracted: ExtractedThemeResult = {
        name: 'Obsidian Velvet',
        tagline: 'High contrast tactical tech theme',
        category: 'dark',
        mode: 'dark',
        visualMotif: 'cyber-hud',
        layoutArchetype: 'split-hero',
        headerStamp: 'TACTICAL SYSTEMS // DEFENSE RADAR',
        canvasBg: '#0F172A',
        cardBg: '#1E293B',
        accent: '#38BDF8',
        textPrimary: '#FFFFFF',
        textSecondary: '#D4D4D8',
        textMuted: '#A1A1AA',
        fontFamily: 'mono',
      };

      const theme = compileSlideTheme(extracted, 'test-theme-01');
      expect(theme.id).toBe('test-theme-01');
      expect(theme.name).toBe('Obsidian Velvet');
      expect(theme.accent).toBe('#38BDF8');
      expect(theme.cardBg).toBe('#1E293B');
      expect(theme.mode).toBe('dark');
      expect(theme.swatch).toEqual(['#0F172A', '#1E293B', '#38BDF8']);
      expect(theme.textPrimary).toBe('text-white');
      expect(theme.visualMotif).toBe('cyber-hud');
      expect(theme.layoutArchetype).toBe('split-hero');
    });
  });

  describe('localStorage persistence', () => {
    it('stores and retrieves custom themes from localStorage', () => {
      expect(getStoredCustomThemes()).toEqual([]);

      const extracted = generateThemeFromPrompt('Minimal Dark Cyber HUD');
      const compiled = compileSlideTheme(extracted, 'matrix-01');
      saveCustomThemeToStorage(compiled);

      const retrieved = getStoredCustomThemes();
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].id).toBe('matrix-01');
      expect(retrieved[0].visualMotif).toBe('cyber-hud');
    });
  });

  describe('storage that is damaged or unavailable', () => {
    const KEY = 'scholar_os_custom_slide_themes';
    const good = () => compileSlideTheme(generateThemeFromPrompt('Minimal Dark Cyber HUD'), 'good-1');
    afterEach(() => vi.restoreAllMocks());

    it('leaves out saved entries that are not usable themes instead of breaking the library', () => {
      const ok = good();
      localStorage.setItem(KEY, JSON.stringify([ok, null, 'text', 5, { id: 'no-colours', name: 'x' }, { ...ok, id: 'bad-colour', accent: 'javascript:alert(1)' }, { ...ok, id: '' }]));
      expect(getStoredCustomThemes().map((t) => t.id)).toEqual(['good-1']);
    });

    it('treats a saved value that is not a list, or not JSON, as empty and still saves a new theme', () => {
      for (const damaged of ['{"a":1}', '"text"', '42', 'not json {']) {
        localStorage.setItem(KEY, damaged);
        expect(getStoredCustomThemes()).toEqual([]);
        expect(saveCustomThemeToStorage(good())).toBe(true);
        expect(getStoredCustomThemes().map((t) => t.id)).toEqual(['good-1']);
      }
    });

    it('says whether the theme was saved, and does not claim it when storage refuses', () => {
      expect(saveCustomThemeToStorage(good())).toBe(true);
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(saveCustomThemeToStorage({ ...good(), id: 'another' })).toBe(false);
      expect(removeCustomThemeFromStorage('good-1')).toBe(false);
    });

    it('removes a saved theme and reports it', () => {
      saveCustomThemeToStorage(good());
      saveCustomThemeToStorage({ ...good(), id: 'second' });
      expect(removeCustomThemeFromStorage('good-1')).toBe(true);
      expect(getStoredCustomThemes().map((t) => t.id)).toEqual(['second']);
    });
  });

  describe('extractThemeFromImage when the file cannot be read', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('rejects instead of waiting forever when the file read fails', async () => {
      class FailingReader {
        onload: ((e: unknown) => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        readAsDataURL() {
          setTimeout(() => this.onerror?.(), 0);
        }
      }
      vi.stubGlobal('FileReader', FailingReader);
      await expect(extractThemeFromImage(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow('could not be read');
    });

    it('rejects when the read gives no data', async () => {
      class EmptyReader {
        onload: ((e: { target: { result: string } }) => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        readAsDataURL() {
          setTimeout(() => this.onload?.({ target: { result: '' } }), 0);
        }
      }
      vi.stubGlobal('FileReader', EmptyReader);
      await expect(extractThemeFromImage(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow('could not be read');
    });
  });

  describe('parseThemeJson (a theme shared by a teammate or client)', () => {
    const valid = { name: 'Client Navy', accent: '#002244', canvasBg: '#F4F5F7', cardBg: '#fff', textPrimary: '#0F172A', mode: 'light', fontFamily: 'serif', visualMotif: 'minimal-frame', category: 'executive' };

    it('accepts a complete valid theme, bare or wrapped in { theme }', () => {
      for (const text of [JSON.stringify(valid), JSON.stringify({ theme: valid })]) {
        const r = parseThemeJson(text);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.theme).toMatchObject({ name: 'Client Navy', accent: '#002244', mode: 'light', fontFamily: 'serif' });
      }
    });

    it('needs only a name and an accent', () => {
      expect(parseThemeJson('{"name":"Plain","accent":"#abc"}')).toEqual({ ok: true, theme: { name: 'Plain', accent: '#abc' } });
    });

    it('rejects anything that is not one theme, saying why', () => {
      const cases: Array<[string, RegExp]> = [
        ['not json {', /not valid JSON/],
        ['null', /one theme/],
        ['[1,2]', /one theme/],
        ['"text"', /one theme/],
        ['{"accent":"#123456"}', /needs a name/],
        [JSON.stringify({ name: 'x'.repeat(81), accent: '#123456' }), /name of 1 to 80/],
        ['{"name":"x"}', /accent colour/],
        [JSON.stringify({ ...valid, accent: 'red' }), /"accent" must be a hex colour/],
        [JSON.stringify({ ...valid, canvasBg: 'url(https://evil.example/x.png)' }), /"canvasBg" must be a hex colour/],
        [JSON.stringify({ ...valid, cardBg: 12 }), /"cardBg" must be a hex colour/],
        [JSON.stringify({ ...valid, mode: 'sepia' }), /"mode" must be one of: light, dark/],
        [JSON.stringify({ ...valid, fontFamily: 'Comic Sans' }), /"fontFamily" must be one of/],
        [JSON.stringify({ ...valid, visualMotif: 'rainbow' }), /"visualMotif" must be one of/],
        [JSON.stringify({ ...valid, category: ['dark'] }), /"category" must be one of/],
      ];
      for (const [text, error] of cases) {
        const r = parseThemeJson(text);
        expect(r.ok, text.slice(0, 30)).toBe(false);
        if (!r.ok) expect(r.error).toMatch(error);
      }
    });
  });
});

