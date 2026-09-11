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
    icon: "📝",
    words: "800 – 4,000 words",
    description: "Coursework essays, reflections, and critical case studies.",
    pipeline: "Brief Analysis → Evidence Board → Critical Synthesis → 10-Point Audit",
  },
  {
    id: "OT-10",
    label: "Journal Article",
    icon: "📄",
    words: "4,000 – 10,000 words",
    description: "Empirical studies and reviews with double-blind peer review simulation.",
    pipeline: "Literature Matrix → Gap Analysis → IMRaD Drafting → Peer Review",
  },
  {
    id: "OT-09",
    label: "Thesis / Dissertation",
    icon: "🎓",
    words: "10,000 – 80,000 words",
    description: "Multi-chapter milestone framework with viva voce defense preparation.",
    pipeline: "Theoretical Framing → Literature Review → Findings → Viva Defense",
  },
  {
    id: "OT-19",
    label: "Research Proposal",
    icon: "💡",
    words: "3,000 – 15,000 words",
    description: "Competitive grant applications with strict agency rubric alignment.",
    pipeline: "Specific Aims → Research Significance → Methodological Design → Ethics",
  },
  {
    id: "OT-22",
    label: "Presentation",
    icon: "📊",
    words: "10 – 35 slides",
    description: "Conference slide decks, symposium talks, and oral defense scripts.",
    pipeline: "Visual Methodology → Narrative Arc → Slide Deck Canvas → Defense Q&A",
  },
];

const SUGGESTED_TOPICS = [
  "CRISPR-Cas9 Base Editing Fidelity",
  "Autonomous Multi-Agent Discovery",
  "Decolonial Epistemologies in Global IR",
  "Post-Quantum Cryptography Benchmarks",
];

