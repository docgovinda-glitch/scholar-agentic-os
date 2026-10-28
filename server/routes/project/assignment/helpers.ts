import type { ProjectRecord } from "../../../../src/services/store/types.ts";
import express from "express";
import { createUploadInstance } from "../../../src/middleware/uploadGuard.ts";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText, getCandidates, buildAuthorizedPolicy, resolveRequestAiConfig } from "../../../utils/llm.ts";
import { completeWithFailover } from "../../../../src/platform/gateway/gateway.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import { rejectClientCredentials } from "../../../src/middleware/rejectClientCredentials.ts";
import {
  auditDocumentLineByLine,
  runBriefScannerGraph,
  COMMAND_VERB_MAP,
  type DocumentRequirement,
} from "../../../services/briefScannerGraph.ts";
import type {
  AssignmentAnalysis,
  CommandVerbDetail,
  CoreResearchQuestion,
  RecommendedSearchStrategy,
  ResearchPlan,
  TutorWorkspacePatch,
} from "../../../../src/desk/assignment/types.ts";
import {
  cleanAnswerString,
  extractStandardizedInstructions,
  normalizeProjectAnswers,
  getSectionPromptGuidelines,
  structureToInternalSections,
} from "../../../../src/desk/assignment/types.ts";
import {
  generateDynamicAssignmentStructure,
  generateAiEnhancedOutline,
  extractTargetFrameworks,
  sanitizeOutlineHeadings,
  assignmentStructureToOutlineTree,
  outlineTreeToAssignmentStructure,
} from "../../../../src/desk/assignment/services/outlineService.ts";
import { conductAskScholarResearchForOutline } from "../../../../src/desk/assignment/services/scholarlyDiscoveryService.ts";
import { sanitizeBrief } from "../../../../src/features/understand/services/briefSanitizer.ts";
import { classifyScopeBoundaries, stripLineTags } from "../../../../src/features/understand/services/scopeClassifier.ts";
import { generateSectionDraft } from "../../../../src/features/drafting/services/sectionDraftingEngine.ts";
import {
  isClassroomLogisticsLine,
  isTutorialOrShortQABrief,
  extractSubstantiveBriefQuestions,
  stripSlideArtifacts,
} from "../../../../src/utils/briefExtractor.ts";
import { discoverMultiPortalSources, type DiscoveredSourceDraft } from "../../../src/discovery/discovery.ts";
import { getSupabaseRestConfig, SupabaseTable, type SupabaseRestConfig } from "../../../src/supabaseRest.ts";
import {
  replaceBracketTokensWithDeterministicCitations,
  compileDeterministicBibliographyMarkdown,
  formatAskScholarInText,
  formatAskScholarBibliographyEntry,
  type WebsiteCitationItem,
} from "../../../../src/desk/scholarCitationEngine.ts";
import type { DiscoveredSource } from "../../../../src/desk/assignment/types.ts";

interface SupabaseProjectSourceRecord extends Record<string, unknown> {
  project_id: string;
  source_id: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  journal?: string;
  url?: string;
  source_type: string;
  authority_tier: string;
  discovered_via: string;
  discovered_at: string;
}

function getCourseworkSupabaseConfig(): SupabaseRestConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

export async function persistSourcesToSupabase(projectId: string, sources: DiscoveredSource[]): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const config = getCourseworkSupabaseConfig();
  if (!config) return;

  const table = new SupabaseTable<SupabaseProjectSourceRecord>(config, "project_sources");
  for (const src of sources) {
    const yearNum = typeof src.year === "number" ? src.year : parseInt(String(src.year || ""), 10) || undefined;
    const venue = src.journal || ((src as unknown as Record<string, unknown>).venue as string | undefined);
    await table.upsert({
      project_id: projectId,
      source_id: src.id,
      title: src.title,
      authors: src.authors,
      year: yearNum,
      doi: src.doi,
      venue,
      journal: venue,
      url: src.url,
      source_type: typeof src.type === "string" ? src.type : "scholarly",
      authority_tier: ((src as unknown as Record<string, unknown>).authorityTier as string) || "A",
      discovered_via: src.retrievalSource || "openalex",
      discovered_at: src.retrievedAt || new Date().toISOString(),
    }, "project_id,source_id").catch((dbErr: unknown) => {
      console.warn("Failed to persist source to Supabase project_sources:", dbErr);
    });
  }
}



