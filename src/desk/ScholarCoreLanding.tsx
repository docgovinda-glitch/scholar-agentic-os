import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
    source: "Example source A (illustrative)",
    year: 2024,
    journal: "Example journal: not a real publication",
    quote: "The passage in your own PDF that supports this sentence appears here, quoted word for word.",
    page: "Page 14, Paragraph 3",
    confidence: "Exact quote found",
    badgeColor: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  2: {
    id: 2,
    label: "[2]",
    source: "Example source B (illustrative)",
    year: 2023,
    journal: "Example journal: not a real publication",
    quote: "A second supporting passage from a source in your Knowledge Vault, with its page and figure reference.",
    page: "Page 8, Figure 4B",
    confidence: "Exact quote found",
    badgeColor: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
};

const AGENT_ROLES = [
  {
    id: "auditor",
    name: "Citation Auditor",
    title: "Provenance Verification",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    badge: "Active guard",
    description: "Scans every sentence against your private Knowledge Vault. Flags unsupported assertions or paraphrasing drift before publication.",
    critique: "Example: Claim #4 matches a quoted passage in Source A [PDF p.14]. Claim #7 has no supporting source and is flagged.",
    status: "PASS",
  },
  {
    id: "methodologist",
    name: "The Methodologist",
    title: "Statistical & Experimental Rigour",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    badge: "Peer review",
    description: "Evaluates sample sizes, control groups, statistical tests, and study limitations according to international CONSORT/STROBE/PRISMA standards.",
    critique: "Example: Sample size is reported but no power calculation is given. Multiple comparisons are made without a stated correction.",
    status: "VALIDATED",
  },
  {
    id: "coherence",
    name: "Voice & Tone Architect",
    title: "Academic Register Harmonization",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
    badge: "Style engine",
    description: "Maintains high-impact scholarly prose, eliminates colloquialisms, and balances active vs passive voice based on your chosen target discipline.",
    critique: "Example: Readability and register are checked against your target journal's style, section by section.",
    status: "OPTIMIZED",
  },
  {
    id: "compliance",
    name: "Journal Compliance Warden",
    title: "Instant Author Guideline Auditing",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    badge: "Publisher gate",
    description: "Enforces target journal word counts, required headings, abstract structured constraints, and citation formatting (APA, IEEE, Vancouver, Nature).",
    critique: "Example: Word count checked against your journal's limit; abstract headings and reference style checked against its guidelines.",
    status: "COMPLIANT",
  },
];

function FormatIcon({ id, className = "w-4 h-4" }: { id: string; className?: string }) {
  switch (id) {
    case "OT-01":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "OT-10":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "OT-09":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5" />
        </svg>
      );
    case "OT-19":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "OT-22":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      );
    case "OT-07":
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14M16 10l4 4m0-4l-4 4" />
        </svg>
      );
  }
}

