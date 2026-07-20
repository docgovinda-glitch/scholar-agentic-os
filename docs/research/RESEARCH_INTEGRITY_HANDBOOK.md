# Research Integrity Handbook v1.0
Status: Mandatory governance standard for all contributors, humans, and AI systems working on this project.

This document defines how the platform handles academic research, AI assistance, evidence, provenance, ethics, privacy, and publication integrity. It is a governing document, not implementation guidance.

The current repository already includes research workflows, vault ingestion, citation tooling, AI routing, and local persistence. This handbook establishes the rules those capabilities must obey. [src/types.ts](</Users/pobpkf/Desktop/Doctoral-Research-and-Journal-Publication-Assistant/src/types.ts:1>), [src/services/aiService.ts](</Users/pobpkf/Desktop/Doctoral-Research-and-Journal-Publication-Assistant/src/services/aiService.ts:1>), [src/services/knowledgeVaultService.ts](</Users/pobpkf/Desktop/Doctoral-Research-and-Journal-Publication-Assistant/src/services/knowledgeVaultService.ts:1>), [src/services/aiGateway.ts](</Users/pobpkf/Desktop/Doctoral-Research-and-Journal-Publication-Assistant/src/services/aiGateway.ts:1>)

## 1) Mission

### Mission
Ensure the platform produces research assistance that is accurate, transparent, reproducible, traceable, privacy-preserving, and consistent with academic and institutional standards.

### Why research integrity is fundamental
This platform is not a generic text generator. It is a research environment. If it cannot preserve provenance, validate evidence, and distinguish human work from AI assistance, it cannot be trusted by researchers, supervisors, journals, or institutions.

### Responsibilities
- **Developers** must build systems that preserve evidence, track provenance, and avoid misleading output behavior.
- **Users** must review, validate, and take responsibility for what they submit, publish, or claim.

## 2) Core Principles

### Accuracy over speed
The platform should prefer correct, verifiable output over fast but uncertain output.

### Transparency over convenience
If the system is uncertain, it must say so. Convenience must never hide uncertainty.

### Human accountability
AI may assist, but humans remain accountable for publication, submission, analysis, and ethical decisions.

### Reproducibility
Research actions should be traceable and repeatable whenever practical.

### Explainability
Every meaningful AI-assisted output should be explainable in terms of inputs, sources, versioning, and confidence.

### Privacy by design
Private research data must be protected by default, not after the fact.

### Security by default
Security controls must be designed into workflows, not appended later.

### AI as an assistant, not an author
AI may draft, summarize, organize, and analyze, but it does not own the research.

### Respect for journal and institutional policies
If a journal or institution restricts AI use, the platform must support that policy.

## 3) AI Usage Policy

### Core rules
- Clearly identify AI-generated content.
- Distinguish between user-authored, AI-assisted, and imported material.
- Never claim AI-generated text is human-written.
- Require user review before publication or submission.
- Record which model generated an output.
- Record timestamps and versions.
- Maintain audit history for AI-assisted actions.

### Required classification
All content must be tagged as one of:
- `user-authored`
- `ai-assisted`
- `ai-generated`
- `imported`
- `externally sourced`
- `system-generated`

### Publication rule
No manuscript, abstract, cover letter, or submission package should be treated as final until a human explicitly reviews it.

### Platform obligation
If AI output may materially influence a research claim, the system must label it as AI-assisted and preserve traceability.

## 4) Citation Integrity

### Mandatory rules
- Never fabricate citations.
- Never invent DOIs.
- Never invent authors.
- Never invent journals.
- Never invent publication years.
- Validate references whenever possible.
- Warn users when references cannot be verified.
- Preserve citation provenance.

### Citation handling rules
- A citation must be traceable to a source record or a verified external registry whenever possible.
- If metadata is incomplete, the system must surface that incompleteness.
- If a citation is AI-suggested but unverified, it must be clearly marked as unverified.
- A citation formatter may normalize and structure references, but it must not invent missing bibliographic facts.

### Required status labels
- `verified`
- `partially_verified`
- `unverified`
- `needs_review`

## 5) Evidence and Provenance

### Provenance requirements
Every research claim should support provenance when feasible.

Record:
- source document
- DOI
- URL
- database
- author
- publication date
- confidence
- verification status
- supporting excerpts, where legally appropriate

### Provenance for AI-generated summaries
An AI-generated summary must record:
- source inputs used
- retrieval context
- prompt version
- model identity
- output version
- confidence
- human edits
- verification status

### Policy
If evidence is weak, the output must say so. Weak evidence should not be polished into false certainty.

## 6) Hallucination Mitigation

### Required strategies
- Retrieval before generation
- Source validation before synthesis
- Confidence scoring
- Human review for sensitive outputs
- Fact-check workflows
- Reference verification
- Warning when evidence is insufficient

### System rules
- The platform should ground generation in retrieved evidence whenever possible.
- AI outputs must not be treated as fact unless verified.
- If evidence is unavailable, the system should degrade gracefully instead of fabricating detail.

### High-risk output types
These require stronger validation:
- citations
- literature review synthesis
- statistical interpretation
- ethical statements
- journal recommendations
- claims about clinical or institutional practice

## 7) Human Oversight

### Human approval is mandatory for:
- manuscript submission
- grant proposals
- clinical research outputs
- ethical statements
- statistical interpretation used in publication
- final publication exports
- any output that will be treated as authoritative by a journal or institution

### Human responsibility
The system may assist with drafting or review, but a human must approve outputs that can affect publication, policy, ethics, or research claims.

