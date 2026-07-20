/**
 * Project Version Manager
 * 
 * Manages CRPM versioning, migration, and history.
 */

import type { CanonicalResearchProject, ProjectSnapshot } from "./projectModel";
import type { VersionEntry } from "./projectTypes";

// ============================================================================
// Version Types
// ============================================================================

export interface VersionOperation {
  type: "patch" | "feature" | "breaking";
  changes: string[];
  author: string;
}

// ============================================================================
// Project Version Manager
// ============================================================================

export class ProjectVersionManager {
  private snapshots: Map<string, ProjectSnapshot> = new Map();

  createSnapshot(project: CanonicalResearchProject, state: "draft" | "in-progress" | "review" | "complete" | "archived"): ProjectSnapshot {
    const snapshot: ProjectSnapshot = {
      project,
      state,
      frozenAt: new Date().toISOString(),
    };

    this.snapshots.set(project.identity.id + "-" + snapshot.frozenAt, snapshot);
    return snapshot;
  }

  getSnapshot(snapshotId: string): ProjectSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  listSnapshots(projectId: string): ProjectSnapshot[] {
    return Array.from(this.snapshots.values())
      .filter((s) => s.project.identity.id === projectId)
      .sort((a, b) => b.frozenAt.localeCompare(a.frozenAt));
  }

  // Migration hooks
  migrate(project: CanonicalResearchProject, targetVersion: string): CanonicalResearchProject {
    // Migration logic for schema versions
    return { ...project, configuration: { ...project.configuration, schemaVersion: targetVersion } };
  }

  rollback(projectId: string, toVersion: string): CanonicalResearchProject | undefined {
    const snapshots = this.listSnapshots(projectId);
    const snapshot = snapshots.find((s) => s.project.identity.id === toVersion);
    return snapshot?.project;
  }

  // Patch operations
  applyPatch(
    project: CanonicalResearchProject,
    patch: VersionOperation
  ): CanonicalResearchProject {
    const version: VersionEntry = {
      version: project.identity.updatedAt,
      timestamp: new Date().toISOString(),
      changes: patch.changes,
      author: patch.author,
    };

    if (!project.history.versions) {
      project.history.versions = [];
    }
    project.history.versions = [...project.history.versions, version];
    project.identity.updatedAt = version.timestamp;

    return project;
  }
}