import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateThemeFromPrompt,
  compileSlideTheme,
  getStoredCustomThemes,
  saveCustomThemeToStorage,
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
});
