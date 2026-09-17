/**
 * Research Definition Prompt Builders & Academic Scaffolding
 *
 * Provides client-side prompt builders for:
 * 1. FINER Framework Evaluation & Academic Title/Question Polishing
 * 2. PICO / SPIDER Structured Formulation
 * 3. Reporting Guideline Auto-Matching (CONSORT, PRISMA, STROBE, etc.)
 */

export interface ReportingGuideline {
  name: string;
  fullName: string;
  scope: string;
  url: string;
}

export const STUDY_DESIGN_GUIDELINES: Record<string, ReportingGuideline> = {
  "Randomized Controlled Trial": {
    name: "CONSORT 2010",
    fullName: "Consolidated Standards of Reporting Trials",
    scope: "Parallel group randomised trials",
    url: "https://www.consort-statement.org/",
  },
  "Experimental": {
    name: "CONSORT / ARRIVE",
    fullName: "Consolidated Standards of Reporting Trials / Animal Research: Reporting of In Vivo Experiments",
    scope: "Experimental trials and laboratory studies",
    url: "https://www.equator-network.org/",
  },
  "Cohort": {
    name: "STROBE",
    fullName: "Strengthening the Reporting of Observational Studies in Epidemiology",
    scope: "Cohort observational studies",
    url: "https://www.strobe-statement.org/",
  },
  "Case-control": {
    name: "STROBE",
    fullName: "Strengthening the Reporting of Observational Studies in Epidemiology",
    scope: "Case-control studies",
    url: "https://www.strobe-statement.org/",
  },
  "Cross-sectional": {
    name: "STROBE",
    fullName: "Strengthening the Reporting of Observational Studies in Epidemiology",
    scope: "Cross-sectional surveys and observational studies",
    url: "https://www.strobe-statement.org/",
  },
  "Observational": {
    name: "STROBE",
    fullName: "Strengthening the Reporting of Observational Studies in Epidemiology",
    scope: "General observational epidemiology and empirical inquiries",
    url: "https://www.strobe-statement.org/",
  },
  "Longitudinal": {
    name: "STROBE",
    fullName: "Strengthening the Reporting of Observational Studies in Epidemiology",
    scope: "Longitudinal cohort investigations",
    url: "https://www.strobe-statement.org/",
  },
  "Systematic Review": {
    name: "PRISMA 2020",
    fullName: "Preferred Reporting Items for Systematic Reviews and Meta-Analyses",
    scope: "Systematic reviews of health, behavioral, and scientific interventions",
    url: "http://www.prisma-statement.org/",
  },
  "Scoping Review": {
    name: "PRISMA-ScR",
    fullName: "PRISMA Extension for Scoping Reviews",
    scope: "Scoping reviews and evidence mapping",
    url: "http://www.prisma-statement.org/Extensions/ScopingReviews",
  },
  "Meta-analysis": {
    name: "PRISMA 2020 / MOOSE",
    fullName: "Preferred Reporting Items for Systematic Reviews and Meta-Analyses / Meta-analysis Of Observational Studies in Epidemiology",
    scope: "Quantitative statistical synthesis of research studies",
    url: "http://www.prisma-statement.org/",
  },
  "Qualitative": {
    name: "COREQ / SRQR",
    fullName: "Consolidated Criteria for Reporting Qualitative Research / Standards for Reporting Qualitative Research",
    scope: "Interviews, focus groups, and qualitative thematic inquiries",
    url: "https://www.equator-network.org/",
  },
  "Case Study": {
    name: "CARE",
    fullName: "CAse REport Guidelines",
    scope: "Clinical and organizational case studies",
    url: "https://www.care-statement.org/",
  },
  "Mixed Methods": {
    name: "GRAMMS",
    fullName: "Good Reporting of A Mixed Methods Study",
    scope: "Integration of qualitative and quantitative methodologies",
    url: "https://www.equator-network.org/",
  },
  "Methodological / Methods Research": {
    name: "EQUATOR Guidelines",
    fullName: "Methodological Transparency and Reproducibility Standards",
    scope: "Novel methods, algorithms, and protocols",
    url: "https://www.equator-network.org/",
  },
  "Computational / Simulation": {
    name: "FAIR & ODD",
    fullName: "Overview, Design concepts, and Details protocol / FAIR Research Software",
    scope: "Computational simulations, agent-based models, and machine learning",
    url: "https://www.equator-network.org/",
  },
};

export interface FinerCriteriaItem {
  score: number;
  comment: string;
}

export interface FinerProposal {
  id: string;
  title: string;
  question: string;
  rationale: string;
}

export interface FinerDiagnosticResult {
  overallScore: number;
  criteria: {
    feasible: FinerCriteriaItem;
    interesting: FinerCriteriaItem;
    novel: FinerCriteriaItem;
    ethical: FinerCriteriaItem;
    relevant: FinerCriteriaItem;
  };
  critique: string;
  proposals: FinerProposal[];
}

export interface FinerDiagnosticOptions {
  workingTitle: string;
  researchArea: string;
  primaryResearchQuestion?: string;
  studyDesign?: string;
  articleType?: string;
  expectedContribution?: string;
  theoreticalFramework?: string;
  targetPopulation?: string;
}

