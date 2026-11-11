/**
 * Invisible Decomposition & Sequential Drafting Engine (Section 3 & Section 7.4)
 * Handles automatic word count decomposition, automated source-to-claim evidence binding,
 * and PEEL-structured sequential section streaming.
 */

import type { DiscoveredSource, AssignmentDraftingSection } from "../types";
import { ensureParagraphBreaks } from "../../../shared/proseParagraphs";

export interface InternalSectionPlan extends AssignmentDraftingSection {
  sectionType: "intro" | "body" | "conclusion";
  academicFunction: string;
  boundSourceIds: string[];
}

export interface ClaimEvidenceBinding {
  sectionId: string;
  sectionTitle: string;
  academicFunction: string;
  boundSourceIds: string[];
  suggestedClaims: string[];
}

export interface DecomposeWordBudgetOptions {
  targetWordCount: number;
  wordBudget?: {
    intro?: number;
    body?: number;
    conclusion?: number;
  };
  approvedSourceIds?: string[];
  assignmentTopic?: string;
  academicLevel?: string;
}

export interface ThematicSectionTemplate {
  title: string;
  academicFunction: string;
  guidance: string;
  keyPoints: string[];
}

export interface ThematicDecomposition {
  intro: ThematicSectionTemplate;
  body: ThematicSectionTemplate[];
  conclusion: ThematicSectionTemplate;
}

/**
 * Strips university / administrative metadata from assignment prompt
 * e.g. "DEPARTMENT OF COMPUTER SCIENCE & QUANTUM INFORMATION SYSTEMS Advanced Assessment: Core Branches of Quantum Computing Honours..."
 * -> "Core Branches of Quantum Computing"
 */
