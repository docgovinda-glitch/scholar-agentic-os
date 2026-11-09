# Presentation Studio (OT-22): Slides & Keynotes

Gamma-style card decks with a scientific monochrome look, inline editing, one-click layout and theme switching, a full-screen presenter, and native PowerPoint export that matches what is on screen.

## 1. Where it lives

| Route | Mounted by | Notes |
| :--- | :--- | :--- |
| `/presentation` | `src/desk/DeskApp.tsx` | Works signed-out (demo project); use it to check changes in a browser. |
| OT-22 projects | `DeskApp.tsx` (`outputTypeId === "OT-22"`) | Same workspace, with project hydration and autosave. |

`src/desk/presentation/PresentationWorkspace.tsx` owns deck state, autosave (`PUT /api/projects/:id/presentation/deck` and `/api/presentations/:id`), the single studio header and the full-screen player. It renders four steps from `src/features/slides/components/`:

| Step | Component | What the user does |
| :--- | :--- | :--- |
| 01 Understand | `Step01Understand.tsx` | Enter a topic or upload a document (`.md`, `.txt`, `.pdf`, `.docx`, `.pptx`, image); generate an outline shown as card thumbnails. |
| 02 Design | `Step02Design.tsx` | Pick one of 8 curated themes (each previewed with the user's own slides), browse the library, bring a theme, clone from a screenshot, or set an accent colour (WCAG AA checked). |
| 03 Edit Slides | `Step03StudioCanvas.tsx` (alias `Step03EditSlides`) | Thumbnail rail, inline editing on the card, layout switcher, theme menu, add/remove points, image upload, speaker notes, AI rewrite, **Export .pptx**. |
| 04 Present | `Step04Delivery.tsx` (alias `Step04Present`) | Stage and leave-behind views, export menu (PowerPoint, PDF, Markdown, JSON), start the presenter. |

## 2. The card engine (`src/features/slides/gamma/`)

Every surface (editor, thumbnails, theme gallery, presenter, PDF print and `.pptx`) draws slides through this one engine, so they always match.

| File | Responsibility |
| :--- | :--- |
| `content.ts` | Layout-independent `CardContent` (eyebrow, headline, lede, items, stats, columns, quote, image, takeaway). `getCardContent` derives it from legacy `blocks`; `writeCardContent` stores it and regenerates `blocks` with a fingerprint, so edits made by the copilot or Ask Scholar through `blocks` are detected and win. `reflowContent` coerces content into any layout without inventing numbers. |
| `geometry.ts` | Computes each layout as positioned text, rectangles, ellipses, lines and images on a fixed **1280×720** canvas, with deterministic font fitting. |
| `measure.ts` | Real text measurement via canvas (Plus Jakarta Sans / Georgia on the web, Arial / Georgia for PowerPoint), with a calibrated fallback under jsdom/Node. |
| `GammaCard.tsx` | Web renderer: scales the 1280×720 stage to its container; optional inline editing (`contentEditable`, plain-text paste, Enter to commit, Esc to cancel). |
| `pptxExport.ts` | Draws the same geometry with pptxgenjs (lazy-loaded chunk) at 96 px/in on the 13.333×7.5 in wide layout. Text stays editable; speaker notes and images are included. |
| `GammaPlayer.tsx` | Full-screen presenter: keyboard navigation, audience/presenter mode (N), notes, next card, timer, progress bar. |
| `theme.ts` | Curated deck themes as hex tokens (`bg`, `surface`, `surfaceAlt`, `text`, `muted`, `accent`, `onAccent`, `border`, fonts) plus an adapter for legacy library, cloned and custom themes. Pure `#000000` is never used. |
| `composer.ts` | Offline deck builder (see §4). |
| `StudioControls.tsx` | Layout glyphs, theme menu, export button. |

**Layouts:** `title`, `bento`, `stats` (big numbers), `timeline`, `comparison`, `list` (key points), `split` (image + text), `quote`, `statement`. Old layout ids (`metric-focus`, `two-column`, `cover`, …) map onto these automatically.

**Themes:** Paper (`#F8F7F4`, default), Ink (`#171717`), Sand Academic, Minimal Clean, Editorial Warm, Deep Midnight, Forest Lab, Graphite Amber. Tests enforce text ≥ 7:1, muted text ≥ 4.5:1 and on-accent text ≥ 4.5:1 contrast.

To change how a layout looks, edit `geometry.ts`; the web view and the export follow automatically.

## 3. Images

Images are uploaded from the user's device, downscaled in the browser (max 1600 px) and stored in the deck as data URLs. This keeps them within the production CSP (`img-src 'self' data:`) and lets the exporter embed them directly. Images referenced by external URL are not supported.

## 4. Generation and the no-invented-evidence rule

Decks never contain figures, quotations or citations that are not in the user's material.

- **AI path** (signed in, provider configured): `POST /api/projects/:id/presentation/generate-deck` in `server/routes/project/presentation.ts`. It uses the requested topic, uploaded text, slide count and audience, asks the model for structured cards, and validates them with zod in `server/routes/project/presentationCards.ts`. Any stat whose number is not found in the source material is dropped; a stats card left empty becomes a key-points card.
- **Server fallback** (no provider): builds cards only from the project's own research questions, methodology, findings and Knowledge Vault sources; empty fields become clear prompts for the author.
- **Offline composer** (`composer.ts`, used when the server is unavailable):
  - From text: one card per section. Numbers in the text become stat cards (keeping the original sentence and citation as detail), ordered steps become timelines, contrasts become comparisons, parallel points become bento grids or lists, and the prose is kept as speaker notes.
  - From a bare topic: a structured starter deck whose placeholder text is an instruction to the author, never a claim.
- The copilot's "big metric" action only promotes a number already on the slide; otherwise it switches to numbered cards.

## 5. Keyboard shortcuts

| Where | Keys |
| :--- | :--- |
| Edit Slides | ↑ / ↓ or PageUp / PageDown: previous / next card (when not typing). Enter: commit inline edit; Shift+Enter: new line; Esc: cancel edit. |
| Present (step 4) | ← / →: previous / next; F: start presenting. |
| Presenter | → / Space / Enter / PageDown: next. ← / Backspace / PageUp: previous. Home / End. N: presenter notes. F: full screen. Esc: exit. |

## 6. Tests

- `src/features/slides/gamma/__tests__/gammaEngine.test.ts`: content model, reflow without invented figures, theme contrast, geometry stays on canvas for every layout and theme, composer output, `.pptx` structure (slides, notes, colours).
- `server/routes/__tests__/presentationCards.test.ts`: zod validation and figure grounding.
- `src/desk/presentation/__tests__/PresentationWorkspace.test.tsx` and `src/features/slides/components/__tests__/*`: workspace flow, steps, theme studio.

## 7. Known limitations

- Exported decks use Arial and Georgia so they render the same on Windows and macOS; text is slightly narrower in PowerPoint than in the app's web font.
- The legacy `SlideCanvas` component (`src/features/slides/components/SlideCanvas.tsx`) is still used by `src/desk/assignment/stages/AssignmentDraftingStage.tsx` and `src/features/coursework/components/CourseworkWorkspace.tsx` to preview slides; those surfaces do not use the Gamma card engine.
