# Knowledge Vault Architecture

> **Doc ID:** 43 · **Status:** Design · **Depends on:** `44`, `45`, `46`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

The user's optional, encrypted, local, long-term knowledge corpus.

---

## 1. What it is

**The Vault is everything the user has read, written, and collected — searchable,
for years.**

Not a reference manager (it holds full content, not just metadata). Not a note
app (it holds source material, not just notes). Not a file store (it is parsed,
indexed, and semantically searchable).

**Revision 2:** the Vault is server-side, encrypted at rest, with the data
handling in `44`.

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

| Aspect | Approach |
|---|---|
| At rest | Every blob and index encrypted with a per-object CEK |
| Key hierarchy | Passphrase → Master Key → CEKs (`46` §5) |
| Platform sealing | Master Key sealed to Keychain / DPAPI / TPM where available |
| Recovery | Recovery Kit; operator cannot recover (`46` §6) |
| Search | Index is encrypted at rest, decrypted in memory during search |
| Sync | Encrypted before leaving the device (`44` §5) |

### 9.1 The searchable-encryption trade-off

Full searchable encryption (encrypted index queried without decryption) is not
used. The index is decrypted into process memory during search.

This is an honest trade-off, documented rather than hidden:

- **Gained:** fast hybrid search over 5,000 documents on baseline hardware, which
  is the feature's entire value.
- **Given up:** protection against an attacker with live memory access to the
  running service tier on an unlocked machine.
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

`src/services/knowledgeVaultService.ts`,
`src/components/KnowledgeVaultEngineV2.tsx`, `KnowledgeVaultManager.tsx`,
`KnowledgeVaultWizard.tsx`, `KnowledgeVaultWorkspace.tsx`, and
`src/services/vaultPassphrase.ts` exist.

| Current | Target |
|---|---|
| Prototype storage | Encrypted, content-addressed local store |
| Passphrase concept exists | Full key hierarchy with platform sealing and Recovery Kit |
| Full-text index built (`services/index`'s `TextIndex` — real BM25 over generic `{id, text}` records, `src/services/index/textIndex.ts`) but not wired to the Vault (no VaultDocument entity exists yet to index) | Embedded inverted index over actual Vault content |
| No local vector index | Local embeddings with hybrid retrieval |
| Limited formats | Fourteen content categories including audio, video, handwriting |
| No reference manager import | Zotero, Mendeley, EndNote, BibTeX, RIS |
| No curation | AG-07 with duplicate, relationship, gap, and retraction monitoring |
| No portable export | Documented open-format export |
| Unclear optionality | Architecturally enforced: no module may hard-depend on it |
