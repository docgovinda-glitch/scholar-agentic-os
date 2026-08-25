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

const AGENT_ROLES = [
  {
    id: "auditor",
    name: "Citation Auditor",
    title: "100% Provenance Verification",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    badge: "Active Guard",
    description: "Scans every sentence against your private Knowledge Vault. Flags unsupported assertions or paraphrasing drift before publication.",
    critique: "Claim #4 verified against Chen et al. (2024) [PDF p.14]. Direct quote concordance 99.4%. Zero hallucination detected.",
    status: "PASS",
  },
  {
    id: "methodologist",
    name: "The Methodologist",
    title: "Statistical & Experimental Rigour",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    badge: "Peer Review",
    description: "Evaluates sample sizes, control groups, statistical tests, and study limitations according to international CONSORT/STROBE/PRISMA standards.",
    critique: "Cohort size (n=142) satisfies power calculation (β=0.80, α=0.05). Bonferroni correction correctly applied for multiple comparisons.",
    status: "VALIDATED",
  },
  {
    id: "coherence",
    name: "Voice & Tone Architect",
    title: "Academic Register Harmonization",
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    badge: "Style Engine",
    description: "Maintains high-impact scholarly prose, eliminates colloquialisms, and balances active vs passive voice based on your chosen target discipline.",
    critique: "Calculated Flesch-Kincaid Grade Level: 14.8. Register matches Nature Biotechnology editorial benchmark across Sections 1-4.",
    status: "OPTIMIZED",
  },
  {
    id: "compliance",
    name: "Journal Compliance Warden",
    title: "Instant Author Guideline Auditing",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    badge: "Publisher Gate",
    description: "Enforces target journal word counts, required headings, abstract structured constraints, and citation formatting (APA, IEEE, Vancouver, Nature).",
    critique: "Word count: 3,840 / 4,500 limit. Abstract structured into Background, Methods, Results, Conclusion. References formatted in Nature style.",
    status: "COMPLIANT",
  },
];

const FORMAT_FAMILIES = [
  {
    id: "short_form",
    label: "1. Assignment",
    desc: "Dedicated 8-phase academic thinking, evidence evaluation, research, and grounded drafting workspace.",
    formats: [
      {
        id: "OT-01",
        label: "Academic Assignment",
        words: "800 – 4,000 words",
        sections: "Understand Brief → Research Plan → Evidence Board → Think & Critique → Structure & Word Plan → Grounded Drafting → 10-Point Submission Audit",
        bestFor: "Undergraduate & Postgraduate coursework, essays, reports, and reflections",
      },
    ],
  },
  {
    id: "publication",
    label: "2. Journal Article",
    desc: "25-stage peer-reviewed empirical & review paper pipeline with multi-agent peer review.",
    formats: [
      {
        id: "OT-10",
        label: "Journal Article",
        words: "4,000 – 10,000 words",
        sections: "Journal Discovery → Literature Matrix → Gap Analysis → IMRaD Drafting → Multi-Agent Peer Review Simulator",
        bestFor: "Nature, Elsevier, IEEE, Springer & peer-reviewed journals",
      },
    ],
  },
  {
    id: "long_form",
    label: "3. Thesis / Dissertation",
    desc: "Comprehensive multi-chapter milestone framework with structured defense preparation.",
    formats: [
      {
        id: "OT-09",
        label: "Thesis / Dissertation",
        words: "10,000 – 80,000 words",
        sections: "Proposal & Theory → Literature Review → Methodology → Findings → Discussion → Defense Ready",
        bestFor: "Undergraduate dissertations, Master's theses & PhD doctorates",
      },
    ],
  },
  {
    id: "proposal_funding",
    label: "4. Research Proposal",
    desc: "Competitive grant applications and research plans with strict agency rubric alignment.",
    formats: [
      {
        id: "OT-19",
        label: "Research & Grant Proposal",
        words: "3,000 – 15,000 words",
        sections: "Specific Aims → Research Significance → Methodological Design → Ethics & Timeline Budgeting",
        bestFor: "Institutional grants, federal funding applications & PhD candidacy plans",
      },
    ],
  },
  {
    id: "presentation",
    label: "5. Presentation",
    desc: "High-impact visual communication and narrative scripts for symposiums and oral defenses.",
    formats: [
      {
        id: "OT-22",
        label: "Academic Presentation",
        words: "10 – 35 slides",
        sections: "Core Takeaway → Visual Methodology → Evidence Synthesis → Discussion & Defense Q&A",
        bestFor: "Symposium talks, conference keynotes & thesis defense slide decks",
      },
    ],
  },
  {
    id: "applied_professional",
    label: "6. Text Humanizer",
    desc: "Language & Voice Studio for academic AI text polish, tone tuning, and stylometric humanization.",
    formats: [
      {
        id: "OT-07",
        label: "Academic Text Humanizer",
        words: "Section-by-section",
        sections: "Stylometric Analysis → Tone & Voice Calibration → Passive/Active Balance → Provenance Check",
        bestFor: "Refining AI drafts into natural, authentic human academic prose",
      },
    ],
  },
];

