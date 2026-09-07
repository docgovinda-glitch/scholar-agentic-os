# Knowledge Vault Architecture

> **Doc ID:** 43 · **Status:** Design · **Depends on:** `44`, `45`, `46`
> **Revision:** 4 — Universal Vault v2 Dual Engine (Universal Cloud Sync + Browser-Held Encrypted Storage).

The user's optional, encrypted or cloud-synced, long-term knowledge corpus.

---

## 1. What it is

**The Vault is everything the user has read, written, and collected — searchable,
for years.**

Not a reference manager (it holds full content, not just metadata). Not a note
app (it holds source material, not just notes). Not a file store (it is parsed,
indexed, and semantically searchable).

**Universal Vault v2 Dual Engine:**
The Vault offers the user two distinct storage and privacy paradigms:
1. **Universal Cloud Sync (Recommended):** Real-time multi-device synchronized storage backed by Supabase `public.user_vault_items` with Row Level Security (RLS). Automatically synchronizes papers, datasets, cloud drive files (Google Drive & OneDrive), and auto-extracted academic citations across any computer or browser.
2. **Private Browser-Only Mode (Conflict #7):** Client-held and passphrase-encrypted, stored strictly in browser IndexedDB (`scholar-vault-items:<userId>`) with PBKDF2-SHA256 (100k iterations) and AES-GCM-256 encryption. Only a lightweight existence record (`public.user_vaults`: `{ user_id, label, storage_mode, created_at }`) resides on the server.

For a PhD candidate in year four, the Vault is the answer to *"what did I read
about this in 2023?"* — a question that is otherwise unanswerable and that
currently costs researchers real time.

### 1.1 Optional means optional

`REQ-VLT-1` is a load-bearing constraint, not a courtesy:

- Skipping at onboarding leaves every feature working (`REQ-ONB-7`).
- No module may hard-depend on `app/vault` (`13` §4).
- Agents holding `read:vault` must function without it.
- The Vault is re-offered contextually, at most once per 30 days
  (`25` §10.2).

The architectural test is simple: delete the Vault and every test outside the
Vault suite must still pass.

---

## 2. Content

Everything in `REQ-VLT-2`:

| Category | Formats | Processing |
|---|---|---|
| Papers and articles | PDF, HTML | Parse, extract references, index |
| Books and chapters | PDF, EPUB | Parse, chapter segmentation |
| Lecture notes | PDF, DOCX, PPTX, Markdown | Parse, index |
| Prior work | DOCX, ODT, PDF, LaTeX | Parse; marked as the user's own |
| Theses and dissertations | PDF, DOCX | Parse, chapter segmentation |
| Handwritten notes | Images, PDF scans | OCR (handwriting where possible), index |
| Images and figures | PNG, JPG, TIFF, SVG | OCR embedded text; caption; visual embedding |
| Transcripts | TXT, VTT, SRT, DOCX | Index with timestamps |
| Audio | MP3, WAV, M4A | Local transcription, then index |
| Video | MP4, MOV | Local transcription, keyframe extraction |
| Datasets | CSV, XLSX, JSON, Parquet | Schema extraction, statistical summary, index |
| Lab notes | Any of the above | Parse, timestamp, index |
| Web pages | URL | Snapshot, parse, index, record capture date |
| Email and correspondence | EML, MSG | Parse, index (supervisor feedback is research material) |

### 2.1 The user's own work is special

Material marked as the user's own prior work is tracked distinctly. When it is
drawn into a project it carries origin `imported_own_work` (`32` §3.1), which
matters for two reasons: self-plagiarism awareness (AG-19), and honest authorship
reporting.

---

## 3. Structure

```
Vault (per Workspace)
├── Collections            user-defined, nestable, many-to-many
├── Documents
│   ├── Blob               content-addressed, encrypted
│   ├── CDM                parsed structure
│   ├── Metadata           bibliographic + user
│   ├── Annotations        highlights, notes, tags
│   ├── Extracted refs     the document's own bibliography
│   └── Derived            embeddings, summaries, entities
├── Relationships          cites, contradicts, extends, same-topic, same-author
└── Index                  full-text + vector
```

### 3.1 Organisation

The Vault does not impose a hierarchy. Collections are user-defined and a
document may be in several; tags are flat; relationships form a graph. This
matches how research libraries actually accumulate — messily, with items
belonging to several projects at once — rather than imposing a filesystem
metaphor that users then fight.

---

## 4. Ingestion

```
Add ─▶ Detect ─▶ Deduplicate ─▶ Parse ─▶ Extract ─▶ Enrich ─▶ Index ─▶ Available
                     │                                  │
              content hash +                    identifier resolution
              identifier match                  (Warden-gated, optional)
```

| Stage | Detail |
|---|---|
| **Add** | Drag-drop, folder watch, import from a reference manager, browser share target, mobile share |
| **Detect** | Format by content, not extension |
| **Deduplicate** | Content hash first, then identifier, then fuzzy title+author. Offers merge |
| **Parse** | To CDM. Local, always (`REQ-LOC-1`) |
| **Extract** | Metadata, the document's own references, structure, entities |
| **Enrich** | Identifier resolution and citation-count lookup. Optional and Warden-gated as `bibliographic` |
| **Index** | Full-text and vector. Local |

### 4.1 Bulk ingestion

Importing a decade of reading is the common first action. It must not block the
product.

| Property | Behaviour |
|---|---|
| Background | User continues working |
| Resumable | Survives quit and crash |
| Prioritised | Recently added and currently relevant first |
| Throttled | Respects Resource Monitor limits; yields to interaction |
| Progress | Per-stage, per-document, with failures listed individually |
| Partial availability | A document is searchable by metadata before its embeddings finish |

**Time expectations, stated honestly:** 1,000 PDFs on baseline hardware
(`NFR-HW-1`) is several hours of embedding. The UI says so before starting and
offers metadata-only indexing as a fast path, with semantic search added later.

### 4.2 Reference manager import

| Source | Imports |
|---|---|
| Zotero | Library, collections, tags, notes, attachments, via SQLite or RDF export |
| Mendeley | Library and PDFs via export |
| EndNote | XML |
| BibTeX / RIS | Metadata; attachments where paths resolve |
| Papers / ReadCube | Export formats |

Structure is preserved: collections become collections, tags become tags. A user
with a curated Zotero library keeps their curation.

---

## 5. Index and retrieval

### 5.1 Two indexes

| Index | Technology | Serves |
|---|---|---|
| Full-text | Embedded inverted index (BM25) | Exact terms, names, phrases, identifiers |
| Vector | Local embedding + ANN | Conceptual similarity |

Both local. Both rebuildable from blobs — the index is derived state, never a
source of truth (`13` §3).

### 5.2 Embeddings

| Concern | Approach |
|---|---|
| Model | Local by default (`41` §4.2). A cloud embedding provider would see the entire Vault |
| Chunking | Semantic where structure permits; ~512 tokens with overlap otherwise |
| Storage | Quantised; ~1.5 KB per chunk |
| Scale | 5,000 documents ≈ 400k chunks ≈ 600 MB |
| Rebuild | Possible; expensive; only on model change |

**Changing the embedding model invalidates every embedding.** This is stated
plainly before the user changes it, with the re-embedding time estimated.

### 5.3 Retrieval

Hybrid: keyword and vector results fused with reciprocal rank fusion, then
reranked. Results are labelled with why they matched — users lose trust in
semantic search fast when a result's relevance is inexplicable.

| Mode | Use |
|---|---|
| Keyword | Names, phrases, identifiers |
| Semantic | Concepts |
| Hybrid *(default)* | General |
| Contextual | "Related to the section I'm writing" — the Knowledge Explorer's highest-value mode |
| Question | Natural-language question over the Vault |

### 5.4 Performance

| Operation | Target at 5,000 documents |
|---|---|
| Keyword search | < 200 ms |
| Semantic search | < 800 ms (`NFR-PERF-3`) |
| Hybrid | < 1 s |
| Contextual (background) | < 3 s |
| Ingest one PDF | < 30 s including embeddings |

---

## 6. Vault → Project

Vault material is not automatically available to a project. It passes through
the same approval path as external material (`REQ-VLT-5`).

```
Vault document ──▶ proposed for the project ──▶ user approves ──▶ Approved Corpus
```

### 6.1 Why approval is required for the user's own library

It looks like unnecessary friction. It is not:

1. **Relevance is not membership.** Having read something does not mean it belongs
   in this project's evidence base.
2. **The corpus is the citable set.** `REQ-SRC-8`'s guarantee holds only if there
   is exactly one path into it.
3. **The project must survive the Vault.** Copying into the corpus means deleting
   the Vault does not break a five-year-old project (`20` §2.1).
4. **Systematic reviews need the screening record.** Vault material must be
   screened like anything else (`26` Journey 7).

The friction is low in practice: AG-04 proposes relevant Vault material
contextually, and approval is one action per item.

---

## 7. Curation

AG-07 maintains Vault health. It **proposes**; it never deletes.

| Task | Behaviour |
|---|---|
| Duplicate detection | Proposes merges |
| Tag suggestion | From content and existing tags |
| Relationship detection | Citation graph, topic similarity, contradiction |
| Gap identification | Where the library is thin relative to the user's areas |
| Stale flagging | Superseded editions, retracted papers, dead URLs |
| Health report | Unparsed documents, missing metadata, broken attachments |

### 7.1 Retraction monitoring

The Vault periodically re-checks retraction status for identified sources. A
retracted paper in the Vault produces a notification, and if it is cited in an
active project, a finding.

This is genuinely valuable and difficult to do manually: papers get retracted
years after publication, long after the researcher has moved on, and nobody
re-checks their old reading.

---

## 8. External sources

For discovery (AG-05) and enrichment (AG-01, AG-06).

| Source | Provides | Access |
|---|---|---|
| Crossref | DOI metadata, references | Open API |
| OpenAlex | Works, authors, venues, citations | Open API |
| PubMed / PMC | Biomedical literature | Open API |
| arXiv | Preprints | Open API |
| Semantic Scholar | Metadata, citations, influence | API |
| DOAJ | Open access journals | Open API |
| Unpaywall | Legal open-access full text | Open API |
| Retraction Watch / Crossref | Retraction status | Open |
| OpenAIRE, CORE | Repository aggregation | Open API |
| DataCite | Datasets | Open API |
| ORCID | Author disambiguation | Open API |
| Institutional discovery | Library holdings | Per-institution |

**Rules**

- Every query passes the Warden as `bibliographic`.
- Every result is attributed to its service.
- Failure of one service degrades gracefully.
- Rate limits respected; results cached locally.
- Full text retrieved only through legal open-access routes; paywalled content is
  surfaced as metadata with institutional-access guidance.

---

## 9. Encryption

> **Conflict #7 authoritative implementation** — verified against `src/services/vaultContents.ts`
> and `src/services/userVault.ts`.

| Aspect | Approach |
|---|---|
| At rest | Each Vault item encrypted independently via `encryptDataAsync` (PBKDF2-SHA256 100k iterations + AES-GCM-256, unique random 16-byte salt and 12-byte IV per item) |
| Storage | IndexedDB (`scholar-vault-items:<userId>`) — only `{ id, createdAt, ciphertext }` is persisted |
| Key material | Passphrase held in module-scope memory (`activePassphrase`) for the current tab only; cleared on reload or explicit `lockVault()` |
| Passphrase verification | SHA-256 hash of passphrase stored in `localStorage` (`scholar-vault-verifier:<userId>`) — device-local, never sent to server |
| Recovery | Recovery code (Crockford-encoded `SCHL-XXXX-XXXX-XXXX-XXXX`), shown once at creation, never stored server-side; operator cannot recover |
| Search | Client-side substring search over in-memory decrypted items; no server index, no vector database |
| Server knowledge | `public.user_vaults`: `{ user_id, label, created_at }` only — zero content, zero ciphertext, zero keys |
| Sync | Not yet implemented; future sync will transfer opaque ciphertext blobs only |

### 9.1 The searchable-encryption trade-off

Full searchable encryption (encrypted index queried without decryption) is not
used. Items are decrypted into browser process memory during search.

This is an honest trade-off, documented rather than hidden:

- **Gained:** fast substring search over decrypted items with zero latency and
  zero server roundtrips.
- **Given up:** protection against an attacker with live memory access to the
  running browser tab on an unlocked machine.
- **Retained:** protection at rest, which is the realistic threat (stolen laptop,
  backup exposure, cloud sync compromise).

`46` §4 records this in the threat model.

---

## 10. Scale and limits

| Dimension | Supported | Degrades |
|---|---|---|
| Documents | 5,000 (`NFR-SCALE-1`) | 20,000 with reduced search latency |
| Single document | 2,000 pages | Larger, with slower parsing |
| Total size | 50 GB | Bounded by disk |
| Collections | Unlimited | — |
| Concurrent ingestion | 4 documents | Configurable |

Beyond 5,000 documents the system warns and suggests splitting into multiple
workspace Vaults or archiving older material.

---

## 11. Portability

`REQ-VLT-7` and `P9`. The Vault must be usable without Scholar OS.

**Export produces:**

```
vault-export/
├── manifest.json          documents, metadata, relationships, collections
├── documents/
│   ├── <id>/
│   │   ├── original.pdf   the original file, unmodified
│   │   ├── content.md     parsed content
│   │   ├── metadata.json
│   │   └── annotations.json
├── references.bib         full bibliography
└── README.md             what this is and how to read it
```

Plain files, open formats, documented schema, no proprietary container. A user
who abandons Scholar OS keeps a usable library — which is the only version of
data ownership that means anything.

---

## 12. Backup

The Vault is often the most irreplaceable thing a researcher owns.

| Mechanism | Behaviour |
|---|---|
| Local snapshot | Incremental, scheduled |
| External destination | User-configured drive or folder; encrypted |
| Cloud sync | Optional, E2E encrypted (`44` §5) |
| Export | Full portable export (§11) |
| Verification | Periodic restore test; reports when a backup last verified |

**Prompted at:** Vault creation, 100 documents, 500 documents, and every 90 days
without a verified backup. See `44` §7 for the full backup regime and `RISK-04`.

---

## 13. Current state

> **Conflict #7 verified** — the following reflects the actual active implementation.

### 13.1 Implemented (Verified)

| Component | Implementation |
|---|---|
| **Universal Dual Engine** (`src/services/userVault.ts`, `src/services/vaultContents.ts`) | Supports both `synced` (Supabase RLS `user_vault_items`) and `local` (IndexedDB AES-GCM-256) |
| **Vault metadata** (`src/services/userVault.ts`) | `loadVault()`, `createVault()`, `updateVaultStorageMode()`, `resetVault()` |
| **Vault contents** (`src/services/vaultContents.ts`) | `addVaultItem()`, `listVaultItems()`, `searchVaultItems()`, `lockVault()`, `unlockVault()`, `deleteVaultItem()` |
| **Multi-format Ingestion** (`src/desk/vault/VaultDocumentImport.tsx`, `server/routes/vault.ts`) | PDFs (with metadata heuristic parsing), DOCX (`mammoth`), XLSX/CSV (`xlsx`), BibTeX/RIS, Plain Text, DOIs (Crossref API), Web URLs & YouTube |
| **Cloud Drive Integration** (`src/services/vault/cloudDriveService.ts`) | Google Drive & Microsoft OneDrive OAuth2 browsing, search, and import |
| **Reference Manager Ingestion** (`src/desk/vault/VaultDocumentImport.tsx`) | Zotero API sync and Mendeley BibTeX parsing |
| **Academic Citation Engine** (`src/services/vault/citationService.ts`) | Multi-style formatting (APA7, IEEE, MLA9, Chicago, Harvard, Vancouver), in-text citations, and BibTeX conversion |
| **Project Approval Gate** (`src/desk/workspace/stages/VaultSourcesStage.tsx`) | Archivist Agent scans Vault, computes relevance, and requires user approval before adding to project corpus (`REQ-VLT-5`) |
| **Passphrase & Recovery** (`src/services/userVault.ts`) | Local SHA-256 verifier in localStorage, `generateRecoveryCode()` Crockford-encoded |
| **Portable Open Export** (`src/services/vault/vaultExportService.ts`) | `exportVaultAsZip()` produces `.zip` with `manifest.json`, `references.bib`, and `documents/<id>/content.md` (`REQ-VLT-7`) |

### 13.2 Remaining / Future Enhancements

| Target | Status |
|---|---|
| In-browser vector embedding index (ANN) | In progress |
| Local audio/video speech-to-text transcription (Whisper) | In progress |
| Handwritten notes & image OCR | In progress |
| Automated background Retraction Watch monitoring | In progress |
| Virtualized list rendering for 5,000+ items | In progress |
