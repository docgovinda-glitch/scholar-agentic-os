/**
 * Project Validator
 * 
 * Validates CRPM integrity and consistency.
 */

import type { CanonicalResearchProject } from "./projectModel";

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationRule {
  name: string;
  validate: (project: CanonicalResearchProject) => ValidationResult;
}

// ============================================================================
// Project Validator
// ============================================================================

export class ProjectValidator {
  private rules: ValidationRule[] = [];

  addRule(rule: ValidationRule): this {
    this.rules.push(rule);
    return this;
  }

  validate(project: CanonicalResearchProject): ValidationResult {
    let allErrors: string[] = [];
    let allWarnings: string[] = [];

    for (const rule of this.rules) {
      const result = rule.validate(project);
      allErrors = [...allErrors, ...result.errors.map((e) => rule.name + ": " + e)];
      allWarnings = [...allWarnings, ...result.warnings];
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  // Built-in rules
  static createDefault(): ProjectValidator {
    const validator = new ProjectValidator();

    // No duplicate IDs
    validator.addRule({
      name: "duplicate-ids",
      validate: (project) => {
        const docIds = project.knowledge.documentIds;
        const refIds = project.knowledge.referenceIds;
        const allIds = [...docIds, ...refIds];
        const duplicates = allIds.filter((id) => allIds.indexOf(id) !== allIds.lastIndexOf(id));

        return {
          valid: duplicates.length === 0,
          errors: duplicates.length > 0 ? ["Duplicate IDs found: " + duplicates.join(", ")] : [],
          warnings: [],
        };
      },
    });

    // Required sections
    validator.addRule({
      name: "required-sections",
      validate: (project) => {
        const missing: string[] = [];
        if (!project.identity) missing.push("identity");
        if (!project.metadata) missing.push("metadata");
        if (!project.status) missing.push("status");

        return {
          valid: missing.length === 0,
          errors: missing.length > 0 ? ["Missing required sections: " + missing.join(", ")] : [],
          warnings: [],
        };
      },
    });

    // Version compatibility
    validator.addRule({
      name: "version-compatibility",
      validate: (project) => ({
        valid: project.configuration.schemaVersion === "1.0.0",
        errors: project.configuration.schemaVersion !== "1.0.0" ? ["Schema version mismatch"] : [],
        warnings: [],
      }),
    });

    return validator;
  }
}