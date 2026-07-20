# Implementation Backlog

**Version:** 1.0.0
**Last Updated:** 2026-07-13
**Purpose:** Single source of truth for all remaining implementation tasks

---

## EPIC 6 — Native Skills

### FEATURE 6A — Skills Framework: COMPLETE ✓

All acceptance criteria met. Framework is production-ready with comprehensive tests and documentation.

#### Task SKILL-001
**ID:** SKILL-001
**Title:** Implement comprehensive unit tests for SkillRegistry
**Description:** Create unit tests covering registration, discovery, enable/disable, configuration, and event emission for the SkillRegistry class.
**Priority:** P0
**Effort:** M
**Dependencies:** None
**Acceptance Criteria:**
- [x] Test skill registration and duplicate prevention
- [x] Test skill retrieval and enabled/disabled state
- [x] Test skill query by category, tag, offline capability
- [x] Test enable/disable functionality
- [x] Test configuration update and retrieval
- [x] Test event emission (registered, unregistered, enabled, disabled, error)
**Files Affected:** `src/skills/__tests__/registry.test.ts`, `jest.config.js`
**Status:** Complete

#### Task SKILL-002
**ID:** SKILL-002
**Title:** Implement comprehensive unit tests for SkillExecutor
**Description:** Create unit tests covering validation, execution pipeline, timeout handling, error handling, and metrics collection.
**Priority:** P0
**Effort:** M
**Dependencies:** None
**Acceptance Criteria:**
- [x] Test successful skill execution flow
- [x] Test validation failure handling
- [x] Test execution timeout
- [x] Test error catching and transformation
- [x] Test metrics recording
**Files Affected:** `src/skills/__tests__/executor.test.ts`
**Status:** Complete

#### Task SKILL-002-ALT
**ID:** SKILL-002-ALT
**Title:** Implement production-quality reference skill (Word Count)
**Description:** Create a complete reference skill demonstrating the full Skills Framework lifecycle including registration, discovery, validation, execution, events, logging, and metrics.
**Priority:** P0
**Effort:** M
**Dependencies:** SKILL-001
**Acceptance Criteria:**
- [x] Example skill compiles and registers successfully
- [x] Example skill executes with proper input/output
- [x] Example skill demonstrates lifecycle hooks
- [x] Example skill has proper error handling
- [x] Example skill uses configuration
- [x] Example skill uses logging
- [x] Example skill emits events
- [x] Example skill has comprehensive unit tests
- [x] Example skill has developer documentation
**Files Affected:** `src/skills/examples/wordCountSkill.ts`, `src/skills/__tests__/wordCount.test.ts`
**Status:** Complete

#### Future Improvements (Non-blocking)
- [ ] SKILL-005: Add JSDoc examples to Skill interfaces
- [ ] SKILL-004 (enhancement): Consider explicit factory function createSkillRegistry()
- [ ] Consider integrating with core eventBus.ts for cross-skill events
- [ ] Consider metrics persistence to storage backend

---

### FEATURE 6B — Document Intelligence Engine

#### Task DOC-001
**ID:** DOC-001
**Title:** Implement parser registry for document formats
**Description:** Create a registry system to manage parser implementations for different file formats (PDF, DOCX, XLSX, TXT, etc.).
**Priority:** P0
**Effort:** M
**Dependencies:** SKILL-001
**Acceptance Criteria:**
- [ ] Registry supports registering parsers by MIME type and extension
- [ ] Registry can detect available parser for given document
- [ ] Registry throws appropriate errors for unsupported formats
- [ ] Unit tests cover all registry operations
**Files Affected:** `src/document_intelligence/parser/parserRegistry.ts`
**Status:** Pending

#### Task DOC-002
**ID:** DOC-002
**Title:** Implement document format validator stage
**Description:** Create the validate pipeline stage that checks document integrity, size limits, and encryption status.
**Priority:** P0
**Effort:** S
**Dependencies:** None
**Acceptance Criteria:**
- [ ] Validates file is not corrupted
- [ ] Checks size limits against maxBytes configuration
- [ ] Detects encrypted PDFs
- [ ] Returns structured validation errors
- [ ] Unit tests for all validation scenarios
**Files Affected:** `src/document_intelligence/pipeline/stages/validateStage.ts`
**Status:** Pending

