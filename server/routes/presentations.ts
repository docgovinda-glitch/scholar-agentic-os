/**
 * Presentation Studio REST API Routes
 *
 * Persists and manages Scholar OS 5-Beat Presentation Decks in PostgreSQL / Supabase,
 * supporting debounced autosave, copilot mutations, and CRUD operations.
 */

import express, { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { parseDocument, normalizeUnicodeNFC } from "../../src/document_intelligence/index.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";
import { requireAuth } from "../src/middleware/auth.ts";
import { z } from "zod";
import { createUploadInstance } from "../src/middleware/uploadGuard.ts";

const upload = createUploadInstance({ enforceHeavyParseLimit: true });

async function extractTextFromPptx(buffer: Buffer): Promise<{ text: string; themeColors?: { accent?: string; canvasBg?: string; cardBg?: string; textPrimary?: string } }> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name)
    );
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || "0", 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || "0", 10);
      return numA - numB;
    });

    const slideTexts: string[] = [];
    for (const slidePath of slideFiles) {
      const xml = await zip.files[slidePath].async("text");
      const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
      const extracted = matches
        .map((m) => m.replace(/<[^>]+>/g, "").trim())
        .filter(Boolean)
        .join(" ");
      if (extracted) {
        slideTexts.push(extracted);
      }
    }

    // Try extracting theme colors from ppt/theme/theme1.xml
    let themeColors: { accent?: string; canvasBg?: string; cardBg?: string; textPrimary?: string } | undefined;
    const themeFile = zip.files["ppt/theme/theme1.xml"];
    if (themeFile) {
      const themeXml = await themeFile.async("text");
      const accentMatch = themeXml.match(/<a:accent1>\s*<(?:a:srgbClr\s+val="([0-9A-Fa-f]{6})"[^>]*|a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/);
      const accentHex = accentMatch ? `#${accentMatch[1] || accentMatch[2]}` : undefined;

      const dkMatch = themeXml.match(/<a:dk1>\s*<(?:a:srgbClr\s+val="([0-9A-Fa-f]{6})"[^>]*|a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/);
      const ltMatch = themeXml.match(/<a:lt1>\s*<(?:a:srgbClr\s+val="([0-9A-Fa-f]{6})"[^>]*|a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/);

      if (accentHex || dkMatch || ltMatch) {
        themeColors = {
          accent: accentHex || "#2563EB",
          cardBg: ltMatch ? `#${ltMatch[1] || ltMatch[2]}` : "#FFFFFF",
          canvasBg: ltMatch ? `#${ltMatch[1] || ltMatch[2]}` : "#F8FAFC",
          textPrimary: dkMatch ? `#${dkMatch[1] || dkMatch[2]}` : "#0F172A",
        };
      }
    }

    return { text: slideTexts.join("\n\n"), themeColors };
  } catch (err) {
    console.warn("[presentations.ts] PPTX parse fallback error:", err);
    return { text: buffer.toString("utf-8").replace(/[^\x20-\x7E\n]/g, " ").trim() };
  }
}

function extractHtmlPresentationData(htmlString: string): {
  text: string;
  title?: string;
  themeColors?: { accent?: string; canvasBg?: string; cardBg?: string };
} {
  const titleMatch = htmlString.match(/<title[^>]*>([^<]+)<\/title>/i) || htmlString.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  let accent: string | undefined;
  const hexColors = htmlString.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g);
  if (hexColors && hexColors.length > 0) {
    const coloredHex = hexColors.find((c) => !/^#(000000|ffffff|fff|000|111|222|333|eee|ddd|ccc)$/i.test(c));
    if (coloredHex) accent = coloredHex;
  }

  const clean = htmlString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n\n## $1\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "\n- $1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "\n\n$1\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();

  return {
    text: clean,
    title,
    themeColors: accent ? { accent, canvasBg: "#F8FAFC", cardBg: "#FFFFFF" } : undefined,
  };
}

export interface PresentationDeckRow extends Record<string, unknown> {
  id: string;
  user_id?: string;
  project_id?: string | null;
  title: string;
  topic?: string | null;
  framework?: string;
  theme_id?: string;
  custom_theme?: any;
  slides: any[];
  source_module?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

const router = Router();
router.use(requireAuth);

// In-memory deck store fallback for local development and offline environments
export const MAX_MEMORY_DECKS = 100;
export const memoryDecks = new Map<string, PresentationDeckRow>();


type AuthedRequest = Request & { user?: { id: string } };

/**
 * Fields a client may write on a deck. Everything else (id, user_id,
 * timestamps, unknown columns) is set by the server.
 */
const deckWriteSchema = z
  .object({
    title: z.string().max(300).optional(),
    topic: z.string().max(2000).nullable().optional(),
    framework: z.string().max(100).optional(),
    theme_id: z.string().max(100).optional(),
    custom_theme: z.unknown().optional(),
    slides: z.array(z.unknown()).max(200).optional(),
    source_module: z.string().max(60).nullable().optional(),
    project_id: z.string().max(200).nullable().optional(),
  })
  .strip();

type DeckLookup =
  | { status: "owned"; row: PresentationDeckRow; source: "db" | "memory" }
  | { status: "missing" }
  | { status: "not-owned" }
  | { status: "unavailable" };

/**
 * Strict, fail-closed ownership lookup. A deck belongs to the caller only
 * when its user_id equals the caller's id; an ownerless (legacy) row is not
 * the caller's. If the database is configured but cannot be read, the
 * answer is "unavailable", never "missing", so writes cannot proceed on an
 * unverified id.
 */
async function lookupDeck(id: string, userId: string): Promise<DeckLookup> {
  const table = getDecksTable();
  if (table) {
    try {
      const row = await table.selectOne(`id=eq.${encodeURIComponent(id)}`);
      if (row) return row.user_id === userId ? { status: "owned", row, source: "db" } : { status: "not-owned" };
      return { status: "missing" };
    } catch (err: unknown) {
      console.warn(`[presentations.ts] deck lookup failed for ${id}:`, err instanceof Error ? err.message : err);
      return { status: "unavailable" };
    }
  }
  const mem = memoryDecks.get(id);
  if (!mem) return { status: "missing" };
  return mem.user_id === userId ? { status: "owned", row: mem, source: "memory" } : { status: "not-owned" };
}

const notFound = (res: Response, id: string) => res.status(404).json({ error: `Presentation deck ${id} not found` });
const unavailable = (res: Response) => res.status(503).json({ error: "Presentation storage is temporarily unavailable. Please try again." });

export function setMemoryDeck(id: string, deck: PresentationDeckRow): void {
  if (!memoryDecks.has(id) && memoryDecks.size >= MAX_MEMORY_DECKS) {
    const oldestKey = memoryDecks.keys().next().value;
    if (oldestKey !== undefined) {
      memoryDecks.delete(oldestKey);
    }
  }
  memoryDecks.set(id, deck);
}

export function getDecksTable(): SupabaseTable<PresentationDeckRow> | null {
  const config = getSupabaseRestConfig();
  if (!config) return null;
  return new SupabaseTable<PresentationDeckRow>(config, "presentation_decks");
}

/**
 * GET /api/presentations
 * Returns list of presentations owned by the authenticated user.
 */
router.get("/", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  try {
    const table = getDecksTable();
    if (table) {
      try {
        const rows = await table.select(`user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc`);
        return res.json({ success: true, decks: rows });
      } catch (err: unknown) {
        console.warn("[presentations.ts] Supabase list failed:", err instanceof Error ? err.message : err);
        return unavailable(res);
      }
    }
    const decks = Array.from(memoryDecks.values())
      .filter((d) => d.user_id === userId)
      .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
    res.json({ success: true, decks });
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to fetch presentations" });
  }
});

/**
 * GET /api/presentations/:id
 * Returns a single deck by ID, verifying owner authorization.
 */
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  const found = await lookupDeck(id, userId);
  if (found.status === "unavailable") return unavailable(res);
  if (found.status !== "owned") return notFound(res, id);
  return res.json({ success: true, deck: found.row });
});