export function isCorruptedOutlineHeadings(headings: any[], topic: string): boolean {
  if (!headings || !Array.isArray(headings) || headings.length === 0) return false;
  const flatTitles: string[] = [];
  headings.forEach((h: any) => {
    if (h.title) flatTitles.push(h.title);
    if (h.subheadings && Array.isArray(h.subheadings)) {
      h.subheadings.forEach((s: any) => {
        if (s.title) flatTitles.push(s.title);
      });
    }
  });

  const isAIML = /\b(machine learning|deep learning|neural network|reinforcement learning|gradient descent|transformer model|llm|computer science)\b/i.test(topic);
  const hasOBOrLeadership = /\b(leadership|culture|schein|zappos|human resources|organizational behavior|management|mba|business strategy)\b/i.test(topic);

  const hasLeakedML = (!isAIML || hasOBOrLeadership) && flatTitles.some((t) =>
    /\b(mathematical formulations|loss optimization|optimization landscapes|erm|loss surfaces|gradient descent|empirical risk|convex optimization)\b/i.test(t)
  );

  const hasClassroomLogistics = flatTitles.some((t) =>
    isClassroomLogisticsLine(t) ||
    /\b(divide yourself|teams of \d+|breakout|discussion timer|class discussion|icebreaker)\b/i.test(t)
  );

  return hasLeakedML || hasClassroomLogistics;
}

export function healCorruptedProjectStructure(project: { answers?: Record<string, string>; title?: string } | null | undefined): boolean {
  if (!project || !project.answers) return false;
  let changed = false;
  const rawStructure = project.answers["assignment_structure"] || project.answers["structure"];
  const topic = [
    project.answers["assignment_question"],
    project.answers["instructions"],
    project.answers["assignment_brief_text"],
    project.answers["research_topic"],
    project.answers["title"],
  ]
    .filter(Boolean)
    .join(" ");

  if (rawStructure) {
    try {
      const parsed = typeof rawStructure === "string" ? JSON.parse(rawStructure) : rawStructure;
      if (parsed?.headings && isCorruptedOutlineHeadings(parsed.headings, topic)) {
        const briefText = cleanAnswerString(project.answers["assignment_brief_text"]) || topic;
        const targetWords = Number(
          project.answers["targetWordCount"] ||
          project.answers["word_count"] ||
          (isTutorialOrShortQABrief(briefText) ? 400 : 2000)
        );
        const repaired = generateDynamicAssignmentStructure({
          question: project.answers["assignment_question"] || topic,
          assignmentType: (project.answers["assignment_type"] || "essay") as any,
          academicLevel: (project.answers["academic_level"] || "undergraduate") as any,
          targetWordCount: targetWords,
          citationStyle: project.answers["citation_style"] || "apa7",
          briefText,
        });
        project.answers["assignment_structure"] = JSON.stringify(repaired);
        project.answers["structure"] = JSON.stringify(repaired);
        if (project.answers["assignment_internal_sections"]) {
          delete project.answers["assignment_internal_sections"];
        }
        if (project.answers["assignment_outline"]) {
          delete project.answers["assignment_outline"];
        }
        changed = true;
      }
    } catch {}
  }
  return changed;
}

export function safeParseObject<T = any>(val: any): T | null {
  if (!val) return null;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return null;
}

export function extractProjectInstructions(project: any, reqBody?: any): string {
  const candidate =
    reqBody?.instructions ||
    reqBody?.question ||
    extractStandardizedInstructions(project?.answers);
  return cleanAnswerString(candidate);
}

