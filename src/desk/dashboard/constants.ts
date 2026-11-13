/** Curated 4 essential academic formats */
export const FORMAT_TILES = [
  {
    id: "OT-01",
    label: "Coursework & Essays",
    title: "Coursework & Essays",
    guidance: "Guides you through thesis formulation, marking rubric alignment, critical argument synthesis, and citation formatting.",
    specs: "Structured Outline · Rubric Matched · 800 – 4,000 words",
    footer: "Structured Outline · Rubric Matched · 800 – 4,000 words",
    usp: "Marking Rubric Alignment · Argument Synthesis",
    features: "Structured Outline · Rubric Matched · 800 – 4,000 words",
    budget: "Structured Outline · Rubric Matched · 800 – 4,000 words",
  },
  {
    id: "OT-10",
    label: "Journal Article",
    title: "Journal Article",
    guidance: "Structures formal IMRaD manuscripts with deep literature synthesis, methodology validation, and peer-review readiness.",
    specs: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
    footer: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
    usp: "Peer-Review Standard · IMRaD Methodology",
    features: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
    budget: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
  },
  {
    id: "OT-15",
    label: "Research Proposal",
    title: "Research Proposal",
    guidance: "Guides research question definition, literature gap identification, theoretical frameworks, and methodology design.",
    specs: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
    footer: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
    usp: "Literature Gap Analysis · Ethical Frameworks",
    features: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
    budget: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
  },
  {
    id: "OT-22",
    label: "Slides & Keynotes",
    title: "Slides & Keynotes",
    guidance: "Converts academic papers into visual presentation slides with scripted speaker notes and executive takeaways.",
    specs: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
    footer: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
    usp: "Speaker Notes Scripting · Visual Layouts",
    features: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
    budget: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
  },
];

export const STAGE_BREAKDOWNS: Record<string, { phases: string[]; highlights: string }> = {
  "OT-01": {
    highlights: "Rigorous coursework workflow with syllabus alignment and citation provenance audit.",
    phases: [
      "Phase I: Assignment Scope & Rubric Analysis",
      "Phase II: Knowledge Vault Evidence Ingestion",
      "Phase III: Grounded Multi-Section Drafting",
      "Phase IV: Citation Auditor & Defense Script",
    ],
  },
  "OT-10": {
    highlights: "Full 25-stage peer-reviewed pipeline for high-impact journal submissions.",
    phases: [
      "Phase I (Stages 1–6): Domain Mapping & Gap Lock",
      "Phase II (Stages 7–14): Evidentiary Matrix & Vault Audit",
      "Phase III (Stages 15–18): Peer-Reviewed Agentic Drafting",
      "Phase IV (Stages 19–21): Academic Voice & Guideline Fit",
      "Phase V (Stages 22–25): LaTeX/PDF Export & Sign-Off",
    ],
  },
  "OT-15": {
    highlights: "Competitive grant and doctoral funding proposal generation pipeline.",
    phases: [
      "Phase I: Specific Aims & Novelty Justification",
      "Phase II: Methodological Feasibility & Data Plan",
      "Phase III: Milestone Timelines & Budget Defense",
    ],
  },
  "OT-22": {
    highlights: "Keynote presentation and conference defense slide deck architecture.",
    phases: [
      "Phase I: Core Thesis & Narrative Arc",
      "Phase II: Slide Progression & Evidence Visuals",
      "Phase III: Speaker Notes & Anticipated Defense Q&A",
    ],
  },
};

export const WEBSITE_ASSISTANT_FAQS = [
  {
    question: "How do I set up AI?",
    shortLabel: "How do I set up AI?",
  },
  {
    question: "What is Knowledge Vault?",
    shortLabel: "What is Knowledge Vault?",
  },
  {
    question: "How do I create a research project?",
    shortLabel: "How do I create a research project?",
  },
  {
    question: "What is the Evidence phase?",
    shortLabel: "What is the Evidence phase?",
  },
  {
    question: "How do I add sources?",
    shortLabel: "How do I add sources?",
  },
  {
    question: "Where can I find my projects?",
    shortLabel: "Where can I find my projects?",
  },
  {
    question: "How does the Journal Article workflow work?",
    shortLabel: "Journal Article workflow?",
  },
  {
    question: "What is Scholar AI Engine?",
    shortLabel: "What is Scholar AI Engine?",
  },
  {
    question: "How do I configure an AI provider?",
    shortLabel: "Configure AI provider?",
  },
];

export function getFormatTileTheme(id: string) {
  switch (id) {
    case "OT-01":
      return {
        badgeBg: "bg-blue-50/90 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20",
        accentText: "text-blue-600 dark:text-blue-400",
        hoverBorder: "hover:border-blue-300 dark:hover:border-blue-500/40",
      };
    case "OT-10":
      return {
        badgeBg: "bg-slate-100/90 text-slate-700 dark:bg-white/10 dark:text-slate-300 border border-slate-200/80 dark:border-white/10",
        accentText: "text-slate-700 dark:text-slate-300",
        hoverBorder: "hover:border-slate-300 dark:hover:border-white/25",
      };
    case "OT-15":
      return {
        badgeBg: "bg-indigo-50/90 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400/90 border border-indigo-100 dark:border-indigo-500/20",
        accentText: "text-indigo-600 dark:text-indigo-400/90",
        hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-500/40",
      };
    case "OT-22":
      return {
        badgeBg: "bg-teal-50/90 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300/90 border border-teal-100 dark:border-teal-500/20",
        accentText: "text-teal-600 dark:text-teal-300/90",
        hoverBorder: "hover:border-teal-300 dark:hover:border-teal-500/40",
      };
    default:
      return {
        badgeBg: "bg-slate-50 dark:bg-neutral-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/5",
        accentText: "text-slate-500 dark:text-neutral-400",
        hoverBorder: "hover:border-slate-300 dark:hover:border-neutral-700",
      };
  }
}