export function extractCoreTopic(rawTopic?: string): string {
  if (!rawTopic) return "Academic Assignment";
  let t = rawTopic.trim();
  t = t.replace(/^(?:DEPARTMENT|FACULTY|SCHOOL|MODULE|COURSE)\s+OF\s+[^:\n]+[:\-\s]*/i, "");
  t = t.replace(/^(?:ADVANCED\s+ASSESSMENT|FINAL\s+EXAM|ASSESSMENT\s+BRIEF|ESSAY\s+PROMPT|COURSEWORK)[:\-\s]*/i, "");
  t = t.replace(/\b(?:Honours|Postgraduate|Undergraduate|Master's|PhD)\b.*$/i, "");
  t = t.replace(/\bWord\s*Count:?.*$/i, "");
  t = t.replace(/\bTarget:?.*$/i, "");
  t = t.replace(/\bDetected\s*Rules:?.*$/i, "");
  t = t.replace(/[\r\n\t]+/g, " ").trim();
  return t || "Academic Assignment";
}

/**
 * Generates tailored section templates tuned specifically to the assignment question & approved literature
 */
export function getThematicDecompositionForTopic(
  rawTopic?: string,
  approvedSources: any[] = [],
  bodyCount = 3
): ThematicDecomposition {
  const fullTopic = (rawTopic || "").trim();
  const cleanTopic = extractCoreTopic(fullTopic);
  const lower = (fullTopic + " " + cleanTopic).toLowerCase();

  // 1. Quantum Computing & Information Systems
  const isQuantum =
    lower.includes("quantum") ||
    lower.includes("qubit") ||
    lower.includes("superconducting") ||
    lower.includes("trapped-ion") ||
    lower.includes("transmon") ||
    lower.includes("surface code") ||
    lower.includes("post-quantum") ||
    lower.includes("qec");

  if (isQuantum) {
    const quantumBody: ThematicSectionTemplate[] = [
      {
        title: "Theme 1: Physical Qubit Modalities & Decoherence Constraints (Superconducting vs Trapped-Ion)",
        academicFunction: "Hardware Realisations & NISQ Constraints",
        guidance:
          "Critically contrast superconducting transmon qubits and trapped-ion architectures, examining T1/T2 relaxation, gate fidelities, cryogenic routing bottlenecks, and zero-noise extrapolation (ZNE).",
        keyPoints: [
          "Superconducting transmons vs Trapped-Ions",
          "Relaxation & dephasing (T1/T2)",
          "Cryogenic interconnect bottlenecks",
          "NISQ error mitigation (ZNE/PEC)",
        ],
      },
      {
        title: "Theme 2: Quantum Algorithmic Complexity, BQP Advantages & Circuit Scaling",
        academicFunction: "Complexity Classes & Algorithmic Mechanics",
        guidance:
          "Analyze quantum complexity classes (BQP vs BPP and NP), the Extended Church-Turing thesis, and algorithmic speedups in Shor's factoring and Grover's search algorithms.",
        keyPoints: [
          "BQP complexity class",
          "Extended Church-Turing thesis",
          "Shor's quantum Fourier transform",
          "Grover's amplitude amplification",
        ],
      },
      {
        title: "Theme 3: Fault Tolerance, Surface Code Thresholds & Post-Quantum Cryptographic Migration",
        academicFunction: "Surface Codes & Fault Tolerance",
        guidance:
          "Evaluate 2D planar surface code architectures, minimum-weight perfect matching (MWPM) syndrome decoding, fault-tolerance thresholds, magic state distillation, and post-quantum cryptographic standards (NIST FIPS 203 ML-KEM).",
        keyPoints: [
          "2D planar surface codes & MWPM",
          "Fault-tolerance threshold theorem",
          "Magic state distillation (15-to-1)",
          "NIST PQC standards (ML-KEM)",
        ],
      },
    ];

    if (bodyCount >= 4) {
      quantumBody.push({
        title: "Theme 4: Quantum Cryptography, Decoy-State QKD & Post-Quantum Migration Standards",
        academicFunction: "Quantum Cryptography & PQC Standards",
        guidance:
          "Analyze BB84 photon-number-splitting vulnerabilities, decoy-state QKD protocols, and lattice-based post-quantum cryptography migration across enterprise infrastructure.",
        keyPoints: [
          "BB84 protocol & PNS attacks",
          "Decoy-state QKD",
          "NIST PQC standards",
          "Lattice-based ML-KEM",
        ],
      });
    }

    if (bodyCount >= 5) {
      quantumBody.push({
        title: "Theme 5: Industrial Implementation, Quantum Advantage & Commercial Viability",
        academicFunction: "Industrial Scalability & Commercial Roadmap",
        guidance:
          "Evaluate commercial deployment hurdles, dilution refrigeration requirements, quantum cloud infrastructure, and quantum advantage timelines across chemistry and optimization.",
        keyPoints: [
          "Quantum cloud architectures",
          "Cryogenic scaling limits",
          "Quantum chemistry simulation",
          "Commercial horizon timelines",
        ],
      });
    }

    return {
      intro: {
        title: "Introduction: Foundations of Quantum Information Systems & Physical Architectures",
        academicFunction: "Introduction & Foundational Architecture Framework",
        guidance:
          "Introduce quantum information principles, delineate DiVincenzo criteria for physical realization, and state thesis evaluating scalability vs decoherence.",
        keyPoints: [
          "DiVincenzo criteria",
          "Physical qubit realizations",
          "Decoherence and fidelity metrics",
          "Central argumentative thesis",
        ],
      },
      body: quantumBody.slice(0, bodyCount),
      conclusion: {
        title: "Conclusion: Strategic Synthesis & Physical Scalability Horizons in Quantum Computing",
        academicFunction: "Conclusion & Strategic Synthesis",
        guidance:
          "Synthesize physical modality trade-offs, summarize algorithmic advantage benchmarks, and articulate the transitional trajectory from NISQ devices to fault-tolerant computation.",
        keyPoints: [
          "Modality trade-offs synthesis",
          "Complexity horizon",
          "NISQ to fault-tolerant transition",
          "Strategic roadmap",
        ],
      },
    };
  }

  // 2. AI Ethics, Algorithmic Governance & Computer Science Systems
  const isAiOrAlgo =
    lower.includes("algorithm") ||
    lower.includes("machine learning") ||
    lower.includes("artificial intelligence") ||
    lower.includes("deep learning") ||
    lower.includes("neural network") ||
    lower.includes("ai ethics") ||
    lower.includes("ai governance") ||
    lower.includes("automated decision") ||
    lower.includes("socio-technical") ||
    lower.includes("predictive accountability");

  if (isAiOrAlgo) {
    const aiBody: ThematicSectionTemplate[] = [
      {
        title: "Theme 1: Machine Learning Foundations: Fairness Metrics & Model Architecture Biases",
        academicFunction: "Algorithmic Foundations & Mathematical Parity",
        guidance:
          "Formulate mathematical and philosophical conceptions of fairness, disparate impact, optimization loss functions, and dataset curation biases.",
        keyPoints: [
          "Demographic parity vs equalized odds",
          "Proxy variable entanglement",
          "Loss function trade-offs",
          "Epistemic limits",
        ],
      },
      {
        title: "Theme 2: Empirical Case Evidence: High-Stakes Socio-Technical Deployment",
        academicFunction: "Empirical Case Analysis & Contextual Harms",
        guidance:
          "Evaluate empirical studies in clinical diagnostics, predictive judicial profiling, and credit underwriting, testing model performance against real-world harm.",
        keyPoints: [
          "Clinical diagnostic disparities",
          "Predictive judicial scoring",
          "Automated welfare eligibility",
          "Feedback loops",
        ],
      },
      {
        title: "Theme 3: Regulatory Governance: Auditability, Strict Liability & Innovation Trade-offs",
        academicFunction: "Critical Regulatory & Governance Evaluation",
        guidance:
          "Critically evaluate strict liability vs negligence, third-party algorithmic auditing, model explainability trade-offs, and compliance burdens.",
        keyPoints: [
          "Independent algorithmic audits",
          "Strict liability vs negligence",
          "Explainability vs accuracy trade-offs",
          "Regulatory friction",
        ],
      },
      {
        title: "Theme 4: Institutional Safeguards, Human-in-the-Loop & Procedural Due Process",
        academicFunction: "Institutional Safeguards & Procedural Rights",
        guidance:
          "Analyze procedural due process rights, human oversight efficacy, contestability mechanisms, and institutional governance architectures.",
        keyPoints: [
          "Human-in-the-loop limits",
          "Contestability & appeal mechanisms",
          "Procedural due process",
          "Institutional oversight",
        ],
      },
    ];

    return {
      intro: {
        title: "Introduction: Algorithmic Governance, Opacity & Epistemic Accountability",
        academicFunction: "Introduction & Epistemic Problem Statement",
        guidance:
          "Contextualize automated decision systems in socio-technical governance, define black-box epistemic opacity, and advance a thesis on institutional accountability.",
        keyPoints: [
          "Algorithmic opacity",
          "Socio-technical decision systems",
          "Procedural accountability",
          "Central thesis statement",
        ],
      },
      body: aiBody.slice(0, bodyCount),
      conclusion: {
        title: "Conclusion: Policy Synthesis & Future Frameworks for Trustworthy AI Systems",
        academicFunction: "Conclusion & Strategic Synthesis",
        guidance:
          "Synthesize socio-technical evidence, resolve tensions between innovation and civic protection, and propose actionable governance mechanisms.",
        keyPoints: [
          "Synthesis of technical & legal evidence",
          "Human-in-the-loop governance",
          "Institutional auditing standards",
          "Future research horizons",
        ],
      },
    };
  }

  // 2b. Organizational Culture, Leadership & Organizational Behavior
  const isOBOrLeadership =
    lower.includes("schein") ||
    lower.includes("organizational culture") ||
    lower.includes("leadership") ||
    lower.includes("breakthrough leadership") ||
    lower.includes("human resource");

  if (isOBOrLeadership) {
    const obBody: ThematicSectionTemplate[] = [
      {
        title: "Evaluating Culture Change: Why Changing Artifacts Alone Is Insufficient",
        academicFunction: "Artifacts vs Assumptions",
        guidance:
          "Analyze why modifying physical artifacts alone fails to create durable cultural transformation without shifting underlying assumptions.",
        keyPoints: [
          "Surface compliance vs internalized behavioral alignment",
          "Limits of cosmetic alterations (dress codes, office redesigns)",
          "Why underlying assumptions resist superficial visual redesigns",
        ],
      },
      {
        title: "Leadership Interventions: Selecting the Most Effective Cultural Level to Target",
        academicFunction: "Leadership Intervention Level",
        guidance:
          "Evaluate which level of Schein's model leaders should target first to successfully lead and sustain culture change.",
        keyPoints: [
          "Weighing intervention points: direct targeting of values vs behavioral habits",
          "Executive role-modeling and resource allocation in unfreezing assumptions",
          "Aligning reward systems to bridge espoused values and everyday practices",
        ],
      },
      {
        title: "Assessing Organizational Culture During the Job Interview Process",
        academicFunction: "Interview Culture Assessment",
        guidance:
          "Formulate practical methods for candidates and evaluators to assess genuine organizational culture during job interviews using Schein's levels.",
        keyPoints: [
          "Observing physical artifacts and interaction patterns during visits",
          "Asking probing behavioral questions that test stated values against real dilemmas",
          "Identifying discrepancies between public marketing and internal unspoken assumptions",
        ],
      },
    ];

    return {
      intro: {
        title: "Introduction: Organizational Culture & Theoretical Framing",
        academicFunction: "Introduction & Theoretical Framing",
        guidance:
          "Contextualize organizational culture as a strategic asset, setting up the theoretical framework used in the brief.",
        keyPoints: [
          "Significance of organizational culture",
          "Schein's 3-level model as analytical scaffold",
          "Central thesis on cultural alignment",
        ],
      },
      body: obBody.slice(0, bodyCount),
      conclusion: {
        title: "Conclusion: Strategic Synthesis & Leadership Horizons",
        academicFunction: "Conclusion & Strategic Synthesis",
        guidance:
          "Synthesize findings on leadership, cultural alignment, and strategic hiring into actionable takeaways.",
        keyPoints: [
          "Cultural coherence as sustainable advantage",
          "Schein's framework applied to modern leadership",
          "Recommendations for driving cultural evolution",
        ],
      },
    };
  }

  // 3. International Relations / Geopolitics / Security
  const isIR =
    lower.includes("china") ||
    lower.includes("chinese") ||
    lower.includes("foreign policy") ||
    lower.includes("geopolitic") ||
    lower.includes("international relations") ||
    lower.includes("hegemon") ||
    lower.includes("power transition") ||
    lower.includes("security dilemma") ||
    lower.includes("multilateral") ||
    lower.includes("sovereignty");

  if (isIR) {
    const irBody: ThematicSectionTemplate[] = [
      {
        title: "Theme 1: Structural Realism, Hegemonic Rivalry & Security Dilemma Dynamics",
        academicFunction: "Structural Framework & Balance of Power",
        guidance:
          "Interrogate offensive vs defensive realist assumptions, balance of power mechanics, and regional security dilemma escalations.",
        keyPoints: [
          "Offensive vs defensive realism",
          "Security dilemma dynamics",
          "Regional power balancing",
          "Strategic intent",
        ],
      },
      {
        title: "Theme 2: Geo-Economic Statecraft, Trade Networks & Institutional Revisionism",
        academicFunction: "Geo-Economic Leverage & Institutional Evidence",
        guidance:
          "Synthesize empirical evidence on infrastructure investments, multilateral banking initiatives, trade weaponization, and bilateral dependencies.",
        keyPoints: [
          "Geo-economic leverage",
          "Institutional statecraft",
          "Supply chain dependencies",
          "Empirical indicators",
        ],
      },
      {
        title: "Theme 3: Multilateral Friction, Alliance Counter-Balancing & Deterrence Dilemmas",
        academicFunction: "Critical Evaluation & Dialectical Tension",
        guidance:
          "Critically evaluate counter-containment coalitions, minilateral partnerships, sovereignty conflicts, and crisis escalation risks.",
        keyPoints: [
          "Minilateralism vs multilateralism",
          "Deterrence credibility",
          "Sovereignty contestation",
          "Counter-coalitions",
        ],
      },
      {
        title: "Theme 4: Global Institutional Governance, Sanctions & Strategic Autonomy",
        academicFunction: "Global Governance & Strategic Autonomy",
        guidance:
          "Analyze international institutional compliance, sovereign sanctions resistance, diplomatic coalitions, and the fragmentation of global governance.",
        keyPoints: [
          "Institutional fragmentation",
          "Sanctions resistance",
          "Diplomatic alignment",
          "Normative contestation",
        ],
      },
    ];

    return {
      intro: {
        title: "Introduction: Hegemonic Transitions & the Contemporary International Order",
        academicFunction: "Introduction & Structural Problem Statement",
        guidance:
          "Introduce the systemic debate on the evolving global order, delineate theoretical frameworks of power transition, and articulate a clear thesis on institutional resilience.",
        keyPoints: [
          "Systemic power distribution",
          "Power transition theory",
          "Liberal international order",
          "Central thesis statement",
        ],
      },
      body: irBody.slice(0, bodyCount),
      conclusion: {
        title: "Conclusion: Strategic Synthesis & Long-Term Geopolitical Trajectories",
        academicFunction: "Conclusion & Geopolitical Synthesis",
        guidance:
          "Synthesize empirical findings against systemic theories, restate the thesis, and articulate strategic implications for future multilateral stability.",
        keyPoints: [
          "Synthesis of structural arguments",
          "Empirical reconciliation",
          "Future order scenarios",
          "Policy roadmap",
        ],
      },
    };
  }

  // 4. Universal Question-Tuned Dynamic Construction
  const words = cleanTopic.split(/\s+/).filter(Boolean);
  const topicShort = words.length > 5 ? words.slice(0, 5).join(" ") + "..." : cleanTopic;

  const defaultBody: ThematicSectionTemplate[] = [
    {
      title: `Theme 1: Foundational Theoretical Framework & Conceptual Paradigms in ${topicShort}`,
      academicFunction: "Core Concept & Foundational Framework",
      guidance: `Define primary terminology, articulate underlying theoretical assumptions, and establish the analytical lens for ${cleanTopic}.`,
      keyPoints: ["Foundational definitions", "Theoretical framework", "Conceptual boundaries"],
    },
    {
      title: `Theme 2: Empirical Evidence, Case Studies & Applied Analysis in ${topicShort}`,
      academicFunction: "Empirical Evidence & Contemporary Context",
      guidance: `Synthesize concrete empirical findings, comparative case studies, and observational data evaluating ${cleanTopic}.`,
      keyPoints: ["Empirical findings", "Case analysis", "Comparative evaluation"],
    },
    {
      title: `Theme 3: Critical Evaluation, Dialectical Trade-offs & Counter-Perspectives in ${topicShort}`,
      academicFunction: "Critical Evaluation, Trade-offs & Counter-Perspectives",
      guidance: `Critically evaluate competing schools of thought, examine methodological limitations, and address dissenting perspectives regarding ${cleanTopic}.`,
      keyPoints: ["Counter-arguments", "Methodological critique", "Dialectical synthesis"],
    },
    {
      title: `Theme 4: Institutional Governance, Policy Implications & Strategic Implementation`,
      academicFunction: "Policy Implications & Strategic Implementation",
      guidance: `Analyze institutional consequences, feasibility constraints, and pragmatic implementation barriers in ${cleanTopic}.`,
      keyPoints: ["Institutional governance", "Feasibility constraints", "Pragmatic implications"],
    },
    {
      title: `Theme 5: Long-Term Trajectories, Unresolved Limits & Systemic Horizons`,
      academicFunction: "Synthesis, Long-Term Impact & Methodological Limits",
      guidance: `Synthesize overarching systemic implications, unaddressed research gaps, and future trajectories for ${cleanTopic}.`,
      keyPoints: ["Systemic synthesis", "Unresolved tensions", "Future horizons"],
    },
  ];

  return {
    intro: {
      title: `Introduction: Contextual Scope & Problem Statement in ${topicShort}`,
      academicFunction: "Introduction & Problem Statement",
      guidance: `Introduce the scholarly debate on '${cleanTopic}', delineate scope boundaries, and advance a clear, argumentative thesis statement.`,
      keyPoints: ["Contextual background", "Problem statement", "Central thesis statement", "Roadmap of paper"],
    },
    body: defaultBody.slice(0, bodyCount),
    conclusion: {
      title: `Conclusion: Strategic Synthesis & Future Horizons in ${topicShort}`,
      academicFunction: "Conclusion & Strategic Synthesis",
      guidance: `Synthesize core findings without introducing new evidence, restate the substantiated thesis, and articulate broader academic or policy implications for ${cleanTopic}.`,
      keyPoints: ["Restatement of thesis", "Synthesis of main arguments", "Broader implications", "Closing judgment"],
    },
  };
}

export interface TuneSectionsOptions {
  existingSections?: (AssignmentDraftingSection | InternalSectionPlan)[];
  sections?: (AssignmentDraftingSection | InternalSectionPlan)[];
  assignmentTopic: string;
  approvedSources?: DiscoveredSource[] | string[];
  targetWordCount?: number;
  academicLevel?: string;
}

/**
 * Re-tunes existing sections to match the assignment question & literature,
 * while preserving all existing drafted content and status.
 */
export function tuneSectionsToQuestion(options: TuneSectionsOptions): InternalSectionPlan[] {
  const existingSections = options.existingSections || options.sections || [];
  const { assignmentTopic, approvedSources = [] } = options;
  if (!existingSections || existingSections.length === 0) {
    return decomposeWordBudget({
      targetWordCount: options.targetWordCount || 2000,
      assignmentTopic,
      approvedSourceIds: Array.isArray(approvedSources)
        ? approvedSources.map((s) => (typeof s === "string" ? s : s.id))
        : [],
    });
  }

  const bodySections = existingSections.filter(
    (s) => s.sectionType === "body" || (!s.id.includes("intro") && !s.id.includes("conclusion"))
  );
  const bodyCount = Math.max(1, bodySections.length || 3);
  const decomposition = getThematicDecompositionForTopic(assignmentTopic, approvedSources, bodyCount);

  let bodyIdx = 0;
  return existingSections.map((sec) => {
    const isIntro = sec.sectionType === "intro" || sec.id.includes("intro");
    const isConclusion = sec.sectionType === "conclusion" || sec.id.includes("conclusion");

    if (isIntro) {
      return {
        ...sec,
        sectionType: "intro" as const,
        title: decomposition.intro.title,
        academicFunction: decomposition.intro.academicFunction,
        guidance: decomposition.intro.guidance,
        keyPoints: decomposition.intro.keyPoints,
        boundSourceIds: sec.boundSourceIds || [],
      };
    }

    if (isConclusion) {
      return {
        ...sec,
        sectionType: "conclusion" as const,
        title: decomposition.conclusion.title,
        academicFunction: decomposition.conclusion.academicFunction,
        guidance: decomposition.conclusion.guidance,
        keyPoints: decomposition.conclusion.keyPoints,
        boundSourceIds: sec.boundSourceIds || [],
      };
    }

    // Body section
    const theme = decomposition.body[bodyIdx % decomposition.body.length];
    bodyIdx++;

    return {
      ...sec,
      sectionType: "body" as const,
      title: theme.title,
      academicFunction: theme.academicFunction,
      guidance: theme.guidance,
      keyPoints: theme.keyPoints,
      boundSourceIds: sec.boundSourceIds || [],
    };
  });
}

/**
 * Step 1: Invisible Body Word Count Decomposition Formula (Section 3.1)
 * Evaluates W_body and dynamically determines the optimal thematic sub-section breakdown.
 */
export function decomposeWordBudget(options: DecomposeWordBudgetOptions): InternalSectionPlan[] {
  const {
    targetWordCount = 2000,
    wordBudget,
    approvedSourceIds = [],
    assignmentTopic = "Academic Assessment",
  } = options;

  const total = Math.max(200, targetWordCount);

  // Discrete Exam Mode: Only when explicitly requested with 0 intro words and explicit question parts
  const isStrictExamParts =
    wordBudget?.intro === 0 &&
    /quantum/i.test(assignmentTopic) &&
    /part\s*1|question\s*1/i.test(assignmentTopic);

  if (isStrictExamParts) {
    const partWords = Math.round(total / 4);
    return [
      {
        id: "sec-part-1",
        title: "PART 1: QUANTUM HARDWARE ARCHITECTURES & PHYSICAL MODALITIES [25 MARKS]",
        sectionType: "body",
        academicFunction: "Qubit Realisations & NISQ Constraints",
        targetWordCount: partWords,
        currentWordCount: 0,
        guidance: "Solve Question 1 (a-c) on superconducting transmons vs trapped-ions, and Question 2 on NISQ constraints and error mitigation strategies (ZNE/PEC).",
        draftContent: "",
        status: "pending",
        boundSourceIds: approvedSourceIds.slice(0, 2),
        keyPoints: ["Transmon vs Trapped-Ion", "Decoherence mechanisms", "Cryogenic routing bottlenecks", "NISQ error mitigation"],
      },
      {
        id: "sec-part-2",
        title: "PART 2: QUANTUM ALGORITHMIC PARADIGMS & COMPLEXITY ADVANTAGE [25 MARKS]",
        sectionType: "body",
        academicFunction: "Complexity Classes & Algorithmic Mechanics",
        targetWordCount: partWords,
        currentWordCount: 0,
        guidance: "Solve Question 3 on BQP and Extended Church-Turing thesis, and Question 4 on Shor's and Grover's algorithms.",
        draftContent: "",
        status: "pending",
        boundSourceIds: approvedSourceIds.slice(2, 4),
        keyPoints: ["BQP vs NP", "Extended Church-Turing thesis", "Shor's order-finding QFT", "Grover's amplitude amplification"],
      },
      {
        id: "sec-part-3",
        title: "PART 3: QUANTUM ERROR CORRECTION (QEC) & FAULT TOLERANCE [25 MARKS]",
        sectionType: "body",
        academicFunction: "Surface Codes & Fault Tolerance",
        targetWordCount: partWords,
        currentWordCount: 0,
        guidance: "Solve Question 5 (a-c) on planar surface code layout, syndrome extraction, threshold theorem, and magic state distillation.",
        draftContent: "",
        status: "pending",
        boundSourceIds: approvedSourceIds.slice(4, 6),
        keyPoints: ["2D planar surface code", "MWPM decoding", "Threshold theorem", "Magic state distillation (15-to-1)"],
      },
      {
        id: "sec-part-4",
        title: "PART 4: QUANTUM CRYPTOGRAPHY & POST-QUANTUM MIGRATION [25 MARKS]",
        sectionType: "body",
        academicFunction: "Quantum Cryptography & PQC Standards",
        targetWordCount: partWords,
        currentWordCount: 0,
        guidance: "Solve Question 6 on BB84 protocol and optical fiber limitations, and Question 7 on NIST PQC standards (FIPS 203 ML-KEM).",
        draftContent: "",
        status: "pending",
        boundSourceIds: approvedSourceIds.slice(6, 8),
        keyPoints: ["BB84 protocol & PNS attacks", "Decoy-state QKD", "NIST PQC standards", "Lattice-based ML-KEM"],
      },
    ];
  }

  // Proportional baseline budget: ~10% Intro / ~75-80% Body / ~10-15% Conclusion
  const introWords = wordBudget?.intro ?? Math.round(total * 0.10);
  const conclusionWords = wordBudget?.conclusion ?? Math.round(total * 0.15);
  const bodyWords = wordBudget?.body ?? Math.max(0, total - introWords - conclusionWords);

  // Determine number of body sub-themes based on W_body threshold
  let bodySubThemeCount: number;
  if (bodyWords <= 800) {
    bodySubThemeCount = 2;
  } else if (bodyWords <= 2500) {
    bodySubThemeCount = 3;
  } else if (bodyWords <= 4000) {
    bodySubThemeCount = 4;
  } else {
    bodySubThemeCount = 5;
  }

  // Calculate target word allocation per body sub-theme
  const baseWordsPerSubTheme = Math.floor(bodyWords / bodySubThemeCount);
  const remainder = bodyWords - baseWordsPerSubTheme * bodySubThemeCount;

  // Retrieve intelligent question-tuned thematic decomposition
  const thematicDecomp = getThematicDecompositionForTopic(
    assignmentTopic,
    approvedSourceIds,
    bodySubThemeCount
  );

  const sections: InternalSectionPlan[] = [];

  // 1. Introduction Section (~10%)
  sections.push({
    id: "sec-intro",
    title: thematicDecomp.intro.title,
    sectionType: "intro",
    academicFunction: thematicDecomp.intro.academicFunction,
    targetWordCount: introWords,
    currentWordCount: 0,
    guidance: thematicDecomp.intro.guidance,
    draftContent: "",
    status: "pending",
    boundSourceIds: approvedSourceIds.slice(0, 1),
    keyPoints: thematicDecomp.intro.keyPoints,
  });

  // 2. Thematic Body Sections
  for (let i = 0; i < bodySubThemeCount; i++) {
    const fn = thematicDecomp.body[i % thematicDecomp.body.length];
    const allocatedWords = i === bodySubThemeCount - 1 ? baseWordsPerSubTheme + remainder : baseWordsPerSubTheme;

    sections.push({
      id: `sec-body-${i + 1}`,
      title: fn.title,
      sectionType: "body",
      academicFunction: fn.academicFunction,
      targetWordCount: allocatedWords,
      currentWordCount: 0,
      guidance: fn.guidance,
      draftContent: "",
      status: "pending",
      boundSourceIds: [],
      keyPoints: fn.keyPoints,
    });
  }

  // 3. Conclusion Section (~10-15%)
  sections.push({
    id: "sec-conclusion",
    title: thematicDecomp.conclusion.title,
    sectionType: "conclusion",
    academicFunction: thematicDecomp.conclusion.academicFunction,
    targetWordCount: conclusionWords,
    currentWordCount: 0,
    guidance: thematicDecomp.conclusion.guidance,
    draftContent: "",
    status: "pending",
    boundSourceIds: approvedSourceIds.slice(-2),
    keyPoints: thematicDecomp.conclusion.keyPoints,
  });

  // Automatically bind approved sources across the generated body sections
  bindApprovedSourcesToSections(sections, approvedSourceIds);

  return sections;
}

/**
 * Step 2: Automated Evidence Binding (Section 3.2)
 * Maps approved sources across the generated body sections according to academic purpose:
 * - Sources 1 & 2 -> Sub-Theme 1 (Core Concept / Foundation)
 * - Sources 3 & 4 -> Sub-Theme 2 (Empirical Proof / Context)
 * - Source 5 + dissenting -> Sub-Theme 3 (Counter-arguments / Evaluation)
 */
export function bindApprovedSourcesToSections(
  sections: InternalSectionPlan[],
  approvedSourceIds: string[]
): ClaimEvidenceBinding[] {
  const bodySections = sections.filter((s) => s.sectionType === "body");
  const bindings: ClaimEvidenceBinding[] = [];

  if (bodySections.length === 0) return bindings;

  if (approvedSourceIds.length === 0) {
    for (const section of bodySections) {
      section.boundSourceIds = [];
      bindings.push({
        sectionId: section.id,
        sectionTitle: section.title,
        academicFunction: section.academicFunction,
        boundSourceIds: [],
        suggestedClaims: ["Conceptual reasoning and literature synthesis required."],
      });
    }
    return bindings;
  }

  if (bodySections.length === 3 && approvedSourceIds.length >= 3) {
    // Exact spec mapping
    bodySections[0].boundSourceIds = approvedSourceIds.slice(0, 2);
    bodySections[1].boundSourceIds = approvedSourceIds.slice(2, 4);
    bodySections[2].boundSourceIds = approvedSourceIds.length > 4 ? approvedSourceIds.slice(4) : approvedSourceIds.slice(2);
  } else {
    // Dynamic round-robin chunking across N body sections
    const chunkSize = Math.max(1, Math.ceil(approvedSourceIds.length / bodySections.length));
    bodySections.forEach((section, idx) => {
      const start = idx * chunkSize;
      const slice = approvedSourceIds.slice(start, start + chunkSize);
      // Fallback: if slice is empty, wrap around to ensure every body section has evidence
      section.boundSourceIds = slice.length > 0 ? slice : [approvedSourceIds[idx % approvedSourceIds.length]];
    });
  }

  // Populate ClaimEvidenceBinding summaries
  for (const section of bodySections) {
    bindings.push({
      sectionId: section.id,
      sectionTitle: section.title,
      academicFunction: section.academicFunction,
      boundSourceIds: section.boundSourceIds,
      suggestedClaims: [
        `Substantiate ${section.academicFunction.toLowerCase()} using citations: ${section.boundSourceIds.join(", ")}`,
      ],
    });
  }

  return bindings;
}

/**
 * Step 3: Sequential Section Streaming Client Contract (Section 7.4)
 * Connects to POST /api/projects/:id/assignment/stream-section with SSE or resilient streaming fallback.
 * Enforces PEEL paragraph framework:
 * - Point: Thematic topic sentence
 * - Evidence: Assigned Phase 2 citations
 * - Explanation: 70% critical analysis / 30% description
 * - Link: Explicit transition back to prompt
 */
export interface StreamSectionOptions {
  projectId: string;
  section: InternalSectionPlan;
  assignmentTopic: string;
  academicLevel?: string;
  citationStyle?: string;
  approvedSources?: DiscoveredSource[];
  thesis?: string;
  revisionPrompt?: "deepen" | "expand" | "condense" | string;
  /** Serialized evidence pack prompt block (Production Spec §4.1–4.3) */
  evidencePackPrompt?: string;
  onChunk: (chunk: string, aggregatedText: string) => void;
  onComplete: (fullText: string) => void;
  onError?: (err: Error) => void;
  /** Called when the server could not use an AI and sent an offline scaffold instead. */
  onFallback?: (info: { reason: string }) => void;
  /** Where this section sits in the report, for a cohesive, non-repetitive draft. */
  report?: {
    sectionIndex: number;
    sectionCount: number;
    outlineTitles: string[];
    previousTail?: string;
    /** Words the essay may still use: target minus words already in other sections. */
    remainingEssayWords?: number;
  };
  writingStyle?: { preset?: string; customSampleText?: string };
}

/**
 * Drafts one section with the user's own AI. The server either streams the
 * AI's text, or (when the AI runs in the browser) hands the prompt back via
 * a 426, which `authedJsonFetch` runs and retries. Nothing is ever written
 * here without the AI: on failure the caller gets an error, not filler (P0-20).
 */
export async function streamSectionGeneration(options: StreamSectionOptions): Promise<string> {
  const {
    projectId,
    section,
    assignmentTopic,
    academicLevel = "undergraduate",
    citationStyle = "apa7",
    approvedSources = [],
    thesis = "",
    revisionPrompt,
    evidencePackPrompt,
    onChunk,
    onComplete,
    onError,
    onFallback,
    report,
    writingStyle,
  } = options;

  const relevantSources = approvedSources.filter(
    (s) => section.boundSourceIds?.includes(s.id) || s.status === "kept"
  );

  const attempt = async (): Promise<string> => {
    const { authedJsonFetch } = await import("../../api/client");
    const response = await authedJsonFetch(`/api/projects/${projectId}/assignment/stream-section`, "POST", {
      sectionId: section.id,
      sectionTitle: section.title,
      guidance: section.guidance,
      keyPoints: section.keyPoints,
      academicFunction: section.academicFunction,
      targetWordCount: section.targetWordCount,
      allocatedWords: section.targetWordCount,
      ...(report
        ? {
            sectionIndex: report.sectionIndex,
            sectionCount: report.sectionCount,
            outlineTitles: report.outlineTitles,
            previousTail: report.previousTail,
            remainingEssayWords: report.remainingEssayWords,
          }
        : {}),
      ...(writingStyle ? { writingStyle } : {}),
      academicLevel,
      citationStyle,
      assignmentTopic,
      thesis,
      boundSources: relevantSources,
      revisionPrompt,
      existingContent: section.draftContent,
      evidencePackPrompt,
    });

    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(
        data?.error ||
          (response.status === 426
            ? "Connect an AI provider in AI Access to draft sections."
            : "The section could not be drafted. Nothing was written. Try again.")
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aggregatedText = "";
    let buffer = "";
    let streamError = "";
    let finalFromServer = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const rawData = line.slice(6).trim();
        if (!rawData || rawData === "[DONE]") continue;
        try {
          const parsed = JSON.parse(rawData) as { chunk?: string; fullText?: string; error?: string; recoverable?: boolean; fallback?: { reason?: string } };
          if (parsed.error) streamError = parsed.error;
          if (parsed.fallback) onFallback?.({ reason: parsed.fallback.reason || "No AI provider could answer right now." });
          if (parsed.chunk) {
            aggregatedText += parsed.chunk;
            onChunk(parsed.chunk, aggregatedText);
          }
          if (parsed.fullText) {
            aggregatedText = parsed.fullText;
            finalFromServer = true;
          }
        } catch {
          // ignore a malformed line
        }
      }
    }

    // A failure event (or a stream that ended without its final text) never
    // overwrites the section with a partial answer.
    if (streamError && !finalFromServer) throw new Error(streamError);
    const finalText = ensureParagraphBreaks(aggregatedText.trim());
    if (!finalText) {
      throw new Error(streamError || "The AI returned no text for this section. Nothing was written. Try again.");
    }
    return finalText;
  };

  try {
    let finalText: string;
    try {
      finalText = await attempt();
    } catch (first) {
      // A dropped socket (TypeError: Failed to fetch) is retried once straight away.
      if (!(first instanceof TypeError)) throw first;
      finalText = await attempt();
    }
    onComplete(finalText);
    return finalText;
  } catch (err) {
    // A dropped connection surfaces as TypeError: Failed to fetch; say what it means.
    const error =
      err instanceof TypeError
        ? new Error("Could not reach the server. Check your connection and try again.")
        : err instanceof Error
        ? err
        : new Error(String(err));
    onError?.(error);
    throw error;
  }
}
