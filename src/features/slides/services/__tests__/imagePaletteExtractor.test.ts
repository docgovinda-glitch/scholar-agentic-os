// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  rgbToHex,
  calculatePixelLuminance,
  getHsvMetrics,
  extractPaletteFromRgbaBuffer,
  getFallbackPalette,
} from '../imagePaletteExtractor';

describe('imagePaletteExtractor', () => {
  it('converts rgb to uppercase hex correctly', () => {
    expect(rgbToHex(37, 99, 235)).toBe('#2563EB');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
  });

  it('calculates relative luminance properly', () => {
    const whiteLum = calculatePixelLuminance(255, 255, 255);
    const blackLum = calculatePixelLuminance(0, 0, 0);
    expect(whiteLum).toBeCloseTo(1, 2);
    expect(blackLum).toBeCloseTo(0, 2);
  });

  it('computes HSV saturation and value metrics', () => {
    const pureRed = getHsvMetrics(255, 0, 0);
    expect(pureRed.saturation).toBe(1);
    expect(pureRed.value).toBe(1);

    const gray = getHsvMetrics(128, 128, 128);
    expect(gray.saturation).toBe(0);
    expect(gray.value).toBeCloseTo(0.5, 1);
  });

  it('extracts light Sand palette from an image with light borders and royal blue central signal', () => {
    const width = 10;
    const height = 10;
    const buffer = new Uint8ClampedArray(width * height * 4);

    // Fill with light off-white (245, 245, 240)
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 245;
      buffer[i + 1] = 245;
      buffer[i + 2] = 240;
      buffer[i + 3] = 255;
    }

    // Place vibrant sapphire blue in central pixels (x=4,5, y=4,5)
    for (const y of [4, 5]) {
      for (const x of [4, 5]) {
        const idx = (y * width + x) * 4;
        buffer[idx] = 37;
        buffer[idx + 1] = 99;
        buffer[idx + 2] = 235;
        buffer[idx + 3] = 255;
      }
    }

    const palette = extractPaletteFromRgbaBuffer(buffer, width, height);

    expect(palette.mode).toBe('light');
    expect(palette.canvasBg).toBe('#F7F5F0');
    expect(palette.cardBg).toBe('#FFFFFF');
    expect(palette.textPrimary).toBe('#0F172A');
    expect(palette.accent.toUpperCase()).toBe('#2563EB');
    expect(palette.contrastRatio).toBeGreaterThan(3.0);
  });

  it('extracts dark Midnight palette from an image with dark borders and sky blue central accent', () => {
    const width = 10;
    const height = 10;
    const buffer = new Uint8ClampedArray(width * height * 4);

    // Fill with dark charcoal (20, 20, 24)
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 20;
      buffer[i + 1] = 20;
      buffer[i + 2] = 24;
      buffer[i + 3] = 255;
    }

    // Place sky blue in center (96, 165, 250)
    for (const y of [4, 5]) {
      for (const x of [4, 5]) {
        const idx = (y * width + x) * 4;
        buffer[idx] = 96;
        buffer[idx + 1] = 165;
        buffer[idx + 2] = 250;
        buffer[idx + 3] = 255;
      }
    }

    const palette = extractPaletteFromRgbaBuffer(buffer, width, height);

    expect(palette.mode).toBe('dark');
    expect(palette.canvasBg).toBe('#171717');
    expect(palette.cardBg).toBe('#1C1C1E');
    expect(palette.textPrimary).toBe('#F8FAFC');
    expect(palette.accent.toUpperCase()).toBe('#60A5FA');
  });

  it('returns valid fallback palette for empty buffer or zero dimensions', () => {
    const fallback = getFallbackPalette('light', '#2563EB');
    expect(fallback.canvasBg).toBe('#F7F5F0');
    expect(fallback.cardBg).toBe('#FFFFFF');
    expect(fallback.accent).toBe('#2563EB');
    expect(fallback.isValidWcagAA).toBe(true);
  });
});
