import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import ScholarCoreLogo from "../components/ScholarCoreLogo";
import EmbeddedAuthModal from "./auth/EmbeddedAuthModal";

interface ScholarCoreLandingProps {
  onGetStarted?: () => void;
  onSignIn?: () => void;
}

interface CitationInfo {
  id: number;
  label: string;
  source: string;
  year: number;
  journal: string;
  quote: string;
  page: string;
  confidence: string;
  badgeColor: string;
}

// Clean Monochrome SVG Icons for Academic Formats & Verification
function AssignmentIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function JournalIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function ThesisIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
    </svg>
  );
}

function ProposalIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function PresentationIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  );
}

function ShieldLockIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function CheckBadgeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CloudServerIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  );
}

function SearchAuditIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
    </svg>
  );
}

const SAMPLE_CITATIONS: Record<number, CitationInfo> = {
  1: {
    id: 1,
    label: "[1]",
    source: "High-efficiency in vivo base editing in primate models",
    year: 2024,
    journal: "Nature Biotechnology, 42(3), 312-324",
    quote: "Observed a 4.2-fold reduction in double-strand break translocations compared to standard SpCas9 nuclease controls (p < 0.001) across all targeted loci.",
    page: "Page 14, Paragraph 3",
    confidence: "99.4% Provenance Match",
    badgeColor: "text-[color:var(--state-success)] bg-[color:var(--state-success-subtle)] border-[color:var(--state-success)]",
  },
  2: {
    id: 2,
    label: "[2]",
    source: "Epigenetic durability of prime editing in human hematopoietic stem cells",
    year: 2023,
    journal: "Cell Stem Cell, 30(8), 1042-1055",
    quote: "Long-term engraftment in xenograft models demonstrated sustained target allele conversion without detectable off-target chromosomal rearrangements.",
    page: "Page 8, Figure 4B",
    confidence: "98.8% Provenance Match",
    badgeColor: "text-[color:var(--state-info)] bg-[color:var(--state-info-subtle)] border-[color:var(--state-info)]",
  },
};

const WORKSPACES = [
  {
    id: "OT-01",
    label: "Assignment",
    icon: AssignmentIcon,
    words: "800 – 4k words",
    description: "Coursework essays, reflections, and case studies.",
    pipeline: "Evidence Board → Synthesis → 10-Point Audit",
  },
  {
    id: "OT-10",
    label: "Journal Article",
    icon: JournalIcon,
    words: "4k – 10k words",
    description: "Empirical papers with structured peer review pipelines.",
    pipeline: "Lit Matrix → Gap Analysis → IMRaD Drafting",
  },
  {
    id: "OT-09",
    label: "Thesis / Dissertation",
    icon: ThesisIcon,
    words: "10k – 80k words",
    description: "Multi-chapter milestones with viva defense preparation.",
    pipeline: "Theory Framing → Findings → Viva Prep",
  },
  {
    id: "OT-19",
    label: "Research Proposal",
    icon: ProposalIcon,
    words: "3k – 15k words",
    description: "Grant applications with funding rubric alignment.",
    pipeline: "Specific Aims → Methodology → Ethics",
  },
  {
    id: "OT-22",
    label: "Presentation",
    icon: PresentationIcon,
    words: "10 – 35 slides",
    description: "Conference slide decks and defense speaking scripts.",
    pipeline: "Slide Canvas → Narrative Arc → Defense Q&A",
  },
];

