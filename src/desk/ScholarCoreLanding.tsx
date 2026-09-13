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
    source: "High-efficiency in vivo base editing in primate models",
    year: 2024,
    journal: "Nature Biotechnology, 42(3), 312-324",
    quote: "Observed a 4.2-fold reduction in double-strand break translocations compared to standard SpCas9 nuclease controls (p < 0.001) across all targeted loci.",
    page: "Page 14, Paragraph 3",
    confidence: "99.4% Provenance Match",
    badgeColor: "text-[#334155] bg-transparent border-[#334155]",
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
    badgeColor: "text-[#334155] bg-transparent border-[#334155]",
  },
};

const AGENT_ROLES = [
  {
    id: "auditor",
    name: "Citation Auditor",
    title: "100% Provenance Verification",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="square" strokeLinejoin="miter" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    badge: "Active Guard",
    description: "Scans every sentence against your private Knowledge Vault. Flags unsupported assertions or paraphrasing drift before publication.",
    critique: "Claim #4 verified against Chen et al. (2024) [PDF p.14]. Direct quote concordance 99.4%. Zero hallucination detected.",
    status: "PASS",
  },
  {
    id: "methodologist",
    name: "The Methodologist",
    title: "Statistical & Experimental Rigour",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="square" strokeLinejoin="miter" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    badge: "Peer Review",
    description: "Evaluates sample sizes, control groups, statistical tests, and study limitations according to international CONSORT/STROBE/PRISMA standards.",
    critique: "Cohort size (n=142) satisfies power calculation (β=0.80, α=0.05). Bonferroni correction correctly applied for multiple comparisons.",
    status: "VALIDATED",
  },
  {
    id: "coherence",
    name: "Voice & Tone Architect",
    title: "Academic Register Harmonization",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="square" strokeLinejoin="miter" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
    badge: "Style Engine",
    description: "Maintains high-impact scholarly prose, eliminates colloquialisms, and balances active vs passive voice based on your chosen target discipline.",
    critique: "Calculated Flesch-Kincaid Grade Level: 14.8. Register matches Nature Biotechnology editorial benchmark across Sections 1-4.",
    status: "OPTIMIZED",
  },
  {
    id: "compliance",
    name: "Journal Compliance Warden",
    title: "Instant Author Guideline Auditing",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="square" strokeLinejoin="miter" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    badge: "Publisher Gate",
    description: "Enforces target journal word counts, required headings, abstract structured constraints, and citation formatting (APA, IEEE, Vancouver, Nature).",
    critique: "Word count: 3,840 / 4,500 limit. Abstract structured into Background, Methods, Results, Conclusion. References formatted in Nature style.",
    status: "COMPLIANT",
  },
];

function FormatIcon({ id, className = "w-4 h-4" }: { id: string; className?: string }) {
  switch (id) {
    case "OT-01":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "OT-10":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "OT-09":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5" />
        </svg>
      );
    case "OT-19":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "OT-22":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      );
    case "OT-07":
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="square" strokeLinejoin="miter" d="M4 6h16M4 12h10M4 18h14M16 10l4 4m0-4l-4 4" />
        </svg>
      );
  }
}

