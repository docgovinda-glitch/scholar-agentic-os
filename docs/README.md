# Scholar OS — Design Documentation

**A web-based academic writing platform that helps students and researchers
produce work worth submitting.**

This is the authoritative design specification for Scholar OS.

**Revision 2** (current) makes two decisions that reshape the suite:

1. **Website only.** No desktop application. Two deliberately different web
   experiences — **Desk** for a screen, **Pocket** for a phone.
2. **The product's job is making the work good, not auditing it.** Mandatory
   authorship measurement and the export block are withdrawn. The
   **Language & Voice Studio** becomes the product's most developed feature.

Revision 1 assumed a desktop application with local-first computing. Documents
still carrying revision-1 assumptions are marked in the index below.

---

## How to read this suite

| If you are… | Read, in this order |
|---|---|
| New to the project | `01`, `02`, `10`, `20`, `30` |
| Designing UI | `20`, `21`, `22`, `23`, `25`, `26` |
| Building the editor | `22`, `30`, `32`, `33`, `45` |
| **Building the Language & Voice Studio** | **`32`**, `41`, `42`, `21` |
| Building the agent runtime | `41`, `42`, `46`, `47` |
| Building compliance | `14`, `31`, `30` |
| Building admin tooling | `49`, `46`, `48` |
| Planning delivery | `50`, `51`, `52`, `53` |
| Assessing privacy posture | `44`, `46`, `41` |

---

## Document index

### 00 — Foundation

| Doc | Purpose | Rev |
|---|---|---|
| [`01-PRODUCT-VISION.md`](00-foundation/01-PRODUCT-VISION.md) | What Scholar OS is, the nine principles, the position on AI detection, what changed in revision 2 | **2** |
| [`02-GLOSSARY.md`](00-foundation/02-GLOSSARY.md) | Canonical vocabulary. Every named subsystem and domain term | **2** |

### 01 — Product

| Doc | Purpose | Rev |
|---|---|---|
| [`10-PRD.md`](01-product/10-PRD.md) | Personas, jobs-to-be-done, IDed requirements, success metrics, scope | 1† |
| [`11-PRODUCT-SPECIFICATION.md`](01-product/11-PRODUCT-SPECIFICATION.md) | System behaviour: surfaces, object lifecycle, gates, tiers | 1† |
| [`12-FEATURE-SPECIFICATIONS.md`](01-product/12-FEATURE-SPECIFICATIONS.md) | Per-feature behaviour, acceptance criteria, failure modes | 1† |
| [`13-MODULE-SPECIFICATIONS.md`](01-product/13-MODULE-SPECIFICATIONS.md) | Module boundaries, dependency rules, migration map | 1† |
| [`14-OUTPUT-TYPE-CATALOG.md`](01-product/14-OUTPUT-TYPE-CATALOG.md) | 24 academic output types with structure, intake schema, and workflow | 1‡ |

### 02 — Experience

| Doc | Purpose | Rev |
|---|---|---|
| [`20-INFORMATION-ARCHITECTURE.md`](02-experience/20-INFORMATION-ARCHITECTURE.md) | Object model, navigation, **the Desk/Pocket capability matrix** | **2** |
| [`21-UX-ARCHITECTURE.md`](02-experience/21-UX-ARCHITECTURE.md) | Interaction principles, AI affordance rules, design system, accessibility | 1† |
| [`22-DESKTOP-WEB-UX-SPECIFICATION.md`](02-experience/22-DESKTOP-WEB-UX-SPECIFICATION.md) | **Desk**: regions, editor, presets, keyboard model | **2** |
| [`23-MOBILE-WEB-UX-SPECIFICATION.md`](02-experience/23-MOBILE-WEB-UX-SPECIFICATION.md) | **Pocket**: four jobs, approval queue, touch, PWA | **2** |
| [`25-ONBOARDING-ARCHITECTURE.md`](02-experience/25-ONBOARDING-ARCHITECTURE.md) | Onboarding stages, AI setup, optional Vault, Workshop | 1† |
| [`26-USER-JOURNEY-MAPS.md`](02-experience/26-USER-JOURNEY-MAPS.md) | Nine end-to-end journeys with failure branches | 1† |
| [`ACCOUNT_SETTINGS_AND_NAVIGATION.md`](ACCOUNT_SETTINGS_AND_NAVIGATION.md) | **Account Settings**: vertical tabs, deduplication, and multi-user switching | **2** |
| [`AIRBNB_TYPOGRAPHY_DESIGN_SYSTEM.md`](AIRBNB_TYPOGRAPHY_DESIGN_SYSTEM.md) | **Design System**: typography, soft radii, and navigation layout | **2** |
| [`LANDING_PAGE_AND_IN_PAGE_AUTH.md`](LANDING_PAGE_AND_IN_PAGE_AUTH.md) | **Direct Landing & In-Page Auth**: command center landing, contextual auth modal, and bottom Website Assistant | **2** |

