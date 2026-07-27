import React, { useState, useEffect } from "react";
import { PaperProject, AISettings, OutputFormat } from "../types";
import { FileText, Sparkles, BookOpen, AlertCircle, Play, Check, HelpCircle, Loader2 } from "lucide-react";
import {
  suggestTopic,
  improveTitle,
  generateTitleVariations,
  suggestObjectives,
  suggestMethodology,
  checkRQsQuality,
  suggestFullBlueprint
} from "../services/aiService";
import { OUTPUT_FORMAT_FIELD_CONFIG, OUTPUT_FORMAT_OPTIONS } from "../config/outputFormats";

interface ResearchIntakeWizardProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onNext: () => void;
  intakeProgress: number;
  onOpenVault?: () => void;
}

export default function ResearchIntakeWizard({
  project,
  updateProject,
  onNext,
  intakeProgress,
  onOpenVault
}: ResearchIntakeWizardProps) {
  const [error, setError] = useState<string | null>(null);
  const [blueprintLoading, setBlueprintLoading] = useState(false);

  const handleAutoFillBlueprint = async () => {
    if (!project.title.trim()) {
      setError("Please specify a Proposed Research Title/Topic first.");
      return;
    }
    setBlueprintLoading(true);
    setError(null);
    let blueprint;
    let isFallback = false;
    
    try {
      blueprint = await suggestFullBlueprint({
        title: project.title,
        aiSettings: project.aiSettings
      });
    } catch (err: any) {
      console.warn("AI generation failed, using local academic template fallback:", err);
      isFallback = true;
      
      const titleLower = project.title.toLowerCase();
      if (
        titleLower.includes("westphalia") ||
        titleLower.includes("rta") ||
        titleLower.includes("dhamma") ||
        titleLower.includes("international order") ||
        titleLower.includes("international relations")
      ) {
        blueprint = {
          objectives: "1. To examine the ontological limitations of the Westphalian sovereign-state model in addressing contemporary global crises.\n2. To reconstruct the classical Indian concepts of Rta (cosmic order) and Dhamma (moral duty/righteousness) as alternative metaphysical foundations for international relations.\n3. To formulate a comparative framework bridging non-Western relational ontologies with standard Western pluralist and constructivist IR theories.",
          researchQuestions: "1. How do the concepts of Rta and Dhamma challenge the Westphalian assumption of anarchy and absolute sovereignty?\n2. In what ways can a dharmic relational ontology offer more resilient, moral-cosmic frameworks for global cooperation and ecological governance?",
          methodology: "Theoretical-conceptual hermeneutics drawing on textual analysis of classical Sanskrit and Pali texts (such as the Rigveda, major Upanishads, and Buddhist suttas) paired with comparative analysis of contemporary critical IR theory.",
          field: "International Relations, Philosophy of International Law, non-Western IR Theory, Indian Philosophy",
          keywords: "Beyond Westphalia, Rta, Dhamma, Relational Ontology, International Order, non-Western IR",
          researchGap: "Modern international relations theory is overwhelmingly dominated by the Westphalian ontology of sovereign anarchy, leaving cosmic-moral and relational frameworks like Rta and Dhamma virtually unexamined in global governance literature.",
          articleType: "Theoretical/Conceptual"
        };
      } else if (
        titleLower.includes("vedic") ||
        titleLower.includes("dharmic") ||
        titleLower.includes("governance") ||
        titleLower.includes("ethics") ||
        titleLower.includes("indian") ||
        titleLower.includes("sanskrit") ||
        titleLower.includes("kautilyan") ||
        titleLower.includes("trusteeship")
      ) {
        blueprint = {
          objectives: "1. To analyze classical Kautilyan (Arthasastra) ethical paradigms and the Vedic framework of trusteeship.\n2. To re-conceptualize modern corporate social responsibility (CSR) standards by integrating these dharmic principles.\n3. To construct a comparative bridge between Eastern spiritual ethics and contemporary Western stakeholder-primacy models.",
          researchQuestions: "1. How do Upanishadic notions of trusteeship (such as Isavasya) challenge standard shareholder-primacy models?\n2. In what ways can dharmic ethics guide corporate responsibility frameworks for contemporary multinational firms?",
          methodology: "Theoretical-conceptual analysis drawing on textual hermeneutics of classical Sanskrit texts (Arthasastra, Upanishads) paired with comparative policy analysis of standard ESG frameworks.",
          field: "Business Ethics, Philosophy of Management, Indian Philosophy",
          keywords: "Vedic Trusteeship, Arthasastra, Corporate Governance, Dharmic Ethics, CSR",
          researchGap: "Existing corporate governance models are primarily Western-centric, focusing on utility-maximizing theory or compliance. Classical Indian statecraft and cosmic-moral frameworks (Dharma) remain under-researched in modern management literature.",
          articleType: "Theoretical/Conceptual"
        };
      } else if (
        titleLower.includes("ai") ||
        titleLower.includes("intelligence") ||
        titleLower.includes("machine") ||
        titleLower.includes("learning") ||
        titleLower.includes("algorithm") ||
        titleLower.includes("technology") ||
        titleLower.includes("neural") ||
        titleLower.includes("network")
      ) {
        blueprint = {
          objectives: "1. To examine the ethical implications of autonomous decision-making algorithms in public sectors.\n2. To investigate key regulatory frameworks governing AI deployment in risk-sensitive environments.\n3. To propose a human-centric auditing framework that bridges technological capability with social responsibility.",
          researchQuestions: "1. What are the key ethical failure modes of deep neural networks in automated credit scoring and hiring algorithms?\n2. How can algorithmic audit frameworks be designed to guarantee accountability without limiting research innovation?",
          methodology: "Mixed-methods analysis consisting of qualitative policy hermeneutics and quantitative algorithmic stress-testing across diverse public datasets.",
          field: "Artificial Intelligence Ethics, Computer Science and Policy, Technology Studies",
          keywords: "Artificial Intelligence, Algorithmic Ethics, Governance, Machine Learning, Auditing",
          researchGap: "Current technological guidelines focus on model metrics (accuracy, recall) but miss qualitative sociotechnical feedback loops, leaving a critical gap in multi-stakeholder algorithmic accountability.",
          articleType: "Empirical/Mixed-Methods"
        };
      } else {
        const titleWords = project.title.split(/\s+/).filter(w => w.length > 3).slice(0, 4).join(", ");
        blueprint = {
          objectives: `1. To systematically identify the core factors influencing "${project.title}".\n2. To evaluate the direct impact of these factors on overall organizational or societal outcomes.\n3. To construct a strategic policy framework to optimize implementation effectiveness.`,
          researchQuestions: `1. What is the relationship between the key dimensions of "${project.title}" and current industry practices?\n2. What are the primary structural barriers hindering successful application in this domain?`,
          methodology: "A structured mixed-methods approach comprising a systematic literature review (SLR) followed by semi-structured interviews with key domain experts.",
          field: "Interdisciplinary Academic Research",
          keywords: `${titleWords || "Empirical Study"}, Policy Analysis`,
          researchGap: `While direct correlations are often assumed, empirical research addressing the specific contextual variables of "${project.title}" is sparse, leaving a lack of actionable policy guidelines.`,
          articleType: "Empirical/Qualitative"
        };
      }
    }

    try {
      updateProject({
        objectives: blueprint.objectives,
        researchQuestions: blueprint.researchQuestions,
        methodology: blueprint.methodology,
        field: blueprint.field,
        keywords: blueprint.keywords,
        researchGap: blueprint.researchGap,
        articleType: blueprint.articleType
      });
      
      if (isFallback) {
        setTopicAdvice(`⚠️ AI service offline/no keys. Auto-filled using local academic template fallback for "${project.title}"`);
      } else {
        setTopicAdvice(`Blueprint generated successfully for: "${project.title}"`);
      }
      
      setObjectivesAdvice(blueprint.objectives.split("\n").map(o => o.replace(/^\d+\.\s*/, "")));
      setRqQuality({
        relevance: isFallback ? 85 : 90,
        novelty: isFallback ? 80 : 85,
        publishability: isFallback ? 82 : 88,
        feedback: isFallback 
          ? "Local template fallback. Customize fields as needed to align with your study design."
          : "Automatically generated as part of your research blueprint."
      });
      setMethodologyAdvice({
        methodology: blueprint.methodology,
        confidence: isFallback ? "Medium" : "High",
        rationale: isFallback
          ? "Matched from local academic template directory based on topic keywords."
          : "Synthesized from your research title and target objectives."
      });
    } catch (err: any) {
      setError(`Failed to update project data: ${err.message || err}`);
    } finally {
      setBlueprintLoading(false);
    }
  };
  
  // AI Sidebar States
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicAdvice, setTopicAdvice] = useState<string | null>(null);
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  
  const [objectivesLoading, setObjectivesLoading] = useState(false);
  const [objectivesAdvice, setObjectivesAdvice] = useState<string[]>([]);
  
  const [rqLoading, setRqLoading] = useState(false);
  const [rqQuality, setRqQuality] = useState<{ relevance: number; novelty: number; publishability: number; feedback: string } | null>(null);
  
  const [methodologyLoading, setMethodologyLoading] = useState(false);
  const [methodologyAdvice, setMethodologyAdvice] = useState<{ methodology: string; confidence: string; rationale: string } | null>(null);

  // Stage 4/5 field gating (target-workflow.md §3) — falls back to research-paper's
  // (all-fields-shown) config defensively; App.tsx only mounts this component once
  // project.outputFormat is set, so the fallback should never actually be exercised.
  const formatConfig = OUTPUT_FORMAT_FIELD_CONFIG[project.outputFormat as OutputFormat] ?? OUTPUT_FORMAT_FIELD_CONFIG["research-paper"];
  const formatOption = OUTPUT_FORMAT_OPTIONS.find((o) => o.id === project.outputFormat);

  if (formatConfig.needsDedicatedIntake) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-[#E5E7EB] rounded-3xl p-8 shadow-sm space-y-4 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-[#1A365D] font-serif">
            {formatOption?.label ?? "This format"} needs a dedicated intake flow
          </h2>
          <p className="text-xs text-[#6B665E] font-sans max-w-lg mx-auto leading-relaxed">
            The standard research-input fields (research questions, objectives, research gap, methodology) don't
            fit a {(formatOption?.label ?? "this format").toLowerCase()} — it needs its own fields instead
            (headline/angle, target publication or section, word count, audience, quotes/sources). That dedicated
            flow isn't built yet (see <code>docs/planning/target-workflow.md</code> §3).
          </p>
          <button
            type="button"
            onClick={() => updateProject({ outputFormat: "" })}
            className="px-4 py-2 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white font-mono text-[10px] uppercase font-bold rounded-lg cursor-pointer transition-all"
          >
            ← Choose a Different Format
          </button>
        </div>
      </div>
    );
  }

  const updateAuthorField = (updates: Partial<PaperProject>) => {
    const nextState = {
      ...project,
      ...updates
    };
    
    // Compile authorDetails string
    const parts = [];
    if (nextState.authorName) {
      let authStr = nextState.authorName;
      if (nextState.orcidId) authStr += ` (ORCID: ${nextState.orcidId})`;
      parts.push(authStr);
    }
    if (nextState.authorAffiliation) {
      parts.push(`[Affiliation: ${nextState.authorAffiliation}]`);
    }
    if (nextState.authorEmail) {
      parts.push(`[Email: ${nextState.authorEmail}]`);
    }
    
    if (nextState.coAuthorName) {
      let coStr = nextState.coAuthorName;
      if (nextState.coAuthorOrcidId) coStr += ` (ORCID: ${nextState.coAuthorOrcidId})`;
      parts.push(`Co-Author: ${coStr}`);
      if (nextState.coAuthorAffiliation) {
        parts.push(`[Co-Author Affiliation: ${nextState.coAuthorAffiliation}]`);
      }
      if (nextState.coAuthorEmail) {
        parts.push(`[Co-Author Email: ${nextState.coAuthorEmail}]`);
      }
    }
    
    nextState.authorDetails = parts.join(" - ") || "";
    updateProject(nextState);
  };

  // Preset loader
  const loadPreset = () => {
    updateProject({
      title: "Ethical Leadership and Dharmic Governance: Re-evaluating Corporate Responsibility through Kautilyan and Vedic Trusteeship Constructs",
      objectives: "To re-conceptualize modern CSR standards by integrating classical Kautilyan (Arthasastra) ethical paradigms and the Vedic framework of trusteeship (Isavasya philosophy), bridging eastern spiritual ethics with corporate governance models.",
      researchQuestions: "1. How do Isavasya Upanishadic notions of trusteeship challenge standard shareholder-primacy models?\n2. In what ways can Kautilya's ethical statecraft concepts guide corporate responsibility frameworks for contemporary multinational firms?",
      researchGap: "Existing CSR models are primarily Western-centric, focusing heavily on utility-maximizing theory or basic regulatory tick-box compliance, leaving classical Indian statecraft, systemic ethics, and cosmic-moral frameworks (Dharma) under-researched.",
      methodology: "Theoretical-conceptual analysis drawing on textual hermeneutics of classical Sanskrit texts (Arthasastra, Isavasya Upanishad) paired with comparative policy analysis of standard ESG frameworks.",
      field: "Business Ethics, Philosophy of Management, Indian Philosophy",
      keywords: "Vedic Trusteeship, Arthasastra, Corporate Governance, Dharmic Ethics, CSR",
      preferredJournalScope: "Double-blind peer-reviewed journals focusing on global ethics and business philosophy, Scopus/Web of Science indexed, with low/zero publishing charges (APC).",
      articleType: "Theoretical/Conceptual",
      dissertationMaterials: "Chapter 3: Philosophical Roots of Dharmic Stewardship. Notes that wealth is an instrument of social preservation (Lokasangraha) and ownership is a sacred trust (Isavasya). Extracted over fifteen primary citations on welfare economics of Kautilya.",
      styleAspiration: "Rigorous Sanskrit-grounded hermeneutic analysis with precise Western academic philosophy comparisons. Avoid any dry, mechanical writing.",
      authorName: "",
      orcidId: "",
      authorAffiliation: "",
      authorEmail: "",
      coAuthorName: "",
      coAuthorOrcidId: "",
      coAuthorAffiliation: "",
      coAuthorEmail: "",
      authorDetails: "",
    });
    setError(null);
  };

  const isFormValid = () => {
    const fields = formatConfig.fields;
    return (
      project.title.trim() !== "" &&
      project.field.trim() !== "" &&
      (fields.objectives !== "required" || project.objectives.trim() !== "") &&
      (fields.researchQuestions !== "required" || project.researchQuestions.trim() !== "") &&
      (fields.researchGap !== "required" || project.researchGap.trim() !== "") &&
      (fields.methodology !== "required" || project.methodology.trim() !== "")
    );
  };

  const handleNextClick = () => {
    if (!isFormValid()) {
      setError("Please fill in at least the essential research inputs (marked with *) to proceed.");
      return;
    }
    setError(null);
    onNext();
  };

  // Title-only alternative path (target-workflow.md Stage 5, previously 🔴 not built):
  // bypasses the guided path's per-format required-field gate above, requiring only
  // a title. Downstream stages already read the gated fields defensively (|| ""
  // fallbacks in aiService.ts, documentExportService.ts, etc.), so this reuses the
  // same onNext() the guided path uses rather than a separate flow.
  const isTitleOnlyValid = () => project.title.trim() !== "";

  const handleTitleOnlyClick = () => {
    if (!isTitleOnlyValid()) {
      setError("Please specify a research title to proceed with a title-only start.");
      return;
    }
    setError(null);
    onNext();
  };

  // AI Co-agent Trigger Actions
  const handleSuggestTopic = async () => {
    setTopicLoading(true);
    setTopicAdvice(null);
    try {
      const kw = project.keywords || "Ethical Leadership, Vedic Philosophy";
      const res = await suggestTopic({ keywords: kw, aiSettings: project.aiSettings });
      setTopicAdvice(`Suggested Topic: "${res.topic}"\n\nFields: ${res.field}\n\nObjectives summary: ${res.objectives}`);
      setTopicSuggestions([res.topic]);
    } catch (err: any) {
      setTopicAdvice(`Error: ${err.message || "Could not retrieve suggestions"}`);
    } finally {
      setTopicLoading(false);
    }
  };

  const handleImproveTitle = async () => {
    if (!project.title) {
      setTopicAdvice("Please enter a draft title first before refining.");
      return;
    }
    setTopicLoading(true);
    setTopicAdvice(null);
    try {
      const res = await improveTitle({ title: project.title, aiSettings: project.aiSettings });
      setTopicAdvice(`Improved Title: "${res.title}"\n\nRationale: ${res.rationale}`);
      setTopicSuggestions([res.title]);
    } catch (err: any) {
      setTopicAdvice(`Error: ${err.message || "Could not refine title"}`);
    } finally {
      setTopicLoading(false);
    }
  };

  const handleGenerateVariations = async () => {
    if (!project.title) {
      setTopicAdvice("Please enter a title to generate variations.");
      return;
    }
    setTopicLoading(true);
    setTopicAdvice(null);
    try {
      const res = await generateTitleVariations({ title: project.title, aiSettings: project.aiSettings });
      setTopicSuggestions(res.variations);
      setTopicAdvice("Generated 3 alternative framings below.");
    } catch (err: any) {
      setTopicAdvice(`Error: ${err.message || "Could not generate variations"}`);
    } finally {
      setTopicLoading(false);
    }
  };

  const handleSuggestObjectives = async () => {
    if (!project.title) {
      setError("Please set a research title first to suggest objectives.");
      return;
    }
    setObjectivesLoading(true);
    setObjectivesAdvice([]);
    setError(null);
    try {
      const res = await suggestObjectives({ title: project.title, aiSettings: project.aiSettings });
      setObjectivesAdvice(res.objectives);
    } catch (err: any) {
      console.warn("AI suggestObjectives failed, using local fallback:", err);
      const lower = project.title.toLowerCase();
      let fallbackObjs = [
        "1. To identify key components and current state of research in this domain.",
        "2. To evaluate structural challenges and implementation barriers.",
        "3. To recommend policy adjustments or operational solutions based on analysis."
      ];
      if (lower.includes("westphalia") || lower.includes("rta") || lower.includes("dhamma") || lower.includes("international order") || lower.includes("international relations")) {
        fallbackObjs = [
          "1. To examine the ontological limitations of the Westphalian sovereign-state model in addressing contemporary global crises.",
          "2. To reconstruct the classical Indian concepts of Rta (cosmic order) and Dhamma (moral duty/righteousness) as alternative metaphysical foundations for international relations.",
          "3. To formulate a comparative framework bridging non-Western relational ontologies with standard Western pluralist and constructivist IR theories."
        ];
      } else if (lower.includes("vedic") || lower.includes("dharmic") || lower.includes("governance") || lower.includes("ethics")) {
        fallbackObjs = [
          "1. To analyze classical Indian ethical paradigms and Vedic governance models.",
          "2. To evaluate modern CSR standards by integrating dharmic stewardship constructs.",
          "3. To formulate a comparative framework bridging eastern and western business ethics."
        ];
      } else if (lower.includes("ai") || lower.includes("intelligence") || lower.includes("machine") || lower.includes("learning")) {
        fallbackObjs = [
          "1. To analyze systemic ethical vulnerabilities in autonomous algorithmic systems.",
          "2. To evaluate existing regulatory policies governing automated decision tools.",
          "3. To propose a practical checklist for human-centric AI model auditing."
        ];
      }
      setObjectivesAdvice(fallbackObjs.map(o => o.replace(/^\d+\.\s*/, "")));
      setTopicAdvice("⚠️ AI service offline. Populated objectives suggestions from local template fallback.");
    } finally {
      setObjectivesLoading(false);
    }
  };

  const handleCheckRQs = async () => {
    if (!project.researchQuestions) {
      setError("Please write down research questions to evaluate.");
      return;
    }
    setRqLoading(true);
    setRqQuality(null);
    setError(null);
    try {
      const res = await checkRQsQuality({ questions: project.researchQuestions, aiSettings: project.aiSettings });
      setRqQuality(res);
    } catch (err: any) {
      console.warn("AI checkRQsQuality failed, using local fallback:", err);
      setRqQuality({
        relevance: 80,
        novelty: 75,
        publishability: 78,
        feedback: "⚠️ AI service offline. Local evaluation: The research questions focus on relevant themes, but should be refined to highlight clear, measurable parameters."
      });
    } finally {
      setRqLoading(false);
    }
  };

  const handleRecommendMethodology = async () => {
    setMethodologyLoading(true);
    setMethodologyAdvice(null);
    setError(null);
    try {
      const res = await suggestMethodology({
        title: project.title || "Untitled Project",
        objectives: project.objectives || "Not specified",
        aiSettings: project.aiSettings
      });
      setMethodologyAdvice(res);
    } catch (err: any) {
      console.warn("AI suggestMethodology failed, using local fallback:", err);
      const lower = (project.title || "").toLowerCase();
      let fallbackMeth = {
        methodology: "Conceptual analysis drawing on standard literature review paired with comparative case study analysis.",
        confidence: "Medium",
        rationale: "Selected local fallback based on general interdisciplinary research."
      };
      if (lower.includes("westphalia") || lower.includes("rta") || lower.includes("dhamma") || lower.includes("international order") || lower.includes("international relations")) {
        fallbackMeth = {
          methodology: "Theoretical-conceptual hermeneutics drawing on textual analysis of classical Sanskrit and Pali texts paired with comparative analysis of contemporary critical IR theory.",
          confidence: "High",
          rationale: "Selected local fallback based on Rta, Dhamma, and non-Western IR frameworks."
        };
      } else if (lower.includes("vedic") || lower.includes("dharmic") || lower.includes("governance") || lower.includes("ethics")) {
        fallbackMeth = {
          methodology: "Theoretical-conceptual analysis drawing on textual hermeneutics of classical Sanskrit texts paired with comparative policy analysis.",
          confidence: "High",
          rationale: "Selected local fallback based on Kautilyan and Vedic Trusteeship constructs."
        };
      } else if (lower.includes("ai") || lower.includes("intelligence") || lower.includes("machine") || lower.includes("learning")) {
        fallbackMeth = {
          methodology: "Mixed-methods analysis consisting of qualitative policy reviews and quantitative model checking using benchmark datasets.",
          confidence: "High",
          rationale: "Selected local fallback based on AI auditing and algorithmic governance."
        };
      }
      setMethodologyAdvice(fallbackMeth);
      setTopicAdvice("⚠️ AI service offline. Populated methodology suggestions from local template fallback.");
    } finally {
      setMethodologyLoading(false);
    }
  };

  // Generate ASCII progress bar
  const renderAsciiProgressBar = (pct: number) => {
    const totalBlocks = 15;
    const filledBlocks = Math.round((pct / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    const blocksStr = "█".repeat(filledBlocks) + "░".repeat(emptyBlocks);
    return `${blocksStr} ${pct}%`;
  };

  return (
    <div className="space-y-6">

      {/* Stage 4 selection context banner */}
      <div className="flex items-center justify-between gap-3 p-3 bg-[#FAF8F5] border border-[#E5E7EB] rounded-xl">
        <span className="text-xs font-mono text-[#1A365D]">
          Output format: <strong>{formatOption?.label ?? project.outputFormat}</strong>
        </span>
        <button
          type="button"
          onClick={() => updateProject({ outputFormat: "" })}
          className="text-[10px] font-mono uppercase font-bold text-[#C08A3E] hover:underline cursor-pointer"
        >
          Change Format
        </button>
      </div>

      {/* 1. Dashboard Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Card: Research Blueprint */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] flex items-center gap-2">
              <BookOpen className="w-4.5 h-4.5 text-[#C08A3E]" />
              Research Blueprint
            </h3>
            <span className="text-xs font-mono font-bold text-[#946A30]">
              Progress: {intakeProgress}%
            </span>
          </div>
          
          <div className="space-y-2 text-xs font-mono text-[#6B665E]">
            <div className="flex items-center justify-between">
              <span>Step 1: Research Topic</span>
              <span className={project.title ? "text-emerald-600 font-bold" : "text-amber-600"}>
                {project.title ? "✓ Completed" : "⚠ Missing"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Step 2: Objectives & RQs</span>
              <span className={(project.objectives && project.researchQuestions) ? "text-emerald-600 font-bold" : "text-amber-600"}>
                {(project.objectives && project.researchQuestions) ? "✓ Completed" : "⚠ Missing"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Step 3: Methodology & Gap</span>
              <span className={(project.methodology && project.researchGap) ? "text-emerald-600 font-bold" : "text-amber-600"}>
                {(project.methodology && project.researchGap) ? "✓ Completed" : "⚠ Missing"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Step 4: Journal Target</span>
              <span className={project.targetJournal ? "text-emerald-600 font-bold" : "text-amber-600"}>
                {project.targetJournal ? "✓ Selected" : "⚠ Journal Match Missing"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Step 5: References Grounding</span>
              <span className={(project.dataSources && project.dataSources.length > 0) ? "text-emerald-600 font-bold" : "text-amber-600"}>
                {(project.dataSources && project.dataSources.length > 0) ? "✓ Sources Attached" : "⚠ Citation Sources Weak"}
              </span>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              onClick={loadPreset}
              className="flex-1 py-2 border border-[#C08A3E] hover:bg-amber-50/50 text-[#946A30] font-mono text-[10px] uppercase font-bold rounded-lg cursor-pointer transition-all"
            >
              Load 'Dharmic Ethics' Preset
            </button>
            <button
              onClick={handleNextClick}
              className="flex-1 py-2 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white font-mono text-[10px] uppercase font-bold rounded-lg cursor-pointer transition-all shadow-sm"
            >
              Continue Setup
            </button>
          </div>
          <button
            onClick={handleTitleOnlyClick}
            className="w-full py-2 border border-dashed border-[#8C887F] hover:bg-[#FAF8F5] text-[#5c564e] font-mono text-[10px] uppercase font-bold rounded-lg cursor-pointer transition-all"
          >
            Start With Title Only — Fill In The Rest Later
          </button>
        </div>

        {/* Right Card: Research Readiness */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="border-b border-[#E5E7EB] pb-3">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D]">
              Research Readiness Index
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="block text-[10px] font-mono font-bold text-[#76726A] uppercase tracking-wider">
                Overall Completion Metrics:
              </span>
              <div className="font-mono text-sm font-bold text-amber-700 bg-[#FAF8F5] p-3 rounded-lg border border-[#E5E7EB]">
                {renderAsciiProgressBar(intakeProgress)}
              </div>
            </div>

            <div className="space-y-1 text-xs font-sans text-[#5c564e] leading-relaxed">
              <div className="flex items-center gap-2">
                {project.title ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <span className="text-amber-500 font-bold shrink-0">⚠</span>
                )}
                <span>Research Topic: {project.title ? `"${project.title.substring(0, 45)}..."` : "Draft title is required"}</span>
              </div>
              <div className="flex items-center gap-2">
                {project.researchQuestions ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <span className="text-amber-500 font-bold shrink-0">⚠</span>
                )}
                <span>Research Questions: {project.researchQuestions ? "Configured" : "RQs are required"}</span>
              </div>
              <div className="flex items-center gap-2">
                {project.methodology ? (
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <span className="text-amber-500 font-bold shrink-0">⚠</span>
                )}
                <span>Methodology: {project.methodology ? "Determined" : "Theoretical method must be outlined"}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 2. Create Research Blueprint Intake Forms */}
      <div className="bg-white border border-[#E5E7EB] rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        
        <div className="border-b border-[#E5E7EB] pb-4">
          <h2 className="text-lg font-bold text-[#1A365D] font-serif">
            Create Research Blueprint
          </h2>
          <p className="text-xs text-[#6B665E] font-sans mt-0.5">
            Configure your AI research parameters and align your co-agents before manuscript generation.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center gap-2 font-sans font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Blueprint Inputs grid with adjacent AI Panels */}
        <div className="space-y-6">
          
          {/* Card Block 1: Research Topic */}
          {/* Card Block 1: Research Topic */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
              Proposed Research Title / Topic *
            </label>
            <textarea
              rows={3}
              required
              className="w-full p-3 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
              placeholder="Enter your research topic/title or enter draft ideas to suggest..."
              value={project.title}
              onChange={(e) => {
                updateProject({ title: e.target.value });
                setError(null);
              }}
            />
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSuggestTopic}
                disabled={topicLoading}
                className="px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E7EB] text-[#1A365D] font-mono text-[9px] uppercase font-bold rounded hover:bg-neutral-100 cursor-pointer disabled:opacity-50 flex items-center gap-1"
              >
                {topicLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                Suggest Topic
              </button>
              <button
                type="button"
                onClick={handleImproveTitle}
                disabled={topicLoading}
                className="px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E7EB] text-[#1A365D] font-mono text-[9px] uppercase font-bold rounded hover:bg-neutral-100 cursor-pointer disabled:opacity-50 flex items-center gap-1"
              >
                {topicLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                Improve Title
              </button>
              <button
                type="button"
                onClick={handleGenerateVariations}
                disabled={topicLoading}
                className="px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E7EB] text-[#1A365D] font-mono text-[9px] uppercase font-bold rounded hover:bg-neutral-100 cursor-pointer disabled:opacity-50 flex items-center gap-1"
              >
                {topicLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                Generate Variations
              </button>
              <button
                type="button"
                onClick={handleAutoFillBlueprint}
                disabled={blueprintLoading || !project.title.trim()}
                className="px-3 py-1.5 bg-[#C08A3E] text-white font-mono text-[9px] uppercase font-bold rounded-lg hover:bg-[#A3702E] cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-all duration-200"
                title="Automatically suggest and fill all other fields based on the title"
              >
                {blueprintLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                )}
                ⚡ Auto-Fill Blueprint
              </button>
            </div>

            {project.title.trim().length > 15 && !project.objectives && !project.researchQuestions && (
              <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#C08A3E] animate-pulse shrink-0" />
                  <span>Ready to build your blueprint? Auto-populate the Objectives, Questions, and Methodology fields in one click.</span>
                </div>
                <button
                  type="button"
                  onClick={handleAutoFillBlueprint}
                  disabled={blueprintLoading}
                  className="px-3 py-1.5 bg-[#C08A3E] hover:bg-[#A3702E] text-white font-mono text-[9px] uppercase font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1 shrink-0 shadow-sm"
                >
                  {blueprintLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  ⚡ Auto-Fill Now
                </button>
              </div>
            )}

            {topicAdvice && (
              <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                {topicAdvice}
              </div>
            )}
            {topicSuggestions.length > 0 && !topicLoading && (
              <div className="mt-2 p-3 bg-white border border-[#E5E7EB] rounded-lg space-y-1.5 shadow-sm">
                <span className="block text-[10px] font-mono text-[#76726A] uppercase font-bold">Apply Suggested Title:</span>
                <div className="flex flex-col gap-1">
                  {topicSuggestions.map((titleSuggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        updateProject({ title: titleSuggestion });
                        setTopicSuggestions([]);
                        setTopicAdvice(`Applied Title: "${titleSuggestion}"`);
                      }}
                      className="w-full text-left p-2 bg-[#FAF8F5] border border-[#E5E7EB] hover:border-[#C08A3E] rounded text-[11px] text-[#1A365D] font-sans font-medium block transition-all"
                    >
                      {titleSuggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card Block 2: Objectives */}
          {formatConfig.fields.objectives !== "hidden" && (
          <div className="space-y-2">
            <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
              Research Objectives {formatConfig.fields.objectives === "required" ? "*" : ""}
            </label>
            <textarea
              rows={3}
              required={formatConfig.fields.objectives === "required"}
              disabled={blueprintLoading}
              className={`w-full p-3 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D] ${blueprintLoading ? "animate-pulse text-gray-400" : ""}`}
              placeholder={blueprintLoading ? "⚡ AI is drafting suggested objectives..." : "Outline the core objective parameters of this study..."}
              value={blueprintLoading ? "⚡ AI is drafting suggested objectives..." : project.objectives}
              onChange={(e) => updateProject({ objectives: e.target.value })}
            />
            <button
              type="button"
              onClick={handleSuggestObjectives}
              disabled={objectivesLoading}
              className="px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E7EB] text-[#1A365D] font-mono text-[9px] uppercase font-bold rounded hover:bg-neutral-100 cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              {objectivesLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              Suggest Objectives
            </button>

            {objectivesAdvice.length > 0 && !objectivesLoading && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <span className="block text-[10px] font-mono font-bold text-[#946A30] uppercase tracking-wider">
                  Suggested Objectives:
                </span>
                <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700 font-sans leading-relaxed">
                  {objectivesAdvice.map((obj, i) => (
                    <li key={i}>{obj}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    const formatted = objectivesAdvice.map((o, idx) => `${idx + 1}. ${o}`).join("\n");
                    updateProject({ objectives: formatted });
                    setObjectivesAdvice([]);
                  }}
                  className="px-4 py-2 bg-white border border-[#E5E7EB] hover:border-[#1A365D] text-xs text-[#1A365D] font-bold rounded-lg transition-all font-mono uppercase shadow-sm cursor-pointer animate-fade-in"
                >
                  Apply Suggested Objectives
                </button>
              </div>
            )}
          </div>
          )}

          {/* Card Block 3: Research Questions */}
          {formatConfig.fields.researchQuestions !== "hidden" && (
          <div className="space-y-2">
            <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
              Research Questions {formatConfig.fields.researchQuestions === "required" ? "*" : ""}
            </label>
            <textarea
              rows={3}
              required={formatConfig.fields.researchQuestions === "required"}
              disabled={blueprintLoading}
              className={`w-full p-3 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D] ${blueprintLoading ? "animate-pulse text-gray-400" : ""}`}
              placeholder={blueprintLoading ? "⚡ AI is drafting suggested research questions..." : "1. What is the impact of...? 2. To what extent...?"}
              value={blueprintLoading ? "⚡ AI is drafting suggested research questions..." : project.researchQuestions}
              onChange={(e) => updateProject({ researchQuestions: e.target.value })}
            />
            <button
              type="button"
              onClick={handleCheckRQs}
              disabled={rqLoading}
              className="px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E7EB] text-[#1A365D] font-mono text-[9px] uppercase font-bold rounded hover:bg-neutral-100 cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              {rqLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              Analyze RQs Quality
            </button>

            {rqQuality && !rqLoading && (
              <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 font-mono text-[10px] uppercase font-semibold text-[#1A365D] animate-fade-in shadow-sm">
                <span className="block text-[10px] font-mono font-bold text-[#946A30] uppercase tracking-wider">
                  AI Quality Score:
                </span>
                <div className="grid grid-cols-3 gap-4 border-b border-[#E5E7EB] pb-2">
                  <div className="flex flex-col">
                    <span className="text-gray-400">Relevance:</span>
                    <span className="text-[#1A365D] font-bold text-sm">{rqQuality.relevance}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Novelty:</span>
                    <span className="text-[#1A365D] font-bold text-sm">{rqQuality.novelty}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400">Publishability:</span>
                    <span className="text-[#1A365D] font-bold text-sm">{rqQuality.publishability}%</span>
                  </div>
                </div>
                <p className="text-[11px] text-[#6B665E] font-sans lowercase leading-relaxed pt-1 normal-case font-medium">
                  <strong>Feedback:</strong> {rqQuality.feedback}
                </p>
              </div>
            )}
          </div>
          )}

          {/* Card Block 4: Methodology */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                  Methodology Category *
                </label>
                <select
                  disabled={blueprintLoading}
                  className="w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D] disabled:opacity-75"
                  value={blueprintLoading ? "Theoretical/Conceptual" : project.articleType}
                  onChange={(e) => updateProject({ articleType: e.target.value })}
                >
                  <option value="Theoretical/Conceptual">Theoretical & Conceptual</option>
                  <option value="Empirical (Quantitative)">Empirical - Quantitative</option>
                  <option value="Empirical (Qualitative)">Empirical - Qualitative</option>
                  <option value="Mixed-Method">Mixed-Method</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                  Target Academic Field *
                </label>
                <input
                  type="text"
                  required
                  disabled={blueprintLoading}
                  className={`w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D] ${blueprintLoading ? "animate-pulse text-gray-400" : ""}`}
                  placeholder={blueprintLoading ? "⚡ Identifying field..." : "e.g. Business Ethics, Philosophy"}
                  value={blueprintLoading ? "⚡ Identifying field..." : project.field}
                  onChange={(e) => updateProject({ field: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                Detailed Method Description {formatConfig.fields.methodology === "required" ? "*" : ""}
              </label>
              <textarea
                rows={2}
                required={formatConfig.fields.methodology === "required"}
                disabled={blueprintLoading}
                className={`w-full p-3 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D] ${blueprintLoading ? "animate-pulse text-gray-400" : ""}`}
                placeholder={blueprintLoading ? "⚡ AI is formulating methodology..." : "Specify study framework, comparative tests, hermeneutical limits..."}
                value={blueprintLoading ? "⚡ AI is formulating methodology..." : project.methodology}
                onChange={(e) => updateProject({ methodology: e.target.value })}
              />
            </div>

            <button
              type="button"
              onClick={handleRecommendMethodology}
              disabled={methodologyLoading}
              className="px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E7EB] text-[#1A365D] font-mono text-[9px] uppercase font-bold rounded hover:bg-neutral-100 cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              {methodologyLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              Analyze Methodology Approach
            </button>

            {methodologyAdvice && !methodologyLoading && (
              <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs text-slate-700 font-sans animate-fade-in shadow-sm">
                <span className="block text-[10px] font-mono font-bold text-[#946A30] uppercase tracking-wider">
                  AI Methodology Advisor:
                </span>
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase font-bold text-slate-500">
                    Recommended: <span className="text-[#1A365D] font-bold">{methodologyAdvice.methodology}</span>
                  </p>
                  <p className="font-mono text-[10px] uppercase font-bold text-slate-500">
                    Confidence: <span className={methodologyAdvice.confidence === "High" ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>{methodologyAdvice.confidence}</span>
                  </p>
                  <p className="leading-relaxed mt-1 border-t border-[#E5E7EB]/50 pt-2 text-[#6B665E]">
                    {methodologyAdvice.rationale}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateProject({ methodology: `${methodologyAdvice.methodology} - Rationale: ${methodologyAdvice.rationale}` });
                    setMethodologyAdvice(null);
                  }}
                  className="px-4 py-2 bg-white border border-[#E5E7EB] hover:border-[#1A365D] text-xs text-[#1A365D] font-bold rounded-lg transition-all font-mono uppercase shadow-sm cursor-pointer"
                >
                  Apply Advisor Method
                </button>
              </div>
            )}
          </div>

          {/* Section: Secondary details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#E5E7EB]/70">
            {formatConfig.fields.researchGap !== "hidden" && (
            <div className="space-y-2">
              <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                Research Gap {formatConfig.fields.researchGap === "required" ? "*" : ""}
              </label>
              <textarea
                rows={2}
                required={formatConfig.fields.researchGap === "required"}
                disabled={blueprintLoading}
                className={`w-full p-3 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D] ${blueprintLoading ? "animate-pulse text-gray-400" : ""}`}
                placeholder={blueprintLoading ? "⚡ AI is identifying research gap..." : "Describe what core theoretical discrepancy or literature missing this study reconciles..."}
                value={blueprintLoading ? "⚡ AI is identifying research gap..." : project.researchGap}
                onChange={(e) => updateProject({ researchGap: e.target.value })}
              />
            </div>
            )}
            <div className={formatConfig.fields.researchGap === "hidden" ? "space-y-2 md:col-span-2" : "space-y-2"}>
              <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
                Study Keywords (Commas)
              </label>
              <input
                type="text"
                disabled={blueprintLoading}
                className={`w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D] ${blueprintLoading ? "animate-pulse text-gray-400" : ""}`}
                placeholder={blueprintLoading ? "⚡ Extracting keywords..." : "Corporate Ethics, Trusteeship..."}
                value={blueprintLoading ? "⚡ Extracting keywords..." : project.keywords}
                onChange={(e) => updateProject({ keywords: e.target.value })}
              />
            </div>
          </div>

          {/* Target minimum reference count (soft target, target-workflow.md Stage 5) */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold font-mono text-[#76726A] uppercase tracking-wider">
              Target Minimum Reference Count (Optional)
            </label>
            <input
              type="number"
              min={0}
              className="w-full md:w-56 p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
              placeholder="e.g. 30"
              value={project.targetReferenceCount ?? ""}
              onChange={(e) =>
                updateProject({ targetReferenceCount: e.target.value ? Number(e.target.value) : undefined })
              }
            />
            <p className="text-[10px] text-[#76726A] font-sans">
              {formatConfig.referenceCountHint} A soft target only — it can warn at draft time but will never block
              drafting or export.
            </p>
          </div>

          {/* Card Block: Author & Submission Metadata */}
          <div className="p-5 bg-[#FAF8F5] border border-[#E5E7EB] rounded-2xl space-y-4">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#1A365D] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Author & Submission Metadata
            </h4>
            
            {/* Primary Author Metadata */}
            <div className="space-y-3">
              <span className="block text-[10px] font-mono text-[#76726A] uppercase font-bold">Primary Author Details</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Author Full Name *
                  </label>
                  <input
                    type="text"
                    className="w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
                    placeholder="e.g. Dr. Jane Doe"
                    value={project.authorName || ""}
                    onChange={(e) => updateAuthorField({ authorName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    ORCID iD (Optional)
                  </label>
                  <input
                    type="text"
                    className="w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
                    placeholder="0000-0002-4190-3882"
                    value={project.orcidId || ""}
                    onChange={(e) => updateAuthorField({ orcidId: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Institutional Affiliation *
                  </label>
                  <input
                    type="text"
                    className="w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
                    placeholder="e.g. Department of Philosophy, Oxford University"
                    value={project.authorAffiliation || ""}
                    onChange={(e) => updateAuthorField({ authorAffiliation: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Corresponding Email Address *
                  </label>
                  <input
                    type="email"
                    className="w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
                    placeholder="e.g. doc.govinda@gmail.com"
                    value={project.authorEmail || ""}
                    onChange={(e) => updateAuthorField({ authorEmail: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-[#E5E7EB] my-3"></div>

            {/* Co-Author Metadata (Optional) */}
            <div className="space-y-3">
              <span className="block text-[10px] font-mono text-[#76726A] uppercase font-bold">Co-Author Details (Optional)</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Co-Author Full Name
                  </label>
                  <input
                    type="text"
                    className="w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
                    placeholder="Dr. Ram Chandra Bhatta"
                    value={project.coAuthorName || ""}
                    onChange={(e) => updateAuthorField({ coAuthorName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Co-Author ORCID iD
                  </label>
                  <input
                    type="text"
                    className="w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
                    placeholder="0000-0003-1234-5678"
                    value={project.coAuthorOrcidId || ""}
                    onChange={(e) => updateAuthorField({ coAuthorOrcidId: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Co-Author Affiliation
                  </label>
                  <input
                    type="text"
                    className="w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
                    placeholder="e.g. Department of Philosophy, Oxford University"
                    value={project.coAuthorAffiliation || ""}
                    onChange={(e) => updateAuthorField({ coAuthorAffiliation: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-bold font-mono text-[#6B665E] uppercase tracking-wider">
                    Co-Author Email
                  </label>
                  <input
                    type="email"
                    className="w-full p-2.5 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
                    placeholder="ram.bhatta@tribhuvan.edu.np"
                    value={project.coAuthorEmail || ""}
                    onChange={(e) => updateAuthorField({ coAuthorEmail: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Row: Dissertation Materials */}
          <div className="p-5 bg-[#FAF8F5] border border-[#E5E7EB] rounded-2xl space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#1A365D] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              PhD Thesis Grounding & Scriptural Mandates
            </h4>
            <p className="text-[11px] text-[#6B665E] leading-relaxed font-sans">
              All literature review and drafting co-agents are dynamically configured to build upon your uploaded doctoral dissertation or manuscript in the **Knowledge Vault**. The system prioritizes exact source grounding and domain-specific indexing to inject authentic citations throughout the workbench.
            </p>

            {onOpenVault && (
              <div className="flex items-center justify-between p-3.5 bg-white border border-[#E5E7EB] rounded-xl shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1A365D] flex items-center gap-2">
                      Knowledge Vault Primary Documents
                      {project.knowledgeVault?.files?.some((f: any) => f.isActive && f.status === 'ready') ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-100 text-emerald-800 font-bold">GROUNDED</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-100 text-amber-800 font-bold">NOT UPLOADED</span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#6B665E]">
                      {project.knowledgeVault?.files?.filter((f: any) => f.isActive && f.status === 'ready').length || 0} active thesis/manuscript files indexed for automated RAG citation
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenVault}
                  className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-xs rounded-lg shadow-sm transition-all shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  Upload / Manage Vault →
                </button>
              </div>
            )}

            <textarea
              rows={2}
              className="w-full p-3 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D] font-mono"
              placeholder="Thesis excerpts and key materials to ground AI agent actions..."
              value={project.dissertationMaterials}
              onChange={(e) => updateProject({ dissertationMaterials: e.target.value })}
            />
          </div>

        </div>

        {/* Status: Active agents */}
        <div className="bg-[#FAF8F5] border border-[#E5E7EB] rounded-2xl p-5 space-y-3">
          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-[#1A365D]">
            Active Research Agents Status
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 font-mono text-[10px] text-[#6B665E]">
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Literature Review Agent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Citation Agent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Methodology Agent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Journal Matching Agent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Ethics & Integrity Agent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Manuscript Structuring Agent</span>
            </div>
          </div>
        </div>

        {/* Generate Button action row */}
        <div className="flex justify-end pt-4 border-t border-[#E5E7EB]">
          <button
            onClick={handleNextClick}
            className="px-6 py-2.5 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white text-xs font-mono font-bold uppercase tracking-widest rounded-lg transition-all shadow-md flex items-center gap-2 cursor-pointer"
          >
            <span>Generate Research Blueprint</span>
            <FileText className="w-4 h-4" />
          </button>
        </div>

      </div>

    </div>
  );
}