function capitalizeTitleWords(str: string): string {
  const minor = new Set(["a", "an", "the", "and", "but", "or", "for", "nor", "on", "at", "to", "from", "by", "in", "of", "with"]);
  const words = str.split(" ").filter(Boolean);
  return words
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && minor.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function cleanTitleCandidate(raw: string): string {
  let s = raw
    .replace(/^#+\s*/, "") // markdown headers
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "") // outer quotes
    .replace(
      /^(?:critically\s+evaluate\s+(?:the\s+)?|critically\s+assess\s+(?:the\s+)?|critically\s+examine\s+(?:the\s+)?|critically\s+discuss\s+(?:the\s+)?|evaluate\s+(?:the\s+)?|assess\s+(?:the\s+)?|examine\s+(?:the\s+)?|discuss\s+(?:the\s+)?|to\s+what\s+extent\s+(?:does|do|is|are)\s+|an\s+analysis\s+of\s+|an\s+investigation\s+into\s+|how\s+(?:does|do|can)\s+|explore\s+(?:the\s+)?)/i,
      ""
    )
    .replace(/[.?!;:]+$/, "")
    .trim();

  const firstClause = s.split(/[.;]/)[0].trim();
  if (firstClause.length >= 6) s = firstClause;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    if (words.length === 0) return "";
    return capitalizeTitleWords(words.join(" "));
  }

  const selectedWords = words.slice(0, Math.min(words.length, 7));
  let result = selectedWords.join(" ");
  result = result.replace(/\s+(?:and|or|in|of|for|with|to|at|by|from|the|a|an|on)$/i, "");

  return capitalizeTitleWords(result);
}

/**
 * Fast, deterministic heuristic to extract a concise academic title (3 to 7 words)
 * from the first several lines of a brief or assignment question.
 */
export function deriveHeuristicTitle(rawText: string): string {
  if (!rawText || typeof rawText !== "string") return "Academic Assignment";

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^\[L\d+\]\s*/, "")) // remove [L001] prefixes
    .filter((l) => l.length > 0);

  if (lines.length === 0) return "Academic Assignment";

  // Check first 5 lines for course code + subject or title indicators
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];

    // Skip bare generic document header labels e.g. "Assignment Brief", "Essay Prompt"
    if (/^(?:assignment\s*(?:brief|question|specification)?|coursework\s*(?:brief|specification)?|syllabus\s*brief|essay\s*prompt)$/i.test(line)) {
      continue;
    }
    if (isClassroomLogisticsLine(line)) {
      continue;
    }

    // Pattern 1: Course code prefix e.g. "POLI3002: Security Analysis in the 21st Century" or "CS 7015 - Machine Learning"
    const courseCodeMatch = line.match(/^([A-Z]{2,5}\s*\d{3,5})[:\s\-–]+(.+)$/i);
    if (courseCodeMatch) {
      const code = courseCodeMatch[1].replace(/\s+/g, "").toUpperCase();
      const subject = cleanTitleCandidate(courseCodeMatch[2]);
      if (subject.length > 0) {
        return `${code} ${subject}`.slice(0, 60).trim();
      }
    }

    // Pattern 2: Explicit prefix e.g. "Title: ...", "Topic: ...", "Assignment Question: ..."
    const explicitPrefixMatch = line.match(
      /^(?:assignment\s*(?:brief|question|title)?|essay\s*(?:topic|title)?|coursework\s*(?:title)?|module\s*(?:title)?|topic|question|task)\s*[:\-–—]\s*(.+)$/i
    );
    if (explicitPrefixMatch) {
      const cleaned = cleanTitleCandidate(explicitPrefixMatch[1]);
      if (cleaned.length >= 4) return cleaned;
    }
  }

  // Pattern 3: Clean first prominent sentence or question
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    if (/^(?:assignment\s*(?:brief|question|specification)?|coursework\s*(?:brief|specification)?|syllabus\s*brief|essay\s*prompt)$/i.test(line)) {
      continue;
    }
    if (isClassroomLogisticsLine(line)) {
      continue;
    }
    const cleaned = cleanTitleCandidate(line);
    if (cleaned.length >= 6) {
      return cleaned;
    }
  }

  return "Academic Assignment";
}

/**
 * Intelligent Semantic Auto-Naming:
 * Generates a concise academic research title (3 to 7 words).
 * Tries LLM if configured; otherwise gracefully falls back to deterministic heuristic.
 */
