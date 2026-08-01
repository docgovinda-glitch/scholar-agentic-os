/**
 * Multi-Document Type System
 *
 * Defines 10 academic writing types with:
 * - Custom sections/structure
 * - Validation rules
 * - Quality gates
 * - Guidance per type
 * - Output format specs
 */

export type DocumentType =
  | "thesis-dissertation"
  | "journal-article"
  | "research-proposal"
  | "lab-report"
  | "case-study"
  | "literature-review"
  | "conference-paper"
  | "white-paper"
  | "book-chapter"
  | "grant-proposal";

export interface DocumentTypeMetadata {
  id: DocumentType;
  label: string;
  description: string;
  wordCountTarget: { min: number; max: number };
  sections: Section[];
  qualityGates: QualityGate[];
  guidanceByPhase: Record<string, string>;
  citations: { style: string; minCount: number };
  format: FormatSpec;
}

export interface Section {
  key: string;
  title: string;
  description: string;
  wordCount?: { min: number; max: number };
  required: boolean;
  guidelines: string;
  aiGuidance?: string;
}

export interface QualityGate {
  id: string;
  name: string;
  description: string;
  check: (content: string) => boolean;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface FormatSpec {
  margins?: string;
  lineSpacing?: number;
  fontSize?: number;
  fontFamily?: string;
  headerFooter?: boolean;
}

// ============================================================================
// DOCUMENT TYPES CATALOG - 10 Academic Writing Types
// ============================================================================

export const DOCUMENT_TYPES: Record<DocumentType, DocumentTypeMetadata> = {
  "thesis-dissertation": {
    id: "thesis-dissertation",
    label: "Thesis/Dissertation",
    description: "Comprehensive doctoral/master's thesis with original research",
    wordCountTarget: { min: 40000, max: 100000 },
    sections: [
      {
        key: "introduction",
        title: "Introduction",
        description: "Research problem, significance, objectives",
        wordCount: { min: 2000, max: 5000 },
        required: true,
        guidelines: "Establish context and justify research significance",
        aiGuidance: "Help articulate research gap and motivation"
      },
      {
        key: "literature-review",
        title: "Literature Review",
        description: "Comprehensive review of prior work",
        wordCount: { min: 5000, max: 12000 },
        required: true,
        guidelines: "Synthesize existing literature thematically",
        aiGuidance: "Organize sources by theme and identify gaps"
      },
      {
        key: "methodology",
        title: "Methodology",
        description: "Research design, methods, procedures",
        wordCount: { min: 3000, max: 8000 },
        required: true,
        guidelines: "Detail data collection and analysis methods",
        aiGuidance: "Ensure reproducibility and clarity"
      },
      {
        key: "results",
        title: "Results",
        description: "Findings from data analysis",
        wordCount: { min: 5000, max: 15000 },
        required: true,
        guidelines: "Present data objectively without interpretation",
        aiGuidance: "Help structure complex data visualizations"
      },
      {
        key: "discussion",
        title: "Discussion",
        description: "Interpretation and implications",
        wordCount: { min: 5000, max: 12000 },
        required: true,
        guidelines: "Interpret results in context of literature",
        aiGuidance: "Connect findings to research questions"
      },
      {
        key: "conclusion",
        title: "Conclusion",
        description: "Summary and future research",
        wordCount: { min: 1500, max: 3000 },
        required: true,
        guidelines: "Summarize findings and suggest future work",
        aiGuidance: "Synthesize implications"
      }
    ],
    qualityGates: [
      {
        id: "citation-density",
        name: "Citation Density",
        description: "Ensure adequate scholarly sourcing",
        check: () => true,
        message: "Ensure minimum 1 citation per 500 words",
        severity: "warning"
      }
    ],
    guidanceByPhase: {
      A: "Define your research problem and significance",
      B: "Ground your work in existing literature",
      C: "Discover relevant datasets and sources",
      D: "Identify target journals for publishing",
      E: "Follow formatting requirements precisely",
      F: "Draft each section with AI guidance",
      G: "Perform peer review and compliance audit",
      H: "Prepare submission package",
      I: "Submit to journal"
    },
    citations: { style: "IEEE", minCount: 50 },
    format: {
      margins: "1 inch",
      lineSpacing: 2,
      fontSize: 12,
      fontFamily: "Times New Roman",
      headerFooter: true
    }
  },

  "journal-article": {
    id: "journal-article",
    label: "Journal Article",
    description: "Research article for peer-reviewed journal publication",
    wordCountTarget: { min: 5000, max: 12000 },
    sections: [
      {
        key: "abstract",
        title: "Abstract",
        description: "150-250 word summary",
        wordCount: { min: 150, max: 250 },
        required: true,
        guidelines: "Concise summary of problem, methods, results, conclusions",
        aiGuidance: "Distill key findings into abstract form"
      },
      {
        key: "introduction",
        title: "Introduction",
        description: "Problem statement and significance",
        wordCount: { min: 1000, max: 2000 },
        required: true,
        guidelines: "Establish context and research question",
        aiGuidance: "Connect to existing literature"
      },
      {
        key: "methods",
        title: "Methods",
        description: "Research methodology",
        wordCount: { min: 1000, max: 2500 },
        required: true,
        guidelines: "Enable replication of study",
        aiGuidance: "Ensure methodological rigor"
      },
      {
        key: "results",
        title: "Results",
        description: "Study findings",
        wordCount: { min: 1500, max: 3000 },
        required: true,
        guidelines: "Present data clearly with tables/figures",
        aiGuidance: "Organize results logically"
      },
      {
        key: "discussion",
        title: "Discussion",
        description: "Interpretation and implications",
        wordCount: { min: 1000, max: 2500 },
        required: true,
        guidelines: "Interpret findings and address limitations",
        aiGuidance: "Connect to broader context"
      },
      {
        key: "conclusion",
        title: "Conclusion",
        description: "Summary and future directions",
        wordCount: { min: 500, max: 1000 },
        required: true,
        guidelines: "Concise summary and implications",
        aiGuidance: "Highlight impact and next steps"
      }
    ],
    qualityGates: [],
    guidanceByPhase: {
      A: "Define research question and objectives",
      B: "Ground in prior research",
      C: "Identify datasets and sources",
      D: "Match journal scope and guidelines",
      E: "Follow journal formatting requirements",
      F: "Draft article sections",
      G: "Perform peer review compliance check",
      H: "Prepare submission packet",
      I: "Submit to journal"
    },
    citations: { style: "APA", minCount: 20 },
    format: {
      margins: "1 inch",
      lineSpacing: 1.5,
      fontSize: 11,
      fontFamily: "Arial"
    }
  },

  "research-proposal": {
    id: "research-proposal",
    label: "Research Proposal",
    description: "Proposal for funding or approval of research project",
    wordCountTarget: { min: 3000, max: 8000 },
    sections: [
      {
        key: "executive-summary",
        title: "Executive Summary",
        wordCount: { min: 300, max: 500 },
        required: true,
        description: "High-level overview",
        guidelines: "Compelling summary for busy reviewers",
        aiGuidance: "Highlight significance and innovation"
      },
      {
        key: "research-question",
        title: "Research Question & Objectives",
        wordCount: { min: 500, max: 1000 },
        required: true,
        description: "Clear, measurable objectives",
        guidelines: "Specific, achievable research goals",
        aiGuidance: "Make objectives concrete and testable"
      },
      {
        key: "significance",
        title: "Significance & Innovation",
        wordCount: { min: 800, max: 1500 },
        required: true,
        description: "Why this research matters",
        guidelines: "Demonstrate impact and novelty",
        aiGuidance: "Articulate broader implications"
      },
      {
        key: "methods",
        title: "Methodology",
        wordCount: { min: 1000, max: 2000 },
        required: true,
        description: "How research will be conducted",
        guidelines: "Detailed, feasible research plan",
        aiGuidance: "Ensure methodological soundness"
      },
      {
        key: "timeline",
        title: "Timeline & Resources",
        wordCount: { min: 500, max: 1000 },
        required: true,
        description: "Project schedule and budget",
        guidelines: "Realistic timelines and resource allocation",
        aiGuidance: "Create feasible project schedule"
      }
    ],
    qualityGates: [],
    guidanceByPhase: {
      A: "Define research vision and goals",
      B: "Ground in literature and prior work",
      C: "Identify data sources and resources needed",
      D: "Understand funder priorities and requirements",
      E: "Follow funder formatting guidelines",
      F: "Draft proposal sections with compelling language",
      G: "Peer review for clarity and impact",
      H: "Finalize submission materials",
      I: "Submit to funding agency"
    },
    citations: { style: "APA", minCount: 15 },
    format: {
      margins: "1 inch",
      lineSpacing: 1.5,
      fontSize: 11,
      fontFamily: "Calibri"
    }
  },

  "lab-report": {
    id: "lab-report",
    label: "Lab Report",
    description: "Experimental lab report with structured findings",
    wordCountTarget: { min: 2000, max: 5000 },
    sections: [
      {
        key: "objective",
        title: "Objective",
        required: true,
        description: "What the experiment aimed to determine",
        guidelines: "Clear statement of experimental purpose",
        aiGuidance: "State hypothesis clearly"
      },
      {
        key: "materials-methods",
        title: "Materials & Methods",
        required: true,
        description: "Equipment, materials, procedures",
        guidelines: "Enable reproduction of experiment",
        aiGuidance: "Document methods precisely"
      },
      {
        key: "results",
        title: "Results",
        required: true,
        description: "Experimental observations and data",
        guidelines: "Present data objectively",
        aiGuidance: "Organize results clearly"
      },
      {
        key: "discussion",
        title: "Discussion",
        required: true,
        description: "Analysis and interpretation",
        guidelines: "Connect results to objectives",
        aiGuidance: "Explain implications of findings"
      },
      {
        key: "conclusion",
        title: "Conclusion",
        required: true,
        description: "Summary of findings",
        guidelines: "Concise summary and next steps",
        aiGuidance: "Synthesize key findings"
      }
    ],
    qualityGates: [],
    guidanceByPhase: {
      A: "Establish experiment objectives",
      B: "Review relevant theory and prior work",
      C: "Identify experimental materials and methods",
      D: "Plan lab procedures",
      E: "Follow lab report format standards",
      F: "Draft report sections from lab notes",
      G: "Verify accuracy and completeness",
      H: "Prepare final report",
      I: "Submit to instructor"
    },
    citations: { style: "IEEE", minCount: 5 },
    format: {
      margins: "1 inch",
      lineSpacing: 1.5,
      fontSize: 12
    }
  },

  "case-study": {
    id: "case-study",
    label: "Case Study",
    description: "In-depth analysis of specific case, organization, or phenomenon",
    wordCountTarget: { min: 5000, max: 15000 },
    sections: [
      {
        key: "introduction",
        title: "Introduction",
        required: true,
        description: "Background and context",
        guidelines: "Introduce case and research questions",
        aiGuidance: "Set up compelling case narrative"
      },
      {
        key: "case-description",
        title: "Case Description",
        required: true,
        description: "Detailed description of the case",
        guidelines: "Provide comprehensive background",
        aiGuidance: "Narrate case chronology clearly"
      },
      {
        key: "analysis",
        title: "Analysis",
        required: true,
        description: "In-depth analysis and interpretation",
        guidelines: "Apply theoretical frameworks",
        aiGuidance: "Connect case to broader concepts"
      },
      {
        key: "findings",
        title: "Key Findings",
        required: true,
        description: "Insights and conclusions from case",
        guidelines: "Articulate key takeaways",
        aiGuidance: "Synthesize learnings"
      },
      {
        key: "implications",
        title: "Implications",
        required: true,
        description: "Broader implications and applications",
        guidelines: "Discuss relevance beyond single case",
        aiGuidance: "Explore practical applications"
      }
    ],
    qualityGates: [],
    guidanceByPhase: {
      A: "Select compelling case",
      B: "Research case background and context",
      C: "Gather case data and sources",
      D: "Identify relevant publication outlets",
      E: "Follow case study writing conventions",
      F: "Draft case analysis with context",
      G: "Verify accuracy and completeness",
      H: "Prepare final manuscript",
      I: "Submit for publication"
    },
    citations: { style: "APA", minCount: 20 },
    format: {
      margins: "1 inch",
      lineSpacing: 1.5,
      fontSize: 12,
      fontFamily: "Times New Roman"
    }
  },

  "literature-review": {
    id: "literature-review",
    label: "Literature Review",
    description: "Comprehensive synthesis of research in a topic area",
    wordCountTarget: { min: 5000, max: 20000 },
    sections: [
      {
        key: "introduction",
        title: "Introduction",
        required: true,
        description: "Topic overview and scope",
        guidelines: "Define scope and research questions",
        aiGuidance: "Frame literature review context"
      },
      {
        key: "thematic-sections",
        title: "Thematic Sections",
        required: true,
        description: "Organized by theme or subtopic",
        guidelines: "Group literature thematically",
        aiGuidance: "Synthesize sources by theme"
      },
      {
        key: "trends-gaps",
        title: "Trends & Research Gaps",
        required: true,
        description: "Identify patterns and missing areas",
        guidelines: "Highlight gaps in literature",
        aiGuidance: "Synthesize research directions"
      },
      {
        key: "conclusions",
        title: "Conclusions & Future Directions",
        required: true,
        description: "Summary and recommendations",
        guidelines: "Synthesize overall findings",
        aiGuidance: "Suggest future research directions"
      }
    ],
    qualityGates: [],
    guidanceByPhase: {
      A: "Define literature review scope",
      B: "Identify key authors and seminal works",
      C: "Search for and gather sources",
      D: "Organize sources by theme",
      E: "Follow literature review format",
      F: "Draft thematic sections",
      G: "Verify coverage and accuracy",
      H: "Prepare final review",
      I: "Publish or archive review"
    },
    citations: { style: "APA", minCount: 50 },
    format: {
      margins: "1 inch",
      lineSpacing: 1.5,
      fontSize: 12
    }
  },

  "conference-paper": {
    id: "conference-paper",
    label: "Conference Paper",
    description: "Paper for conference presentation and proceedings",
    wordCountTarget: { min: 4000, max: 8000 },
    sections: [
      {
        key: "abstract",
        title: "Abstract",
        required: true,
        description: "100-150 word abstract",
        guidelines: "Compelling summary for conference selection",
        aiGuidance: "Make abstract stand out"
      },
      {
        key: "introduction",
        title: "Introduction",
        required: true,
        description: "Problem and motivation",
        guidelines: "Engage audience immediately",
        aiGuidance: "Hook with compelling opening"
      },
      {
        key: "contribution",
        title: "Key Contribution",
        required: true,
        description: "Novel aspect of research",
        guidelines: "Highlight what's new",
        aiGuidance: "Emphasize innovation"
      },
      {
        key: "findings",
        title: "Findings & Results",
        required: true,
        description: "Key results",
        guidelines: "Focus on most important findings",
        aiGuidance: "Highlight key insights"
      },
      {
        key: "discussion",
        title: "Discussion",
        required: true,
        description: "Implications and impact",
        guidelines: "Connect to field concerns",
        aiGuidance: "Explain broader significance"
      }
    ],
    qualityGates: [],
    guidanceByPhase: {
      A: "Select conference and topic",
      B: "Research conference priorities",
      C: "Gather relevant sources",
      D: "Identify conference focus areas",
      E: "Follow conference paper guidelines",
      F: "Draft paper for presentation",
      G: "Review for conference fit",
      H: "Prepare presentation materials",
      I: "Submit to conference"
    },
    citations: { style: "IEEE", minCount: 15 },
    format: {
      margins: "0.75 inch",
      lineSpacing: 1,
      fontSize: 10
    }
  },

  "white-paper": {
    id: "white-paper",
    label: "White Paper",
    description: "Technical document explaining policy or proposed solution",
    wordCountTarget: { min: 3000, max: 10000 },
    sections: [
      {
        key: "executive-summary",
        title: "Executive Summary",
        required: true,
        description: "Quick overview for decision makers",
        guidelines: "Compelling, actionable summary",
        aiGuidance: "Communicate key value clearly"
      },
      {
        key: "problem-statement",
        title: "Problem Statement",
        required: true,
        description: "Clear articulation of problem",
        guidelines: "Define problem and scope",
        aiGuidance: "Make problem compelling"
      },
      {
        key: "proposed-solution",
        title: "Proposed Solution",
        required: true,
        description: "Detailed solution approach",
        guidelines: "Explain solution clearly",
        aiGuidance: "Address objections preemptively"
      },
      {
        key: "implementation",
        title: "Implementation & Benefits",
        required: true,
        description: "How to implement and expected benefits",
        guidelines: "Provide actionable recommendations",
        aiGuidance: "Quantify benefits where possible"
      },
      {
        key: "conclusion",
        title: "Conclusion & Call to Action",
        required: true,
        description: "Summary and next steps",
        guidelines: "Clear call to action",
        aiGuidance: "Motivate action"
      }
    ],
    qualityGates: [],
    guidanceByPhase: {
      A: "Define policy or solution topic",
      B: "Research background and context",
      C: "Identify relevant data and evidence",
      D: "Understand audience needs",
      E: "Follow white paper style guide",
      F: "Draft persuasive sections",
      G: "Verify accuracy and impact",
      H: "Prepare distribution version",
      I: "Publish and distribute"
    },
    citations: { style: "APA", minCount: 10 },
    format: {
      margins: "1 inch",
      lineSpacing: 1.5,
      fontSize: 11
    }
  },

  "book-chapter": {
    id: "book-chapter",
    label: "Book Chapter",
    description: "Chapter contribution to edited academic book",
    wordCountTarget: { min: 8000, max: 20000 },
    sections: [
      {
        key: "introduction",
        title: "Introduction",
        required: true,
        description: "Chapter overview and context",
        guidelines: "Set up chapter topic and contribution",
        aiGuidance: "Connect to book theme"
      },
      {
        key: "literature",
        title: "Literature & Background",
        required: true,
        description: "Relevant background and context",
        guidelines: "Establish foundation for chapter",
        aiGuidance: "Synthesize relevant research"
      },
      {
        key: "main-content",
        title: "Main Content",
        required: true,
        description: "Chapter's substantive contribution",
        guidelines: "Develop key ideas thoroughly",
        aiGuidance: "Organize ideas logically"
      },
      {
        key: "analysis",
        title: "Analysis & Discussion",
        required: true,
        description: "Critical analysis and implications",
        guidelines: "Provide depth and insight",
        aiGuidance: "Connect to broader themes"
      },
      {
        key: "conclusion",
        title: "Conclusion",
        required: true,
        description: "Chapter summary and implications",
        guidelines: "Synthesize chapter points",
        aiGuidance: "Connect to book narrative"
      }
    ],
    qualityGates: [],
    guidanceByPhase: {
      A: "Define chapter topic and scope",
      B: "Research chapter subject thoroughly",
      C: "Gather sources and materials",
      D: "Understand book's overall narrative",
      E: "Follow editor's chapter guidelines",
      F: "Draft chapter sections",
      G: "Verify fit with book theme",
      H: "Prepare final chapter",
      I: "Submit to editor"
    },
    citations: { style: "Chicago", minCount: 30 },
    format: {
      margins: "1 inch",
      lineSpacing: 1.5,
      fontSize: 12,
      fontFamily: "Times New Roman"
    }
  },

  "grant-proposal": {
    id: "grant-proposal",
    label: "Grant Proposal",
    description: "Detailed proposal to fund research project",
    wordCountTarget: { min: 5000, max: 15000 },
    sections: [
      {
        key: "executive-summary",
        title: "Executive Summary",
        required: true,
        description: "Compelling 1-2 page overview",
        guidelines: "Hook reviewers immediately",
        aiGuidance: "Lead with strongest points"
      },
      {
        key: "specific-aims",
        title: "Specific Aims",
        required: true,
        description: "Clear, measurable research objectives",
        guidelines: "Specific, achievable, realistic goals",
        aiGuidance: "Make aims concrete and testable"
      },
      {
        key: "research-strategy",
        title: "Research Strategy",
        required: true,
        description: "Detailed methodology",
        guidelines: "Comprehensive, feasible research plan",
        aiGuidance: "Ensure methodological rigor"
      },
      {
        key: "significance",
        title: "Significance",
        required: true,
        description: "Impact and innovation",
        guidelines: "Demonstrate importance to field",
        aiGuidance: "Articulate broader implications"
      },
      {
        key: "budget-narrative",
        title: "Budget & Justification",
        required: true,
        description: "Budget explanation and justification",
        guidelines: "Realistic and well-justified budget",
        aiGuidance: "Justify each line item"
      }
    ],
    qualityGates: [],
    guidanceByPhase: {
      A: "Identify funding opportunities and priorities",
      B: "Research funder expectations",
      C: "Identify relevant data and resources",
      D: "Match funder program areas",
      E: "Follow funder's formatting requirements",
      F: "Draft compelling proposal narrative",
      G: "Peer review for impact and quality",
      H: "Finalize budget and materials",
      I: "Submit to funding agency"
    },
    citations: { style: "APA", minCount: 25 },
    format: {
      margins: "1 inch",
      lineSpacing: 1.5,
      fontSize: 11,
      fontFamily: "Calibri"
    }
  }
};

// Helper functions
export function getDocumentType(id: DocumentType): DocumentTypeMetadata | null {
  return DOCUMENT_TYPES[id] || null;
}

export function getAllDocumentTypes(): DocumentTypeMetadata[] {
  return Object.values(DOCUMENT_TYPES);
}

export function isValidDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && value in DOCUMENT_TYPES;
}
