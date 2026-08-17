import type { ResearchStage } from "../types";
import { RESEARCH_STAGES } from "../types";

/**
 * PlaceholderStage — temporary component for research stages that haven't
 * been fully implemented yet (Literature through Final).
 *
 * Shows the stage name, description, and what will be built in future phases.
 * This ensures the full navigation works immediately while features are
 * delivered incrementally.
 */
export default function PlaceholderStage({ stage }: { stage: ResearchStage }) {
  const def = RESEARCH_STAGES.find((s) => s.id === stage);
  if (!def) return null;

  const phaseInfo = STAGE_PHASES[stage];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-16 text-center animate-fade-in">
        {/* Stage icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center">
          <svg className="w-10 h-10 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
          </svg>
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)] mb-2">
          {def.label}
        </h2>
        <p className="text-base text-[color:var(--text-secondary)] mb-8 max-w-md mx-auto leading-relaxed">
          {def.description}
        </p>

        {/* Phase info */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[color:var(--state-info)]/20 bg-[color:var(--state-info-subtle)] text-sm font-medium text-[color:var(--state-info)]">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Planned for {phaseInfo.phase}
        </div>

        {/* Upcoming features */}
        <div className="mt-10 text-left max-w-lg mx-auto">
          <h3 className="text-sm font-bold text-[color:var(--text-primary)] mb-4 uppercase tracking-wider">
            What's Coming
          </h3>
          <ul className="space-y-3">
            {phaseInfo.features.map((feature, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-[color:var(--text-secondary)]">
                <div className="w-5 h-5 mt-0.5 shrink-0 rounded-full bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[color:var(--text-muted)]">{i + 1}</span>
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const STAGE_PHASES: Record<ResearchStage, { phase: string; features: string[] }> = {
  definition: { phase: "Phase 1", features: [] },
  literature: {
    phase: "Phase 2",
    features: [
      "AI-powered scholarly literature search (Google Scholar, arXiv, OpenAlex)",
      "Source discovery with authority scoring",
      "Major author and theory identification",
      "Source approval queue with ✓ Approve / ✕ Reject controls",
    ],
  },
  gap: {
    phase: "Phase 2",
    features: [
      "Structured research gap identification (knowledge, empirical, theoretical, etc.)",
      "Gap confidence scoring with supporting evidence",
      "Interactive gap selection and research question refinement",
      "AI-generated title options based on selected gap",
    ],
  },
  evidence: {
    phase: "Phase 3",
    features: [
      "Knowledge Vault integration for existing sources",
      "Universal file ingestion (PDF, Word, Excel, URLs, YouTube)",
      "AI evidence extraction with exact provenance tracking",
      "Batch approval interface with filtering and selection",
    ],
  },
  analysis: {
    phase: "Phase 3",
    features: [
      "Evidence Matrix builder with thematic clustering",
      "Contradiction detection and resolution",
      "AI Research Analysis Chat for deep exploration",
      "Manual annotation and researcher conclusions",
    ],
  },
  journal: {
    phase: "Phase 3",
    features: [
      "AI Journal Discovery Agent with transparent scoring",
      "Journal comparison by scope, metrics, and requirements",
      "Automated author guideline extraction",
      "Editable journal requirement workspace",
    ],
  },
  draft: {
    phase: "Phase 4",
    features: [
      "Section-by-section manuscript generation with evidence citation",
      "Real-time citation integrity verification",
      "Writing quality engine for academic tone and clarity",
      "Coherence analysis across sections",
    ],
  },
  review: {
    phase: "Phase 4",
    features: [
      "7-lens AI peer review (contribution, literature, methodology, evidence, argument, citation, journal fit)",
      "Severity-rated findings with specific locations",
      "Round-based review history",
      "Review comparison across rounds",
    ],
  },
  revision: {
    phase: "Phase 4",
    features: [
      "Reviewer comment → manuscript location mapping",
      "AI-suggested revisions with accept/reject/modify controls",
      "Side-by-side diff with previous versions",
      "Version history preservation",
    ],
  },
  final: {
    phase: "Phase 5",
    features: [
      "Full document editor with page view and tracked changes",
      "Publication readiness gate (research integrity, citations, originality, compliance)",
      "Plagiarism and text-overlap analysis",
      "Word (.docx) and PDF export with journal formatting",
    ],
  },
};