const FORMAT_FAMILIES = [
  {
    id: "short_form",
    label: "Assignment",
    icon: "OT-01",
    desc: "Dedicated 8-phase thinking, evidence board & grounded drafting workspace.",
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
    <div className="min-h-screen bg-[#F7F5F0] text-[#1E293B] font-sans antialiased relative overflow-x-hidden selection:bg-[#334155] selection:text-[#F7F5F0]">
      {/* Top Header */}
      <header
        className={`fixed top-0 inset-x-0 z-40 bg-[#F7F5F0] border-b-2 border-[#334155] transition-all duration-200 ${
          scrolled ? "py-2.5" : "py-3 md:py-4"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 md:px-8 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <div className="w-9 h-9 rounded-none border-2 border-[#334155] bg-[#334155] text-[#F7F5F0] flex items-center justify-center flex-shrink-0">
              <ScholarCoreLogo size="sm" className="text-[#F7F5F0]" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-[#1E293B] leading-none uppercase font-sans">
                Scholar Core
              </span>
              <span className="text-[10px] font-mono font-bold text-[#475569] tracking-widest uppercase mt-0.5">
                Research OS // 334.155
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-mono font-bold uppercase tracking-wider text-[#334155]">
            <a href="#formats-explorer" className="hover:text-[#1E293B] transition-colors">
              Workspaces
            </a>
            <a href="#interactive-demo" className="hover:text-[#1E293B] transition-colors">
              Live Demo
            </a>
            <a href="#editorial-board" className="hover:text-[#1E293B] transition-colors">
              Editorial Agents
            </a>
            <a href="#security" className="hover:text-[#1E293B] transition-colors">
              Vault & Privacy
            </a>
            <a href="#comparison" className="hover:text-[#1E293B] transition-colors">
              Comparison
            </a>
          </nav>

          <div className="hidden sm:flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => openAuth("signin")}
              className="text-xs font-mono font-bold text-[#334155] hover:bg-[#334155] hover:text-[#F7F5F0] px-3 py-1.5 rounded-none border border-[#334155] transition-colors cursor-pointer uppercase"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="px-4 py-1.5 rounded-none text-xs font-mono font-bold bg-[#334155] text-[#F7F5F0] border border-[#334155] hover:bg-[#1E293B] shadow-none transition-colors cursor-pointer uppercase tracking-wider flex items-center gap-1.5"
            >
              Enter Workspace →
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-none border border-[#334155] text-[#334155] bg-transparent"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              {mobileMenuOpen ? (
                <path strokeLinecap="square" strokeLinejoin="miter" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="square" strokeLinejoin="miter" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#F7F5F0] border-b-2 border-[#334155] px-6 py-4 flex flex-col gap-3 font-mono text-xs">
            <a
              href="#formats-explorer"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 text-[#334155] font-bold uppercase"
            >
              Workspaces
            </a>
            <a
              href="#interactive-demo"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 text-[#334155] font-bold uppercase"
            >
              Live Demo
            </a>
            <a
              href="#editorial-board"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 text-[#334155] font-bold uppercase"
            >
              Editorial Agents
            </a>
            <a
              href="#security"
              onClick={() => setMobileMenuOpen(false)}
              className="py-1 text-[#334155] font-bold uppercase"
            >
              Vault & Privacy
            </a>
            <div className="pt-3 border-t border-[#334155] flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuth("signin");
                }}
                className="w-full py-2 text-center text-xs font-mono font-bold rounded-none border border-[#334155] uppercase"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate("/projects");
                }}
                className="w-full py-2 text-center text-xs font-mono font-bold bg-[#334155] text-[#F7F5F0] rounded-none border border-[#334155] uppercase"
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-none border border-[#334155] bg-transparent mb-6">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#334155]">
              VERIFIABLE AUTONOMOUS RESEARCH ENGINE // MONOCHROME 334.155
            </span>
          </div>

          {/* Main Hero Header */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-center mb-4 leading-[1.1] text-[#1E293B] max-w-5xl font-sans">
            Research at the Speed of Thought. <br className="hidden sm:inline" />
            <span className="text-[#334155]">Verified to the Standard of Nature.</span>
          </h1>

          <p className="text-sm sm:text-base text-[#334155] text-center max-w-3xl mx-auto mb-8 leading-relaxed font-sans">
            From raw literature search and PDF extraction to publication-ready manuscripts with{" "}
            <strong className="text-[#1E293B] font-bold">
              100% cryptographic citation provenance
            </strong>
            , multi-agent editorial review, and strict journal compliance.
          </p>

          {/* Interactive Live Research Prompt Bar */}
          <div className="w-full max-w-3xl mb-8 p-1.5 rounded-none bg-[#F7F5F0] border border-[#334155] shadow-none flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex items-center gap-2.5 px-3 py-1.5">
              <svg className="w-4 h-4 text-[#334155] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="square" strokeLinejoin="miter" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Enter research topic (e.g. CRISPR-Cas9 Base Editing Fidelity)..."
                className="w-full bg-transparent text-xs font-mono text-[#1E293B] outline-none placeholder:text-[#475569]"
              />
            </div>
            <button
              type="button"
              onClick={() => openAuth("signup", "OT-10")}
              className="px-6 py-2.5 bg-[#334155] text-[#F7F5F0] rounded-none border border-[#334155] text-xs font-mono font-bold uppercase tracking-wider hover:bg-[#1E293B] transition-colors shrink-0 flex items-center justify-center gap-2 cursor-pointer shadow-none"
            >
              <span>Assemble Pipeline</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="square" strokeLinejoin="miter" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

          {/* Quick Topic Suggestions */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10 text-xs text-[#475569] font-mono">
            <span className="font-bold uppercase tracking-wider text-[10px] text-[#334155]">Try Live:</span>
            {SUGGESTED_TOPICS.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => {
                  setCustomTopic(topic);
                  const demoElem = document.getElementById("interactive-demo");
                  if (demoElem) demoElem.scrollIntoView({ behavior: "smooth" });
                }}
                className="px-2.5 py-1 rounded-none bg-transparent border border-[#334155] text-[#334155] hover:bg-[#334155] hover:text-[#F7F5F0] transition-colors cursor-pointer text-xs"
              >
                {topic}
              </button>
            ))}
          </div>

          {/* 5 CURATED ACADEMIC WORKSPACES */}
          <div id="formats-explorer" className="w-full scroll-mt-24 pt-6 border-t-2 border-[#334155]">
            <div className="text-center max-w-3xl mx-auto mb-8">
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#334155] px-2 py-0.5 border border-[#334155]">
                5 DEDICATED ACADEMIC WORKSPACES
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1E293B] mt-3 font-sans">
                Engineered for Every Stage of Scholarship
              </h2>
              <p className="text-[#334155] mt-1 text-xs sm:text-sm font-sans">
                Each workspace provides dedicated workflow stages, evidence pipelines, and discipline-specific quality rubrics.
              </p>
            </div>

            {/* 6 Curated Workspace Cards Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FORMAT_FAMILIES.map((fam) => {
                const fmt = fam.formats[0];

                return (
                  <div
                    key={fmt.id}
                    className="p-5 rounded-none border border-[#334155] bg-[#F7F5F0] hover:bg-[#334155]/5 shadow-none transition-colors flex flex-col justify-between group text-left"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-none border border-[#334155] bg-transparent text-[#334155] flex items-center justify-center">
                            <FormatIcon id={fmt.id} className="w-4 h-4" />
                          </div>
                          <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-none bg-transparent text-[#334155] border border-[#334155]">
                            {fmt.id}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-[#334155] bg-transparent px-2 py-0.5 rounded-none border border-[#334155] uppercase">
                          Ready to Boot
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-[#1E293B] mb-1 font-sans">
                        {fmt.label}
                      </h3>
                      <p className="text-xs text-[#334155] mb-2 font-mono font-bold uppercase tracking-wider">
                        Budget: {fmt.words}
                      </p>
                      <p className="text-xs text-[#475569] mb-4 leading-relaxed font-sans">
                        {fmt.bestFor}
                      </p>
                      <div className="text-xs text-[#475569] pt-3 border-t border-[#334155]">
                        <span className="font-bold font-mono text-[#334155] block mb-1 text-[10px] uppercase tracking-wider">
                          Dedicated Pipeline:
                        </span>
                        <span className="text-xs leading-relaxed text-[#1E293B] font-sans">
                          {fmt.sections}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-[#334155]">
                      <button
                        type="button"
                        onClick={() => openAuth("signup", fmt.id)}
                        className="w-full py-2.5 rounded-none text-xs font-mono font-bold uppercase tracking-wider text-[#F7F5F0] bg-[#334155] hover:bg-[#1E293B] border border-[#334155] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-none"
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
        <section id="interactive-demo" className="px-4 sm:px-6 lg:px-8 py-16 scroll-mt-24 bg-[#F7F5F0] border-y-2 border-[#334155]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#334155] px-2 py-0.5 border border-[#334155]">
                Live Interactive Workspace
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1E293B] mt-3 font-sans">
                Click any citation to verify provenance
              </h2>
              <p className="text-[#334155] mt-2 text-xs sm:text-sm font-sans">
                Scholar Core maps every sentence directly to verbatim evidence inside your private Knowledge Vault.
              </p>
            </div>

            <div className="rounded-none border-2 border-[#334155] bg-[#F7F5F0] shadow-none overflow-hidden">
              {/* App Mock Window Header */}
              <div className="h-10 border-b border-[#334155] bg-[#F7F5F0] flex items-center justify-between px-4 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-none border border-[#334155] bg-transparent" />
                  <span className="w-2.5 h-2.5 rounded-none border border-[#334155] bg-transparent" />
                  <span className="w-2.5 h-2.5 rounded-none border border-[#334155] bg-transparent" />
                  <span className="ml-3 text-[11px] font-mono text-[#475569] hidden sm:inline">
                    scholar-os://workspace/empirical-article-ot10/results
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-none bg-transparent text-[#334155] border border-[#334155] text-[10px] font-mono font-bold uppercase">
                    Quality Gate: 5/5 PASSED
                  </span>
                  <span className="px-2 py-0.5 rounded-none bg-[#334155] text-[#F7F5F0] border border-[#334155] text-[10px] font-mono font-bold uppercase">
                    Target: Nature Biotech
                  </span>
                </div>
              </div>

              {/* Two-Pane Interactive Demo */}
              <div className="grid lg:grid-cols-12 min-h-[460px]">
                {/* Left Pane: Manuscript Text with Interactive Citations */}
                <div className="lg:col-span-7 p-6 sm:p-8 bg-[#F7F5F0] border-b lg:border-b-0 lg:border-r border-[#334155] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#334155]">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#334155]">
                        Manuscript Draft — Section 3.2: Efficacy Metrics
                      </span>
                      <span className="text-[11px] font-mono text-[#475569]">Word Count: 3,842</span>
                    </div>

                    <h3 className="text-lg font-bold text-[#1E293B] mb-4 leading-snug font-sans">
                      Comparative Analysis of In Vivo Cleavage and Repair Fidelity
                    </h3>

                    <div className="space-y-4 text-[#1E293B] text-sm leading-relaxed font-sans">
                      <p>
                        High-throughput genomic screening revealed that targeted nucleotide modifications achieved
                        statistically superior fidelity when compared against traditional endonucleases. Quantitative
                        evaluation in primate cell lineages confirmed a significant reduction in unintended genomic
                        cleavage{" "}
                        <button
                          type="button"
                          onClick={() => setActiveCitation(1)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none font-bold font-mono text-xs transition-colors cursor-pointer border border-[#334155] ${
                            activeCitation === 1
                              ? "bg-[#334155] text-[#F7F5F0]"
                              : "bg-transparent text-[#334155] hover:bg-[#334155]/10"
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
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none font-bold font-mono text-xs transition-colors cursor-pointer border border-[#334155] ${
                            activeCitation === 2
                              ? "bg-[#334155] text-[#F7F5F0]"
                              : "bg-transparent text-[#334155] hover:bg-[#334155]/10"
                          }`}
                        >
                          [2] Cell Stem Cell 2023
                        </button>
                        . These parameters substantiate clinical viability for downstream therapeutic translation.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-3 border-t border-[#334155] flex items-center justify-between text-xs font-mono text-[#334155]">
                    <span className="flex items-center gap-1.5 font-bold">
                      <span className="w-2 h-2 rounded-none bg-[#334155]" />
                      Auto-Citation Resolver Active
                    </span>
                    <span className="text-[#475569]">Click citations above to inspect evidence</span>
                  </div>
                </div>

                {/* Right Pane: Live Evidence & Citation Inspector */}
                <div className="lg:col-span-5 p-6 sm:p-8 bg-[#F7F5F0] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#334155]">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#334155] flex items-center gap-2">
                        Knowledge Vault Provenance Inspector
                      </span>
                    </div>

                    {activeCitation && SAMPLE_CITATIONS[activeCitation] ? (
                      <div className="space-y-3">
                        <div className="p-4 rounded-none bg-transparent border border-[#334155]">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="font-bold text-xs text-[#1E293B] font-sans leading-tight">
                              {SAMPLE_CITATIONS[activeCitation].source}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-none text-[10px] font-mono font-bold border border-[#334155] text-[#334155] shrink-0">
                              {SAMPLE_CITATIONS[activeCitation].confidence}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-[#475569] mb-3">
                            {SAMPLE_CITATIONS[activeCitation].journal}
                          </p>

                          <div className="p-3 rounded-none bg-transparent border-l-2 border-[#334155]">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#334155] block mb-1">
                              Extracted Verbatim Proof from PDF:
                            </span>
                            <blockquote className="text-xs italic text-[#1E293B] leading-relaxed font-sans">
                              "{SAMPLE_CITATIONS[activeCitation].quote}"
                            </blockquote>
                          </div>

                          <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-[#475569]">
                            <span>{SAMPLE_CITATIONS[activeCitation].page}</span>
                            <span>SHA-256 Vault Hash Verified</span>
                          </div>
                        </div>

                        {/* Automated Quality Signoff Status */}
                        <div className="p-3.5 rounded-none bg-transparent border border-[#334155] flex items-start gap-3">
                          <div className="w-4 h-4 rounded-none border border-[#334155] bg-[#334155] text-[#F7F5F0] flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-mono font-bold">
                            ✓
                          </div>
                          <div>
                            <span className="font-mono font-bold text-xs text-[#1E293B] block uppercase tracking-wider">
                              Integrity Gate: ZERO Hallucination Confirmed
                            </span>
                            <span className="text-xs text-[#475569] font-sans leading-tight">
                              Assertion supported by verified vault vectors with exact page bounds.
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-16 text-center text-xs font-mono text-[#475569]">
                        Select a citation tag in the manuscript to view live proof.
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#334155]">
                    <button
                      type="button"
                      onClick={() => openAuth("signup", "OT-10")}
                      className="w-full py-2.5 rounded-none bg-[#334155] text-[#F7F5F0] text-xs font-mono font-bold uppercase tracking-wider hover:bg-[#1E293B] border border-[#334155] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-none"
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
        <section id="editorial-board" className="px-4 sm:px-6 lg:px-8 py-16 bg-[#F7F5F0] scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#334155] px-2 py-0.5 border border-[#334155]">
                Autonomous Quality Assurance
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1E293B] mt-3 font-sans">
                An AI Editorial Board on Your Desktop
              </h2>
              <p className="text-[#334155] mt-1 text-xs sm:text-sm font-sans">
                Four specialized agents review and critique your manuscript across every critical academic dimension before journal submission.
              </p>
            </div>

            {/* Agent Selector Tabs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {AGENT_ROLES.map((agent) => {
                const isActive = agent.id === activeAgent;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setActiveAgent(agent.id)}
                    className={`p-4 rounded-none border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? "border-2 border-[#334155] bg-[#334155]/5"
                        : "border border-[#334155] bg-[#F7F5F0] hover:bg-[#334155]/5"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8 h-8 rounded-none border border-[#334155] bg-transparent text-[#334155] flex items-center justify-center">
                        {agent.icon}
                      </div>
                      <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 border border-[#334155] text-[#334155]">
                        {agent.badge}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#1E293B] font-sans">{agent.name}</h4>
                      <p className="text-xs text-[#475569] font-mono mt-0.5 line-clamp-1">{agent.title}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Agent Detail Card */}
            <div className="p-6 rounded-none border-2 border-[#334155] bg-[#F7F5F0] shadow-none">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-[#334155]">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#334155] px-1.5 py-0.5 border border-[#334155]">
                    Active Agent Inspection
                  </span>
                  <h3 className="text-xl font-black text-[#1E293B] mt-2 font-sans">{selectedAgent.name}</h3>
                  <p className="text-xs text-[#475569] mt-0.5 font-sans">{selectedAgent.description}</p>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto font-mono text-xs">
                  <span className="text-[#475569]">Verification:</span>
                  <span className="px-2 py-0.5 rounded-none font-bold bg-[#334155] text-[#F7F5F0] border border-[#334155]">
                    ✓ {selectedAgent.status}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-none bg-transparent border border-[#334155]">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#334155] block mb-2">
                  Agent Telemetry & Review Feedback:
                </span>
                <p className="text-xs text-[#1E293B] leading-relaxed font-mono bg-transparent p-3 border border-[#334155]/30">
                  {selectedAgent.critique}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* PRIVACY, LOCAL RUNNER & VAULT ARCHITECTURE */}
        <section id="security" className="px-4 sm:px-6 lg:px-8 py-16 bg-[#F7F5F0] border-y-2 border-[#334155] scroll-mt-20">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#334155] px-2 py-0.5 border border-[#334155]">
                  Research Sovereignty & Privacy
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1E293B] mt-3 leading-tight font-sans">
                  Your Unpublished Discoveries Stay Yours. Period.
                </h2>
                <p className="text-[#334155] mt-3 text-xs sm:text-sm leading-relaxed font-sans">
                  Academic integrity requires absolute confidentiality. Scholar Core is engineered from the ground up so your raw data, hypotheses, and drafts are never fed back into public model training.
                </p>

                <div className="space-y-4 mt-6">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-none border border-[#334155] bg-transparent text-[#334155] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="square" strokeLinejoin="miter" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#1E293B] font-sans">Universal Knowledge Vault with Cloud Sync</h4>
                      <p className="text-xs text-[#475569] mt-0.5 leading-relaxed font-sans">
                        Seamlessly sync your research papers, datasets, notes, and citations across all devices with Google Drive, OneDrive, and academic citation formats.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-none border border-[#334155] bg-transparent text-[#334155] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="square" strokeLinejoin="miter" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#1E293B] font-sans">Local Offline AI & BYOK (Bring Your Own Key)</h4>
                      <p className="text-xs text-[#475569] mt-0.5 leading-relaxed font-sans">
                        Run fully air-gapped on Ollama or LM Studio, or connect your personal Anthropic, OpenAI, or Google Cloud API credentials.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-none border border-[#334155] bg-transparent text-[#334155] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="square" strokeLinejoin="miter" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-[#1E293B] font-sans">Institutional Data Governance</h4>
                      <p className="text-xs text-[#475569] mt-0.5 leading-relaxed font-sans">
                        Meets HIPAA and GDPR data minimization standards for academic health centers and defense research institutions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security Blueprint Visual Card */}
              <div className="p-6 rounded-none border-2 border-[#334155] bg-[#F7F5F0] shadow-none">
                <div className="flex items-center justify-between pb-3 border-b border-[#334155] mb-4">
                  <span className="text-xs font-mono font-bold text-[#334155]">SYSTEM_ISOLATION_TOPOLOGY</span>
                  <span className="px-2 py-0.5 rounded-none text-[10px] font-mono font-bold bg-[#334155] text-[#F7F5F0]">
                    ENFORCED
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="p-3 rounded-none bg-transparent border border-[#334155]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-none bg-[#334155]" />
                      <span className="text-xs font-mono font-bold text-[#1E293B]">Client Sandbox (Browser / Desktop)</span>
                    </div>
                    <p className="text-xs text-[#475569] mt-1 pl-4 font-sans">
                      Private PDF parsing, AES-256 local vault encryption, and live citation linking execute on your machine.
                    </p>
                  </div>

                  <div className="p-3 rounded-none bg-transparent border border-[#334155]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-none bg-[#334155]" />
                      <span className="text-xs font-mono font-bold text-[#1E293B]">AI Gateway & Policy Firewall</span>
                    </div>
                    <p className="text-xs text-[#475569] mt-1 pl-4 font-sans">
                      Redacts PII, strips metadata, and routes exclusively through zero-data-retention API endpoints.
                    </p>
                  </div>

                  <div className="p-3 rounded-none bg-transparent border border-[#334155]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-none bg-[#334155]" />
                      <span className="text-xs font-mono font-bold text-[#1E293B]">Export & Journal Packages</span>
                    </div>
                    <p className="text-xs text-[#475569] mt-1 pl-4 font-sans">
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
            <div className="text-center max-w-2xl mx-auto mb-8">
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#334155] px-2 py-0.5 border border-[#334155]">
                Direct Comparison
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1E293B] mt-3 font-sans">
                Why Researchers Choose Scholar Core
              </h2>
              <p className="text-[#334155] mt-1 text-xs sm:text-sm font-sans">
                Generic chatbots write believable fiction. Scholar Core writes verified science.
              </p>
            </div>

            <div className="rounded-none border-2 border-[#334155] bg-[#F7F5F0] shadow-none overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b-2 border-[#334155] bg-[#F7F5F0]">
                      <th className="p-3.5 font-bold text-[#1E293B] uppercase">Capability</th>
                      <th className="p-3.5 font-semibold text-[#475569] text-center uppercase">Generic LLMs (ChatGPT)</th>
                      <th className="p-3.5 font-semibold text-[#475569] text-center uppercase">Reference Managers (Zotero)</th>
                      <th className="p-3.5 font-bold text-[#F7F5F0] bg-[#334155] text-center uppercase">Scholar Core OS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-[#334155]">
                    <tr>
                      <td className="p-3 font-bold text-[#1E293B] border-r border-[#334155]">Citation Provenance</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">Hallucinates fake papers</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">Stores PDFs only</td>
                      <td className="p-3 text-center font-bold text-[#334155] bg-[#334155]/5">100% Cryptographic Match</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-[#1E293B] border-r border-[#334155]">Academic Workspaces</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">Generic unstructured chat</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">—</td>
                      <td className="p-3 text-center font-bold text-[#334155] bg-[#334155]/5">Tailored 8-to-25 Stage Workspaces</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-[#1E293B] border-r border-[#334155]">Editorial Board</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">Single unspecialized model</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">—</td>
                      <td className="p-3 text-center font-bold text-[#334155] bg-[#334155]/5">4 Specialized Reviewers</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-[#1E293B] border-r border-[#334155]">Journal Compliance</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">Manual formatting needed</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">Basic CSL styling only</td>
                      <td className="p-3 text-center font-bold text-[#334155] bg-[#334155]/5">Word limits + Section Audits</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-[#1E293B] border-r border-[#334155]">Offline / Local AI Support</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">Cloud-only</td>
                      <td className="p-3 text-center text-[#475569] border-r border-[#334155]">Local storage</td>
                      <td className="p-3 text-center font-bold text-[#334155] bg-[#334155]/5">Ollama, LM Studio & BYOK</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* CTA BANNER */}
        <section className="px-4 sm:px-6 lg:px-8 py-16 bg-[#F7F5F0] border-t-2 border-[#334155] text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-4xl font-black text-[#1E293B] tracking-tight mb-3 font-sans">
              Accelerate Your Research Without Sacrificing Rigour
            </h2>
            <p className="text-xs sm:text-sm text-[#334155] max-w-2xl mx-auto mb-6 font-sans">
              Join thousands of scholars worldwide organizing their literature, guaranteeing citation integrity, and publishing faster.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/projects")}
                className="px-8 py-3 rounded-none text-xs font-mono font-bold uppercase tracking-wider bg-[#334155] text-[#F7F5F0] border border-[#334155] hover:bg-[#1E293B] inline-flex items-center gap-2 cursor-pointer shadow-none"
              >
                Enter Scholar Workspace →
              </button>
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="px-8 py-3 rounded-none text-xs font-mono font-bold uppercase tracking-wider bg-transparent text-[#334155] border border-[#334155] hover:bg-[#334155] hover:text-[#F7F5F0] inline-flex items-center gap-2 cursor-pointer"
              >
                Sign Up for Free Account
              </button>
            </div>
            <p className="text-[11px] font-mono text-[#475569] mt-3">
              Free forever for individual local researchers. No credit card required.
            </p>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t-2 border-[#334155] py-8 px-6 bg-[#F7F5F0]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#334155]">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-none border border-[#334155] bg-[#334155] text-[#F7F5F0] flex items-center justify-center">
              <ScholarCoreLogo size="sm" className="text-[#F7F5F0]" />
            </div>
            <span className="font-bold uppercase tracking-wider">
              © {new Date().getFullYear()} Scholar Core. All rights reserved.
            </span>
          </div>
          <div className="flex gap-6 font-bold uppercase tracking-wider">
            <a href="#formats-explorer" className="hover:underline">
              Formats
            </a>
            <a href="#interactive-demo" className="hover:underline">
              Live Demo
            </a>
            <a href="#security" className="hover:underline">
              Security
            </a>
            <a href="#comparison" className="hover:underline">
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