export async function deriveSemanticAcademicTitle(
  briefText: string,
  req?: express.Request
): Promise<string> {
  const heuristic = deriveHeuristicTitle(briefText);
  if (!briefText || briefText.trim().length < 15) {
    return heuristic;
  }

  try {
    const candidates = getCandidates(req);
    if (candidates.length > 0 && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
      const prompt = `Generate a concise, academic title (3 to 7 words, e.g. "Quantum Computing Cryptographic Architectures", "Algorithmic Bias in Healthcare") based on this assignment brief. Output ONLY the plain text title, with NO punctuation, NO quotes, NO explanation:\n\n${briefText.slice(0, 1500)}`;
      const response = await completeWithFailover(
        {
          taskClass: "summarisation",
          systemPrompt: "You are an expert academic research registrar. Craft a concise, formal academic title (3-7 words).",
          userPrompt: prompt,
          segments: [{ label: "Brief", text: briefText.slice(0, 1500) }],
        },
        { candidates },
        buildAuthorizedPolicy(candidates)
      );

      if (response.ok && response.value?.text) {
        const candidate = response.value.text
          .trim()
          .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
          .replace(/^(?:title|topic)[:\s\-–]+/i, "")
          .replace(/[.?!;:]+$/, "")
          .trim();
        const wordCount = candidate.split(/\s+/).length;
        if (wordCount >= 2 && wordCount <= 10 && candidate.length >= 5 && candidate.length <= 75) {
          return capitalizeTitleWords(candidate);
        }
      }
    }
  } catch {
    // Fall back to heuristic
  }

  return heuristic;
}

/**
 * Automatically updates project title in answers & record if currently untitled.
 */
export async function autoUpdateProjectTitleIfUntitled(
  project: (ProjectRecord & { title?: string }) | null | undefined,
  derivedTitle: string
): Promise<string> {
  if (!project) return derivedTitle;
  if (!project.answers) project.answers = {};

  const currentTitle = (
    project.answers["title"] ||
    project.answers["assignment_title"] ||
    project.title ||
    ""
  ).trim();

  const isDefaultOrUntitled =
    !currentTitle ||
    currentTitle.toLowerCase().includes("untitled") ||
    currentTitle.toLowerCase() === "academic assignment" ||
    currentTitle.toLowerCase() === "synthesized research project";

  if (isDefaultOrUntitled && derivedTitle && derivedTitle !== "Academic Assignment") {
    project.answers["title"] = derivedTitle;
    project.answers["assignment_title"] = derivedTitle;
    if (typeof project.title === "string") {
      project.title = derivedTitle;
    }
    await getProjectStore().save(project);
    return derivedTitle;
  }

  return currentTitle || derivedTitle;
}

export const upload = createUploadInstance({ enforceHeavyParseLimit: true });

export async function getProjectSafe(req: express.Request<unknown>, res: express.Response) {
  const projectId = (req.params as Record<string, string>).id;
  if (!projectId) {
    res.status(400).json({ error: "Missing project ID" });
    return null;
  }
  const callerId = (req as express.Request & { user?: { id: string } }).user?.id;
  const project = await getProjectStore().get(projectId);
  if (!project || !callerId || project.ownerId !== callerId) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  if (healCorruptedProjectStructure(project)) {
    await getProjectStore().save(project);
  }
  return project;
}