export default function ScholarCoreLanding({
  onGetStarted,
  onSignIn,
}: ScholarCoreLandingProps) {
  const [searchParams] = useSearchParams();
  const [scrolled, setScrolled] = useState(false);
  const [activeCitation, setActiveCitation] = useState<number | null>(1);
  const [activeDemoTab, setActiveDemoTab] = useState<"provenance" | "matrix" | "audit">("provenance");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Embedded Auth Modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup" | "switch">("signin");
  const [selectedFormatId, setSelectedFormatId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Check URL query parameters for auto auth opening
  useEffect(() => {
    const authQuery = searchParams.get("auth");
    if (authQuery === "signin" || authQuery === "signup" || authQuery === "switch") {
      setAuthModalMode(authQuery);
      setAuthModalOpen(true);
    }
  }, [searchParams]);

  function openAuth(mode: "signin" | "signup" | "switch", formatId?: string) {
    if (onSignIn && mode === "signin") {
      onSignIn();
      return;
    }
    if (onGetStarted && mode === "signup") {
      onGetStarted();
      return;
    }
    setAuthModalMode(mode);
    setSelectedFormatId(formatId);
    setAuthModalOpen(true);
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-sans antialiased selection:bg-[color:var(--accent-subtle)] relative overflow-x-hidden">
      {/* Subtle, precise technical grid background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--border-subtle)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35 pointer-events-none -z-10" />

      {/* Clean Modern Navigation Bar */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-200 ${
          scrolled
            ? "bg-[color:var(--surface-canvas)]/90 backdrop-blur-md border-b border-[color:var(--border-subtle)] shadow-xs py-3"
            : "bg-transparent py-4 sm:py-5"
        }`}
      >
        <div className="mx-auto max-w-5xl px-6 flex items-center justify-between">
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none group"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="w-7 h-7 rounded-lg bg-[color:var(--accent)] text-white flex items-center justify-center transition-transform group-hover:scale-105">
              <ScholarCoreLogo size="sm" className="text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-[color:var(--text-primary)]">
              Scholar Core
            </span>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-[color:var(--text-secondary)]">
            <a href="#workspaces" className="hover:text-[color:var(--text-primary)] transition-colors">
              Workspaces
            </a>
            <a href="#provenance" className="hover:text-[color:var(--text-primary)] transition-colors">
              Provenance
            </a>
            <a href="#privacy" className="hover:text-[color:var(--text-primary)] transition-colors">
              Privacy
            </a>
          </nav>

          <div className="hidden sm:flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => openAuth("signin")}
              className="text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[color:var(--accent)] text-white shadow-xs hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer flex items-center gap-1"
            >
              Start Researching
              <span className="text-xs font-bold">→</span>
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1 rounded-md text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[color:var(--surface-raised)] border-b border-[color:var(--border-subtle)] px-6 py-3 flex flex-col gap-2.5 shadow-lg animate-in fade-in duration-150">
            <a
              href="#workspaces"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium py-1 text-[color:var(--text-primary)]"
            >
              Workspaces
            </a>
            <a
              href="#provenance"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium py-1 text-[color:var(--text-primary)]"
            >
              Provenance
            </a>
            <a
              href="#privacy"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium py-1 text-[color:var(--text-primary)]"
            >
              Privacy
            </a>
            <div className="pt-2.5 border-t border-[color:var(--border-subtle)] flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuth("signin");
                }}
                className="flex-1 py-1.5 text-center text-xs font-semibold rounded-lg border border-[color:var(--border-default)]"
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuth("signup");
                }}
                className="flex-1 py-1.5 text-center text-xs font-bold bg-[color:var(--accent)] text-white rounded-lg"
              >
                Start Free
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="pt-24 sm:pt-28 pb-16">
        {/* HERO SECTION — ACADEMIC AUTHORING WORKSTATION */}
        <section className="px-6 max-w-3xl mx-auto flex flex-col items-center text-center pt-4 sm:pt-6 pb-10">
          {/* Release / Architecture Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[11px] font-mono font-medium text-[color:var(--text-secondary)] mb-4 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)]" />
            <span>Scholar Core • Evidence-Gated Authoring OS</span>
          </div>

          {/* Balanced Main Heading */}
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.15] text-[color:var(--text-primary)] mb-3" style={{ textWrap: "balance" }}>
            Research at the Frontier of Academic Rigor.
            <span className="block mt-1 text-[color:var(--accent)]">Structured Thinking. Verifiable Citations.</span>
          </h1>

          {/* Sober, realistic value proposition */}
          <p className="text-sm sm:text-base text-[color:var(--text-secondary)] max-w-xl mx-auto mb-6 leading-relaxed font-normal" style={{ textWrap: "pretty" }}>
            The evidence-gated authoring environment for scholarly manuscripts, doctoral dissertations, and peer-reviewed empirical papers.
          </p>

          {/* Dual Action Buttons */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-[color:var(--accent)] text-white shadow-xs hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Start Researching</span>
              <span className="text-xs font-bold">→</span>
            </button>
            <a
              href="#workspaces"
              className="px-5 py-2.5 rounded-full text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] border border-[color:var(--border-default)] hover:border-[color:var(--border-control)] bg-[color:var(--surface-raised)] transition-all cursor-pointer"
            >
              Explore Workspaces
            </a>
          </div>

          {/* Academic Standards & Toolchain Compatibility Strip */}
          <div className="mt-4 pt-5 border-t border-[color:var(--border-subtle)] w-full max-w-xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-mono text-[color:var(--text-muted)]">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[color:var(--text-secondary)]">Supported:</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)]" />LaTeX & BibTeX</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)]" />Zotero & Mendeley</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)]" />Google Drive & OneDrive</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)]" />Air-Gapped Local LLM</span>
          </div>
        </section>

        {/* 5 DEDICATED ACADEMIC WORKSPACES — TECHNICAL TAXONOMY GRID */}
        <section id="workspaces" className="px-6 py-10 max-w-5xl mx-auto scroll-mt-20">
          <div className="text-center max-w-xl mx-auto mb-6">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--accent)] block mb-1">
              5 DEDICATED ACADEMIC WORKSPACES
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[color:var(--text-primary)]" style={{ textWrap: "balance" }}>
              Structured cognitive pipelines for each academic format
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-1">
              Tailored workflow stages and quality rubrics designed for academic standards.
            </p>
          </div>

          {/* Symmetrical 5-column grid on desktop, nicely centered on tablet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {WORKSPACES.map((ws) => (
              <div
                key={ws.id}
                className="p-3.5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--border-control)] transition-all flex flex-col justify-between group last:sm:col-span-2 last:sm:max-w-xs last:sm:w-full last:sm:mx-auto last:lg:max-w-none last:lg:col-span-1"
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-secondary)] group-hover:text-[color:var(--accent)] group-hover:border-[color:var(--border-control)] transition-colors">
                      <ws.icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]">
                      {ws.id}
                    </span>
                  </div>

                  <h3 className="font-bold text-xs text-[color:var(--text-primary)] group-hover:text-[color:var(--accent)] transition-colors mb-0.5">
                    {ws.label}
                  </h3>
                  <span className="text-[10px] font-mono text-[color:var(--text-muted)] block mb-2">
                    {ws.words}
                  </span>
                  <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed mb-3">
                    {ws.description}
                  </p>

                  <div className="text-[10px] text-[color:var(--text-muted)] pt-2 border-t border-[color:var(--border-subtle)]">
                    <span className="font-semibold text-[color:var(--text-secondary)] block mb-0.5 text-[9px] uppercase tracking-wider">
                      Workflow:
                    </span>
                    <span className="font-mono text-[9px] text-[color:var(--text-muted)] block leading-snug">
                      {ws.pipeline}
                    </span>
                  </div>
                </div>

                <div className="mt-3.5 pt-2.5 border-t border-[color:var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => openAuth("signup", ws.id)}
                    className="w-full py-1.5 px-2 rounded-lg text-[10.5px] font-bold text-[color:var(--text-primary)] bg-[color:var(--surface-inset)] hover:bg-[color:var(--accent)] hover:text-white transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    Initialize {ws.label} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* MULTI-STAGE INTERACTIVE WORKSPACE PREVIEW */}
        <section id="provenance" className="px-6 py-10 max-w-5xl mx-auto scroll-mt-20">
          <div className="text-center max-w-xl mx-auto mb-5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--accent)] block mb-1">
              Live Interactive Workspace
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
              Click any citation to verify provenance
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-1">
              Scholar Core maps assertions directly to verified evidence inside your Knowledge Vault.
            </p>
          </div>

          {/* Interactive Stage Tabs Switcher */}
          <div className="flex items-center justify-center mb-5">
            <div className="inline-flex p-1 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-2xs gap-1">
              <button
                type="button"
                onClick={() => setActiveDemoTab("provenance")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeDemoTab === "provenance"
                    ? "bg-[color:var(--accent)] text-white shadow-2xs"
                    : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <SearchAuditIcon className="w-3.5 h-3.5" />
                <span>1. Provenance Inspector</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDemoTab("matrix")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeDemoTab === "matrix"
                    ? "bg-[color:var(--accent)] text-white shadow-2xs"
                    : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <JournalIcon className="w-3.5 h-3.5" />
                <span>2. Literature Synthesis Matrix</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDemoTab("audit")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeDemoTab === "audit"
                    ? "bg-[color:var(--accent)] text-white shadow-2xs"
                    : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <CheckBadgeIcon className="w-3.5 h-3.5" />
                <span>3. Pre-Submission Audit</span>
              </button>
            </div>
          </div>

          {/* TAB 1: LIVE PROVENANCE INSPECTOR */}
          {activeDemoTab === "provenance" && (
            <div className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-xs overflow-hidden animate-in fade-in duration-150">
              {/* Header bar */}
              <div className="h-9 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/60 flex items-center justify-between px-3.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[color:var(--state-success)]" />
                  <span className="font-mono text-[10px] text-[color:var(--text-muted)]">
                    empirical-article-ot10 / results.tex
                  </span>
                </div>
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  Provenance Gate: 5/5 PASSED
                </span>
              </div>

              {/* Symmetrical Two-Pane Body */}
              <div className="grid md:grid-cols-12">
                {/* Left Column: Manuscript Draft */}
                <div className="md:col-span-7 p-5 border-b md:border-b-0 md:border-r border-[color:var(--border-subtle)] flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] block mb-1.5">
                      Manuscript Draft — Section 3.2: Efficacy Metrics
                    </span>
                    <div className="space-y-2.5 text-xs text-[color:var(--text-primary)] leading-relaxed">
                      <p>
                        High-throughput genomic screening revealed that targeted nucleotide modifications achieved
                        superior fidelity over traditional endonucleases, with significant reduction in unintended cleavage{" "}
                        <button
                          type="button"
                          onClick={() => setActiveCitation(1)}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[11px] transition-all cursor-pointer ${
                            activeCitation === 1
                              ? "bg-[color:var(--accent)] text-white shadow-2xs"
                              : "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-white"
                          }`}
                        >
                          [1] Nature Biotech 2024
                        </button>
                        .
                      </p>
                      <p>
                        Longitudinal assessment confirmed stable heritability in stem cell repopulation models without
                        observable off-target translocations{" "}
                        <button
                          type="button"
                          onClick={() => setActiveCitation(2)}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[11px] transition-all cursor-pointer ${
                            activeCitation === 2
                              ? "bg-[color:var(--state-info)] text-white shadow-2xs"
                              : "bg-[color:var(--state-info-subtle)] text-[color:var(--state-info)] hover:bg-[color:var(--state-info)] hover:text-white"
                          }`}
                        >
                          [2] Cell Stem Cell 2023
                        </button>
                        , establishing clinical viability.
                      </p>
                    </div>
                  </div>

                  <div className="pt-3.5 border-t border-[color:var(--border-subtle)] flex items-center justify-between text-[10px] text-[color:var(--text-muted)]">
                    <span>Citation Resolver: Active</span>
                    <span className="text-[color:var(--accent)] font-medium">Click tags above to inspect proof</span>
                  </div>
                </div>

                {/* Right Column: Knowledge Vault Inspector */}
                <div className="md:col-span-5 p-5 bg-[color:var(--surface-inset)]/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1.5">
                        <SearchAuditIcon className="w-3.5 h-3.5 text-[color:var(--accent)]" />
                        <span>Knowledge Vault Provenance Inspector</span>
                      </span>
                    </div>

                    {activeCitation && SAMPLE_CITATIONS[activeCitation] ? (
                      <div className="space-y-2.5 animate-in fade-in duration-150">
                        <div className="p-3 rounded-lg bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
                          <div className="flex items-start justify-between gap-1.5 mb-1">
                            <span className="font-bold text-xs text-[color:var(--text-primary)] leading-snug">
                              {SAMPLE_CITATIONS[activeCitation].source}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 border ${SAMPLE_CITATIONS[activeCitation].badgeColor}`}>
                              {SAMPLE_CITATIONS[activeCitation].confidence}
                            </span>
                          </div>
                          <p className="text-[10px] text-[color:var(--text-secondary)] mb-2">
                            {SAMPLE_CITATIONS[activeCitation].journal}
                          </p>

                          <div className="p-2 rounded bg-[color:var(--surface-inset)]/60 border-l-2 border-[color:var(--accent)]">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] block mb-0.5">
                              Verbatim Vault Evidence:
                            </span>
                            <p className="text-[11px] italic text-[color:var(--text-primary)] leading-relaxed">
                              "{SAMPLE_CITATIONS[activeCitation].quote}"
                            </p>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                          <span className="font-bold text-xs">✓</span>
                          <span className="font-semibold text-[10px]">
                            ZERO Hallucination Confirmed — Provenance Verified
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="pt-3 border-t border-[color:var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => openAuth("signup", "OT-10")}
                      className="w-full py-1.5 rounded-md bg-[color:var(--accent)] text-white text-[11px] font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
                    >
                      Run Citation Audit on Your Sources →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LITERATURE SYNTHESIS MATRIX */}
          {activeDemoTab === "matrix" && (
            <div className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-xs overflow-hidden animate-in fade-in duration-150">
              <div className="h-9 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/60 flex items-center justify-between px-3.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[color:var(--accent)]" />
                  <span className="font-mono text-[10px] text-[color:var(--text-muted)]">
                    vault / literature-matrix / synthesis-grid.tsv
                  </span>
                </div>
                <span className="text-[9px] font-mono text-[color:var(--text-secondary)]">
                  3 Papers Synthesized
                </span>
              </div>
              <div className="overflow-x-auto p-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[color:var(--border-subtle)] text-[10px] uppercase font-bold text-[color:var(--text-muted)] tracking-wider">
                      <th className="pb-2 font-mono">Study / Author</th>
                      <th className="pb-2">Methodology</th>
                      <th className="pb-2">Sample / Corpus</th>
                      <th className="pb-2">Key Findings</th>
                      <th className="pb-2 text-right">BibTeX Key</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--border-subtle)] text-[11px]">
                    <tr>
                      <td className="py-2.5 font-semibold text-[color:var(--text-primary)]">Anzalone et al. (2024)</td>
                      <td className="py-2.5 text-[color:var(--text-secondary)]">Targeted base editing</td>
                      <td className="py-2.5 font-mono text-[10px] text-[color:var(--text-muted)]">N=18 Macaca mulatta</td>
                      <td className="py-2.5 text-[color:var(--text-secondary)]">4.2x translocation reduction vs Cas9 (p&lt;0.001)</td>
                      <td className="py-2.5 text-right font-mono text-[10px] text-[color:var(--accent)]">@anzalone2024</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-semibold text-[color:var(--text-primary)]">Gaudelli et al. (2023)</td>
                      <td className="py-2.5 text-[color:var(--text-secondary)]">Stem cell prime editing</td>
                      <td className="py-2.5 font-mono text-[10px] text-[color:var(--text-muted)]">Human CD34+ xenografts</td>
                      <td className="py-2.5 text-[color:var(--text-secondary)]">Stable conversion without genomic rearrangement</td>
                      <td className="py-2.5 text-right font-mono text-[10px] text-[color:var(--accent)]">@gaudelli2023</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-semibold text-[color:var(--text-primary)]">Newby et al. (2022)</td>
                      <td className="py-2.5 text-[color:var(--text-secondary)]">In vivo AAV delivery</td>
                      <td className="py-2.5 font-mono text-[10px] text-[color:var(--text-muted)]">Mouse CNS / liver models</td>
                      <td className="py-2.5 text-[color:var(--text-secondary)]">Durability sustained through 12-month endpoints</td>
                      <td className="py-2.5 text-right font-mono text-[10px] text-[color:var(--accent)]">@newby2022</td>
                    </tr>
                  </tbody>
                </table>
                <div className="pt-3.5 mt-2 border-t border-[color:var(--border-subtle)] flex items-center justify-between">
                  <span className="text-[10px] text-[color:var(--text-muted)] font-mono">Literature Matrix auto-extracts empirical parameters from vault PDFs</span>
                  <button
                    type="button"
                    onClick={() => openAuth("signup", "OT-10")}
                    className="px-3 py-1 rounded bg-[color:var(--accent)] text-white text-[10.5px] font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
                  >
                    Generate Matrix for Your Vault →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRE-SUBMISSION AUDIT */}
          {activeDemoTab === "audit" && (
            <div className="rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-xs overflow-hidden animate-in fade-in duration-150">
              <div className="h-9 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/60 flex items-center justify-between px-3.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-mono text-[10px] text-[color:var(--text-muted)]">
                    audit / pre-submission-report.json
                  </span>
                </div>
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  Ready for Submission
                </span>
              </div>
              <div className="p-5 grid sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-[color:var(--text-primary)]">Citation Grounding</span>
                    <span className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">100% MATCH</span>
                  </div>
                  <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                    All 38 factual assertions are mapped to verbatim indexed passages in the Knowledge Vault.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-[color:var(--text-primary)]">Paraphrase Drift Gating</span>
                    <span className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">DELTA: 0.14</span>
                  </div>
                  <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                    Zero semantic drift detected between source evidence conclusions and drafted prose.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-[color:var(--text-primary)]">Bibliographic Recency</span>
                    <span className="text-[9px] font-mono font-bold text-blue-600 dark:text-blue-400">92% &lt; 3 YRS</span>
                  </div>
                  <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                    Literature baseline prioritizes high-impact peer-reviewed studies published 2022–2025.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-[color:var(--text-primary)]">Disclosures & Rubric</span>
                    <span className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400">VERIFIED</span>
                  </div>
                  <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                    Methods reproducibility disclosures, statistical power calculations, and funding declarations verified.
                  </p>
                </div>
              </div>
              <div className="px-5 pb-4">
                <button
                  type="button"
                  onClick={() => openAuth("signup", "OT-10")}
                  className="w-full py-1.5 rounded-md bg-[color:var(--accent)] text-white text-[11px] font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
                >
                  Run 10-Point Audit on Manuscript →
                </button>
              </div>
            </div>
          )}
        </section>

        {/* THREE SCIENTIFIC GUARANTEES — CLEAN SYMMETRICAL ROW */}
        <section id="privacy" className="px-6 py-10 max-w-5xl mx-auto scroll-mt-20">
          <div className="text-center max-w-xl mx-auto mb-6">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--accent)] block mb-1">
              Privacy & Architecture
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
              Sovereignty by Design
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-1">
              Client-side controls, zero copyright document retention, and private local model execution.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-3.5">
            <div className="p-5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-secondary)] mb-3">
                  <ShieldLockIcon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs text-[color:var(--text-primary)] mb-1">
                  Zero Document Storage
                </h3>
                <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                  Scholar Core never stores full copyright PDFs or raw files on servers. Only client-authorized metadata pointers and references are indexed.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-secondary)] mb-3">
                  <CheckBadgeIcon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs text-[color:var(--text-primary)] mb-1">
                  Evidence-Gated Drafting
                </h3>
                <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                  Every factual assertion is checked against verified citations. Unsupported claims or paraphrasing drift are highlighted before export.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-secondary)] mb-3">
                  <CloudServerIcon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs text-[color:var(--text-primary)] mb-1">
                  Cloud Drive & Local Privacy
                </h3>
                <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                  Seamlessly index private Google Drive and OneDrive documents, or work fully offline with local air-gapped LLMs (Ollama / LM Studio).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* MINIMAL FINAL CTA BANNER */}
        <section className="px-6 py-10 max-w-5xl mx-auto">
          <div className="p-8 sm:p-10 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-center shadow-xs max-w-2xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-[color:var(--text-primary)] tracking-tight mb-2">
              Structured Research Without Distraction
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] max-w-md mx-auto mb-5 leading-relaxed">
              Start organizing your literature and drafting evidence-backed manuscripts today.
            </p>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-[color:var(--accent)] text-white shadow-xs hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Get Started for Free</span>
              <span className="text-xs font-bold">→</span>
            </button>
            <p className="text-[10px] text-[color:var(--text-muted)] mt-2.5">
              Free for individual researchers. No credit card required.
            </p>
          </div>
        </section>
      </main>

      {/* MINIMAL SYMMETRIC FOOTER */}
      <footer className="border-t border-[color:var(--border-subtle)] py-6 px-6 bg-[color:var(--surface-canvas)]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[color:var(--text-muted)]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[color:var(--accent)] text-white flex items-center justify-center">
              <ScholarCoreLogo size="sm" className="text-white" />
            </div>
            <span>© {new Date().getFullYear()} Scholar Core. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5 font-medium text-[11px]">
            <a href="#workspaces" className="hover:text-[color:var(--text-primary)] transition-colors">
              Workspaces
            </a>
            <a href="#provenance" className="hover:text-[color:var(--text-primary)] transition-colors">
              Provenance
            </a>
            <a href="#privacy" className="hover:text-[color:var(--text-primary)] transition-colors">
              Privacy
            </a>
          </div>
        </div>
      </footer>

      {/* EMBEDDED AUTH MODAL */}
      <EmbeddedAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
        selectedFormatId={selectedFormatId}
      />
    </div>
  );
}