#### Task DOC-003
**ID:** DOC-003
**Title:** Implement format identification stage
**Description:** Create the identify_format pipeline stage that determines document type from content and metadata.
**Priority:** P0
**Effort:** S
**Dependencies:** DOC-002
**Acceptance Criteria:**
- [ ] Identifies PDF, DOCX, XLSX, TXT, RTF formats
- [ ] Returns format confidence score
- [ ] Handles ambiguous formats gracefully
**Files Affected:** `src/document_intelligence/pipeline/stages/identifyFormatStage.ts`
**Status:** Pending

#### Task DOC-004
**ID:** DOC-004
**Title:** Implement PDF parser stage
**Description:** Create the parse pipeline stage for PDF documents using pdf-parse library.
**Priority:** P0
**Effort:** L
**Dependencies:** DOC-001, DOC-003
**Acceptance Criteria:**
- [ ] Extracts text content from PDF pages
- [ ] Handles encrypted PDF errors
- [ ] Handles corrupted PDF errors
- [ ] Extracts metadata (title, author, subject)
- [ ] Unit tests with sample PDF fixtures
**Files Affected:** `src/document_intelligence/parser/pdfParser.ts`
**Status:** Pending

#### Task DOC-005
**ID:** DOC-005
**Title:** Implement DOCX parser stage
**Description:** Create the parse pipeline stage for Word documents using mammoth library.
**Priority:** P0
**Effort:** M
**Dependencies:** DOC-001, DOC-003
**Acceptance Criteria:**
- [ ] Extracts text content from DOCX
- [ ] Handles corrupted DOCX errors
- [ ] Extracts basic metadata
- [ ] Unit tests with sample DOCX fixtures
**Files Affected:** `src/document_intelligence/parser/docxParser.ts`
**Status:** Pending

#### Task DOC-006
**ID:** DOC-006
**Title:** Implement XLSX/Excel parser stage
**Description:** Create the parse pipeline stage for Excel documents using xlsx library.
**Priority:** P1
**Effort:** M
**Dependencies:** DOC-001, DOC-003
**Acceptance Criteria:**
- [ ] Extracts cell values from worksheets
- [ ] Converts to searchable text representation
- [ ] Handles corrupted Excel errors
**Files Affected:** `src/document_intelligence/parser/xlsxParser.ts`
**Status:** Pending

#### Task DOC-007
**ID:** DOC-007
**Title:** Implement normalize pipeline stage
**Description:** Create the normalize pipeline stage that standardizes extracted content and cleans whitespace.
**Priority:** P1
**Effort:** S
**Dependencies:** DOC-002
**Acceptance Criteria:**
- [ ] Normalizes whitespace in extracted text
- [ ] Handles encoding issues
- [ ] Removes duplicate content
**Files Affected:** `src/document_intelligence/pipeline/stages/normalizeStage.ts`
**Status:** Pending

#### Task DOC-008
**ID:** DOC-008
**Title:** Implement metadata extraction stage
**Description:** Create the extract_metadata pipeline stage that identifies document-level metadata.
**Priority:** P1
**Effort:** M
**Dependencies:** DOC-002, DOC-003
**Acceptance Criteria:**
- [ ] Extracts title, authors, affiliations
- [ ] Extracts abstract and keywords
- [ ] Populates DocumentMetadata structure
- [ ] Unit tests for metadata inference
**Files Affected:** `src/document_intelligence/pipeline/stages/extractMetadataStage.ts`
**Status:** Pending

#### Task DOC-009
**ID:** DOC-009
**Title:** Implement academic structure extraction stage
**Description:** Create the extract_structure stage that identifies IMRaD and other academic sections.
**Priority:** P1
**Effort:** L
**Dependencies:** DOC-004, DOC-005
**Acceptance Criteria:**
- [ ] Identifies Introduction, Methods, Results, Discussion sections
- [ ] Creates Section objects with proper hierarchy
- [ ] Handles variations in section naming
- [ ] Heuristic-based detection with confidence scores
**Files Affected:** `src/document_intelligence/pipeline/stages/extractStructureStage.ts`
**Status:** Pending

#### Task DOC-010
**ID:** DOC-010
**Title:** Implement reference extraction stage
**Description:** Create the extract_references stage that identifies and extracts bibliographic references.
**Priority:** P1
**Effort:** L
**Dependencies:** DOC-004, DOC-005
**Acceptance Criteria:**
- [ ] Extracts reference text from document
- [ ] Associates references with page locations
- [ ] Creates Reference objects
- [ ] Unit tests with reference-rich documents
**Files Affected:** `src/document_intelligence/pipeline/stages/extractReferencesStage.ts`
**Status:** Pending

