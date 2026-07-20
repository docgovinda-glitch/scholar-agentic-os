# Document Intelligence Architecture Report

## Executive Summary

The Document Intelligence subsystem is a comprehensive document processing pipeline designed to parse, validate, and transform academic documents into a canonical document model (CDM). This analysis covers the complete architecture including parsers, pipeline stages, registries, and integration points.

---

## 1. Complete Document Processing Pipeline

### Pipeline Flow Diagram

```
User Upload
    ↓
┌─────────────────────────────────────────────────────────┐
│                    Document Pipeline                     │
│              (parser/pipeline.ts - DocumentPipeline)     │
└─────────────────────────────────────────────────────────┘
    ↓
1. Format Detection (formatIdentifier.ts)
    - Magic byte signature matching
    - MIME type detection
    - Extension-based fallback
    ↓
2. Document Validation (documentValidator.ts)
    - Size limits (default 100MB)
    - Format validation
    - Encryption detection
    - MIME consistency check
    - Corruption check
    ↓
3. Parser Selection
    - ParserRegistry lookup by format
    - Auto-discovery via MIME/extension
    ↓
4. Text Extraction (Parser Implementations)
    - PDF: pdf-parse library
    - DOCX: mammoth library
    - TXT: Native encoding detection
    - Markdown: Custom block parser
    ↓
5. CDM Generation (cdmAdapter.ts)
    - DocumentIdentity creation
    - Metadata transformation
    - Structure assembly
    - Statistics calculation
```

### Dual Pipeline Architecture

**Note:** The system has TWO distinct pipelines:

1. **Parser Pipeline** (`parser/pipeline.ts`): Entry point for document processing via `DocumentPipeline.processDocument()` - handles format detection → validation → parser selection → parsing.

2. **Stage Pipeline** (`pipeline/pipeline.ts`): Abstract orchestration pipeline expecting `DocumentIntelligenceStage[]` injections for stages like validate, identify_format, parse, normalize, extract_metadata, extract_structure, extract_references, generate_model, store, index_prep.

**The Stage Pipeline is NOT connected to the Parser Pipeline** - it exists as a separate abstraction layer requiring stage implementations that are NOT provided in the current codebase.

---

## 2. Parser Registry Analysis

### ParserRegistry (`parser/parserRegistry.ts`)

**Purpose:** Manages registration, discovery, and lifecycle of document parsers.

**Responsibilities:**
- Singleton pattern for global access
- Parser registration with version conflict detection
- Capability-based parser discovery via query system
- Enable/disable parser states
- Auto-discovery of parsers by MIME type or file extension
- Event emission for registration lifecycle

**Public Interfaces:**
```typescript
interface Parser {
  metadata: ParserMetadata;
  parse(input: DocumentInput): Promise<ParserOperationResult>;
}

interface ParserRegistry {
  register(parser: Parser, options?: ParserRegisterOptions): { success: true } | { success: false; reason: string };
  unregister(id: string): boolean;
  get(id: string): Parser | undefined;
  getMetadata(id: string): ParserMetadata | undefined;
  list(): ParserMetadata[];
  query(options: ParserQuery): ParserMetadata[];
  parse(input: DocumentInput, parserId?: string): Promise<ParserOperationResult>;
}
```

**Parser Selection Logic:**
1. If `parserId` provided → direct lookup
2. Else if `mimeType` provided → query by MIME type, use first match
3. Else if `filename` provided → extract extension, query by extension
4. Else → return UNSUPPORTED_FORMAT error

---

## 3. Supported Format Matrix

