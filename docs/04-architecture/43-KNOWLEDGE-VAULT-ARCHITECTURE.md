# Source Library Architecture

> **Doc ID:** 43 · **Status:** Complete & Locked · **Depends on:** `44`, `45`, `46`
> **Revision:** 5 — Source Library: Zero Document Storage, User-Owned Cloud Index (`source-library.json`), & Lightweight Synchronized Metadata.

**"Save your sources. Find them when you write."**

Source Library is the user's lightweight source indexing, organization, and citation layer. It is **not** a document storage service, not a research operating system, and not a vector/RAG platform.

---

## 1. Core Architectural Principle: Zero Document Storage

The fundamental requirement of Source Library is:

**SOURCE LIBRARY NEVER BECOMES A DOCUMENT STORAGE SERVICE.**

Actual user documents remain exclusively in the user's personal cloud storage:
- **Google Drive**
- **Microsoft OneDrive**
- **Original Publisher / Web URLs**

The application never permanently stores or hosts:
- PDF binaries
- Word (DOC/DOCX) binaries
- Excel (XLS/XLSX/CSV) binaries
- Document images or scans
- Downloaded document files
- Full extracted document text
- OCR output containing full document contents
- Transcription output containing full document contents
- Document blobs or permanent document caches

Zero user documents are persisted in application S3/object storage, backend persistent filesystems, or database BLOB columns.

---

## 2. Canonical Persistence: User-Owned Cloud Index

The canonical persistent library index is:

```
Google Drive / OneDrive
└── Source Library/
    └── source-library.json
```

Stored directly in the user's designated **Library Storage** provider.

