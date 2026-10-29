#!/usr/bin/env node
/**
 * Slide visual-parity check: web card vs exported .pptx.
 *
 * For every card layout in the light and dark monochrome themes:
 *   1. renders the card in Chromium through the real GammaCard renderer;
 *   2. builds the .pptx in the same page with the real exporter;
 *   3. converts the .pptx to PNG with LibreOffice (headless) + pdftoppm;
 *   4. compares the two images and writes side-by-side PNGs + report.json.
 *
 * Fails on gross mismatch: wrong colours, missing elements or overflow show
 * up as a large mean colour difference on a downscaled grid. Font rendering
 * differences (Plus Jakarta Sans on the web, Arial/Liberation Sans in the
 * export) stay well under the threshold.
 *
 * Usage: start the dev server (`npm run dev`), then
 *   node scripts/slide-parity/run.mjs [--base http://localhost:3000] [--out artifacts/slide-parity]
 * Requires: playwright (Chromium), soffice (LibreOffice), pdftoppm (poppler).
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', process.env.PARITY_BASE_URL || 'http://localhost:3000');
const OUT = resolve(arg('out', 'artifacts/slide-parity'));
// Mean absolute RGB difference (0-255) on a 64×36 grid. Calibrated: matching
// renders score ~3-9; a missing card, swapped theme or overflowing block
// scores well above 20.
const THRESHOLD = Number(arg('threshold', '16'));
// Share of content cells that must appear in the other render (±1 cell).
// Catches missing or overflowing elements that barely move the mean colour.
const MIN_OVERLAP = Number(arg('min-overlap', '0.9'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'pptx'), { recursive: true });

const browser = await chromium.launch(process.env.PARITY_CHROMIUM ? { executablePath: process.env.PARITY_CHROMIUM } : {});
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE + '/signin', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => import('/scripts/slide-parity/harness.tsx'));
await page.waitForFunction(() => Boolean(window.__parity) && document.querySelectorAll('[data-parity]').length > 0);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500); // let the post-font-load re-measure settle

const { themes, layouts } = await page.evaluate(() => ({ themes: window.__parity.themes, layouts: window.__parity.layouts }));

// 1. Web renders
const web = {};
for (const t of themes) {
  for (const l of layouts) {
    const el = page.locator(`[data-parity="${t}--${l}"] > div`).first();
    web[`${t}--${l}`] = (await el.screenshot()).toString('base64');
  }
}

// 2-3. PPTX → PDF → PNG per theme
const pptxPages = {};
for (const t of themes) {
  const b64 = await page.evaluate((id) => window.__parity.pptx(id), t);
  const file = join(OUT, 'pptx', `${t}.pptx`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', join(OUT, 'pptx'), file], { stdio: 'ignore', timeout: 180000 });
  execFileSync('pdftoppm', ['-r', '96', '-png', join(OUT, 'pptx', `${t}.pdf`), join(OUT, 'pptx', t)], { timeout: 120000 });
  const pngs = readdirSync(join(OUT, 'pptx')).filter((f) => f.startsWith(`${t}-`) && f.endsWith('.png')).sort();
  if (pngs.length !== layouts.length) throw new Error(`${t}: expected ${layouts.length} slides in the export, got ${pngs.length}`);
  layouts.forEach((l, i) => {
    pptxPages[`${t}--${l}`] = readFileSync(join(OUT, 'pptx', pngs[i])).toString('base64');
  });
}

// 4. Compare + side-by-side, in the browser canvas
const results = await page.evaluate(
  async ({ web, pptx }) => {
    const load = (b64) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = 'data:image/png;base64,' + b64;
      });
    const grid = (img) => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, 64, 36);
      return x.getImageData(0, 0, 64, 36).data;
    };
    // Structural check: which cells of a 160×90 grid carry content (differ
    // from the slide background)? Text, shapes and images all count. Masks
    // are compared with a one-cell tolerance so font metrics may shift.
    const W = 160;
    const H = 90;
    const mask = (img) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data;
      const bg = [d[(2 * W + 2) * 4], d[(2 * W + 2) * 4 + 1], d[(2 * W + 2) * 4 + 2]];
      const m = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        const diff = (Math.abs(d[i * 4] - bg[0]) + Math.abs(d[i * 4 + 1] - bg[1]) + Math.abs(d[i * 4 + 2] - bg[2])) / 3;
        m[i] = diff > 14 ? 1 : 0;
      }
      return m;
    };
    const dilate = (m) => {
      const o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (!m[y * W + x]) continue;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const yy = y + dy;
              const xx = x + dx;
              if (yy >= 0 && yy < H && xx >= 0 && xx < W) o[yy * W + xx] = 1;
            }
        }
      return o;
    };
    const covered = (m, other) => {
      let n = 0;
      let hit = 0;
      for (let i = 0; i < m.length; i++) if (m[i]) { n++; if (other[i]) hit++; }
      return n ? hit / n : 1;
    };
    const out = {};
    for (const key of Object.keys(web)) {
      const [a, b] = await Promise.all([load(web[key]), load(pptx[key])]);
      const da = grid(a);
      const db = grid(b);
      let sum = 0;
      for (let i = 0; i < da.length; i += 4) sum += (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
      const meanDiff = sum / (da.length / 4);
      const ma = mask(a);
      const mb = mask(b);
      // recall: web content present in the export; precision: export content present on the web
      const recall = covered(ma, dilate(mb));
      const precision = covered(mb, dilate(ma));
      const c = document.createElement('canvas');
      c.width = 1280 * 2 + 30;
      c.height = 720 + 40;
      const x = c.getContext('2d');
      x.fillStyle = '#888';
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#fff';
      x.font = '600 18px sans-serif';
      x.fillText(`web: ${key}`, 10, 26);
      x.fillText(`pptx (LibreOffice): ${key}   diff ${meanDiff.toFixed(1)}  recall ${recall.toFixed(2)}  precision ${precision.toFixed(2)}`, 1300, 26);
      x.drawImage(a, 0, 40, 1280, 720);
      x.drawImage(b, 1290, 40, 1280, 720);
      out[key] = { meanDiff, recall, precision, png: c.toDataURL('image/png').split(',')[1] };
    }
    return out;
  },
  { web, pptx: pptxPages },
);

const report = [];
for (const [key, r] of Object.entries(results)) {
  writeFileSync(join(OUT, `${key}.png`), Buffer.from(r.png, 'base64'));
  report.push({
    card: key,
    meanDiff: Number(r.meanDiff.toFixed(2)),
    recall: Number(r.recall.toFixed(3)),
    precision: Number(r.precision.toFixed(3)),
    pass: r.meanDiff <= THRESHOLD && r.recall >= MIN_OVERLAP && r.precision >= MIN_OVERLAP,
  });
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ threshold: THRESHOLD, minOverlap: MIN_OVERLAP, errors, report }, null, 2));
await browser.close();

for (const r of report) console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.card.padEnd(30)} diff ${String(r.meanDiff).padEnd(5)} recall ${r.recall.toFixed(2)} precision ${r.precision.toFixed(2)}`);
const failed = report.filter((r) => !r.pass);
if (errors.length) console.log('page errors:\n' + errors.join('\n'));
if (failed.length || errors.length) {
  console.error(`\nSlide parity failed: ${failed.length} card(s) mismatched (colour diff > ${THRESHOLD} or overlap < ${MIN_OVERLAP}). Side-by-side images: ${OUT}`);
  process.exit(1);
}
console.log(`\nSlide parity OK: ${report.length} cards (colour diff ≤ ${THRESHOLD}, overlap ≥ ${MIN_OVERLAP}). Side-by-side images: ${OUT}`);