### 03 — Workflow

| Doc | Purpose | Rev |
|---|---|---|
| [`30-ACADEMIC-WORKFLOW-ARCHITECTURE.md`](03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md) | The eight-gate model and the drafting pipeline | 1‡ |
| [`JOURNAL_ARTICLE_WORKSPACE_25_STAGES.md`](JOURNAL_ARTICLE_WORKSPACE_25_STAGES.md) | **Journal Article Workspace**: 25-stage sequential lifecycle, domain-aware fallbacks, and camera-ready export | **2** |
| [`31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md`](03-workflow/31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md) | Rubric: compiling requirements into continuous checks | 1‡ |
| [`32-LANGUAGE-AND-VOICE-ARCHITECTURE.md`](03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md) | **The Studio**: five intervention levels, voice matching, second-language support, optional Writing History | **2** |
| [`33-EXPORT-ARCHITECTURE.md`](03-workflow/33-EXPORT-ARCHITECTURE.md) | DOCX and ODT as first-class; other formats derived | 1‡ |

### 04 — Architecture

| Doc | Purpose | Rev |
|---|---|---|
| [`40-SYSTEM-ARCHITECTURE.md`](04-architecture/40-SYSTEM-ARCHITECTURE.md) | Web application: client, services, data tier, trust boundaries | **2** |
| [`41-AI-ARCHITECTURE.md`](04-architecture/41-AI-ARCHITECTURE.md) | Model Gateway, providers, routing, the Warden egress boundary | 1† |
| [`42-MULTI-AGENT-ARCHITECTURE.md`](04-architecture/42-MULTI-AGENT-ARCHITECTURE.md) | The Mesh: agents, contracts, permissions, release channels | 1† |
| [`43-KNOWLEDGE-VAULT-ARCHITECTURE.md`](04-architecture/43-KNOWLEDGE-VAULT-ARCHITECTURE.md) | Source Library: Zero document storage, cloud index (`source-library.json`), citation layer | **5** |
| [`44-DATA-RESIDENCY-AND-PRIVACY.md`](04-architecture/44-DATA-RESIDENCY-AND-PRIVACY.md) | **What we hold, who can see it, what leaves for AI processing** | **2** |
| [`45-DATA-ARCHITECTURE.md`](04-architecture/45-DATA-ARCHITECTURE.md) | Entities, schemas, migration, retention | 1† |
| [`46-SECURITY-ARCHITECTURE.md`](04-architecture/46-SECURITY-ARCHITECTURE.md) | Threat model, key management, sandboxing, MFA, audit | 1† |
| [`47-PLUGIN-ARCHITECTURE.md`](04-architecture/47-PLUGIN-ARCHITECTURE.md) | Extension model, capability tokens, sandbox, review | 1† |
| [`48-API-ARCHITECTURE.md`](04-architecture/48-API-ARCHITECTURE.md) | API surfaces and the versioning contract | 1† |
| [`49-ADMIN-ARCHITECTURE.md`](04-architecture/49-ADMIN-ARCHITECTURE.md) | Operator console, Foundry, plane isolation, analytics | 1‡ |

### 05 — Delivery

