# KNOWN_LIMITATIONS.md — Documented Project Constraints

## Purpose

This document catalogs intentional limitations and constraints in the current Scholar implementation. These limitations are documented for transparency and future planning, not as failures.

---

## High Priority Limitations

### Authentication Not Implemented

**Status**: Architecture Ready, Implementation Pending
**Impact**: Users cannot save work to cloud or collaborate securely
**Workaround**: Local storage only
**Planned Resolution**: Version 1.1
**Related Tasks**: T004, T005

### Cloud Synchronization Not Available

**Status**: Not Implemented
**Impact**: Work does not sync across devices
**Workaround**: Export/import functionality
**Planned Resolution**: Version 1.2
**Related Tasks**: E01 completion required

---

## Medium Priority Limitations

### Git Repository Cleanup Pending

**Status**: Planned
**Impact**: Repository history contains experimental branches
**Workaround**: Current branch is stable
**Planned Resolution**: Ongoing
**Related Tasks**: See `ROADMAP.md` and `.claude/HANDOVER.md` §10

### Legacy User Management Code

**Status**: Transition Period
**Impact**: Dual user management patterns during migration
**Workaround**: Both systems coexist
**Planned Resolution**: Version 1.2
**Related Tasks**: Migration pending

### Inline Styles in Older Components

**Status**: Migration in Progress
**Impact**: Inconsistent styling approach
**Workaround**: Functionality unaffected
**Planned Resolution**: Version 1.2
**Related Tasks**: Tailwind migration

---

## Low Priority Limitations

### Server-Side Rate Limiting Patterns Evolving

**Status**: In Development
**Impact**: Rate limiting may change
**Workaround**: Current implementation works
**Planned Resolution**: Version 2.x
**Related Tasks**: T006

### Document Intelligence Phase 6 In Progress

**Status**: Active Development
**Impact**: Document parsing incomplete
**Workaround**: Manual evidence entry
**Planned Resolution**: Phase 6B cycle
**Related Tasks**: T006-cycle1

---

## Intentional Limitations (Design Decisions)

### Single-User Assumption

**Rationale**: Phase 1 focuses on individual researcher experience
**Planned Enhancement**: Multi-user in Version 2.x

### Local-First Data Model

**Rationale**: Works offline, no network dependency
**Planned Enhancement**: Cloud sync in Version 1.2

### Provider Abstraction Overhead

**Rationale**: Flexibility over performance
**Trade-off**: Enables new providers without core changes

### Knowledge Graph In-Memory

**Rationale**: Simplicity for Version 1.0
**Trade-off**: Large graphs may impact performance
**Planned Enhancement**: Persistent graph in Version 2.x

---

## Out-of-Scope Limitations

### Voice Interface

**Status**: Not Planned
**Reason**: Research feature, not core workflow

### AR/VR Knowledge Visualization

**Status**: Not Planned
**Reason**: Niche use case, high complexity

### Blockchain Verification

**Status**: Not Planned
**Reason**: Research topic, no clear use case

---

## Limitations vs. Future Enhancements

See `FUTURE_ENHANCEMENTS.md` for features planned to address these limitations.