const SUGGESTED_TOPICS = [
  "Autonomous Multi-Agent Systems in Scientific Discovery",
  "CRISPR-Cas9 Base Editing Efficacy in Primary Stem Cells",
  "Zero-Knowledge Verification for Decentralized Knowledge Graphs",
  "Post-Quantum Cryptography Benchmarks on Embedded Devices",
];

export default function ScholarCoreLanding({
  onGetStarted,
  onSignIn,
}: ScholarCoreLandingProps) {
  const [searchParams] = useSearchParams();
  const [scrolled, setScrolled] = useState(false);
  const [activeCitation, setActiveCitation] = useState<number | null>(1);
  const [activeAgent, setActiveAgent] = useState<string>("auditor");
  const [activeFamily, setActiveFamily] = useState<string>("short_form");
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

  const selectedAgent = AGENT_ROLES.find((a) => a.id === activeAgent) ?? AGENT_ROLES[0];
  const selectedFamily = FORMAT_FAMILIES.find((f) => f.id === activeFamily) ?? FORMAT_FAMILIES[0];

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-sans antialiased selection:bg-[color:var(--accent-subtle)] relative overflow-x-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-[color:var(--accent-subtle)] blur-[140px] rounded-full pointer-events-none -z-10 opacity-70" />
      <div className="absolute top-[35%] left-[-100px] w-[500px] h-[500px] bg-[color:var(--state-info-subtle)] blur-[160px] rounded-full pointer-events-none -z-10 opacity-60" />
      <div className="absolute bottom-0 right-[-100px] w-[600px] h-[600px] bg-[color:var(--state-success-subtle)] blur-[160px] rounded-full pointer-events-none -z-10 opacity-50" />

      {/* Header */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
          scrolled
            ? "bg-[color:var(--surface-raised)]/90 backdrop-blur-xl border-b border-[color:var(--border-subtle)] shadow-xs py-3"
            : "bg-transparent py-4 sm:py-5"
        }`}
      >
        <div className="mx-auto max-w-7xl px-6 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="w-10 h-10 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <ScholarCoreLogo size="md" className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-[color:var(--text-primary)] leading-none">
                Scholar Core
              </span>
              <span className="text-[11px] font-semibold text-[color:var(--text-muted)] tracking-wider uppercase mt-0.5">
                Research OS
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[color:var(--text-secondary)]">
            <a href="#formats-explorer" className="hover:text-[color:var(--accent)] transition-colors">
              Workspaces
            </a>
            <a href="#interactive-demo" className="hover:text-[color:var(--accent)] transition-colors">
              Live Demo
            </a>
            <a href="#editorial-board" className="hover:text-[color:var(--accent)] transition-colors">
              Editorial Agents
            </a>
            <a href="#security" className="hover:text-[color:var(--accent)] transition-colors">
              Vault & Privacy
            </a>
            <a href="#comparison" className="hover:text-[color:var(--accent)] transition-colors">
              Why Scholar Core
            </a>
          </nav>

          <div className="hidden sm:flex items-center gap-3">
            <button
              type="button"
              onClick={() => openAuth("signin")}
              className="text-sm font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--accent)] px-4 py-2 rounded-xl hover:bg-[color:var(--surface-hover)] transition-all cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="px-5 py-2.5 rounded-full text-sm font-bold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] shadow-sm hover:bg-[color:var(--accent-hover)] transition-all hover:shadow-md cursor-pointer flex items-center gap-2"
            >
              Start Researching
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          <div className="md:hidden bg-[color:var(--surface-raised)] border-b border-[color:var(--border-subtle)] px-6 py-4 flex flex-col gap-3 shadow-xl">
            <a
              href="#formats-explorer"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium py-2 text-[color:var(--text-primary)]"
            >
              Workspaces
            </a>
            <a
              href="#interactive-demo"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium py-2 text-[color:var(--text-primary)]"
            >
              Live Demo
            </a>
            <a
              href="#editorial-board"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium py-2 text-[color:var(--text-primary)]"
            >
              Editorial Agents
            </a>
            <a
              href="#security"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium py-2 text-[color:var(--text-primary)]"
            >
              Vault & Privacy
            </a>
            <div className="pt-3 border-t border-[color:var(--border-subtle)] flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuth("signin");
                }}
                className="w-full py-2.5 text-center text-sm font-semibold rounded-lg border border-[color:var(--border-default)]"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuth("signup");
                }}
                className="w-full py-2.5 text-center text-sm font-bold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-lg"
              >
                Start for Free
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10 pt-24 sm:pt-28">
        {/* HERO SECTION */}
        <section id="hero" className="px-4 sm:px-6 lg:px-8 pt-6 pb-12 max-w-7xl mx-auto flex flex-col items-center">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-xs mb-6">
            <span className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-success)] animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">
              Verifiable Autonomous Multi-Agent Research Engine
            </span>
          </div>

          {/* Main Hero Header */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-center mb-4 leading-[1.1] text-[color:var(--text-primary)] max-w-5xl">
            Research at the Speed of Thought. <br className="hidden sm:inline" />
            <span className="text-[color:var(--accent)]">Verified to the Standard of Nature.</span>
          </h1>

          <p className="text-base sm:text-lg text-[color:var(--text-secondary)] text-center max-w-3xl mx-auto mb-8 leading-relaxed font-normal">
            From raw literature search and PDF extraction to publication-ready manuscripts with{" "}
            <strong className="text-[color:var(--text-primary)] font-semibold">
              100% cryptographic citation provenance
            </strong>
            , multi-agent editorial review, and strict journal compliance.
          </p>

          {/* Interactive Live Research Prompt Bar */}
          <div className="w-full max-w-3xl mb-8 p-2 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] shadow-lg flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex items-center gap-3 px-3 py-2">
              <svg className="w-5 h-5 text-[color:var(--accent)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Enter research topic (e.g. CRISPR-Cas9 Base Editing Fidelity)..."
                className="w-full bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
              />
            </div>
            <button
              type="button"
              onClick={() => openAuth("signup", "OT-10")}
              className="px-6 py-3 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-xl text-sm font-bold shadow hover:bg-[color:var(--accent-hover)] transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Assemble Pipeline</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

          {/* Quick Topic Suggestions */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10 text-xs text-[color:var(--text-muted)]">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Try Live:</span>
            {SUGGESTED_TOPICS.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => {
                  setCustomTopic(topic);
                  const demoElem = document.getElementById("interactive-demo");
                  if (demoElem) demoElem.scrollIntoView({ behavior: "smooth" });
                }}
                className="px-3 py-1 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-[color:var(--accent-border)] hover:text-[color:var(--accent)] transition-all cursor-pointer"
              >
                {topic}
              </button>
            ))}
          </div>

          {/* 6 CURATED ACADEMIC WORKSPACES */}
          <div id="formats-explorer" className="w-full scroll-mt-24 pt-4 border-t border-[color:var(--border-subtle)]">
            <div className="text-center max-w-3xl mx-auto mb-6">
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                6 DEDICATED ACADEMIC WORKSPACES
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[color:var(--text-primary)] mt-1">
                Engineered for Every Stage of Scholarship
              </h2>
              <p className="text-[color:var(--text-secondary)] mt-2 text-xs sm:text-sm">
                From undergraduate assignments and postgraduate coursework to Nature empirical articles and doctoral dissertations, Scholar Core provides dedicated workflow pipelines and quality rubrics.
              </p>
            </div>

            {/* 6 Category Filter Tabs in specific order */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              {FORMAT_FAMILIES.map((family) => {
                const isActive = family.id === activeFamily;
                return (
                  <button
                    key={family.id}
                    type="button"
                    onClick={() => setActiveFamily(family.id)}
                    className={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      isActive
                        ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] shadow-xs scale-105"
                        : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)]"
                    }`}
                  >
                    {family.label}
                  </button>
                );
              })}
            </div>

            <div className="mb-6 text-center">
              <p className="text-xs sm:text-sm font-medium text-[color:var(--text-secondary)]">{selectedFamily.desc}</p>
            </div>

            {/* Curated Workspace Detail Card */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FORMAT_FAMILIES.map((fam) => {
                const fmt = fam.formats[0];
                const isSelected = fam.id === activeFamily;

                return (
                  <div
                    key={fmt.id}
                    onClick={() => setActiveFamily(fam.id)}
                    className={`p-6 rounded-3xl border transition-all flex flex-col justify-between group text-left cursor-pointer ${
                      isSelected
                        ? "border-[color:var(--accent)] bg-[color:var(--surface-canvas)] shadow-lg ring-1 ring-[color:var(--accent)]/30 scale-[1.02]"
                        : "border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--accent-border)] hover:shadow-md"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-md bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)]">
                          {fmt.id}
                        </span>
                        <span className="text-[10px] font-bold text-[color:var(--state-success)] bg-[color:var(--state-success-subtle)] px-2 py-0.5 rounded-full border border-[color:var(--state-success)]/30">
                          Ready to Boot
                        </span>
                      </div>
                      <h3 className="font-bold text-lg text-[color:var(--text-primary)] group-hover:text-[color:var(--accent)] transition-colors mb-2">
                        {fmt.label}
                      </h3>
                      <p className="text-xs text-[color:var(--text-secondary)] mb-3 font-mono font-semibold">
                        🎯 Budget: {fmt.words}
                      </p>
                      <p className="text-xs text-[color:var(--text-secondary)] mb-4 leading-relaxed">
                        {fmt.bestFor}
                      </p>
                      <div className="text-xs text-[color:var(--text-muted)] pt-3 border-t border-[color:var(--border-subtle)]">
                        <span className="font-bold text-[color:var(--text-secondary)] block mb-1 text-[11px] uppercase tracking-wider">
                          Dedicated Pipeline:
                        </span>
                        <span className="text-xs leading-relaxed text-[color:var(--text-primary)] font-medium">
                          {fmt.sections}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-[color:var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAuth("signup", fmt.id);
                        }}
                        className="w-full py-3 rounded-xl text-xs font-bold text-white bg-[color:var(--accent-solid)] hover:bg-[color:var(--accent-hover)] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                      >
                        Initialize {fmt.label} →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* INTERACTIVE PRODUCT DEMO: LIVE MANUSCRIPT & PROVENANCE INSPECTOR */}
        <section id="interactive-demo" className="px-4 sm:px-6 lg:px-8 py-16 scroll-mt-24 bg-[color:var(--surface-raised)] border-y border-[color:var(--border-subtle)]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                Live Interactive Workspace
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[color:var(--text-primary)] mt-2">
                Click any citation to verify provenance
              </h2>
              <p className="text-[color:var(--text-secondary)] mt-3 text-sm sm:text-base">
                Scholar Core maps every sentence directly to verbatim evidence inside your private Knowledge Vault.
              </p>
            </div>

            <div className="rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-canvas)] shadow-xl overflow-hidden">
              {/* App Mock Window Header */}
              <div className="h-12 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] flex items-center justify-between px-5">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[color:var(--state-danger)] opacity-80" />
                  <span className="w-3 h-3 rounded-full bg-[color:var(--state-warning)] opacity-80" />
                  <span className="w-3 h-3 rounded-full bg-[color:var(--state-success)] opacity-80" />
                  <span className="ml-3 text-xs font-mono font-medium text-[color:var(--text-muted)] hidden sm:inline">
                    scholar-os://workspace/empirical-article-ot10/results
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-md bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)] text-[11px] font-bold">
                    Quality Gate: 5/5 PASSED
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)] text-[11px] font-bold">
                    Target: Nature Biotech
                  </span>
                </div>
              </div>

              {/* Two-Pane Interactive Demo */}
              <div className="grid lg:grid-cols-12 min-h-[480px]">
                {/* Left Pane: Manuscript Text with Interactive Citations */}
                <div className="lg:col-span-7 p-6 sm:p-8 bg-[color:var(--surface-canvas)] border-b lg:border-b-0 lg:border-r border-[color:var(--border-subtle)] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[color:var(--border-subtle)]">
                      <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                        Manuscript Draft — Section 3.2: Efficacy Metrics
                      </span>
                      <span className="text-xs font-mono text-[color:var(--text-muted)]">Word Count: 3,842</span>
                    </div>

                    <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-4 leading-snug">
                      Comparative Analysis of In Vivo Cleavage and Repair Fidelity
                    </h3>

                    <div className="space-y-4 text-[color:var(--text-primary)] text-base leading-relaxed">
                      <p>
                        High-throughput genomic screening revealed that targeted nucleotide modifications achieved
                        statistically superior fidelity when compared against traditional endonucleases. Quantitative
                        evaluation in primate cell lineages confirmed a significant reduction in unintended genomic
                        cleavage{" "}
                        <button
                          type="button"
                          onClick={() => setActiveCitation(1)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold font-mono text-xs transition-all cursor-pointer ${
                            activeCitation === 1
                              ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)] ring-2 ring-[color:var(--accent-border)] scale-105"
                              : "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-white"
                          }`}
                        >
                          [1] Nature Biotech 2024
                        </button>
                        .
                      </p>

                      <p>
                        Furthermore, longitudinal assessment across a 24-week observational window confirmed the stable
                        heritability of target alleles in stem cell repopulation models without observable off-target
                        translocations{" "}
                        <button
                          type="button"
                          onClick={() => setActiveCitation(2)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold font-mono text-xs transition-all cursor-pointer ${
                            activeCitation === 2
                              ? "bg-[color:var(--state-info)] text-white ring-2 ring-[color:var(--state-info-subtle)] scale-105"
                              : "bg-[color:var(--state-info-subtle)] text-[color:var(--state-info)] hover:bg-[color:var(--state-info)] hover:text-white"
                          }`}
                        >
                          [2] Cell Stem Cell 2023
                        </button>
                        . These parameters substantiate clinical viability for downstream therapeutic translation.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-between text-xs text-[color:var(--text-secondary)]">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="w-2 h-2 rounded-full bg-[color:var(--state-success)] animate-pulse" />
                      Auto-Citation Resolver Active
                    </span>
                    <span className="text-[color:var(--accent)] font-semibold">Click citations above to inspect evidence</span>
                  </div>
                </div>

                {/* Right Pane: Live Evidence & Citation Inspector */}
                <div className="lg:col-span-5 p-6 sm:p-8 bg-[color:var(--surface-raised)] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-2">
                        <svg className="w-4 h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Knowledge Vault Provenance Inspector
                      </span>
                    </div>

                    {activeCitation && SAMPLE_CITATIONS[activeCitation] ? (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        <div className="p-4 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)]">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="font-bold text-sm text-[color:var(--text-primary)] leading-tight">
                              {SAMPLE_CITATIONS[activeCitation].source}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${SAMPLE_CITATIONS[activeCitation].badgeColor}`}>
                              {SAMPLE_CITATIONS[activeCitation].confidence}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-[color:var(--text-secondary)] mb-3">
                            {SAMPLE_CITATIONS[activeCitation].journal}
                          </p>

                          <div className="p-3 rounded-lg bg-[color:var(--surface-raised)] border-l-4 border-[color:var(--accent)] shadow-xs">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] block mb-1">
                              Extracted Verbatim Proof from PDF:
                            </span>
                            <blockquote className="text-xs italic text-[color:var(--text-primary)] leading-relaxed">
                              "{SAMPLE_CITATIONS[activeCitation].quote}"
                            </blockquote>
                          </div>

                          <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-[color:var(--text-muted)]">
                            <span>{SAMPLE_CITATIONS[activeCitation].page}</span>
                            <span>SHA-256 Vault Hash Verified</span>
                          </div>
                        </div>

                        {/* Automated Quality Signoff Status */}
                        <div className="p-4 rounded-xl bg-[color:var(--state-success-subtle)] border border-[color:var(--state-success)] flex items-start gap-3">
                          <div className="w-5 h-5 rounded-full bg-[color:var(--state-success)] text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div>
                            <span className="font-bold text-xs text-[color:var(--state-success)] block">
                              Integrity Gate: ZERO Hallucination Confirmed
                            </span>
                            <span className="text-xs text-[color:var(--text-secondary)] leading-tight">
                              This assertion is mathematically supported by verified vault vectors with exact page bounds.
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-16 text-center text-sm text-[color:var(--text-muted)]">
                        Select a citation tag in the manuscript to view live proof.
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-[color:var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => openAuth("signup", "OT-10")}
                      className="w-full py-2.5 rounded-xl bg-[color:var(--accent-solid)] text-white text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      Run Citation Audit on Your Own PDFs
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MULTI-AGENT EDITORIAL BOARD */}
        <section id="editorial-board" className="px-4 sm:px-6 lg:px-8 py-20 bg-[color:var(--surface-canvas)] scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                Autonomous Quality Assurance
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[color:var(--text-primary)] mt-2">
                An AI Editorial Board on Your Desktop
              </h2>
              <p className="text-[color:var(--text-secondary)] mt-3 text-base">
                Four specialized agents review and critique your manuscript across every critical academic dimension before journal submission.
              </p>
            </div>

            {/* Agent Selector Tabs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {AGENT_ROLES.map((agent) => {
                const isActive = agent.id === activeAgent;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setActiveAgent(agent.id)}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)] shadow-sm"
                        : "border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--border-control)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isActive
                            ? "bg-[color:var(--accent)] text-white"
                            : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]"
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={agent.icon} />
                        </svg>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        isActive
                          ? "bg-[color:var(--accent)] text-white"
                          : "bg-[color:var(--surface-inset)] text-[color:var(--text-muted)]"
                      }`}>
                        {agent.badge}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[color:var(--text-primary)]">{agent.name}</h4>
                      <p className="text-xs text-[color:var(--text-secondary)] mt-0.5 line-clamp-1">{agent.title}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Agent Detail Card */}
            <div className="p-8 rounded-3xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-[color:var(--border-subtle)]">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    Active Agent Inspection
                  </span>
                  <h3 className="text-2xl font-black text-[color:var(--text-primary)] mt-1">{selectedAgent.name}</h3>
                  <p className="text-sm text-[color:var(--text-secondary)] mt-1">{selectedAgent.description}</p>
                </div>
                <div className="flex items-center gap-3 self-start md:self-auto">
                  <span className="text-xs font-medium text-[color:var(--text-muted)]">Verification Status:</span>
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]">
                    ✓ {selectedAgent.status}
                  </span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)]">
                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] block mb-2">
                  Agent Telemetry & Review Feedback:
                </span>
                <p className="text-sm text-[color:var(--text-primary)] leading-relaxed font-mono bg-[color:var(--surface-canvas)] p-4 rounded-xl border border-[color:var(--border-subtle)]">
                  {selectedAgent.critique}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* PRIVACY, LOCAL RUNNER & VAULT ARCHITECTURE */}
        <section id="security" className="px-4 sm:px-6 lg:px-8 py-20 bg-[color:var(--surface-raised)] border-y border-[color:var(--border-subtle)] scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                  Research Sovereignty & Privacy
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[color:var(--text-primary)] mt-2 leading-tight">
                  Your Unpublished Discoveries Stay Yours. Period.
                </h2>
                <p className="text-[color:var(--text-secondary)] mt-4 text-base leading-relaxed">
                  Academic integrity requires absolute confidentiality. Scholar Core is engineered from the ground up so your raw data, hypotheses, and drafts are never fed back into public model training.
                </p>

                <div className="space-y-6 mt-8">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)] flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-[color:var(--text-primary)]">Universal Knowledge Vault with Cloud Sync</h4>
                      <p className="text-xs text-[color:var(--text-secondary)] mt-1 leading-relaxed">
                        Seamlessly sync your research papers, datasets, notes, and citations across all devices with Google Drive, OneDrive, and academic citation formats.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[color:var(--state-info-subtle)] text-[color:var(--state-info)] border border-[color:var(--state-info)] flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-[color:var(--text-primary)]">Local Offline AI & BYOK (Bring Your Own Key)</h4>
                      <p className="text-xs text-[color:var(--text-secondary)] mt-1 leading-relaxed">
                        Run fully air-gapped on Ollama or LM Studio, or connect your personal Anthropic, OpenAI, or Google Cloud API credentials.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)] flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-[color:var(--text-primary)]">Institutional Data Governance</h4>
                      <p className="text-xs text-[color:var(--text-secondary)] mt-1 leading-relaxed">
                        Meets HIPAA and GDPR data minimization standards for academic health centers and defense research institutions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security Blueprint Visual Card */}
              <div className="p-8 rounded-3xl border border-[color:var(--border-default)] bg-[color:var(--surface-canvas)] shadow-md">
                <div className="flex items-center justify-between pb-4 border-b border-[color:var(--border-subtle)] mb-6">
                  <span className="text-xs font-mono font-bold text-[color:var(--text-muted)]">SYSTEM_ISOLATION_TOPOLOGY</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]">
                    ENFORCED
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-[color:var(--state-success)]" />
                      <span className="text-xs font-bold text-[color:var(--text-primary)]">Client Sandbox (Browser / Desktop)</span>
                    </div>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-2 pl-6">
                      Private PDF parsing, AES-256 local vault encryption, and live citation linking execute on your machine.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-[color:var(--accent)]" />
                      <span className="text-xs font-bold text-[color:var(--text-primary)]">AI Gateway & Policy Firewall</span>
                    </div>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-2 pl-6">
                      Redacts PII, strips metadata, and routes exclusively through zero-data-retention API endpoints.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-[color:var(--state-info)]" />
                      <span className="text-xs font-bold text-[color:var(--text-primary)]">Export & Journal Packages</span>
                    </div>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-2 pl-6">
                      Outputs LaTeX, DOCX, and PDF with formatted reference bibliographies and cover letters.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COMPARISON TABLE */}
        <section id="comparison" className="px-4 sm:px-6 lg:px-8 py-20 scroll-mt-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                Direct Comparison
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[color:var(--text-primary)] mt-2">
                Why Researchers Choose Scholar Core
              </h2>
              <p className="text-[color:var(--text-secondary)] mt-2 text-sm">
                Generic chatbots write believable fiction. Scholar Core writes verified science.
              </p>
            </div>

            <div className="rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
                      <th className="p-4 sm:p-5 font-bold text-[color:var(--text-primary)]">Capability</th>
                      <th className="p-4 sm:p-5 font-medium text-[color:var(--text-secondary)] text-center">Generic LLMs (ChatGPT)</th>
                      <th className="p-4 sm:p-5 font-medium text-[color:var(--text-secondary)] text-center">Reference Managers (Zotero)</th>
                      <th className="p-4 sm:p-5 font-bold text-[color:var(--accent)] bg-[color:var(--accent-subtle)] text-center">Scholar Core OS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--border-subtle)]">
                    <tr>
                      <td className="p-4 sm:p-5 font-semibold text-[color:var(--text-primary)]">Citation Provenance</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--state-danger)]">❌ Hallucinates fake papers</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--text-secondary)]">⚠️ Stores PDFs only</td>
                      <td className="p-4 sm:p-5 text-center font-bold text-[color:var(--state-success)] bg-[color:var(--accent-subtle)]">✅ 100% Cryptographic Match</td>
                    </tr>
                    <tr>
                      <td className="p-4 sm:p-5 font-semibold text-[color:var(--text-primary)]">Dedicated Academic Workspaces</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--state-danger)]">❌ Generic unstructured chat</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--text-muted)]">—</td>
                      <td className="p-4 sm:p-5 text-center font-bold text-[color:var(--state-success)] bg-[color:var(--accent-subtle)]">✅ Tailored 8-to-25 Stage Workspaces</td>
                    </tr>
                    <tr>
                      <td className="p-4 sm:p-5 font-semibold text-[color:var(--text-primary)]">Multi-Agent Editorial Board</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--state-danger)]">❌ Single unspecialized model</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--text-muted)]">—</td>
                      <td className="p-4 sm:p-5 text-center font-bold text-[color:var(--state-success)] bg-[color:var(--accent-subtle)]">✅ 4 Specialized Reviewers</td>
                    </tr>
                    <tr>
                      <td className="p-4 sm:p-5 font-semibold text-[color:var(--text-primary)]">Journal Compliance Checks</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--state-danger)]">❌ Manual formatting needed</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--text-secondary)]">⚠️ Basic CSL styling only</td>
                      <td className="p-4 sm:p-5 text-center font-bold text-[color:var(--state-success)] bg-[color:var(--accent-subtle)]">✅ Word limits + Section Audits</td>
                    </tr>
                    <tr>
                      <td className="p-4 sm:p-5 font-semibold text-[color:var(--text-primary)]">Offline / Local AI Support</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--state-danger)]">❌ Cloud-only</td>
                      <td className="p-4 sm:p-5 text-center text-[color:var(--state-success)]">✅ Local storage</td>
                      <td className="p-4 sm:p-5 text-center font-bold text-[color:var(--state-success)] bg-[color:var(--accent-subtle)]">✅ Ollama, LM Studio & BYOK</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* CTA BANNER */}
        <section className="px-4 sm:px-6 lg:px-8 py-20 bg-[color:var(--surface-raised)] border-t border-[color:var(--border-subtle)] text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-black text-[color:var(--text-primary)] tracking-tight mb-4">
              Accelerate Your Research Without Sacrificing Rigour
            </h2>
            <p className="text-base sm:text-lg text-[color:var(--text-secondary)] max-w-2xl mx-auto mb-8">
              Join thousands of scholars worldwide organizing their literature, guaranteeing citation integrity, and publishing faster.
            </p>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="px-10 py-4 rounded-xl text-lg font-bold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] shadow-lg hover:bg-[color:var(--accent-hover)] transition-all hover:scale-105 active:scale-98 inline-flex items-center gap-3 cursor-pointer"
            >
              Get Started for Free
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
            <p className="text-xs text-[color:var(--text-muted)] mt-4">
              Free forever for individual local researchers. No credit card required.
            </p>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-[color:var(--border-subtle)] py-10 px-6 bg-[color:var(--surface-canvas)]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-[color:var(--text-muted)]">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[color:var(--accent)] text-white flex items-center justify-center">
              <ScholarCoreLogo size="sm" className="text-white" />
            </div>
            <span className="font-semibold text-[color:var(--text-secondary)]">
              © {new Date().getFullYear()} Scholar Core. All rights reserved.
            </span>
          </div>
          <div className="flex gap-6 font-medium">
            <a href="#formats-explorer" className="hover:text-[color:var(--text-primary)] transition-colors">
              Formats
            </a>
            <a href="#interactive-demo" className="hover:text-[color:var(--text-primary)] transition-colors">
              Live Demo
            </a>
            <a href="#security" className="hover:text-[color:var(--text-primary)] transition-colors">
              Security
            </a>
          </div>
        </div>
      </footer>

      {/* EMBEDDED AUTH MODAL (Sign In / Sign Up / Multi-Account Switcher) */}
      <EmbeddedAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
        selectedFormatId={selectedFormatId}
      />
    </div>
  );
}