### Escalation policy
If the system is uncertain, under-sourced, or inconsistent, it must escalate to the user for review.

## 8) Privacy and Confidentiality

### Protected categories
- unpublished manuscripts
- sensitive datasets
- patient information
- institutional data
- proprietary research
- student work
- reviewer comments
- editorial decisions
- unpublished grant material

### Data handling rules
- Store sensitive research data only in approved storage.
- Use least-privilege access.
- Retain only what is necessary.
- Minimize transfer of confidential content to external systems.
- Respect tenant, institutional, and user privacy boundaries.

### External AI provider rule
Data may be sent to external AI providers only if:
- the user or institution policy permits it,
- the data is not prohibited from external processing,
- the transmission is disclosed,
- and the platform records the provider used.

### Default posture
If privacy policy is unclear, the platform should default to local/native mode or reject the external transfer.

## 9) Journal and Institutional Compliance

### Policy support
The platform must support differing publisher and institutional rules regarding:
- AI use disclosure
- authorship standards
- reference verification
- data privacy
- retention
- submission preparation
- review handling

### Compliance profiles
The system should allow configurable compliance profiles for:
- journals
- publishers
- research institutions
- departments
- grant bodies

### Behavior
If a profile forbids certain AI usage or output types, the platform must enforce that rule or clearly block the action.

## 10) Reproducibility

### Preserve the following where possible
- dataset versions
- prompt versions
- AI model versions
- workflow history
- document revisions
- analysis parameters
- citation metadata snapshots
- export versions

### Reproducibility rule
A user should be able to reconstruct how a result was produced from recorded inputs, versions, and workflow history.

### Minimum reproducibility record
- when it happened
- who initiated it
- which sources were used
- which model or native skill ran
- what version of the prompt/workflow was used
- what human edits occurred afterward

## 11) User Responsibilities

Users must:
- verify AI outputs before relying on them
- review citations and source provenance
- check statistical analyses
- confirm journal and institution compliance
- respect copyright and licensing
- avoid plagiarism
- disclose AI assistance where required
- protect confidential research data

### User accountability rule
The platform may assist with research, but it does not transfer academic responsibility away from the user.

## 12) Developer Responsibilities

Developers must:
- never introduce features that fabricate evidence
- preserve provenance in data models and workflows
- build explainable systems
- protect user privacy
- follow the Engineering Handbook
- maintain backward compatibility where practical
- test integrity-sensitive behavior
- design for safe degradation when AI is unavailable

### Developer rule
If a feature could mislead a researcher, supervisor, reviewer, or editor, it must be redesigned or blocked.

## 13) AI Agent Responsibilities

Every AI agent must declare:

- purpose
- allowed actions
- restricted actions
- required evidence
- confidence thresholds
- human approval requirements
- failure behavior

### Agent constraints
- Agents may orchestrate, not silently authorize.
- Agents must not invent evidence.
- Agents must not bypass citations or provenance checks.
- Agents must surface uncertainty.
- Agents must stop or escalate when evidence is insufficient.

### Agent failure behavior
When an agent cannot verify a result:
- it should fail safe,
- mark the output as unverified,
- and ask for human review.

## 14) Risk Management

### Major risks
- hallucinated references
- plagiarism
- misinterpretation of data
- privacy breaches
- bias
- outdated information
- overreliance on AI

### Mitigations
- retrieval-first workflows
- strict citation validation
- provenance tracking
- human approval gates
- privacy policy enforcement
- provider policy controls
- output labeling
- audit logs
- confidence scoring
- fallback to native skills

### Risk rule
If a risk cannot be mitigated adequately, the feature must be limited, gated, or deferred.

## 15) Audit and Traceability

Every AI-assisted action should be traceable.

### Required audit fields
- user
- timestamp
- agent
- model
- prompt version
- sources used
- output version
- human edits
- verification status

### Audit policy
Audit records should be:
- immutable or append-only where possible,
- queryable for review,
- and retained according to policy.

### Purpose
Audit records are not only for debugging. They are required for academic integrity, compliance, and institutional trust.

## 16) Future Governance

This handbook should evolve as:
- AI capabilities change,
- publication standards change,
- privacy regulations change,
- institutional policies change,
- and research practices evolve.

### Update rules
- Revisions must be versioned.
- Changes to integrity policy should be reviewed carefully.
- Superseding rules should be clearly identified.
- Deprecated policy should remain discoverable for historical reference.

### Governance principle
The handbook must remain stricter than the product, not looser.

## Final Critique

### Weaknesses
- This handbook is necessarily policy-heavy. It will require enforcement tools, not just documentation.
- Some rules are normative and will need operational interpretation across institutions and journals.
- Traceability and provenance can become burdensome if implementation does not automate them well.

### Missing governance
- A formal review process for AI policy changes.
- A data-retention and deletion policy by tenant type.
- An incident response policy for integrity breaches.
- An explicit policy for model evaluation and deprecation.
- A standard for when content must be blocked rather than merely warned.

### Recommended improvements
- Add a policy appendix for discipline-specific exceptions.
- Add an institution override model with constrained admin rights.
- Add a formal policy for human review thresholds by output type.
- Add a sanctions/recovery policy for integrity violations.
- Add a recurring governance review schedule.

### Future handbook versions
- **v1.1**: enforcement matrix, policy exceptions, blocking rules
- **v1.2**: discipline-specific addenda, institutional override framework
- **v2.0**: regulation-aware AI governance, advanced provenance automation