export function buildFinerDiagnosticPrompts(options: FinerDiagnosticOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are an elite academic research architect, senior journal editor, and principal peer-review director.
Your goal is to evaluate the foundational parameters of a proposed academic journal article using the FINER criteria:
- Feasible: Scope, technical capabilities, resources, timeframe, and empirical viability.
- Interesting: Potential to engage readers, provoke intellectual inquiry, and stimulate scholarly dialogue.
- Novel: Originality of empirical evidence, conceptual modeling, methodological innovation, or synthesis.
- Ethical: Human/animal subject protections, institutional approvals, data integrity, transparency, and reflexivity.
- Relevant: Significance to current academic discourse, policy implications, or practical advancements.

You will provide:
1. An overall score (0 to 100).
2. Individual scores and brief appraisals for each of the 5 FINER criteria.
3. A concise, incisive academic critique (2-3 sentences highlighting main strengths and vulnerable assumptions).
4. Exactly 3 distinct, publication-grade proposals for refined Title & Primary Research Question pairings:
   - Proposal 1: Direct & Precise (optimized for high citation clarity).
   - Proposal 2: Theoretical & Mechanistic (emphasizes framework & causal/thematic relations).
   - Proposal 3: Interdisciplinary / High-Impact (phrased for top-tier general or multidisciplinary journals).

Return ONLY valid JSON matching this exact structure:
{
  "overallScore": 84,
  "criteria": {
    "feasible": { "score": 85, "comment": "Clear boundary and achievable methodology." },
    "interesting": { "score": 80, "comment": "Strong interest among domain specialists." },
    "novel": { "score": 75, "comment": "Distinct from established literature but requires sharp positioning." },
    "ethical": { "score": 95, "comment": "Standard research safeguards apply." },
    "relevant": { "score": 88, "comment": "Directly impacts contemporary academic debate." }
  },
  "critique": "The core inquiry is well-grounded, but the primary question needs tighter operationalization to avoid scope creep during literature review and drafting.",
  "proposals": [
    {
      "id": "prop-1",
      "title": "Precise Academic Title Here",
      "question": "Primary research question here?",
      "rationale": "Tight focus on measurable outcomes and direct causal pathways."
    },
    {
      "id": "prop-2",
      "title": "Theoretical Title with Subtitle",
      "question": "Mechanistic or framework-grounded question here?",
      "rationale": "Directly interrogates the theoretical framework and moderating dynamics."
    },
    {
      "id": "prop-3",
      "title": "Broad Impact / Interdisciplinary Title",
      "question": "High-impact overarching inquiry?",
      "rationale": "Expands relevance across adjacent sub-disciplines for wider readership."
    }
  ]
}`;

  const userPrompt = `Evaluate this academic research proposal and provide a FINER diagnostic with 3 publication-ready title & research question proposals:
- Working Title: ${options.workingTitle || "Untitled Study"}
- Research Domain / Area: ${options.researchArea || "General Academic Inquiry"}
- Primary Research Question: ${options.primaryResearchQuestion || "Not yet formulated"}
- Article Type: ${options.articleType || "Original Research"}
- Study Design: ${options.studyDesign || "Not specified"}
- Target Population / Sample / Dataset: ${options.targetPopulation || "Not specified"}
- Theoretical Framework: ${options.theoreticalFramework || "Not specified"}
- Expected Contribution: ${options.expectedContribution || "Not specified"}`;

  return { systemPrompt, userPrompt };
}

export interface PicoSynthesisOptions {
  population: string;
  intervention: string;
  comparison?: string;
  outcome: string;
  studyDesign?: string;
  contextOrSetting?: string;
}

export interface PicoSynthesisResult {
  researchQuestion: string;
  workingTitle: string;
  rationale: string;
}

export function buildPicoSynthesisPrompts(options: PicoSynthesisOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a methodological consultant specializing in evidence-based research question formulation (PICO / PICOS / SPIDER frameworks).
Transform the user's structured components into:
1. A rigorous, grammatically impeccable Primary Research Question suitable for a Q1 journal.
2. A compelling, concise academic Working Title.
3. A brief 1-sentence rationale explaining how the components were synthesized.

Return ONLY valid JSON matching this exact structure:
{
  "researchQuestion": "Among [Population], how does [Intervention] compared to [Comparison] affect [Outcome]?",
  "workingTitle": "Impact of [Intervention] on [Outcome] in [Population]: A [Study Design] Study",
  "rationale": "Harmonizes the target sample with specific exposure and primary outcome metrics."
}`;

  const userPrompt = `Synthesize a primary research question and working title from these PICO components:
- Population / Problem (P): ${options.population || "Unspecified"}
- Intervention / Exposure / Phenomenon (I): ${options.intervention || "Unspecified"}
- Comparison / Control / Alternative (C): ${options.comparison || "None / Standard of Care"}
- Outcome / Dependent Variable (O): ${options.outcome || "Unspecified"}
- Study Design / Context (S/T): ${options.studyDesign || options.contextOrSetting || "General"}`;

  return { systemPrompt, userPrompt };
}
