/**
 * Manuscript Writer Agent Module
 * 
 * Exports all manuscript writer components.
 */

// Interfaces
export type { ManuscriptDraft, ManuscriptSection, ManuscriptTemplate, ManuscriptWriterInput } from "./interfaces";

// Agent
export { ManuscriptWriterAgent } from "./writer";

// Section Builders
export {
  TitleSection,
  AbstractSection,
  IntroductionSection,
  LiteratureReviewSection,
  MethodologySection,
  ResultsSection,
  DiscussionSection,
  ConclusionSection,
} from "./sections";