#### Task DOC-011
**ID:** DOC-011
**Title:** Implement model generator stage
**Description:** Create the generate_model stage that finalizes the Canonical Document Model.
**Priority:** P0
**Effort:** M
**Dependencies:** All previous stages
**Acceptance Criteria:**
- [ ] Assembles complete Document object
- [ ] Generates searchable chunks
- [ ] Produces final diagnostics report
**Files Affected:** `src/document_intelligence/pipeline/stages/generateModelStage.ts`
**Status:** Pending

#### Task DOC-012
**ID:** DOC-012
**Title:** Implement index preparation stage
**Description:** Create the index_prep stage that prepares document for vector search and indexing.
**Priority:** P2
**Effort:** M
**Dependencies:** DOC-011
**Acceptance Criteria:**
- [ ] Creates searchable text chunks
- [ ] Generates embeddings placeholder
- [ ] Prepares metadata for storage
**Files Affected:** `src/document_intelligence/pipeline/stages/indexPrepStage.ts`
**Status:** Pending

---

### FEATURE 6C — Citation & Academic Compliance Engine

#### Task CITE-001
**ID:** CITE-001
**Title:** Implement style registry for citation formats
**Description:** Create a registry system to manage citation style implementations (APA, MLA, Chicago, IEEE, Vancouver, AMA, ACS).
**Priority:** P0
**Effort:** M
**Dependencies:** SKILL-001
**Acceptance Criteria:**
- [ ] Registry supports registering formatters by style name
- [ ] Registry can retrieve formatter for given style
- [ ] Default formatter fallback mechanism
- [ ] Unit tests for registry operations
**Files Affected:** `src/citation_compliance/formatter/styleRegistry.ts`
**Status:** Pending

#### Task CITE-002
**ID:** CITE-002
**Title:** Implement APA 7 citation formatter
**Description:** Create APA 7th edition citation and bibliography formatter that integrates with CanonicalReference model.
**Priority:** P0
**Effort:** M
**Dependencies:** CITE-001
**Acceptance Criteria:**
- [ ] Formats in-text citations correctly
- [ ] Formats bibliography entries correctly
- [ ] Handles all 12 reference types
- [ ] Golden tests for exact output strings
- [ ] Unit tests cover edge cases
**Files Affected:** `src/citation_compliance/formatter/apaFormatter.ts`, `src/citation_compliance/__tests__/apa.test.ts`
**Status:** Pending

#### Task CITE-003
**ID:** CITE-003
**Title:** Implement MLA 9 citation formatter
**Description:** Create MLA 9th edition citation formatter.
**Priority:** P1
**Effort:** M
**Dependencies:** CITE-001
**Acceptance Criteria:**
- [ ] Formats in-text citations correctly
- [ ] Formats works-cited entries correctly
- [ ] Golden tests for exact output
- [ ] Unit tests for MLA-specific rules
**Files Affected:** `src/citation_compliance/formatter/mlaFormatter.ts`
**Status:** Pending

#### Task CITE-004
**ID:** CITE-004
**Title:** Implement Chicago citation formatter
**Description:** Create Chicago style (Notes and Author-Date) citation formatter.
**Priority:** P1
**Effort:** M
**Dependencies:** CITE-001
**Acceptance Criteria:**
- [ ] Supports both Notes and Author-Date variants
- [ ] Formats bibliography correctly
- [ ] Golden tests for each variant
**Files Affected:** `src/citation_compliance/formatter/chicagoFormatter.ts`
**Status:** Pending

#### Task CITE-005
**ID:** CITE-005
**Title:** Implement IEEE citation formatter
**Description:** Create IEEE citation formatter for engineering publications.
**Priority:** P1
**Effort:** S
**Dependencies:** CITE-001
**Acceptance Criteria:**
- [ ] Numeric citation style with bracket notation
- [ ] Bibliography sorted by citation order
- [ ] Golden tests for IEEE format
**Files Affected:** `src/citation_compliance/formatter/ieeeFormatter.ts`
**Status:** Pending

#### Task CITE-006
**ID:** CITE-006
**Title:** Implement Vancouver citation formatter
**Description:** Create Vancouver style citation formatter for medical publications.
**Priority:** P2
**Effort:** S
**Dependencies:** CITE-001
**Acceptance Criteria:**
- [ ] Superscript numeric citations
- [ ] Authors' surnames in bibliography
- [ ] Golden tests for Vancouver format
**Files Affected:** `src/citation_compliance/formatter/vancouverFormatter.ts`
**Status:** Pending