export function buildDeterministicResearchPlan(
  question: string,
  assignmentType: string,
  academicLevel: string,
  analysis?: any
) {
  const qClean = question?.trim() || "Academic Coursework Assignment";
  let parsedAnalysis: any = {};
  try {
    parsedAnalysis = typeof analysis === "string" ? JSON.parse(analysis) : analysis || {};
  } catch {
    parsedAnalysis = {};
  }

  const isQuantum = /quantum|qubit|superconducting|trapped-ion|shor|grover|qec|surface code|nisq|post-quantum|qkd/i.test(qClean);

  const concepts = parsedAnalysis.keyConcepts?.length > 0 
    ? parsedAnalysis.keyConcepts 
    : isQuantum
    ? [
        "Superconducting Transmon vs Trapped-Ion Modalities",
        "NISQ Constraints & Error Mitigation (ZNE/PEC)",
        "BQP Complexity & Algorithmic Mechanics (Shor & Grover)",
        "Planar Surface Codes & Fault-Tolerant Threshold Theorem",
        "Quantum Cryptography (BB84 QKD) & Post-Quantum Cryptography (FIPS 203)",
      ]
    : ["Theoretical Framework", "Empirical Accountability", "Governance & Regulation"];

  const coreQuestions: CoreResearchQuestion[] = isQuantum
    ? [
        {
          id: "q-1",
          question: "How do physical qubit modalities (superconducting transmon vs trapped-ion) trade off gate speed against coherence times (T1, T2) and inter-qubit connectivity?",
          rationale: "Evaluates microscopic physical mechanisms and architectural DiVincenzo criteria required for Part 1.",
          category: "Hardware Architectures",
        },
        {
          id: "q-2",
          question: "What are the computational limits of NISQ processors, and why do error mitigation techniques (ZNE, PEC, CDR) fail on deep circuits compared to fault-tolerant error correction?",
          rationale: "Synthesizes Preskill (2018) NISQ limits against scaling thresholds required for First-Class honors.",
          category: "NISQ & Error Mitigation",
        },
        {
          id: "q-3",
          question: "How do Shor's (exponential) and Grover's (quadratic) algorithms demonstrate quantum advantage, and where does BQP sit relative to P, NP, and the Extended Church-Turing thesis?",
          rationale: "Directly solves the algorithmic mechanics and complexity-theoretic foundations of Part 2.",
          category: "Algorithmic Advantage",
        },
        {
          id: "q-4",
          question: "Under what physical gate error rates does the 2D surface code achieve fault tolerance, and what magic state distillation overheads govern cryptanalytic feasibility (e.g. RSA-2048)?",
          rationale: "Analyzes stabilizer syndrome extraction cycles, threshold theorems (Fowler 2012), and physical-to-logical qubit ratios (Gidney & Ekerå 2021).",
          category: "Fault Tolerance & QEC",
        },
      ]
    : [
        {
          id: "q-1",
          question: `What foundational theoretical frameworks and empirical mechanisms govern "${qClean.slice(0, 90)}"?`,
          rationale: "Establishes conceptual boundaries and foundational academic terminology mandated by First-Class rubric criteria.",
          category: "Theoretical Foundation",
        },
        {
          id: "q-2",
          question: `How do competing scholarly perspectives and empirical datasets evaluate tensions between operational efficiency and institutional accountability in ${concepts[0] || "this domain"}?`,
          rationale: "Fulfills examiner command verb requirements for critical synthesis and debate.",
          category: "Dialectical Tension",
        },
        {
          id: "q-3",
          question: `What methodological limitations, systemic risks, and unintended consequences arise when applying ${concepts[1] || "these models"} in practical settings?`,
          rationale: "Demonstrates high-level evaluative critique and awareness of real-world constraints.",
          category: "Empirical Reality",
        },
        {
          id: "q-4",
          question: `Which justified regulatory, ethical, or policy interventions best reconcile competing stakeholder demands and long-term public interest?`,
          rationale: "Provides grounded, actionable synthesis necessary to conclude the inquiry with academic authority.",
          category: "Policy & Resolution",
        },
      ];

  const searchStrategies: RecommendedSearchStrategy[] = isQuantum
    ? [
        {
          id: "strat-1",
          database: "arXiv (quant-ph) / Physical Review Letters",
          searchQuery: '"quantum computing" AND ("superconducting transmon" OR "trapped ion") AND ("gate fidelity" OR "coherence")',
          relevanceTarget: "Foundational hardware reviews (Kjaergaard 2020) and experimental demonstrations (Arute 2019).",
        },
        {
          id: "strat-2",
          database: "Physical Review A / IEEE FOCS",
          searchQuery: '("Shor\'s algorithm" OR "Grover\'s algorithm") AND ("order finding" OR "phase estimation" OR "amplitude amplification")',
          relevanceTarget: "Seminal algorithmic papers (Shor 1994, Grover 1996, Nielsen & Chuang 2010).",
        },
        {
          id: "strat-3",
          database: "Physical Review A / Quantum",
          searchQuery: '"surface codes" AND ("threshold theorem" OR "magic state distillation") AND ("Fowler" OR "Gidney")',
          relevanceTarget: "Topological quantum error correction benchmarks (Fowler 2012, Gidney & Ekerå 2021).",
        },
        {
          id: "strat-4",
          database: "Theoretical Computer Science / NIST Standards",
          searchQuery: '("quantum key distribution" OR "BB84" OR "post-quantum cryptography" OR "FIPS 203" OR "ML-KEM")',
          relevanceTarget: "Cryptographic protocol foundations (Bennett & Brassard 2014) and PQC standards (NIST 2024).",
        },
      ]
    : [
        {
          id: "strat-1",
          database: "Google Scholar",
          searchQuery: `"${concepts[0] || 'algorithmic governance'}" AND ("theoretical framework" OR "conceptual model") AND "peer-reviewed"`,
          relevanceTarget: "Seminal papers and high-impact theoretical paradigms published in leading journals.",
        },
        {
          id: "strat-2",
          database: "JSTOR / Scopus",
          searchQuery: `("${concepts[0] || 'algorithmic governance'}" OR "${concepts[1] || 'accountability'}") AND ("empirical analysis" OR "case study") AND (2020 OR 2021 OR 2022 OR 2023 OR 2024 OR 2025)`,
          relevanceTarget: "Recent peer-reviewed empirical case studies measuring operational impact.",
        },
        {
          id: "strat-3",
          database: "CrossRef / Web of Science",
          searchQuery: `"${concepts[1] || 'regulatory compliance'}" AND ("EU AI Act" OR "institutional oversight") AND NOT "non-academic"`,
          relevanceTarget: "Statutory governance frameworks and institutional audit methodologies.",
        },
        {
          id: "strat-4",
          database: "SSRN / Academic Repositories",
          searchQuery: `("${qClean.slice(0, 40)}" OR "${concepts[2] || 'systemic risk'}") AND ("counterarguments" OR "systemic bias")`,
          relevanceTarget: "Dialectical counterarguments and stress-testing evidence against orthodox claims.",
        },
      ];

  const keyDebates = isQuantum
    ? [
        "NISQ error mitigation (ZNE/CDR) vs Fault-Tolerant Surface Codes (threshold theorem)",
        "Physical qubit scaling: Transmon Josephson junction dielectric losses vs Trapped-Ion optical switching bottlenecks",
        "Exponential quantum speedup (Shor) vs Quadratic quantum speedup (Grover) and cryptographic implications",
        "QKD information-theoretic security (fiber attenuation/no-cloning) vs PQC lattice-based mathematical hardness (NIST FIPS 203)",
      ]
    : [
        "Algorithmic efficiency vs transparent procedural fairness",
        "Centralized statutory regulation vs agile self-governance standards",
        "Individual rights and privacy vs collective security and optimization",
      ];

  const evidenceTypesNeeded = isQuantum
    ? [
        "Seminal quantum computing peer-reviewed journal papers (Physical Review A/Letters, Quantum, Nature)",
        "Conference proceedings in theoretical computer science (IEEE FOCS, ACM STOC)",
        "Official cryptographic standards publications (NIST FIPS 203/204/205)",
      ]
    : [
        "Peer-reviewed academic journal publications (Q1/Q2 ranked journals)",
        "Official institutional whitepapers (EU Commission, IEEE, OECD)",
        "Empirical field audit data and audited corporate/public case studies",
      ];

  return {
    coreQuestions,
    mainConcepts: concepts,
    keyDebates,
    evidenceTypesNeeded,
    searchStrategies,
    outOfScopeTopics: [
      "Unverified blog posts, speculative trade journalism, or marketing collateral",
      "Broad historical surveys that do not directly address post-2015 modern frameworks",
    ],
    approvedByUser: false,
  };
}

// 2. POST /api/projects/:id/assignment/plan