const FORMAT_FAMILIES = [
  {
    id: "short_form",
    label: "Assignment",
    icon: "OT-01",
    desc: "Dedicated 4-phase brief intake, scholarly sourcing, grounded drafting & submission audit workspace.",
    formats: [
      {
        id: "OT-01",
        label: "Assignment",
        words: "800 – 4,000 words",
        sections: "Brief Analysis → Research Plan → Evidence Board → Critical Synthesis → Adaptive Outline → Grounded Drafting → 10-Point Submission Audit",
        bestFor: "Coursework essays, reports, reflections, and case studies (Undergraduate & Postgraduate).",
      },
    ],
  },
  {
    id: "publication",
    label: "Journal Article",
    icon: "OT-10",
    desc: "25-stage peer-reviewed empirical & review paper pipeline with peer review simulator.",
    formats: [
      {
        id: "OT-10",
        label: "Journal Article",
        words: "4,000 – 10,000 words",
        sections: "Journal Discovery → Literature Matrix → Gap Analysis → IMRaD Drafting → Multi-Agent Peer Review",
        bestFor: "Empirical research & literature reviews for Nature, IEEE, Elsevier & Springer.",
      },
    ],
  },
  {
    id: "long_form",
    label: "Thesis / Dissertation",
    icon: "OT-09",
    desc: "Comprehensive multi-chapter milestone framework with defense preparation.",
    formats: [
      {
        id: "OT-09",
        label: "Thesis / Dissertation",
        words: "10,000 – 80,000 words",
        sections: "Proposal & Theory → Literature Review → Methodology → Findings → Discussion → Defense Preparation",
        bestFor: "Undergraduate capstones, Master's theses, and PhD doctoral dissertations.",
      },
    ],
  },
  {
    id: "proposal_funding",
    label: "Research Proposal",
    icon: "OT-19",
    desc: "Competitive grant applications and research plans with strict agency rubric alignment.",
    formats: [
      {
        id: "OT-19",
        label: "Research Proposal",
        words: "3,000 – 15,000 words",
        sections: "Specific Aims → Research Significance → Methodological Design → Ethics & Timeline Budgeting",
        bestFor: "Institutional grant proposals, ethics applications, and funded research candidacy.",
      },
    ],
  },
  {
    id: "presentation",
    label: "Presentation",
    icon: "OT-22",
    desc: "High-impact visual communication and narrative scripts for symposiums and oral defenses.",
    formats: [
      {
        id: "OT-22",
        label: "Presentation",
        words: "10 – 35 slides",
        sections: "Core Takeaways → Visual Methodology → Empirical Synthesis → Defense & Q&A Preparation",
        bestFor: "Conference slide decks, symposium talks, and oral thesis defense presentations.",
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [scrolled, setScrolled] = useState(false);
  const [activeCitation, setActiveCitation] = useState<number | null>(1);
  const [activeAgent, setActiveAgent] = useState<string>("auditor");
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

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-neutral-900 font-sans antialiased relative overflow-x-hidden selection:bg-neutral-900 selection:text-white">
      {/* Top Header */}
      <header
        className={`fixed top-0 inset-x-0 z-40 bg-[#F7F5F0]/90 backdrop-blur-md border-b border-neutral-200/80 transition-all duration-200 ${
          scrolled ? "py-2.5 shadow-xs" : "py-3 md:py-4"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 md:px-8 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <ScholarCoreLogo size="sm" className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-neutral-900 leading-none">
                Scholar Core
              </span>
              <span className="text-xs font-medium text-neutral-500 mt-1">
                Scholar Workspace OS
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-600">
            <a href="#formats-explorer" className="hover:text-neutral-900 transition-colors">
              Workspaces
            </a>
            <a href="#interactive-demo" className="hover:text-neutral-900 transition-colors">
              Live Demo
            </a>
            <a href="#editorial-board" className="hover:text-neutral-900 transition-colors">
              Editorial Board
            </a>
            <a href="#security" className="hover:text-neutral-900 transition-colors">
              Vault & Privacy
            </a>
            <a href="#comparison" className="hover:text-neutral-900 transition-colors">
              Comparison
            </a>
          </nav>

          <div className="hidden sm:flex items-center gap-3">
            <button
              type="button"
              onClick={() => openAuth("signin")}
              className="text-sm font-medium text-neutral-700 hover:text-neutral-900 px-4 py-2 rounded-full border border-neutral-200 bg-white hover:border-neutral-300 transition-all cursor-pointer shadow-2xs"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="px-4 py-2 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              Enter Workspace →
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl border border-neutral-200 text-neutral-700 bg-white shadow-2xs"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#F7F5F0]/95 backdrop-blur-md border-b border-neutral-200 px-6 py-4 flex flex-col gap-3 text-sm font-medium">
            <a
              href="#formats-explorer"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 text-neutral-700 hover:text-neutral-900"
            >
              Workspaces
            </a>
            <a
              href="#interactive-demo"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 text-neutral-700 hover:text-neutral-900"
            >
              Live Demo
            </a>
            <a
              href="#editorial-board"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 text-neutral-700 hover:text-neutral-900"
            >
              Editorial Board
            </a>
            <a
              href="#security"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 text-neutral-700 hover:text-neutral-900"
            >
              Vault & Privacy
            </a>
            <div className="pt-3 border-t border-neutral-200 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuth("signin");
                }}
                className="w-full py-2.5 text-center text-sm font-medium rounded-full border border-neutral-200 bg-white text-neutral-800"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/projects");
                }}
                className="w-full py-2.5 text-center text-sm font-semibold bg-neutral-900 text-white rounded-full"
              >
                Enter Workspace →
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="relative z-10 pt-24 sm:pt-28">
        {/* HERO SECTION */}
        <section id="hero" className="px-4 sm:px-6 lg:px-8 pt-6 pb-12 max-w-7xl mx-auto flex flex-col items-center">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-neutral-200 bg-white shadow-2xs mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-neutral-700">
              Verifiable autonomous research engine
            </span>
          </div>

          {/* Main Hero Header */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-center mb-4 leading-[1.1] text-neutral-900 max-w-5xl">
            Research at the speed of thought. <br className="hidden sm:inline" />
            <span className="text-neutral-600">Every claim traced to your own sources.</span>
          </h1>

          <p className="text-base sm:text-lg text-neutral-600 text-center max-w-3xl mx-auto mb-8 leading-relaxed font-normal">
            From raw literature search and PDF extraction to publication-ready manuscripts with{" "}
            <strong className="text-neutral-900 font-semibold">
              citations checked against the sources in your vault
            </strong>
            , multi-agent editorial review, and strict journal compliance.
          </p>

          {/* Interactive Live Research Prompt Bar */}
          <div className="w-full max-w-2xl mb-8 p-1.5 rounded-full bg-white border border-neutral-200 shadow-sm flex flex-col sm:flex-row gap-2 transition-shadow focus-within:shadow-md focus-within:border-neutral-300">
            <div className="flex-1 flex items-center gap-2.5 px-3 py-1.5">
              <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Enter research topic (e.g. CRISPR-Cas9 Base Editing Fidelity)..."
                className="w-full bg-transparent text-sm font-normal text-neutral-900 outline-none placeholder:text-neutral-400 px-2"
              />
            </div>
            <button
              type="button"
              onClick={() => openAuth("signup", "OT-10")}
              className="px-6 py-2.5 bg-neutral-900 text-white rounded-full text-xs font-semibold hover:bg-black transition-all shrink-0 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <span>Get Started</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

          {/* Quick Topic Suggestions */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-12 text-xs text-neutral-600">
            <span className="font-semibold text-neutral-500">Try live:</span>
            {SUGGESTED_TOPICS.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => {
                  setCustomTopic(topic);
                  const demoElem = document.getElementById("interactive-demo");
                  if (demoElem) demoElem.scrollIntoView({ behavior: "smooth" });
                }}
                className="px-3 py-1 rounded-full bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:text-neutral-900 transition-all cursor-pointer text-xs font-medium shadow-2xs"
              >
                {topic}
              </button>
            ))}
          </div>

          {/* 5 CURATED ACADEMIC WORKSPACES */}
          <div id="formats-explorer" className="w-full scroll-mt-24 pt-8 border-t border-neutral-200/80">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 shadow-2xs">
                5 Dedicated academic workspaces
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 mt-3">
                Engineered for every stage of scholarship
              </h2>
              <p className="text-neutral-600 mt-2 text-sm leading-relaxed max-w-2xl mx-auto font-normal">
                Each workspace provides dedicated workflow stages, evidence pipelines, and discipline-specific quality rubrics.
              </p>
            </div>

            {/* 6 Curated Workspace Cards Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FORMAT_FAMILIES.map((fam) => {
                const fmt = fam.formats[0];

                return (
                  <div
                    key={fmt.id}
                    className="p-6 rounded-2xl border border-neutral-200/80 bg-white hover:border-neutral-300 hover:shadow-md shadow-sm transition-all flex flex-col justify-between group text-left"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-neutral-50 border border-neutral-200/80 text-neutral-800 flex items-center justify-center shadow-2xs">
                            <FormatIcon id={fmt.id} className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-600">
                            {fmt.id}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                          Ready to boot
                        </span>
                      </div>
                      <h3 className="font-bold text-lg text-neutral-900 mb-1 tracking-tight">
                        {fmt.label}
                      </h3>
                      <p className="text-xs text-neutral-500 mb-2 font-medium">
                        Budget: {fmt.words}
                      </p>
                      <p className="text-xs sm:text-sm text-neutral-600 mb-4 leading-relaxed font-normal">
                        {fmt.bestFor}
                      </p>
                      <div className="text-xs text-neutral-600 pt-3 border-t border-neutral-100">
                        <span className="font-semibold text-neutral-800 block mb-1 text-xs">
                          Dedicated pipeline:
                        </span>
                        <span className="text-xs leading-relaxed text-neutral-600 font-normal">
                          {fmt.sections}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 pt-3 border-t border-neutral-100">
                      <button
                        type="button"
                        onClick={() => openAuth("signup", fmt.id)}
                        className="w-full py-2.5 rounded-full text-xs font-semibold text-white bg-neutral-900 hover:bg-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
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
        <section id="interactive-demo" className="px-4 sm:px-6 lg:px-8 py-16 scroll-mt-24 bg-transparent border-y border-neutral-200/80">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 shadow-2xs">
                Illustrative example: sample text, not real sources
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 mt-3">
                Click any citation to verify provenance
              </h2>
              <p className="text-neutral-600 mt-2 text-sm leading-relaxed font-normal">
                Scholar Core maps every sentence directly to verbatim evidence inside your private Knowledge Vault.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200/80 bg-white shadow-md overflow-hidden">
              {/* App Mock Window Header */}
              <div className="h-11 border-b border-neutral-200/80 bg-neutral-50/70 flex items-center justify-between px-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-neutral-300" />
                  <span className="w-3 h-3 rounded-full bg-neutral-300" />
                  <span className="w-3 h-3 rounded-full bg-neutral-300" />
                  <span className="ml-3 text-xs text-neutral-400 hidden sm:inline font-medium">
                    scholar-os://workspace/empirical-article-ot10/results
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-medium">
                    Quality gate: 5/5 passed
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-neutral-900 text-white text-xs font-medium">
                    Target: your journal
                  </span>
                </div>
              </div>

              {/* Two-Pane Interactive Demo */}
              <div className="grid lg:grid-cols-12 min-h-[460px]">
                {/* Left Pane: Manuscript Text with Interactive Citations */}
                <div className="lg:col-span-7 p-6 sm:p-8 bg-white border-b lg:border-b-0 lg:border-r border-neutral-200/80 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-100">
                      <span className="text-xs font-semibold text-neutral-500">
                        Manuscript draft — Section 3.2: Efficacy metrics
                      </span>
                      <span className="text-xs text-neutral-400 font-normal">Word count: 3,842</span>
                    </div>

                    <h3 className="text-xl font-bold text-neutral-900 mb-4 leading-snug tracking-tight">
                      Comparative Analysis of In Vivo Cleavage and Repair Fidelity
                    </h3>

                    <div className="space-y-4 text-neutral-800 text-sm sm:text-base leading-relaxed font-normal">
                      <p>
                        High-throughput genomic screening revealed that targeted nucleotide modifications achieved
                        statistically superior fidelity when compared against traditional endonucleases. Quantitative
                        evaluation in primate cell lineages confirmed a significant reduction in unintended genomic
                        cleavage{" "}
                        <button
                          type="button"
                          onClick={() => setActiveCitation(1)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold text-xs transition-all cursor-pointer ${
                            activeCitation === 1
                              ? "bg-neutral-900 text-white shadow-sm"
                              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200/80 border border-neutral-200/80"
                          }`}
                        >
                          [1] Source A 2024
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
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold text-xs transition-all cursor-pointer ${
                            activeCitation === 2
                              ? "bg-neutral-900 text-white shadow-sm"
                              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200/80 border border-neutral-200/80"
                          }`}
                        >
                          [2] Source B 2023
                        </button>
                        . These parameters substantiate clinical viability for downstream therapeutic translation.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-600">
                    <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Auto-citation resolver active
                    </span>
                    <span className="text-neutral-400 font-normal">Click citations above to inspect evidence</span>
                  </div>
                </div>

                {/* Right Pane: Live Evidence & Citation Inspector */}
                <div className="lg:col-span-5 p-6 sm:p-8 bg-neutral-50/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-200/80">
                      <span className="text-xs font-bold text-neutral-800 flex items-center gap-2">
                        Knowledge Vault Provenance Inspector
                      </span>
                    </div>

                    {activeCitation && SAMPLE_CITATIONS[activeCitation] ? (
                      <div className="space-y-3">
                        <div className="p-4 rounded-xl bg-white border border-neutral-200/80 shadow-2xs">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="font-bold text-xs text-neutral-900 leading-snug">
                              {SAMPLE_CITATIONS[activeCitation].source}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                              {SAMPLE_CITATIONS[activeCitation].confidence}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 mb-3 font-normal">
                            {SAMPLE_CITATIONS[activeCitation].journal}
                          </p>

                          <div className="p-3 rounded-lg bg-neutral-50 border-l-2 border-neutral-900">
                            <span className="text-xs font-semibold text-neutral-700 block mb-1">
                              Extracted verbatim proof from PDF:
                            </span>
                            <blockquote className="text-xs italic text-neutral-800 leading-relaxed font-normal">
                              "{SAMPLE_CITATIONS[activeCitation].quote}"
                            </blockquote>
                          </div>

                          <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                            <span>{SAMPLE_CITATIONS[activeCitation].page}</span>
                            <span>SHA-256 Vault Hash Verified</span>
                          </div>
                        </div>

                        {/* Automated Quality Signoff Status */}
                        <div className="p-3.5 rounded-xl bg-white border border-neutral-200/80 shadow-2xs flex items-start gap-3">
                          <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold shadow-2xs">
                            ✓
                          </div>
                          <div>
                            <span className="font-bold text-xs text-neutral-900 block">
                              Example: sentence matched to a quoted passage
                            </span>
                            <span className="text-xs text-neutral-500 leading-normal font-normal">
                              Assertion supported by verified vault vectors with exact page bounds.
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-16 text-center text-xs text-neutral-400">
                        Select a citation tag in the manuscript to view live proof.
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-neutral-200/80">
                    <button
                      type="button"
                      onClick={() => openAuth("signup", "OT-10")}
                      className="w-full py-2.5 rounded-full bg-neutral-900 text-white text-xs font-semibold hover:bg-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      Run Citation Audit on Your Own PDFs →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MULTI-AGENT EDITORIAL BOARD */}
        <section id="editorial-board" className="px-4 sm:px-6 lg:px-8 py-16 bg-transparent scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 shadow-2xs">
                Autonomous quality assurance
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 mt-3">
                An AI editorial board on your desktop
              </h2>
              <p className="text-neutral-600 mt-2 text-sm leading-relaxed max-w-2xl mx-auto font-normal">
                Four specialized agents review and critique your manuscript across every critical academic dimension before journal submission.
              </p>
            </div>

            {/* Agent Selector Tabs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {AGENT_ROLES.map((agent) => {
                const isActive = agent.id === activeAgent;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setActiveAgent(agent.id)}
                    className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? "border-neutral-900 bg-white shadow-md ring-1 ring-neutral-900/10"
                        : "border-neutral-200/80 bg-white/70 hover:bg-white hover:border-neutral-300 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center">
                        {agent.icon}
                      </div>
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200/60">
                        {agent.badge}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-neutral-900">{agent.name}</h4>
                      <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1 font-normal">{agent.title}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Agent Detail Card */}
            <div className="p-6 sm:p-8 rounded-2xl border border-neutral-200/80 bg-white shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-neutral-100">
                <div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                    Active agent inspection
                  </span>
                  <h3 className="text-xl font-bold text-neutral-900 mt-2 tracking-tight">{selectedAgent.name}</h3>
                  <p className="text-sm text-neutral-600 mt-1 leading-relaxed font-normal">{selectedAgent.description}</p>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto text-xs">
                  <span className="text-neutral-500 font-medium">Verification:</span>
                  <span className="px-3 py-1 rounded-full font-semibold bg-neutral-900 text-white shadow-2xs">
                    ✓ {selectedAgent.status}
                  </span>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-neutral-50/70 border border-neutral-200/80">
                <span className="text-xs font-semibold text-neutral-700 block mb-2">
                  Agent telemetry & review feedback:
                </span>
                <p className="text-sm text-neutral-800 leading-relaxed bg-white p-4 rounded-lg border border-neutral-200/60 font-normal">
                  {selectedAgent.critique}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* PRIVACY, LOCAL RUNNER & VAULT ARCHITECTURE */}
        <section id="security" className="px-4 sm:px-6 lg:px-8 py-16 bg-transparent border-y border-neutral-200/80 scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 shadow-2xs">
                  Research sovereignty & privacy
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 mt-3 leading-tight">
                  Your unpublished discoveries stay yours. Period.
                </h2>
                <p className="text-neutral-600 mt-3 text-sm sm:text-base leading-relaxed font-normal">
                  Academic integrity requires absolute confidentiality. Scholar Core is engineered from the ground up so your raw data, hypotheses, and drafts are never fed back into public model training.
                </p>

                <div className="space-y-4 mt-8">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200/80 text-neutral-800 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-neutral-900">Universal Knowledge Vault with Cloud Sync</h4>
                      <p className="text-xs sm:text-sm text-neutral-600 mt-0.5 leading-relaxed font-normal">
                        Seamlessly sync your research papers, datasets, notes, and citations across all devices with Google Drive, OneDrive, and academic citation formats.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200/80 text-neutral-800 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-neutral-900">Local Offline AI & BYOK (Bring Your Own Key)</h4>
                      <p className="text-xs sm:text-sm text-neutral-600 mt-0.5 leading-relaxed font-normal">
                        Run fully air-gapped on Ollama or LM Studio, or connect your personal Anthropic, OpenAI, or Google Cloud API credentials.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200/80 text-neutral-800 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-neutral-900">Institutional Data Governance</h4>
                      <p className="text-xs sm:text-sm text-neutral-600 mt-0.5 leading-relaxed font-normal">
                        Meets HIPAA and GDPR data minimization standards for academic health centers and defense research institutions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security Blueprint Visual Card */}
              <div className="p-6 sm:p-8 rounded-2xl border border-neutral-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-5">
                  <span className="text-xs font-semibold text-neutral-800">System isolation topology</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Enforced
                  </span>
                </div>

                <div className="space-y-3.5">
                  <div className="p-4 rounded-xl bg-neutral-50/70 border border-neutral-200/80">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-neutral-800" />
                      <span className="text-xs font-semibold text-neutral-900">Client Sandbox (Browser / Desktop)</span>
                    </div>
                    <p className="text-xs text-neutral-600 mt-1 pl-4 leading-relaxed font-normal">
                      Private PDF parsing, AES-256 local vault encryption, and live citation linking execute on your machine.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-50/70 border border-neutral-200/80">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-neutral-800" />
                      <span className="text-xs font-semibold text-neutral-900">AI Gateway & Policy Firewall</span>
                    </div>
                    <p className="text-xs text-neutral-600 mt-1 pl-4 leading-relaxed font-normal">
                      Redacts PII, strips metadata, and routes exclusively through zero-data-retention API endpoints.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-neutral-50/70 border border-neutral-200/80">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-neutral-800" />
                      <span className="text-xs font-semibold text-neutral-900">Export & Journal Packages</span>
                    </div>
                    <p className="text-xs text-neutral-600 mt-1 pl-4 leading-relaxed font-normal">
                      Outputs LaTeX, DOCX, and PDF with formatted reference bibliographies and cover letters.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COMPARISON TABLE */}
        <section id="comparison" className="px-4 sm:px-6 lg:px-8 py-16 scroll-mt-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 shadow-2xs">
                Direct comparison
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 mt-3">
                Why researchers choose Scholar Core
              </h2>
              <p className="text-neutral-600 mt-2 text-sm font-normal">
                Generic chatbots write believable fiction. Scholar Core writes verified science.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200/80 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200/80 bg-neutral-50/70">
                      <th className="p-4 font-semibold text-neutral-800">Capability</th>
                      <th className="p-4 font-semibold text-neutral-500 text-center">Generic LLMs (ChatGPT)</th>
                      <th className="p-4 font-semibold text-neutral-500 text-center">Reference Managers (Zotero)</th>
                      <th className="p-4 font-bold text-white bg-neutral-900 text-center">Scholar Core OS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    <tr>
                      <td className="p-4 font-semibold text-neutral-900 border-r border-neutral-100">Citation Provenance</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">Hallucinates fake papers</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">Stores PDFs only</td>
                      <td className="p-4 text-center font-bold text-neutral-900 bg-neutral-50/80">Checked against your vault sources</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-semibold text-neutral-900 border-r border-neutral-100">Academic Workspaces</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">Generic unstructured chat</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">—</td>
                      <td className="p-4 text-center font-bold text-neutral-900 bg-neutral-50/80">Tailored 8-to-25 Stage Workspaces</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-semibold text-neutral-900 border-r border-neutral-100">Editorial Board</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">Single unspecialized model</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">—</td>
                      <td className="p-4 text-center font-bold text-neutral-900 bg-neutral-50/80">4 Specialized Reviewers</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-semibold text-neutral-900 border-r border-neutral-100">Journal Compliance</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">Manual formatting needed</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">Basic CSL styling only</td>
                      <td className="p-4 text-center font-bold text-neutral-900 bg-neutral-50/80">Word limits + Section Audits</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-semibold text-neutral-900 border-r border-neutral-100">Offline / Local AI Support</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">Cloud-only</td>
                      <td className="p-4 text-center text-neutral-500 border-r border-neutral-100 font-normal">Local storage</td>
                      <td className="p-4 text-center font-bold text-neutral-900 bg-neutral-50/80">Ollama, LM Studio & BYOK</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* CTA BANNER */}
        <section className="px-4 sm:px-6 lg:px-8 py-16 bg-transparent border-t border-neutral-200/80 text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight mb-3">
              Accelerate your research without sacrificing rigour
            </h2>
            <p className="text-sm sm:text-base text-neutral-600 max-w-2xl mx-auto mb-8 leading-relaxed font-normal">
              Join thousands of scholars worldwide organizing their literature, guaranteeing citation integrity, and publishing faster.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/projects")}
                className="px-8 py-3 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-black transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                Enter Scholar Workspace →
              </button>
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="px-8 py-3 rounded-full text-sm font-semibold bg-white text-neutral-800 border border-neutral-300 hover:border-neutral-400 transition-all inline-flex items-center gap-2 cursor-pointer shadow-2xs"
              >
                Sign Up for Free Account
              </button>
            </div>
            <p className="text-xs text-neutral-400 mt-4 font-normal">
              Free forever for individual local researchers. No credit card required.
            </p>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-neutral-200/80 py-8 px-6 bg-[#F7F5F0]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-600">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-neutral-900 text-white flex items-center justify-center shadow-2xs">
              <ScholarCoreLogo size="sm" className="text-white" />
            </div>
            <span className="font-medium text-neutral-700">
              © {new Date().getFullYear()} Scholar Core. All rights reserved.
            </span>
          </div>
          <div className="flex gap-6 font-medium text-neutral-600">
            <a href="#formats-explorer" className="hover:text-neutral-900 transition-colors">
              Workspaces
            </a>
            <a href="#interactive-demo" className="hover:text-neutral-900 transition-colors">
              Live Demo
            </a>
            <a href="#security" className="hover:text-neutral-900 transition-colors">
              Security
            </a>
            <a href="#comparison" className="hover:text-neutral-900 transition-colors">
              Comparison
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