/**
 * POST /api/presentations/parse-document
 * Ingests a brief, coursework draft, or research paper (.pdf, .docx, .txt, .md)
 * and extracts raw text, word count, and detected thesis/topic title.
 */
router.post("/parse-document", upload.single("file"), async (req: Request, res: Response) => {
  const file = (req as any).file;
  if (!file) {
    return res.status(400).json({ error: "No document file provided." });
  }

  try {
    let text = "";
    let detectedTitle = "";
    const lowerName = file.originalname.toLowerCase();

    const isImage =
      file.mimetype?.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(lowerName);

    let detectedTheme: any = null;

    if (isImage) {
      const cleanBaseName = file.originalname
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
        .trim();

      const isScreenshot = /screenshot|screen\s*shot|img|image|capture|\d{8,}/i.test(cleanBaseName);
      detectedTitle = isScreenshot ? "Visual Presentation Blueprint" : cleanBaseName;

      text = `# ${detectedTitle}\n\n` +
        `## Executive Summary & Core Thesis\n` +
        `Empirical observations and structured takeaways derived from visual slide blueprint.\n\n` +
        `## Analytical Context & Empirical Drivers\n` +
        `Key quantitative drivers, comparative dynamics, and methodological validation.\n\n` +
        `## Strategic Takeaways & Conclusion\n` +
        `Actionable conclusions and rigorous forward-looking roadmap.`;
    } else if (
      file.mimetype === "text/html" ||
      lowerName.endsWith(".html") ||
      lowerName.endsWith(".htm")
    ) {
      const htmlString = file.buffer.toString("utf-8");
      const htmlData = extractHtmlPresentationData(htmlString);
      text = htmlData.text;
      if (htmlData.title) detectedTitle = htmlData.title;
      if (htmlData.themeColors) detectedTheme = htmlData.themeColors;
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      file.mimetype === "application/vnd.ms-powerpoint" ||
      lowerName.endsWith(".pptx") ||
      lowerName.endsWith(".ppt")
    ) {
      const pptxData = await extractTextFromPptx(file.buffer);
      text = pptxData.text;
      if (pptxData.themeColors) detectedTheme = pptxData.themeColors;
    } else {
      const parsed = await parseDocument({
        data: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
      });
      text = parsed.ok ? parsed.data.text : file.buffer.toString("utf-8");
    }

    text = normalizeUnicodeNFC(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim());
    if (!text) {
      return res.status(422).json({ error: "Could not extract readable text from document. Please verify file content." });
    }

    // Heuristically extract title/topic from first few non-trivial lines
    const lines = text.split("\n").map(l => l.trim().replace(/^#+\s*/, "")).filter(Boolean);
    if (!detectedTitle) {
      for (let i = 0; i < Math.min(lines.length, 6); i++) {
        const candidate = lines[i].replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
        if (
          candidate.length >= 8 &&
          candidate.length <= 120 &&
          !/^(assignment brief|essay prompt|module handbook|table of contents|contents|abstract|overview|introduction)$/i.test(candidate)
        ) {
          detectedTitle = candidate;
          break;
        }
      }

      if (!detectedTitle) {
        detectedTitle = file.originalname
          .replace(/\.[^/.]+$/, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
          .trim();
      }
    }

    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    res.json({
      success: true,
      text,
      detectedTitle,
      wordCount,
      fileName: file.originalname,
      fileSize: file.size,
      detectedTheme,
    });
  } catch (err: any) {
    console.error("[presentations.ts] Document parsing error:", err);
    res.status(500).json({ error: `Failed to parse document: ${err.message}` });
  }
});

/**
 * POST /api/presentations
 * Creates a new presentation deck owned by the authenticated user.
 */
router.post("/", async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  const parsed = deckWriteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid presentation payload" });
  const body = parsed.data;

  // A client-chosen id is honoured only when it is free; it can never land on
  // someone else's deck.
  const requestedId = typeof req.body?.id === "string" && /^[\w-]{1,120}$/.test(req.body.id) ? req.body.id : undefined;
  let id = requestedId ?? randomUUID();
  if (requestedId) {
    const found = await lookupDeck(requestedId, userId);
    if (found.status === "unavailable") return unavailable(res);
    if (found.status === "not-owned") id = randomUUID();
    if (found.status === "owned") return res.status(409).json({ error: "A presentation with this id already exists", deck: found.row });
  }

  const now = new Date().toISOString();
  const newDeck: PresentationDeckRow = {
    id,
    user_id: userId,
    project_id: body.project_id ?? null,
    title: body.title ?? "Untitled presentation",
    topic: body.topic ?? "",
    framework: body.framework ?? "Standard-Narrative",
    theme_id: body.theme_id ?? "scholar-paper",
    custom_theme: body.custom_theme ?? null,
    slides: body.slides ?? [],
    source_module: body.source_module ?? "presentation-studio",
    created_at: now,
    updated_at: now,
  };

  const table = getDecksTable();
  if (table) {
    try {
      await table.insert(newDeck);
    } catch (err: unknown) {
      console.warn("[presentations.ts] Supabase insert failed:", err instanceof Error ? err.message : err);
      return unavailable(res);
    }
  } else {
    setMemoryDeck(id, newDeck);
  }
  res.status(201).json({ success: true, deck: newDeck });
});

/**
 * PUT /api/presentations/:id
 * Debounced autosave endpoint updating title, theme, slides, etc. for user's deck.
 */
router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  if (!/^[\w-]{1,120}$/.test(id)) return notFound(res, id);
  const parsed = deckWriteSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid presentation payload" });

  const found = await lookupDeck(id, userId);
  if (found.status === "unavailable") return unavailable(res);
  if (found.status === "not-owned") return notFound(res, id);

  const now = new Date().toISOString();
  const base: PresentationDeckRow =
    found.status === "owned"
      ? found.row
      : { id, user_id: userId, title: "Untitled presentation", slides: [], created_at: now };
  const updatedDeck: PresentationDeckRow = { ...base, ...parsed.data, id, user_id: userId, updated_at: now };

  const table = getDecksTable();
  if (table) {
    try {
      if (found.status === "owned") {
        await table.update(`id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, { ...parsed.data, updated_at: now });
      } else {
        await table.insert(updatedDeck);
      }
    } catch (err: unknown) {
      console.warn(`[presentations.ts] Supabase save failed for ${id}:`, err instanceof Error ? err.message : err);
      return unavailable(res);
    }
  } else {
    setMemoryDeck(id, updatedDeck);
  }
  res.json({ success: true, deck: updatedDeck, autosavedAt: now });
});

/**
 * DELETE /api/presentations/:id
 */
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  const found = await lookupDeck(id, userId);
  if (found.status === "unavailable") return unavailable(res);
  if (found.status !== "owned") return notFound(res, id);
  const table = getDecksTable();
  if (table) {
    try {
      await table.delete(`id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`);
    } catch (err: unknown) {
      console.warn(`[presentations.ts] Supabase delete failed for ${id}:`, err instanceof Error ? err.message : err);
      return unavailable(res);
    }
  }
  memoryDecks.delete(id);
  res.json({ success: true, message: `Deck ${id} deleted` });
});

/**
 * POST /api/presentations/:id/copilot
 * In-slide prompt copilot execution route.
 * Ingests prompt and current slide state, performs deterministic transformation.
 */
router.post("/:id/copilot", async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  const { prompt, slideIndex = 0, currentSlide, referenceImage } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing or invalid prompt" });
  }

  try {
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const memDeck = memoryDecks.get(id);
    if (memDeck && memDeck.user_id !== userId) {
      return res.status(404).json({ error: "Presentation deck not found" });
    }
    const deck = memDeck;
    const targetSlide = currentSlide || (deck && deck.slides && deck.slides[slideIndex]);

    if (!targetSlide) {
      return res.status(404).json({ error: "Slide not found for copilot transformation" });
    }

    const lowerPrompt = prompt.toLowerCase();
    const mutatedSlide = JSON.parse(JSON.stringify(targetSlide));

    // Every branch below reuses only the slide's own text and the user's prompt:
    // no stock bullets, comparisons or figures are added.
    const ownBullets: string[] = (Array.isArray(mutatedSlide.blocks) ? mutatedSlide.blocks : [])
      .filter((b: { type?: string; items?: unknown }) => b?.type === "bullet-list" && Array.isArray(b.items))
      .flatMap((b: { items: unknown[] }) => b.items.filter((i): i is string => typeof i === "string" && i.trim().length > 0));
    const ownHeader = (Array.isArray(mutatedSlide.blocks) ? mutatedSlide.blocks : []).find(
      (b: { type?: string }) => b?.type === "action-header"
    ) as { headline?: string; category?: string; subheadline?: string } | undefined;
    const headerBlock = {
      type: "action-header",
      headline: mutatedSlide.actionHeadline || ownHeader?.headline || "",
      category: ownHeader?.category || "",
      subheadline: ownHeader?.subheadline || "",
    };

    // Image-split layout around a reference screenshot (layout only; the slide keeps its own text)
    if (referenceImage || lowerPrompt.includes("replicate") || lowerPrompt.includes("screenshot") || lowerPrompt.includes("clone slide")) {
      mutatedSlide.layoutType = "image-split";
      mutatedSlide.imageUrl = referenceImage || mutatedSlide.imageUrl || "";
      mutatedSlide.blocks = [
        headerBlock,
        ...(ownBullets.length > 0 ? [{ type: "bullet-list", items: ownBullets }] : []),
        {
          type: "image",
          imageUrl: mutatedSlide.imageUrl,
          caption: mutatedSlide.imageCaption || "",
          layout: "split",
          aspectRatio: "16:9",
        },
      ];
    }
    // 2-column layout: the slide's own points, split in two
    else if (lowerPrompt.includes("2-column") || lowerPrompt.includes("compare") || lowerPrompt.includes("comparison")) {
      if (ownBullets.length < 2) {
        return res.status(400).json({
          error: "Add at least two points to this slide first; the comparison layout splits your own points into two columns.",
        });
      }
      const half = Math.ceil(ownBullets.length / 2);
      mutatedSlide.layoutType = "two-column";
      mutatedSlide.blocks = [
        headerBlock,
        {
          type: "two-column",
          leftHeader: "",
          leftPoints: ownBullets.slice(0, half),
          rightHeader: "",
          rightPoints: ownBullets.slice(half),
        },
      ];
    }
    // Big metric callout: only for a figure the user typed
    else if (lowerPrompt.includes("metric") || lowerPrompt.includes("callout") || lowerPrompt.includes("%")) {
      const metricMatch = prompt.match(/(\d+(?:\.\d+)?\s*(?:%|x\b)?)/i);
      if (!metricMatch) {
        return res.status(400).json({
          error: "Include the figure to highlight, for example \"metric callout 42%\". Scholar Core never invents a number.",
        });
      }
      mutatedSlide.layoutType = "metric-focus";
      mutatedSlide.blocks = [
        headerBlock,
        {
          type: "metric-callout",
          value: metricMatch[1].replace(/\s+/g, ""),
          label: "",
          context: "",
        },
      ];
    }
    // Condense the slide's own bullets to 6 words each
    else if (lowerPrompt.includes("condense") || lowerPrompt.includes("6-word") || lowerPrompt.includes("bullet")) {
      const bulletBlock = mutatedSlide.blocks.find((b: any) => b.type === "bullet-list");
      if (!bulletBlock || !Array.isArray(bulletBlock.items) || bulletBlock.items.length === 0) {
        return res.status(400).json({ error: "This slide has no bullet points to condense." });
      }
      mutatedSlide.layoutType = "bullets";
      bulletBlock.items = bulletBlock.items.slice(0, 6).map((item: string) => {
        const words = item.split(/\s+/).filter(Boolean);
        return words.slice(0, 6).join(" ");
      });
    }
    // General transformation / headline refinement
    else {
      mutatedSlide.actionHeadline = prompt.length < 80 
        ? prompt.charAt(0).toUpperCase() + prompt.slice(1)
        : mutatedSlide.actionHeadline;
      if (mutatedSlide.blocks[0] && mutatedSlide.blocks[0].type === "action-header") {
        mutatedSlide.blocks[0].headline = mutatedSlide.actionHeadline;
      }
    }

    // If deck exists in memory, update it
    if (deck && deck.slides && deck.slides[slideIndex]) {
      deck.slides[slideIndex] = mutatedSlide;
      deck.updated_at = new Date().toISOString();
      setMemoryDeck(id, deck);
    }

    res.json({
      success: true,
      mutatedSlide,
      appliedPrompt: prompt,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Copilot error: ${err.message}` });
  }
});

export function registerPresentationRoutes(app: express.Express): void {
  app.use("/api/presentations", router);
}