### 2.1 Index Schema (`schemaVersion: 1`)

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-09-08T14:30:00.000Z",
  "libraryStorageProvider": "google_drive",
  "totalSources": 42,
  "projects": ["Master's Thesis", "Policy Report"],
  "sources": [
    {
      "id": "src-uuid",
      "sourceId": "src-uuid",
      "identity": {
        "doi": "10.1038/nature12373",
        "canonicalUrl": "https://doi.org/10.1038/nature12373",
        "provider": "google_drive",
        "fileId": "1a2b3c4d",
        "fileName": "Paper.pdf"
      },
      "metadata": {
        "title": "Quantum Error Correction",
        "authors": ["Fowler, Austin G.", "Mariantoni, Matteo"],
        "year": "2012",
        "journal": "Physical Review A",
        "volume": "86",
        "issue": "3",
        "pages": "032324",
        "doi": "10.1038/nature12373",
        "type": "paper"
      },
      "cloudReference": {
        "provider": "google_drive",
        "fileId": "1a2b3c4d",
        "fileName": "Paper.pdf",
        "webUrl": "https://drive.google.com/open?id=1a2b3c4d"
      },
      "projects": ["Master's Thesis"],
      "tags": ["quantum", "error-correction"],
      "notes": {
        "whySaved": "Core citation for surface code thresholds in Section 3.",
        "keyQuote": "Threshold error rate approaches 1% under circuit noise.",
        "page": "12"
      },
      "writingNotes": {
        "whySaved": "Core citation for surface code thresholds in Section 3."
      },
      "citation": "Fowler, A. G., & Mariantoni, M. (2012). Quantum error correction. Physical Review A, 86(3), 032324.",
      "citationFormats": {
        "apa7": "Fowler, A. G., & Mariantoni, M. (2012). Quantum error correction. Physical Review A, 86(3), 032324."
      },
      "citationStatus": "confirmed",
      "integrity": {
        "status": "checked",
        "checkedAt": "2026-09-08T12:00:00.000Z",
        "source": "Crossref",
        "message": "No retraction notices found across checked registries"
      },
      "integrityStatus": "clean",
      "createdAt": "2026-09-08T12:00:00.000Z",
      "updatedAt": "2026-09-08T12:00:00.000Z"
    }
  ]
}
```

### 2.2 Concurrency & Sanitization
- **Optimistic Concurrency**: Timestamp comparison (`isIndexUpdatePermitted`) prevents stale clients from overwriting newer cloud indexes.
- **Strict Sanitization**: Automatic scrubbing of any binaries, buffers, extracted text, and OAuth tokens before serialization.

---

## 3. Server-Side Metadata Persistence (Honest Disclosure)

For cross-device synchronized user accounts, the backend database table `public.user_vault_items` stores **server-side lightweight metadata only**.

- **Why it exists**: Enables fast, resilient cross-device synchronization and citation availability during writing stages (drafting, evidence linking, and dissertation chapters) without requiring synchronous cloud drive round-trips on every keypress.
- **What it stores**:
  - `title`, `source_type`, `filename`, `external_reference`, `storage_reference`, `citation`, `authors`, `year`, `journal`, `metadata` (tags, projects, writing notes).
- **What it NEVER stores**:
  - No document binaries, no full-text dumps, no OCR dumps, no audio transcripts, and no access tokens.

---

## 4. Security & SSRF Defense

All outbound URL metadata fetching (`/api/vault/parse-url`) is protected by multi-layer SSRF defenses implemented in `server/utils/ssrfGuard.ts`:

1. **Protocol Sanitization**: Only `http:` and `https:` schemes allowed.
2. **Subnet IP Filter**: Blocks loopback (`127.0.0.0/8`), RFC 1918 private subnets, link-local / cloud metadata (`169.254.0.0/16`, `169.254.169.254`), CGNAT (`100.64.0.0/10`), IPv6 loopback (`::1`), link-local (`fe80::/10`), ULA (`fc00::/7`), and IPv4-mapped IPv6.
3. **Connection-Time DNS Pinning & Interception**: Injects `createRebindingSafeLookup` into transport socket agent options. The resolved IP is verified at actual connection time; if a destination resolves to a private IP or rebounds to an unverified IP, the socket connection throws before transmitting HTTP headers.
4. **Hop-by-Hop Redirect Validation**: Every redirect (up to 5) is independently parsed and re-validated through the full verification pipeline.
5. **Streaming & Size Limits**: 8-second request timeout, 2 MB streaming body limit, and HTML/text content-type enforcement.
6. **Transient-Only Guarantee**: Fetched HTML is processed in-memory to extract title, authors, and year, and is never persisted, cached, logged, or stored in database or Source records.

---

## 5. Scholarly Identity & Duplicate Detection

Scholarly identity is explicitly decoupled from cloud file storage references:
- **Scholarly Identity**: DOI, canonical URL, bibliographic metadata.
- **Cloud File Identity**: Provider, fileId, fileName, webUrl.

### Duplicate Detection Rules:
1. **Definite Duplicate**: Exact normalized DOI match.
2. **Likely Duplicate**: High title similarity + supporting author/year evidence.
3. **Possible Duplicate**: Similar title without sufficient identity evidence. (Title similarity alone never produces a definite duplicate).
4. **Not Duplicate**: Clearly different DOI/title.

---

## 6. Research Integrity Language

To prevent overstated research certification:
- Generic `✓ Verified` claims are prohibited.
- UI status displays:
  - `Integrity checked`
  - `Integrity status: No retraction notices found across checked registries.`
  - `Publication alert: Retraction notice found.`
- Transparently communicates registry coverage boundaries (Crossref & Retraction Watch).

---

## 7. User Experience Mental Model

The product is deliberately calm and focused:

```
SAVE A SOURCE ──▶ ORGANIZE IT ──▶ FIND IT ──▶ CITE IT
```

- **Navigation**: Sources · Projects · Settings
- **Primary Action**: `+ Add Source` (Google Drive, OneDrive, Web URL, DOI lookup, BibTeX/RIS)
- **Search**: Unified `Search your sources...` across titles, authors, DOI, projects, tags, and notes.
- **Zero Technical Leakage**: No parser internals (`/Producer`, `Skia`), vector scores, chunking indicators, embeddings, or RAG terminology in the user interface.