| Format | Parser | Magic Bytes | MIME Types | Extensions | Capabilities |
|--------|--------|-------------|------------|------------|--------------|
| PDF | PDFParser | `%PDF` (0x25, 0x50, 0x44, 0x46) | application/pdf | pdf | metadata, structure, 100MB limit |
| DOCX | DOCXParser | PK.. (ZIP signature) | application/vnd.openxmlformats-officedocument.wordprocessingml.document | docx | metadata, structure, 100MB limit |
| TXT | TXTParser | None (text-based) | text/plain | txt | metadata, structure, encoding detection, 100MB limit |
| Markdown | MarkdownParser | None (text-based) | text/markdown, text/x-markdown | md, markdown | metadata, structure, 50MB limit |
| HTML | FormatIdentifier only | None | text/html | html, htm | Identified but NO PARSER REGISTERED |
| RTF | FormatIdentifier only | None | text/rtf, application/rtf | rtf | Identified but NO PARSER REGISTERED |
| EPUB | FormatIdentifier only | PK.. (ZIP) | application/epub+zip | epub | Identified but NO PARSER REGISTERED |
| ODT | FormatIdentifier only | None | application/vnd.oasis.opendocument.text | odt | Identified but NO PARSER REGISTERED |
| LaTeX | FormatIdentifier only | None | text/x-latex, application/x-latex | tex, latex | Identified but NO PARSER REGISTERED |
| XML | FormatIdentifier only | None | application/xml, text/xml | xml | Identified but NO PARSER REGISTERED |
| RIS | FormatIdentifier only | None | application/x-research-info-systems | ris | Identified but NO PARSER REGISTERED |
| BibTeX | FormatIdentifier only | None | application/x-bibtex | bib, bibtex | Identified but NO PARSER REGISTERED |

**VERIFIED ISSUE:** Formats identified in FormatIdentifier are NOT backed by parser implementations:
- HTML, RTF, EPUB, ODT, LaTeX, XML, RIS, BibTeX are identified but have no registered parsers.

---

## 4. Module-by-Module Analysis

### 4.1 Model Types (`model/types.ts`)

**Purpose:** Defines the Canonical Document Model structures.

**Structures:**
- `Document` - Complete document with pages, sections, paragraphs, tables, figures, references, searchable text
- `DocumentMetadata` - Source info, language/encoding, academic metadata, flags
- `Page` - Page-level content with section/paragraph mappings
- `Section` - Hierarchical structure with heading info, page mappings, roles
- `Paragraph` - Text content with order and role
- `Table` - Rows/columns with optional caption
- `Figure` - Figure placeholders with optional caption
- `Reference` - Reference entries with raw text and citation placeholders
- `Chunk` - Searchable chunks with paragraph range markers
- `DocumentIntelligencePartialModel` - Incremental building structure

### 4.2 CDM Types (`cdm.ts`)

**Purpose:** Alternative CDM definition with different structure (appears to be a duplicate/parallel model).

**Note:** This file defines a separate CDM interface (`CanonicalDocumentModel`) that is distinct from `model/types.ts` Document interface. This creates potential confusion and duplication.

### 4.3 CDM Adapter (`adapters/cdmAdapter.ts`)

**Purpose:** Converts ParserResult to CanonicalDocumentModel.

**Workflow:**
1. Generate document identity with SHA-256 fingerprint
2. Extract metadata from parser result
3. Create default structure from text/pages
4. Calculate statistics (word count, reading time, etc.)
5. Assemble CDM with identity, metadata, structure, statistics, diagnostics

**KNOWN ISSUE:** Uses `require("crypto")` inside function instead of ES module import (potential bundling issue).

### 4.4 Format Identifier (`pipeline/stages/formatIdentifier.ts`)

**Purpose:** Detects document format using multiple methods.

**Detection Methods (Priority):**
1. Magic byte signatures (highest priority)
2. MIME type mapping
3. Extension mapping (lowest priority)

**Conflict Resolution:**
- Prefers signature > MIME type > extension
- Boosts confidence when multiple methods agree (+0.1 per agreeing method)

### 4.5 Document Validator (`pipeline/stages/documentValidator.ts`)

**Purpose:** Validates document integrity, size, and encryption status.

**Validation Checks:**
- Empty file detection
- Size limit enforcement (default 100MB)
- Format validation against allowed list
- Encryption detection (PDF: checks for /Encrypt, /Encrypted, /Password)
- MIME type consistency check
- Corruption check (PDF header, DOCX/ZIP signature, text validity)

### 4.6 Skill Integration (`skills/documentIntelligenceSkill.ts`)

**Purpose:** Skills Framework integration point for document processing.

