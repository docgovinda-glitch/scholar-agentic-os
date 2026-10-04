// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SlideCreativeSketchIllustration from '../SlideCreativeSketchIllustration';

describe('SlideCreativeSketchIllustration', () => {
  it('renders McKinsey Pyramid Principle with 2D consultant sketch and 3-tier MECE strategy pyramid', () => {
    const { container } = render(
      <SlideCreativeSketchIllustration
        themeId="mckinsey-pyramid"
        category="executive"
        accent="#002244"
        cardBg="#FFFFFF"
        canvasBg="#F4F5F7"
        textPrimary="#0F172A"
        textSecondary="#64748B"
        isMini={false}
        mode="light"
      />
    );

    expect(screen.getByText('GOVERNING THOUGHT')).toBeInTheDocument();
    expect(screen.getByText('ARGUMENT A')).toBeInTheDocument();
    expect(screen.getByText('EVIDENCE 01')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders BCG Growth-Share Matrix with 2D business analyst sketch and 4 quadrant labels', () => {
    render(
      <SlideCreativeSketchIllustration
        themeId="bcg-growth-matrix"
        category="executive"
        accent="#00875A"
        cardBg="#FFFFFF"
        canvasBg="#F4F5F7"
        textPrimary="#0F172A"
        textSecondary="#64748B"
        isMini={false}
        mode="light"
      />
    );

    expect(screen.getByText(/MARKET GROWTH RATE/)).toBeInTheDocument();
    expect(screen.getByText('STARS')).toBeInTheDocument();
    expect(screen.getByText('+42% ARR')).toBeInTheDocument();
    expect(screen.getByText('CASH COWS')).toBeInTheDocument();
    expect(screen.getByText('HARVEST')).toBeInTheDocument();
  });

  it('renders Bain Strategic Horizons with visionary telescope sketch and 3 horizon platforms', () => {
    render(
      <SlideCreativeSketchIllustration
        themeId="bain-strategic-horizon"
        category="executive"
        accent="#CC0000"
        cardBg="#FFFFFF"
        canvasBg="#F4F5F7"
        textPrimary="#0F172A"
        textSecondary="#64748B"
        isMini={false}
        mode="light"
      />
    );

    expect(screen.getByText('HORIZON 1')).toBeInTheDocument();
    expect(screen.getByText('HORIZON 2')).toBeInTheDocument();
    expect(screen.getByText('HORIZON 3')).toBeInTheDocument();
    expect(screen.getByText('Scale Engine')).toBeInTheDocument();
  });

  it('renders Harvard Law Casebook with 2D legal advocate sketch, gavel, and scales of justice', () => {
    render(
      <SlideCreativeSketchIllustration
        themeId="harvard-law-casebook"
        category="academic"
        accent="#A51C30"
        cardBg="#FFFFFF"
        canvasBg="#FDFBF7"
        textPrimary="#1C1917"
        textSecondary="#78716C"
        isMini={false}
        mode="light"
      />
    );

    expect(screen.getByText('PRECEDENTIAL RATIO DECIDENDI')).toBeInTheDocument();
    expect(screen.getByText(/Harvard Law Review/)).toBeInTheDocument();
  });

  it('renders MIT Linear Algebra with 2D chalk researcher and 3D coordinate eigenvectors', () => {
    render(
      <SlideCreativeSketchIllustration
        themeId="mit-linear-algebra"
        category="academic"
        accent="#38BDF8"
        cardBg="#0F172A"
        canvasBg="#020617"
        textPrimary="#F1F5F9"
        textSecondary="#94A3B8"
        isMini={false}
        mode="dark"
      />
    );

    expect(screen.getByText(/Av = λv · SPECTRAL DECOMPOSITION/)).toBeInTheDocument();
    expect(screen.getByText('λ₁v₁')).toBeInTheDocument();
  });

  it('renders TED Global Keynote with speaker on circular red rug with spotlight and audience', () => {
    render(
      <SlideCreativeSketchIllustration
        themeId="ted-global-keynote"
        category="conference"
        accent="#E62B1E"
        cardBg="#141414"
        canvasBg="#050505"
        textPrimary="#FFFFFF"
        textSecondary="#A3A3A3"
        isMini={false}
        mode="dark"
      />
    );

    expect(screen.getByText('"Ideas Worth Spreading"')).toBeInTheDocument();
    expect(screen.getByText('TED')).toBeInTheDocument();
  });

  it('renders YC Demo Day Pitch with founder pitching hockey-stick ARR curve', () => {
    render(
      <SlideCreativeSketchIllustration
        themeId="yc-demo-day-pitch"
        category="apple-keynote"
        accent="#FF6600"
        cardBg="#FFFFFF"
        canvasBg="#FAFAFA"
        textPrimary="#0A0A0A"
        textSecondary="#737373"
        isMini={false}
        mode="light"
      />
    );

    expect(screen.getByText('DEMO DAY · BATCH S26')).toBeInTheDocument();
    expect(screen.getByText('10.4x MoM')).toBeInTheDocument();
  });

  it('renders BioRender Cellular Topology with eukaryotic cell, nucleus, DNA, and scientist', () => {
    render(
      <SlideCreativeSketchIllustration
        themeId="biorender-cellular-topology"
        category="scientific"
        accent="#0D9488"
        cardBg="#FFFFFF"
        canvasBg="#F0FDF4"
        textPrimary="#042F2E"
        textSecondary="#0F766E"
        isMini={false}
        mode="light"
      />
    );

    expect(screen.getByText('GENOME SEQUENCING')).toBeInTheDocument();
  });

  it('renders The New Yorker Monograph with pen-and-ink café reader sketch and broadsheet', () => {
    render(
      <SlideCreativeSketchIllustration
        themeId="the-new-yorker-monograph"
        category="editorial"
        accent="#1C1917"
        cardBg="#FBF9F5"
        canvasBg="#F5F2EB"
        textPrimary="#1C1917"
        textSecondary="#78716C"
        isMini={false}
        mode="light"
      />
    );

    expect(screen.getByText('THE EMPIRICAL CHRONICLE')).toBeInTheDocument();
  });

  it('renders mini preview format without overflowing when isMini is true', () => {
    const { container } = render(
      <SlideCreativeSketchIllustration
        themeId="mckinsey-pyramid"
        category="executive"
        accent="#002244"
        cardBg="#FFFFFF"
        canvasBg="#F4F5F7"
        textPrimary="#0F172A"
        textSecondary="#64748B"
        isMini={true}
        mode="light"
      />
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('GOVERNING THOUGHT')).toBeInTheDocument();
  });
});
