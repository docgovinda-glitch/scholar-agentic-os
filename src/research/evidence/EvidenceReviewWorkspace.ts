/**
 * Evidence Review Workspace
 * 
 * Manages the review and approval lifecycle of literature evidence.
 */

import type { ProviderResult, EvidenceState, SearchQuery } from '../discovery/types';

export type EvidenceStatus = 'pending' | 'approved' | 'rejected' | 'excluded' | 'archived' | 'manual';

export interface EvidenceEntry extends ProviderResult {
  evidenceState: EvidenceState;
}

export class EvidenceReviewWorkspace {
  private static instance: EvidenceReviewWorkspace;
  private evidence: Map<string, EvidenceEntry> = new Map();
  private projectId: string | null = null;

  private constructor() {}

  static getInstance(): EvidenceReviewWorkspace {
    if (!EvidenceReviewWorkspace.instance) {
      EvidenceReviewWorkspace.instance = new EvidenceReviewWorkspace();
    }
    return EvidenceReviewWorkspace.instance;
  }

  /**
   * Set the current project context
   */
  setProject(projectId: string): void {
    this.projectId = projectId;
  }

  /**
   * Add evidence for review
   */
  addEvidence(result: ProviderResult, status: EvidenceStatus = 'pending'): EvidenceEntry {
    const entry: EvidenceEntry = {
      ...result,
      evidenceState: {
        status,
        addedAt: new Date().toISOString()
      }
    };

    this.evidence.set(result.id, entry);
    return entry;
  }

  /**
   * Bulk add evidence for review
   */
  addEvidenceBatch(results: ProviderResult[]): EvidenceEntry[] {
    return results.map(r => this.addEvidence(r, 'pending'));
  }

  /**
   * Approve evidence
   */
  approve(id: string): EvidenceEntry | null {
    const entry = this.evidence.get(id);
    if (entry) {
      entry.evidenceState.status = 'approved';
      entry.evidenceState.reviewedAt = new Date().toISOString();
      return entry;
    }
    return null;
  }

  /**
   * Reject evidence
   */
  reject(id: string, notes?: string): EvidenceEntry | null {
    const entry = this.evidence.get(id);
    if (entry) {
      entry.evidenceState = {
        status: 'rejected',
        addedAt: entry.evidenceState.addedAt,
        reviewedAt: new Date().toISOString(),
        notes
      };
      return entry;
    }
    return null;
  }

  /**
   * Exclude evidence
   */
  exclude(id: string, notes?: string): EvidenceEntry | null {
    const entry = this.evidence.get(id);
    if (entry) {
      entry.evidenceState = {
        status: 'excluded',
        addedAt: entry.evidenceState.addedAt,
        reviewedAt: new Date().toISOString(),
        notes
      };
      return entry;
    }
    return null;
  }

  /**
   * Restore evidence (from rejected/excluded)
   */
  restore(id: string): EvidenceEntry | null {
    const entry = this.evidence.get(id);
    if (entry && (entry.evidenceState.status === 'rejected' || entry.evidenceState.status === 'excluded')) {
      entry.evidenceState.status = 'pending';
      return entry;
    }
    return null;
  }

  /**
   * Pin evidence for quick access
   */
  pin(id: string): EvidenceEntry | null {
    const entry = this.evidence.get(id);
    if (entry) {
      entry.evidenceState.pinned = true;
      return entry;
    }
    return null;
  }

  /**
   * Add note to evidence
   */
  addNote(id: string, note: string): EvidenceEntry | null {
    const entry = this.evidence.get(id);
    if (entry) {
      entry.evidenceState.notes = note;
      return entry;
    }
    return null;
  }

  /**
   * Add tag to evidence
   */
  addTag(id: string, tag: string): EvidenceEntry | null {
    const entry = this.evidence.get(id);
    if (entry) {
      entry.evidenceState.tags = [...(entry.evidenceState.tags || []), tag];
      return entry;
    }
    return null;
  }

  /**
   * Get approved evidence only (for Research Intelligence Engine)
   */
  getApprovedEvidence(): EvidenceEntry[] {
    return Array.from(this.evidence.values())
      .filter(e => e.evidenceState.status === 'approved');
  }

  /**
   * Get evidence by status
   */
  getEvidenceByStatus(status: EvidenceStatus): EvidenceEntry[] {
    return Array.from(this.evidence.values())
      .filter(e => e.evidenceState.status === status);
  }

  /**
   * Get all evidence
   */
  getAllEvidence(): EvidenceEntry[] {
    return Array.from(this.evidence.values());
  }

  /**
   * Search within evidence
   */
  searchEvidence(query: string): EvidenceEntry[] {
    const lower = query.toLowerCase();
    return Array.from(this.evidence.values())
      .filter(e => 
        e.title.toLowerCase().includes(lower) ||
        e.authors.some(a => a.toLowerCase().includes(lower)) ||
        e.abstract.toLowerCase().includes(lower) ||
        e.keywords.some(k => k.toLowerCase().includes(lower))
      );
  }
}