#### Task CITE-007
**ID:** CITE-007
**Title:** Implement AMA citation formatter
**Description:** Create AMA style citation formatter.
**Priority:** P2
**Effort:** S
**Dependencies:** CITE-001
**Acceptance Criteria:**
- [ ] AMA-specific formatting rules
- [ ] Golden tests for AMA format
**Files Affected:** `src/citation_compliance/formatter/amaFormatter.ts`
**Status:** Pending

#### Task CITE-008
**ID:** CITE-008
**Title:** Implement ACS citation formatter
**Description:** Create ACS style citation formatter for chemistry publications.
**Priority:** P2
**Effort:** S
**Dependencies:** CITE-001
**Acceptance Criteria:**
- [ ] ACS-specific formatting rules
- [ ] Golden tests for ACS format
**Files Affected:** `src/citation_compliance/formatter/acsFormatter.ts`
**Status:** Pending

#### Task CITE-009
**ID:** CITE-009
**Title:** Implement DOI validator
**Description:** Create deterministic DOI syntax validator with optional checksum verification.
**Priority:** P0
**Effort:** S
**Dependencies:** None
**Acceptance Criteria:**
- [ ] Validates DOI format (10.xxxx/ format)
- [ ] Returns structured validation outcome
- [ ] Suggests fixes for common DOI errors
- [ ] Unit tests with valid/invalid DOIs
**Files Affected:** `src/citation_compliance/validator/doiValidator.ts`
**Status:** Pending

#### Task CITE-010
**ID:** CITE-010
**Title:** Implement ORCID validator
**Description:** Create ORCID validator with checksum verification.
**Priority:** P0
**Effort:** S
**Dependencies:** None
**Acceptance Criteria:**
- [ ] Validates ORCID format (0000-000X-XXXX-XXXX)
- [ ] Verifies ORCID checksum algorithm
- [ ] Returns structured validation outcome
- [ ] Unit tests with valid/invalid ORCIDs
**Files Affected:** `src/citation_compliance/validator/orcidValidator.ts`
**Status:** Pending

#### Task CITE-011
**ID:** CITE-011
**Title:** Implement ISBN validator
**Description:** Create ISBN-10 and ISBN-13 checksum validator.
**Priority:** P1
**Effort:** S
**Dependencies:** None
**Acceptance Criteria:**
- [ ] Validates ISBN-10 format and checksum
- [ ] Validates ISBN-13 format and checksum
- [ ] Handles hyphens and spaces
- [ ] Unit tests for both ISBN versions
**Files Affected:** `src/citation_compliance/validator/isbnValidator.ts`
**Status:** Pending

#### Task CITE-012
**ID:** CITE-012
**Title:** Implement ISSN validator
**Description:** Create ISSN checksum validator for journal identification.
**Priority:** P1
**Effort:** S
**Dependencies:** None
**Acceptance Criteria:**
- [ ] Validates ISSN format (XXXX-XXXX)
- [ ] Verifies ISSN checksum algorithm
- [ ] Unit tests with valid/invalid ISSNs
**Files Affected:** `src/citation_compliance/validator/issnValidator.ts`
**Status:** Pending

#### Task CITE-013
**ID:** CITE-013
**Title:** Implement reference consistency detector
**Description:** Create duplicate, missing, and unused reference detection logic.
**Priority:** P0
**Effort:** M
**Dependencies:** CITE-001
**Acceptance Criteria:**
- [ ] Detects duplicate references via DOI/URL/title key
- [ ] Identifies references not cited in-text
- [ ] Identifies in-text citations without references
- [ ] Returns structured consistency report
- [ ] Unit tests with consistency scenarios
**Files Affected:** `src/citation_compliance/consistency/referenceConsistency.ts`
**Status:** Pending

#### Task CITE-014
**ID:** CITE-014
**Title:** Implement journal requirement pack registry
**Description:** Create registry to manage journal-specific formatting and compliance rules.
**Priority:** P1
**Effort:** M
**Dependencies:** None
**Acceptance Criteria:**
- [ ] Register journal packs by journal ID
- [ ] Query packs by required criteria
- [ ] Default pack fallback
- [ ] Unit tests for registry
**Files Affected:** `src/citation_compliance/journal/journalRegistry.ts`
**Status:** Pending