**Workflow:**
1. Accepts DocumentIntelligenceInput through skill input wrapper
2. Delegates to DocumentIntelligencePipeline
3. Returns Document or failure with diagnostics

**Note:** Requires externally injected stages (not implemented in current codebase).

---

## 5. Parser Implementations

### 5.1 PDF Parser (`parsers/pdfParser.ts`)

**Dependencies:** `pdf-parse` (external library)

**Validation:**
- PDF header check (`%PDF-`)
- Encryption detection via /Encrypt markers
- Valid signature required

**Extraction:**
- Text extraction via pdf-parse
- Page splitting (via form feed characters)
- Metadata: Title, Author, Subject, Keywords, Creator, Producer, CreationDate, ModDate

### 5.2 DOCX Parser (`parsers/docxParser.ts`)

**Dependencies:** `mammoth` (external library)

**Validation:**
- ZIP signature check (DOCX is ZIP-based)

**Extraction:**
- Raw text extraction via mammoth
- Paragraph extraction with heading detection heuristic
- Page estimation (3000 chars per page)
- LIMITED metadata - core properties not fully extracted

**KNOWN ISSUE:** Heading detection heuristic is simplistic (checks length < 100 and no period).

### 5.3 TXT Parser (`parsers/txtParser.ts`)

**Dependencies:** Native Node.js Buffer

**Features:**
- Encoding detection (UTF-8 BOM, UTF-16 LE/BE, ASCII)
- Line ending normalization (CRLF/CR → LF)
- Paragraph splitting via double newlines
- Page estimation (3000 chars per page)
- Metadata: encoding, line count, word count, character count

**KNOWN ISSUES:**
- UTF-8 BOM not stripped from output text
- Encoding detection returns 'utf-8' for pure ASCII (should return 'ascii' per test expectation)

### 5.4 Markdown Parser (`parsers/markdownParser.ts`)

**Dependencies:** Native

**Extraction:**
- Block parsing (headings, paragraphs, lists, blockquotes, code, tables)
- Link/image extraction via regex
- Outline generation from headings
- Text extraction (strips markdown syntax)
- Page estimation (3000 chars per page)

**KNOWN ISSUE:** Code block counting is off - counts opening delimiter as separate block.

---

## 6. Architectural Review

### Duplicate Parsers
- **NONE VERIFIED** - Each format has one parser implementation.

### Duplicate Utilities
- **CDM Models**: Two parallel CDM definitions exist:
  - `model/types.ts` - Document, DocumentMetadata, etc.
  - `cdm.ts` - CanonicalDocumentModel, DocumentIdentity, etc.
  
  These are **INCOMPATIBLE** models with different structures. The CDMAdapter produces `CanonicalDocumentModel` while the pipeline expects `Document` from model/types.

### Dead Code
- **Parser Stage Registry** (`pipeline/stageRegistry.ts`): Registered parser pipeline stages are defined in types but no implementations exist. The `DocumentIntelligencePipeline` requires stages to be injected, but no registration occurs.

### Unused Parsers
- **MISSING PARSER REGISTRATIONS**: 8 formats identified but not implemented:
  - HTML, RTF, EPUB, ODT, LaTeX, XML, RIS, BibTeX

### Tight Coupling
- `cdmAdapter.ts` uses `require("crypto")` instead of ES module - couples to CommonJS
- Parser implementations directly import external libraries (`pdf-parse`, `mammoth`) without abstraction

### Circular Dependencies
- **NONE VERIFIED** - Dependency graph appears clean.

### Pipeline Bottlenecks
- **Stage Pipeline Disconnect**: The `DocumentIntelligencePipeline` has no connection to the working `DocumentPipeline`. Users calling `DocumentPipeline.processDocument()` get a different flow than the documented stage pipeline.

### Memory Concerns
- Large file handling: 100MB default limit may cause memory issues for very large PDFs
- No streaming support in parsers - all content loaded into memory
- Page estimation uses 3000 char heuristic which may not align with actual page breaks

### Scalability Concerns
- Singleton pattern in ParserRegistry/FormatIdentifier/DocumentValidator limits multi-tenancy
- No queue/worker system for concurrent document processing
- No progress callbacks beyond basic onProgress hook

---

## 7. Test Coverage Assessment

