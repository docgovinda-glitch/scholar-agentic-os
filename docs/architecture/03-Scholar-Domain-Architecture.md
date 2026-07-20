# Scholar Domain Architecture

## Canonical Business Domain

### Core Entities

**ResearchProject**
- Purpose: Top-level container for research work
- Attributes: id, title, description, discipline, startDate, status
- Relationships: contains ResearchQuestions, contains Evidence
- Lifecycle: draft → active → completed → archived

**ResearchQuestion**
- Purpose: Specific inquiry being investigated
- Attributes: id, text, category, priority, status
- Relationships: belongsTo ResearchProject, addressedBy Framework, answeredBy Finding

**Evidence**
- Purpose: Approved scholarly material supporting claims
- Attributes: id, title, authors, abstract, year, provider, citationCount, qualityScore
- Relationships: belongsTo ResearchProject, supports Claim, cites Publication
- Lifecycle: pending → approved → rejected → excluded

**KnowledgeObject**
- Purpose: Structured, persistent research knowledge
- Attributes: id, type, content, confidence, version
- Relationships: derivedFrom Evidence, relatesTo KnowledgeObject, embeddedIn KnowledgeGraph
- Lifecycle: draft → validated → published → archived

**Citation**
- Purpose: Reference to scholarly work
- Attributes: id, title, authors, year, source, doi, url
- Relationships: cites Publication, citedBy Publication, belongsTo Evidence

**Author**
- Purpose: Researcher identity
- Attributes: id, name, affiliations, orcid
- Relationships: authored Publication, worksAt Institution

**Report**
- Purpose: Generated research output
- Attributes: id, title, sections, status, generatedAt
- Relationships: generatedBy ResearchIntelligenceEngine, basedOn KnowledgeObjects

### Knowledge Object Standard

Every Knowledge Object supports:
- **Identity**: UUID-based unique identifier
- **Metadata**: Creation date, provider source, normalization history
- **Relationships**: Links to related objects, evidence connections
- **Version History**: Complete audit trail of changes
- **Lifecycle**: draft → validated → published
- **Confidence**: Quality score based on evidence quality

### Relationship Types

- **supports**: Evidence supports Claim/Finding
- **contradicts**: Evidence contradicts Finding
- **extends**: Theory extends prior work
- **implements**: Method implements Framework
- **dependsOn**: Work depends on prior Finding
- **cites**: Paper cites Publication
- **belongsTo**: Entity belongs to Project

### Domain Model Version

**v1.0** - Core research entities frozen for T018 implementation