#### Task CITE-015
**ID:** CITE-015
**Title:** Implement manuscript validation pipeline
**Description:** Create the orchestrated pipeline that validates manuscript against journal requirements.
**Priority:** P0
**Effort:** L
**Dependencies:** CITE-009 through CITE-014
**Acceptance Criteria:**
- [ ] Validates required sections
- [ ] Validates citation completeness
- [ ] Validates reference completeness
- [ ] Validates ethical statements
- [ ] Generates compliance report
- [ ] End-to-end tests
**Files Affected:** `src/citation_compliance/pipeline/compliancePipeline.ts`
**Status:** Pending

#### Task CITE-016
**ID:** CITE-016
**Title:** Integrate citationService.ts with 6C canonical model
**Description:** Either deprecate the old citationService.ts or create adapter layer to use the new CanonicalReference model.
**Priority:** P1
**Effort:** M
**Dependencies:** CITE-002 through CITE-008
**Acceptance Criteria:**
- [ ] Legacy citation metadata converts to CanonicalReference
- [ ] Existing UI continues to work
- [ ] No duplicate citation systems remain
- [ ] Migration guide documented
**Files Affected:** `src/services/citationService.ts`, `src/citation_compliance/adapter/`
**Status:** Pending

---

### FEATURE 6D — Research Analytics & Visualization Engine

#### Task ANALYTICS-001
**ID:** ANALYTICS-001
**Title:** Create analytics types and interfaces
**Description:** Define core types for research metrics, usage tracking, and visualization data.
**Priority:** P0
**Effort:** M
**Dependencies:** None
**Acceptance Criteria:**
- [ ] ResearchMetrics interface defined
- [ ] VisualizationData interface defined
- [ ] ChartConfig interface defined
- [ ] Types follow Research Integrity principles
**Files Affected:** `src/analytics/model/types.ts`
**Status:** Pending

#### Task ANALYTICS-002
**ID:** ANALYTICS-002
**Title:** Implement usage metrics tracker
**Description:** Create the metrics collection system that tracks AI usage, costs, and research activities.
**Priority:** P0
**Effort:** M
**Dependencies:** ANALYTICS-001
**Acceptance Criteria:**
- [ ] Tracks word counts and costs per provider
- [ ] Tracks model usage over time
- [ ] Session-based metrics aggregation
- [ ] Privacy-preserving by design
**Files Affected:** `src/analytics/tracker/usageTracker.ts`
**Status:** Pending

#### Task ANALYTICS-003
**ID:** ANALYTICS-003
**Title:** Implement compliance dashboard data provider
**Description:** Create data provider that aggregates compliance metrics for dashboard display.
**Priority:** P1
**Effort:** M
**Dependencies:** ANALYTICS-001, CITE-015
**Acceptance Criteria:**
- [ ] Aggregates compliance scores over time
- [ ] Tracks validation issue counts
- [ ] Provides data for visualization components
**Files Affected:** `src/analytics/provider/complianceProvider.ts`
**Status:** Pending

#### Task ANALYTICS-004
**ID:** ANALYTICS-004
**Title:** Implement research progress visualizer
**Description:** Create visualization components for research phase progress and timeline.
**Priority:** P1
**Effort:** L
**Dependencies:** ANALYTICS-001, ANALYTICS-002
**Acceptance Criteria:**
- [ ] Phase completion visualization
- [ ] Time-spent tracking charts
- [ ] Cost analysis charts
- [ ] Export capability for reports
**Files Affected:** `src/analytics/components/ResearchProgressChart.tsx`, `src/analytics/components/CostAnalysisChart.tsx`
**Status:** Pending

#### Task ANALYTICS-005
**ID:** ANALYTICS-005
**Title:** Implement citation analysis dashboard
**Description:** Create tools for analyzing citation patterns, completeness, and verification status.
**Priority:** P2
**Effort:** M
**Dependencies:** ANALYTICS-001, CITE-013
**Acceptance Criteria:**
- [ ] Citation density analysis
- [ ] Verification status breakdown
- [ ] Duplicate detection visualization
**Files Affected:** `src/analytics/components/CitationAnalysisDashboard.tsx`
**Status:** Pending

---

## LEGEND

**Priority Levels:**
- P0: Critical - Must be completed before next phase
- P1: High - Should be completed soon
- P2: Medium - Nice to have, can be deferred

**Effort Levels:**
- S: Small - 1-2 hours
- M: Medium - 1-2 days
- L: Large - 1+ weeks