| Doc | Purpose | Rev |
|---|---|---|
| [`50-ROADMAP.md`](05-delivery/50-ROADMAP.md) | Release arc and sequencing logic | **2** |
| [`51-IMPLEMENTATION-PHASES.md`](05-delivery/51-IMPLEMENTATION-PHASES.md) | Phase work breakdown with exit criteria | **2** |
| [`52-TESTING-STRATEGY.md`](05-delivery/52-TESTING-STRATEGY.md) | Test pyramid, agent evaluation, security testing | 1† |
| [`53-RISK-REGISTER.md`](05-delivery/53-RISK-REGISTER.md) | Scored risks with triggers and mitigations | **2** |
| [`54-OPEN-QUESTIONS.md`](05-delivery/54-OPEN-QUESTIONS.md) | Deferred decisions with deadlines | **2** |
| [`55-FUTURE-ENHANCEMENTS.md`](05-delivery/55-FUTURE-ENHANCEMENTS.md) | Out of scope now, plausible later | 1† |

### 06 — Decisions

Records of decisions that changed a direction already taken. Unlike the
documents above, which describe the intended system, these explain why the
system stopped doing something it used to do — and are written to be read
years later by someone asking "why is it like this?"

| Doc | Purpose | Rev |
|---|---|---|
| [`60-DESIGN-DIRECTION.md`](06-decisions/60-DESIGN-DIRECTION.md) | Retires the sci-fi visual direction; establishes the single warm, light-and-dark token system and the contrast verification that guards it | **2** |
| [`61-CLIENT-CONSOLIDATION.md`](06-decisions/61-CLIENT-CONSOLIDATION.md) | Desk becomes the product and the legacy client retires; records the authentication and ownership gap this surfaced, and how it was closed | **2** |
| [`62-DATABASE-ACCESS.md`](06-decisions/62-DATABASE-ACCESS.md) | Persistence moves to Supabase's HTTPS Data API; why the direct connection failed four ways, and the RLS this made mandatory | **2** |
| [`63-ACCESS-MODEL.md`](06-decisions/63-ACCESS-MODEL.md) | Institutionally gated access; withdraws `25` §1.2's account-less path as a revision-1 artifact, and keeps local inference as the thing that carried the privacy promise | **2** |
| [`64-SCIENTIFIC-MONOCHROME.md`](06-decisions/64-SCIENTIFIC-MONOCHROME.md) | Scientific Monochrome 334 155 design system, PostgREST 406 resolution, and Supabase database synchronization | **2** |

**Rev key** — **2**: rewritten for revision 2 · 1†: revision-1 document with
revision-2 terminology applied; surface and architecture passages still need a
full pass · 1‡: substantially surface-independent, carries forward intact.

---

## The one-paragraph version

A student opens Scholar OS in a browser and is asked *"What do you want to
produce?"* They pick **Master's Thesis** and answer a form generated for that
specific output type — not a blank page. The system finds their institution's
requirements and compiles them into a live **Rubric** that checks the work as
they write. They upload their own materials; anything discovered externally lands
in an approval queue and enters the corpus only when they say yes, which is why a
citation to a paper that does not exist is structurally impossible. Agents plan
the structure, draft sections bound to approved evidence, and check formatting.
When the prose needs work — and for a student writing in their second language it
usually does — the **Language & Voice Studio** takes it from rough to publishable
across five levels of intervention, matching how they write rather than flattening
it, explaining every change. On the bus the next morning they open the same
project on their phone and clear eight sources from the approval queue, one card
at a time. What ships is a `.docx` in their department's template, with a
bibliography that is correct and sources that are real.

---

## Conventions

| Convention | Meaning |
|---|---|
| **MUST / MUST NOT** | Non-negotiable. A violation is a defect |
| **SHOULD** | Strong default; deviation requires a recorded decision |
| **MAY** | Genuinely optional |
| `REQ-xxx` | Requirement ID, defined in `10` |
| `AG-xx` | Agent ID, defined in `42` |
| `OT-xx` | Output type ID, defined in `14` |
| `G0`–`G7` | Workflow gate, defined in `30` |
| `RISK-xx` | Risk ID, defined in `53` |
| `OQ-xx` | Open question, defined in `54` |
| **Current state** | A callout describing what the repository does today |

Every capitalised subsystem name is defined in
[`02-GLOSSARY.md`](00-foundation/02-GLOSSARY.md). A capitalised term appearing
elsewhere and absent there is a documentation defect.
