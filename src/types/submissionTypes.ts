/**
 * Submission Pack & Tracking Types
 *
 * Phase H (Submission Pack Suite): Cover letters, checklists, compliance
 * Phase I (Submission Support): Tracking, responses, portal management
 */

export type SubmissionStatus = "draft" | "submitted" | "under_review" | "minor_revisions" | "major_revisions" | "accepted" | "rejected" | "desk_rejected";

export interface SubmissionRecord {
  id: string;
  journalName: string;
  journalUrl?: string;
  submissionDate: string;
  status: SubmissionStatus;
  submissionId?: string; // Journal's submission ID if provided
  statusUpdatedAt: string;
  notes?: string;
  tags?: string[];
}

export interface ReviewerComment {
  id: string;
  reviewer: string;
  date: string;
  section?: string; // Which section the comment relates to
  comment: string;
  severity: "minor" | "major";
}

export interface ResponseDraft {
  id: string;
  journalName: string;
  submissionId?: string;
  createdAt: string;
  updatedAt: string;
  overallResponse: string; // Cover letter for response
  responses: {
    reviewerIndex: number;
    reviewer: string;
    pointByPointResponse: string;
  }[];
  status: "draft" | "ready_for_submission" | "submitted";
}

export interface CoverLetterTemplate {
  id: string;
  name: string;
  description: string;
  structure: {
    opening: string;
    researchSignificance: string;
    noveltyStatement: string;
    alignment: string;
    declarations: string;
    closing: string;
  };
  placeholders: Record<string, string>; // Key-value of placeholder -> example
}

export interface SubmissionChecklist {
  id: string;
  section: "formatting" | "content" | "ethical" | "compliance" | "technical";
  item: string;
  required: boolean;
  completed: boolean;
  notes?: string;
}

export interface SubmissionQualityGate {
  id: string;
  name: string;
  description: string;
  check: (project: any) => boolean; // Returns true if gate passes
  message: string;
  severity: "warning" | "error";
}

// Template library for different manuscript types and submission stages
export const COVER_LETTER_TEMPLATES: Record<string, CoverLetterTemplate> = {
  initial_submission: {
    id: "initial_submission",
    name: "Initial Journal Submission",
    description: "Standard cover letter for new manuscript submission",
    structure: {
      opening: "Dear Editor-in-Chief,",
      researchSignificance: "This study addresses [RESEARCH_GAP] through [METHODOLOGY], contributing novel insights to [FIELD].",
      noveltyStatement: "To our knowledge, this is the first work to [NOVELTY_CLAIM], filling an important gap in the literature.",
      alignment: "This manuscript aligns with [JOURNAL_NAME]'s scope in [SCOPE_AREAS] and meets all submission requirements.",
      declarations: "We declare this is original work, not published elsewhere, and no conflicts of interest exist.",
      closing: "We thank you for considering our manuscript and welcome your feedback."
    },
    placeholders: {
      RESEARCH_GAP: "specific research gap being addressed",
      METHODOLOGY: "research methodology used",
      FIELD: "academic field",
      NOVELTY_CLAIM: "specific innovation or first finding",
      JOURNAL_NAME: "target journal name",
      SCOPE_AREAS: "journal scope areas"
    }
  },

  revision_submission: {
    id: "revision_submission",
    name: "Resubmission After Revisions",
    description: "Cover letter for revised manuscript resubmission",
    structure: {
      opening: "Dear Editor-in-Chief,",
      researchSignificance: "We thank the reviewers for their constructive feedback on our manuscript [TITLE].",
      noveltyStatement: "Following the recommendations, we have substantially strengthened the manuscript by [REVISIONS_SUMMARY].",
      alignment: "[POINT_BY_POINT_REFERENCE] Our detailed response to each reviewer comment is included in the attached document.",
      declarations: "We confirm all revisions have been made transparently and are highlighted in the revised manuscript.",
      closing: "We believe these revisions significantly improve the manuscript and hope it now meets your publication standards."
    },
    placeholders: {
      TITLE: "manuscript title",
      REVISIONS_SUMMARY: "summary of major revisions made",
      POINT_BY_POINT_REFERENCE: "reference to point-by-point response"
    }
  }
};

