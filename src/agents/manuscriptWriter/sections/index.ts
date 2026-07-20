/**
 * Manuscript Section Builders
 * 
 * Builds individual sections from CRPM data.
 */

import type { CanonicalResearchProject } from "../../../core/project/projectModel";
import type { ManuscriptSection } from "../interfaces";

// ============================================================================
// Section Builders
// ============================================================================

export class TitleSection {
  static build(project: CanonicalResearchProject): ManuscriptSection {
    return {
      id: "title",
      title: "Title",
      content: project.identity.title,
      citations: [],
    };
  }
}

export class AbstractSection {
  static build(project: CanonicalResearchProject): ManuscriptSection {
    return {
      id: "abstract",
      title: "Abstract",
      content: project.identity.description,
      citations: [],
    };
  }
}

export class IntroductionSection {
  static build(project: CanonicalResearchProject): ManuscriptSection {
    const questions = project.artifacts.researchQuestionReportId;
    return {
      id: "introduction",
      title: "Introduction",
      content: "This study addresses " + (questions ? "the research questions outlined in the project." : "research questions to be determined."),
      citations: [],
    };
  }
}

export class LiteratureReviewSection {
  static build(project: CanonicalResearchProject): ManuscriptSection {
    const gaps = project.artifacts.knowledgeGapReportId;
    return {
      id: "literature-review",
      title: "Literature Review",
      content: "A comprehensive review of literature reveals several gaps: " + (gaps ? "identified gaps" : "gaps to be explored."),
      citations: project.knowledge.referenceIds,
    };
  }
}

export class MethodologySection {
  static build(project: CanonicalResearchProject): ManuscriptSection {
    const methodology = project.artifacts.methodologyReportId;
    return {
      id: "methodology",
      title: "Methodology",
      content: methodology ? "Methodology as recommended by the methodology advisor." : "Methodology section to be completed.",
      citations: [],
    };
  }
}

export class ResultsSection {
  static build(project: CanonicalResearchProject): ManuscriptSection {
    return {
      id: "results",
      title: "Results",
      content: "Results will be presented here after data collection and analysis.",
      citations: [],
    };
  }
}

export class DiscussionSection {
  static build(project: CanonicalResearchProject): ManuscriptSection {
    return {
      id: "discussion",
      title: "Discussion",
      content: "Discussion of findings in relation to existing literature.",
      citations: [],
    };
  }
}

export class ConclusionSection {
  static build(project: CanonicalResearchProject): ManuscriptSection {
    return {
      id: "conclusion",
      title: "Conclusion",
      content: "This study concludes with implications for future research.",
      citations: [],
    };
  }
}