### Test Summary
- **Total Tests**: 177
- **Passed**: 164
- **Failed**: 13

### Failed Test Analysis

| Test File | Failed Test | Root Cause | Classification |
|-----------|-------------|------------|----------------|
| formatIdentifier.test.ts | should return unknown for unrecognized MIME type | Test assertion incorrect - checks detections instead of resolvedFormat | Test Bug |
| txtParser.test.ts | should detect UTF-8 encoding | Returns 'utf-8' instead of 'ascii' for ASCII text | Implementation/Expectation Mismatch |
| txtParser.test.ts | should detect UTF-8 BOM | BOM character NOT stripped from output | Implementation Bug |
| documentValidator.test.ts | should accept files within size limit | Returns 'warning' instead of 'valid' due to corruption check on random bytes | Implementation/Expectation Mismatch |
| documentValidator.test.ts | should accept allowed format | Same as above - corruption warning triggered | Implementation/Expectation Mismatch |
| markdownParser.test.ts | should parse fenced code blocks | Counts delimiters as separate blocks | Implementation Bug |

### Missing Tests
- No integration tests for PDF/DOCX/Markdown parsers with actual document content
- No tests for CDMAdapter.toCDM()
- No tests for DocumentPipeline.registerParsers() error cases
- No tests for parser error recovery scenarios
- No tests for edge cases (encrypted PDFs, corrupted files)

---

## 8. OCR Implementation

**VERIFIED:** OCR is implemented in `server.ts` via Gemini API for image files (PNG, JPG, JPEG).

**Endpoint:** `POST /api/parse-file` with image extensions triggers:
1. Gemini 2.5-flash model call
2. System prompt: "Transcribe all readable text from this image"
3. Returns extracted text or failure message

**LIMITATIONS:**
- Images must be passed to server endpoint, not client-side parsers
- No OCR capability in client-side Document Intelligence parsers
- Audio transcription also available via same endpoint

---

## 9. Citation Extraction

**VERIFIED:** No dedicated citation extraction in Document Intelligence.

- Markdown parser extracts links/images, not citations
- No RIS/BibTeX parsing despite format identification
- Citation extraction would require separate stage implementation

---

## 10. Section Detection

**VERIFIED:** Limited section detection exists.

- Markdown parser detects headings (ATX style # style)
- DOCX parser has heuristic heading detection
- No semantic role detection (introduction, methods, results, etc.)
- Section hierarchy not built - only flat lists

---

## 11. Chunking Strategy

**VERIFIED:** Two chunking approaches exist:

1. **Parser-level Page Estimation** (TXT, Markdown, DOCX):
   - 3000 character chunks
   - Grouped by paragraphs
   - Used for page-level text division only

2. **Knowledge Vault Chunking** (from earlier analysis):
   - CHUNK_SIZE = 1500
   - CHUNK_OVERLAP = 200
   - Paragraph/sentence boundary hints

**NO OVERLAP STRATEGY** in Document Intelligence parsers - only sequential division.

---

## 12. Known Risks

### Critical
1. **Model Duality Risk**: Two incompatible CDM models exist without clear migration path
2. **Missing Parser Implementation**: 8 formats identified but non-functional
3. **Pipeline Disconnection**: Stage pipeline documented but not implemented

### High
1. **BOM Not Stripped**: UTF-8 BOM causes output corruption
2. **Encoding Detection**: ASCII returns as UTF-8, may confuse downstream processing
3. **Test Failures**: 13 failing tests indicate instability

### Medium
1. **OCR Server Dependency**: Client-side processing cannot handle images
2. **No Progress Granularity**: Only stage-level progress, not operation-level
3. **Singleton Limitation**: Prevents multi-tenant isolation

### Low
1. **Page Estimation Heuristic**: 3000 char approximation may be inaccurate
2. **Heading Detection**: Simple heuristics may misclassify content

---

## 11. Remaining Unknowns

- Whether `DocumentIntelligenceStage` implementations will be added in future cycles
- Performance characteristics under production load
- Memory usage patterns for large document sets
- Integration with Knowledge Vault storage layer
- Whether CDM model duality is intentional or oversight