// Quality gates for submission readiness
export const SUBMISSION_QUALITY_GATES: SubmissionQualityGate[] = [
  {
    id: "manuscript_complete",
    name: "Manuscript Complete",
    description: "All major sections drafted and reviewed",
    check: (project) => Object.keys(project.sections || {}).length >= 5,
    message: "Ensure all manuscript sections are complete before submission",
    severity: "error"
  },
  {
    id: "title_present",
    name: "Title Present",
    description: "Manuscript has a clear, descriptive title",
    check: (project) => !!project.title && project.title.length >= 10,
    message: "Provide a clear, descriptive manuscript title (min 10 characters)",
    severity: "error"
  },
  {
    id: "abstract_present",
    name: "Abstract Present",
    description: "Abstract section is complete",
    check: (project) => !!project.sections?.["Abstract"] && project.sections["Abstract"].length >= 100,
    message: "Include a comprehensive abstract (min 100 characters)",
    severity: "error"
  },
  {
    id: "references_adequate",
    name: "Adequate References",
    description: "Sufficient references cited",
    check: (project) => {
      const targetCount = project.targetReferenceCount || 30;
      const dataSourceCount = project.dataSources?.filter(s => s.status === "approved").length || 0;
      return dataSourceCount >= Math.max(10, Math.round(targetCount * 0.5));
    },
    message: "Ensure adequate peer-reviewed references are cited (min 10-15)",
    severity: "warning"
  },
  {
    id: "compliance_checked",
    name: "Compliance Checked",
    description: "Journal requirements have been reviewed",
    check: (project) => !!project.complianceRules,
    message: "Review target journal's submission requirements and formatting guidelines",
    severity: "error"
  },
  {
    id: "ethical_statements",
    name: "Ethical Disclosures",
    description: "Ethical statements and funding disclosures included",
    check: (project) =>
      project.sections?.["Ethical Declaration"] ||
      project.sections?.["Funding"]?.toLowerCase().includes("no funding"),
    message: "Include ethical declaration and funding/conflict of interest statements",
    severity: "warning"
  },
  {
    id: "author_details",
    name: "Author Information",
    description: "Author contact and affiliation details present",
    check: (project) => !!project.authorName && !!project.authorEmail && !!project.authorAffiliation,
    message: "Provide complete author name, email, and institutional affiliation",
    severity: "error"
  }
];

// Submission checklist templates by manuscript type
export const SUBMISSION_CHECKLISTS: Record<string, SubmissionChecklist[]> = {
  formatting: [
    {
      id: "fmt_1",
      section: "formatting",
      item: "Margins: 1-1.5 inches on all sides",
      required: true,
      completed: false
    },
    {
      id: "fmt_2",
      section: "formatting",
      item: "Font: Standard 11-12pt (Times New Roman or Arial)",
      required: true,
      completed: false
    },
    {
      id: "fmt_3",
      section: "formatting",
      item: "Line spacing: Double-spaced throughout",
      required: true,
      completed: false
    },
    {
      id: "fmt_4",
      section: "formatting",
      item: "Page numbers: Continuous numbering in header/footer",
      required: true,
      completed: false
    }
  ],

  content: [
    {
      id: "cnt_1",
      section: "content",
      item: "Title page includes title, authors, affiliations, and contact info",
      required: true,
      completed: false
    },
    {
      id: "cnt_2",
      section: "content",
      item: "Abstract is within word limit (typically 150-300 words)",
      required: true,
      completed: false
    },
    {
      id: "cnt_3",
      section: "content",
      item: "Keywords provided (3-6 terms)",
      required: true,
      completed: false
    },
    {
      id: "cnt_4",
      section: "content",
      item: "All figures and tables have captions and citations",
      required: true,
      completed: false
    }
  ],

  ethical: [
    {
      id: "eth_1",
      section: "ethical",
      item: "Conflict of interest statement included",
      required: true,
      completed: false
    },
    {
      id: "eth_2",
      section: "ethical",
      item: "Funding sources disclosed",
      required: true,
      completed: false
    },
    {
      id: "eth_3",
      section: "ethical",
      item: "IRB approval documented (if applicable)",
      required: false,
      completed: false
    },
    {
      id: "eth_4",
      section: "ethical",
      item: "Data availability statement included",
      required: false,
      completed: false
    }
  ],

  compliance: [
    {
      id: "cmp_1",
      section: "compliance",
      item: "Citation style matches journal requirements",
      required: true,
      completed: false
    },
    {
      id: "cmp_2",
      section: "compliance",
      item: "Manuscript not under review elsewhere",
      required: true,
      completed: false
    },
    {
      id: "cmp_3",
      section: "compliance",
      item: "All co-authors approved the submission",
      required: true,
      completed: false
    },
    {
      id: "cmp_4",
      section: "compliance",
      item: "Manuscript is original and not previously published",
      required: true,
      completed: false
    }
  ]
};