export default function ScholarCoreLanding({
  onGetStarted,
  onSignIn,
}: ScholarCoreLandingProps) {
  const [searchParams] = useSearchParams();
  const [scrolled, setScrolled] = useState(false);
  const [activeCitation, setActiveCitation] = useState<number | null>(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Embedded Auth Modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup" | "switch">("signin");
  const [selectedFormatId, setSelectedFormatId] = useState<string | undefined>(undefined);
  const [customTopic, setCustomTopic] = useState("");

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
      {/* Subtle ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[color:var(--accent-subtle)]/40 blur-[140px] rounded-full pointer-events-none -z-10" />

      {/* Modern Minimal Navigation Bar */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-200 ${
          scrolled
            ? "bg-[color:var(--surface-canvas)]/85 backdrop-blur-md border-b border-[color:var(--border-subtle)] shadow-xs py-3"
            : "bg-transparent py-5"
        }`}
      >
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between">
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none group"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="w-8 h-8 rounded-lg bg-[color:var(--accent)] text-white flex items-center justify-center transition-transform group-hover:scale-105">
              <ScholarCoreLogo size="sm" className="text-white" />
            </div>
            <span className="font-bold text-base tracking-tight text-[color:var(--text-primary)]">
              Scholar Core
            </span>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-[color:var(--text-secondary)]">
            <a href="#workspaces" className="hover:text-[color:var(--text-primary)] transition-colors">
              Workspaces
            </a>
            <a href="#provenance" className="hover:text-[color:var(--text-primary)] transition-colors">
              Provenance
            </a>
            <a href="#guarantees" className="hover:text-[color:var(--text-primary)] transition-colors">
              Vault & Trust
            </a>
          </nav>

          <div className="hidden sm:flex items-center gap-3">
            <button
              type="button"
              onClick={() => openAuth("signin")}
              className="text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-[color:var(--surface-hover)] transition-all cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="px-4 py-2 rounded-full text-xs font-bold bg-[color:var(--accent)] text-white shadow-xs hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-1.5"
            >
              Start Researching
              <span className="text-xs font-bold">→</span>
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
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
          <div className="md:hidden bg-[color:var(--surface-raised)] border-b border-[color:var(--border-subtle)] px-6 py-4 flex flex-col gap-3 shadow-lg animate-in fade-in duration-150">
            <a
              href="#workspaces"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium py-1.5 text-[color:var(--text-primary)]"
            >
              Workspaces
            </a>
            <a
              href="#provenance"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium py-1.5 text-[color:var(--text-primary)]"
            >
              Provenance
            </a>
            <a
              href="#guarantees"
              onClick={() => setMobileMenuOpen(false)}
              className="text-xs font-medium py-1.5 text-[color:var(--text-primary)]"
            >
              Vault & Trust
            </a>
            <div className="pt-3 border-t border-[color:var(--border-subtle)] flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuth("signin");
                }}
                className="flex-1 py-2 text-center text-xs font-semibold rounded-lg border border-[color:var(--border-default)]"
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuth("signup");
                }}
                className="flex-1 py-2 text-center text-xs font-bold bg-[color:var(--accent)] text-white rounded-lg"
              >
                Start Free
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="pt-28 pb-20">
        {/* HERO SECTION — RADICALLY MINIMAL & BALANCED */}
        <section className="px-6 max-w-4xl mx-auto flex flex-col items-center text-center pt-8 pb-16">
          {/* Subtle Tagline */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]/70 text-[11px] font-semibold text-[color:var(--text-secondary)] mb-6 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--state-success)] animate-pulse" />
            <span>Autonomous Scientific Research OS</span>
          </div>

          {/* Clean Main Heading */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] text-[color:var(--text-primary)] mb-5 max-w-3xl" style={{ textWrap: "balance" }}>
            Research at the Speed of Thought. <br />
            <span className="text-[color:var(--accent)]">Verified to the Standard of Nature.</span>
          </h1>

          {/* 1-Sentence Crisp Value Proposition */}
          <p className="text-base sm:text-lg text-[color:var(--text-secondary)] max-w-2xl mx-auto mb-8 leading-relaxed font-normal" style={{ textWrap: "pretty" }}>
            Deterministic evidence boards, multi-agent peer review, and zero-document-storage provenance for scholars.
          </p>

          {/* Dual Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-10 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="w-full sm:w-auto px-7 py-3 rounded-full text-sm font-bold bg-[color:var(--accent)] text-white shadow-sm hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Start Researching</span>
              <span className="text-sm font-bold">→</span>
            </button>
            <a
              href="#workspaces"
              className="w-full sm:w-auto px-6 py-3 rounded-full text-sm font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] border border-[color:var(--border-default)] hover:border-[color:var(--border-control)] bg-[color:var(--surface-raised)] transition-all cursor-pointer text-center"
            >
              Explore Workspaces
            </a>
          </div>

          {/* Ultra-Clean Minimal Research Topic Launcher */}
          <div className="w-full max-w-xl p-1.5 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] shadow-xs flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2.5 pl-3">
              <span className="text-[color:var(--accent)] text-sm">✦</span>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openAuth("signup", "OT-10");
                }}
                placeholder="Enter research topic (e.g. CRISPR base editing fidelity)..."
                className="w-full bg-transparent text-xs sm:text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
              />
            </div>
            <button
              type="button"
              onClick={() => openAuth("signup", "OT-10")}
              className="px-4 py-2 bg-[color:var(--accent)] text-white rounded-xl text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer shrink-0"
            >
              Launch →
            </button>
          </div>

          {/* Quick topic pills */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 text-[11px] text-[color:var(--text-muted)]">
            <span className="mr-1 font-medium">Examples:</span>
            {SUGGESTED_TOPICS.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => setCustomTopic(topic)}
                className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-[color:var(--border-control)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
              >
                {topic}
              </button>
            ))}
          </div>
        </section>

        {/* 5 DEDICATED ACADEMIC WORKSPACES — MINIMAL & PRECISE */}
        <section id="workspaces" className="px-6 py-16 max-w-6xl mx-auto scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[color:var(--accent)] block mb-1">
              5 DEDICATED ACADEMIC WORKSPACES
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[color:var(--text-primary)]" style={{ textWrap: "balance" }}>
              Purpose-built cognitive pipelines for every scholarly deliverable
            </h2>
            <p className="text-xs sm:text-sm text-[color:var(--text-secondary)] mt-2">
              From brief analysis to submission review, each format is engineered with distinct academic rigor.
            </p>
          </div>

          {/* Clean 5-card grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WORKSPACES.map((ws) => (
              <div
                key={ws.id}
                className="p-5 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--border-control)] hover:shadow-sm transition-all duration-200 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{ws.icon}</span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]">
                        {ws.id}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[color:var(--text-muted)]">
                      {ws.words}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-[color:var(--text-primary)] group-hover:text-[color:var(--accent)] transition-colors mb-1">
                    {ws.label}
                  </h3>
                  <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed mb-4">
                    {ws.description}
                  </p>

                  <div className="text-[11px] text-[color:var(--text-muted)] pt-3 border-t border-[color:var(--border-subtle)]">
                    <span className="font-semibold text-[color:var(--text-secondary)] block mb-0.5 text-[10px] uppercase tracking-wider">
                      Stages:
                    </span>
                    <span className="leading-normal font-mono text-[10px] text-[color:var(--text-secondary)]">
                      {ws.pipeline}
                    </span>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-[color:var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => openAuth("signup", ws.id)}
                    className="w-full py-2 rounded-xl text-xs font-bold text-[color:var(--text-primary)] bg-[color:var(--surface-inset)] hover:bg-[color:var(--accent)] hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    Initialize {ws.label} →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* LIVE INTERACTIVE PROVENANCE INSPECTOR */}
        <section id="provenance" className="px-6 py-16 max-w-5xl mx-auto scroll-mt-20">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[color:var(--accent)] block mb-1">
              Live Interactive Workspace
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[color:var(--text-primary)]">
              Click any citation to verify provenance
            </h2>
            <p className="text-xs sm:text-sm text-[color:var(--text-secondary)] mt-1.5">
              Scholar Core maps assertions directly to verbatim evidence inside your private Knowledge Vault.
            </p>
          </div>

          <div className="rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-sm overflow-hidden">
            {/* Top Toolbar */}
            <div className="h-10 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/60 flex items-center justify-between px-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-success)]" />
                <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                  empirical-article-ot10 / results.tex
                </span>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Quality Gate: 5/5 PASSED
              </span>
            </div>

            {/* Two-Pane Body */}
            <div className="grid md:grid-cols-12 min-h-[320px]">
              {/* Left Column: Manuscript Draft */}
              <div className="md:col-span-7 p-6 border-b md:border-b-0 md:border-r border-[color:var(--border-subtle)] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] block mb-2">
                    Manuscript Draft — Section 3.2: Efficacy Metrics
                  </span>
                  <div className="space-y-3 text-xs sm:text-sm text-[color:var(--text-primary)] leading-relaxed">
                    <p>
                      High-throughput genomic screening revealed that targeted nucleotide modifications achieved
                      superior fidelity over traditional endonucleases, with significant reduction in unintended cleavage{" "}
                      <button
                        type="button"
                        onClick={() => setActiveCitation(1)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-xs transition-all cursor-pointer ${
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
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-xs transition-all cursor-pointer ${
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

                <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-between text-[11px] text-[color:var(--text-muted)]">
                  <span>Citation Resolver: Active</span>
                  <span className="text-[color:var(--accent)] font-medium">Click buttons above to switch source proof</span>
                </div>
              </div>

              {/* Right Column: Knowledge Vault Inspector */}
              <div className="md:col-span-5 p-6 bg-[color:var(--surface-inset)]/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1">
                      <span>🔍</span>
                      <span>Knowledge Vault Provenance Inspector</span>
                    </span>
                  </div>

                  {activeCitation && SAMPLE_CITATIONS[activeCitation] ? (
                    <div className="space-y-3 animate-in fade-in duration-150">
                      <div className="p-3.5 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="font-bold text-xs text-[color:var(--text-primary)] leading-snug">
                            {SAMPLE_CITATIONS[activeCitation].source}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 border ${SAMPLE_CITATIONS[activeCitation].badgeColor}`}>
                            {SAMPLE_CITATIONS[activeCitation].confidence}
                          </span>
                        </div>
                        <p className="text-[11px] text-[color:var(--text-secondary)] mb-2.5">
                          {SAMPLE_CITATIONS[activeCitation].journal}
                        </p>

                        <div className="p-2.5 rounded-lg bg-[color:var(--surface-inset)]/60 border-l-2 border-[color:var(--accent)]">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] block mb-1">
                            Verbatim Vault Evidence:
                          </span>
                          <p className="text-xs italic text-[color:var(--text-primary)] leading-relaxed">
                            "{SAMPLE_CITATIONS[activeCitation].quote}"
                          </p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                        <span className="font-bold">✓</span>
                        <span className="font-semibold text-[11px]">
                          ZERO Hallucination Confirmed — 100% Cryptographic Match
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="pt-3 border-t border-[color:var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => openAuth("signup", "OT-10")}
                    className="w-full py-2 rounded-lg bg-[color:var(--accent)] text-white text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
                  >
                    Run Citation Audit on Your Own Sources →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* THREE CORE SCIENTIFIC GUARANTEES — CLEAN 3-CARD ROW */}
        <section id="guarantees" className="px-6 py-16 max-w-5xl mx-auto scroll-mt-20">
          <div className="grid md:grid-cols-3 gap-5">
            <div className="p-6 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
              <span className="text-2xl mb-3 block">🛡️</span>
              <h3 className="font-bold text-sm text-[color:var(--text-primary)] mb-1.5">
                Zero Document Storage
              </h3>
              <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                Scholar Core never stores full copyright PDFs or raw files on servers. Only client-authorized metadata pointers and references are indexed.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
              <span className="text-2xl mb-3 block">🎯</span>
              <h3 className="font-bold text-sm text-[color:var(--text-primary)] mb-1.5">
                100% Provenance Gating
              </h3>
              <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                Every factual assertion is cryptographically linked to evidence. Unverified claims or paraphrasing drift are flagged prior to manuscript export.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
              <span className="text-2xl mb-3 block">☁️</span>
              <h3 className="font-bold text-sm text-[color:var(--text-primary)] mb-1.5">
                Cloud & Air-Gapped Sovereignty
              </h3>
              <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                Seamlessly index your private Google Drive and OneDrive documents, or run entirely offline on local air-gapped LLMs (Ollama / LM Studio).
              </p>
            </div>
          </div>
        </section>

        {/* MINIMAL FINAL CTA BANNER */}
        <section className="px-6 py-16 text-center max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-[color:var(--text-primary)] tracking-tight mb-3">
            Accelerate Your Research Without Sacrificing Rigour
          </h2>
          <p className="text-xs sm:text-sm text-[color:var(--text-secondary)] max-w-xl mx-auto mb-6">
            Join scholars worldwide organizing their literature, guaranteeing citation integrity, and publishing faster.
          </p>
          <button
            type="button"
            onClick={() => openAuth("signup")}
            className="px-8 py-3 rounded-full text-sm font-bold bg-[color:var(--accent)] text-white shadow-sm hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <span>Get Started for Free</span>
            <span className="text-sm font-bold">→</span>
          </button>
          <p className="text-[11px] text-[color:var(--text-muted)] mt-3">
            Free forever for individual local researchers. No credit card required.
          </p>
        </section>
      </main>

      {/* MINIMAL CLEAN FOOTER */}
      <footer className="border-t border-[color:var(--border-subtle)] py-8 px-6 bg-[color:var(--surface-canvas)]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[color:var(--text-muted)]">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-[color:var(--accent)] text-white flex items-center justify-center">
              <ScholarCoreLogo size="sm" className="text-white" />
            </div>
            <span>© {new Date().getFullYear()} Scholar Core. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 font-medium text-[11px]">
            <a href="#workspaces" className="hover:text-[color:var(--text-primary)] transition-colors">
              Workspaces
            </a>
            <a href="#provenance" className="hover:text-[color:var(--text-primary)] transition-colors">
              Provenance
            </a>
            <a href="#guarantees" className="hover:text-[color:var(--text-primary)] transition-colors">
              Vault & Trust
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
