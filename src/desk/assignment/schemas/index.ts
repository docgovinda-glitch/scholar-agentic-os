/**
 * Assignment Schemas — Barrel Export
 *
 * Runtime validation schemas for the academic research & writing engine.
 * All schema exports are gathered here for convenient import.
 */

export {
  // Outline schemas
  OutlineNodeTypeSchema,
  AssignmentSubheadingSchema,
  AssignmentMainHeadingSchema,
  AssignmentStructureSchema,
  ResearchBlueprintOverviewSchema,
  QuestionMappingMatrixItemSchema,
  QualityControlChecklistSchema,
  SubheadingResearchStatusSchema,
  SubheadingDraftStatusSchema,
  ResearchSourceReferenceSchema,
  InquiryTypeSchema,

  // Outline utilities
  validateOutlineStructure,
  validateMainHeading,
  validateSubheading,
  validateWordBudgetAllocation,

  // Types
  type OutlineNodeType,
} from "./outlineSchema";

export {
  // Source schemas
  SourceAcademicTypeSchema,
  SourceCredibilitySchema,
  SourceStatusSchema,
  VerificationStatusSchema,
  PublicationStatusSchema,
  DiscoveredSourceSchema,

  // Citation anchor schemas
  CitationAnchorSchema,
  SectionCitationRegistrySchema,

  // Source utilities
  validateDiscoveredSource,
  validateCitationAnchor,
  isDoiStructurallyValid,
  validateSourceBatch,

  // Types
  type CitationAnchor,
} from "./sourceSchema";
