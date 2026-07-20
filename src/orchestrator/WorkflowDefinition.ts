/**
 * Workflow Definition Module
 *
 * Defines and manages workflow definitions.
 * Provides validation, serialization, and versioning for workflows.
 */

import type { WorkflowDefinition, WorkflowStage, WorkflowExecutionMode, ArtifactType } from "./types";
import { v4 as uuidv4 } from "uuid";

/**
 * Default workflow configuration
 */
const DEFAULT_WORKFLOW_CONFIG = {
  timeout: 3600000, // 1 hour in milliseconds
  maxRetries: 3,
  retryDelayMs: 5000,
  autoApprove: false,
  checkpointInterval: 300000, // 5 minutes in milliseconds
};

/**
 * Default research workflow stages
 */
const DEFAULT_RESEARCH_WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: "project-creation",
    name: "Project Creation",
    description: "Initialize research project",
    type: "input",
    agentId: "research-planner",
    dependencies: [],
    config: {},
  },
  {
    id: "research-planner",
    name: "Research Planner",
    description: "Create research plan and roadmap",
    type: "processing",
    agentId: "research-planner",
    dependencies: ["project-creation"],
    config: {},
  },
  {
    id: "literature-intelligence",
    name: "Literature Intelligence",
    description: "Conduct comprehensive literature review",
    type: "processing",
    agentId: "literature-review",
    dependencies: ["research-planner"],
    config: {},
  },
  {
    id: "knowledge-intelligence",
    name: "Knowledge Intelligence",
    description: "Analyze and synthesize knowledge",
    type: "processing",
    agentId: "knowledge-gap",
    dependencies: ["literature-intelligence"],
    config: {},
  },
  {
    id: "evidence-intelligence",
    name: "Evidence Intelligence",
    description: "Collect and analyze evidence",
    type: "processing",
    agentId: "evidence-analyzer",
    dependencies: ["knowledge-intelligence"],
    config: {},
  },
  {
    id: "writing-intelligence",
    name: "Writing Intelligence",
    description: "Create manuscript draft",
    type: "processing",
    agentId: "manuscript-writer",
    dependencies: ["evidence-intelligence"],
    config: {},
  },
  {
    id: "quality-assurance",
    name: "Quality Assurance",
    description: "Review and validate content",
    type: "validation",
    agentId: "quality-controller",
    dependencies: ["writing-intelligence"],
    config: {},
  },
  {
    id: "publication-intelligence",
    name: "Publication Intelligence",
    description: "Prepare for publication",
    type: "processing",
    agentId: "publication-advisor",
    dependencies: ["quality-assurance"],
    config: {},
  },
  {
    id: "scholar-intelligence",
    name: "Scholar Intelligence",
    description: "Finalize and optimize scholarly output",
    type: "processing",
    agentId: "scholar-optimizer",
    dependencies: ["publication-intelligence"],
    config: {},
  },
  {
    id: "project-archive",
    name: "Project Archive",
    description: "Archive project materials",
    type: "output",
    agentId: "archiver",
    dependencies: ["scholar-intelligence"],
    config: {},
  },
];

/**
 * Workflow Definition Builder
 */
export class WorkflowDefinitionBuilder {
  private workflow: Partial<WorkflowDefinition> = {
    config: { ...DEFAULT_WORKFLOW_CONFIG },
    stages: [],
  };

  /**
   * Create a new workflow definition builder
   */
  constructor(id?: string, name?: string, description?: string) {
    if (id) this.setId(id);
    if (name) this.setName(name);
    if (description) this.setDescription(description);
  }

  /**
   * Set workflow ID
   */
  setId(id: string): this {
    this.workflow.id = id;
    return this;
  }

  /**
   * Set workflow name
   */
  setName(name: string): this {
    this.workflow.name = name;
    return this;
  }

  /**
   * Set workflow description
   */
  setDescription(description: string): this {
    this.workflow.description = description;
    return this;
  }

  /**
   * Set workflow version
   */
  setVersion(version: string): this {
    this.workflow.version = version;
    return this;
  }

  /**
   * Set execution mode
   */
  setExecutionMode(mode: WorkflowExecutionMode): this {
    this.workflow.executionMode = mode;
    return this;
  }

  /**
   * Add a stage to the workflow
   */
  addStage(stage: WorkflowStage): this {
    this.workflow.stages!.push(stage);
    return this;
  }

  /**
   * Add multiple stages to the workflow
   */
  addStages(stages: WorkflowStage[]): this {
    this.workflow.stages!.push(...stages);
    return this;
  }

  /**
   * Set workflow stages
   */
  setStages(stages: WorkflowStage[]): this {
    this.workflow.stages = stages;
    return this;
  }

  /**
   * Set workflow configuration
   */
  setConfig(config: Record<string, unknown>): this {
    this.workflow.config = { ...this.workflow.config, ...config };
    return this;
  }

  /**
   * Set required permissions
   */
  setRequiredPermissions(permissions: string[]): this {
    this.workflow.requiredPermissions = permissions;
    return this;
  }

  /**
   * Set estimated duration
   */
  setEstimatedDuration(durationMs: number): this {
    this.workflow.estimatedDurationMs = durationMs;
    return this;
  }

  /**
   * Set author
   */
  setAuthor(author: string): this {
    this.workflow.author = author;
    return this;
  }

  /**
   * Set tags
   */
  setTags(tags: string[]): this {
    this.workflow.tags = tags;
    return this;
  }

  /**
   * Build the workflow definition
   */
  build(): WorkflowDefinition {
    if (!this.workflow.id) {
      this.workflow.id = `workflow-${uuidv4()}`;
    }

    if (!this.workflow.name) {
      this.workflow.name = this.workflow.id;
    }

    if (!this.workflow.description) {
      this.workflow.description = "Auto-generated workflow";
    }

    if (!this.workflow.version) {
      this.workflow.version = "1.0.0";
    }

    if (!this.workflow.executionMode) {
      this.workflow.executionMode = "sequential";
    }

    if (!this.workflow.stages || this.workflow.stages.length === 0) {
      throw new Error("Workflow must have at least one stage");
    }

    // Validate stages
    this.validateStages(this.workflow.stages);

    // Set timestamps
    const now = new Date().toISOString();
    this.workflow.createdAt = now;
    this.workflow.modifiedAt = now;

    return this.workflow as WorkflowDefinition;
  }

  /**
   * Validate workflow stages
   */
  private validateStages(stages: WorkflowStage[]): void {
    const stageIds = new Set<string>();

    // Check for duplicate stage IDs
    for (const stage of stages) {
      if (stageIds.has(stage.id)) {
        throw new Error(`Duplicate stage ID: ${stage.id}`);
      }
      stageIds.add(stage.id);
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (stageId: string): boolean => {
      if (!visited.has(stageId)) {
        visited.add(stageId);
        recursionStack.add(stageId);

        const stage = stages.find(s => s.id === stageId);
        if (stage) {
          for (const depId of stage.dependencies) {
            if (!visited.has(depId) && hasCycle(depId)) {
              return true;
            } else if (recursionStack.has(depId)) {
              return true;
            }
          }
        }

        recursionStack.delete(stageId);
      }
      return false;
    };

    for (const stage of stages) {
      if (hasCycle(stage.id)) {
        throw new Error(`Circular dependency detected in workflow stages`);
      }
    }

    // Check for missing dependencies
    for (const stage of stages) {
      for (const depId of stage.dependencies) {
        if (!stageIds.has(depId)) {
          throw new Error(`Missing dependency: ${depId} for stage ${stage.id}`);
        }
      }
    }
  }
}

/**
 * Workflow Definition Manager
 */
export class WorkflowDefinitionManager {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  /**
   * Register a workflow definition
   */
  register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Unregister a workflow definition
   */
  unregister(id: string): boolean {
    return this.workflows.delete(id);
  }

  /**
   * Get a workflow definition by ID
   */
  get(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  /**
   * List all workflow definitions
   */
  list(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Create a default research workflow
   */
  createDefaultResearchWorkflow(id?: string): WorkflowDefinition {
    const workflowId = id || `research-workflow-${uuidv4()}`;
    return new WorkflowDefinitionBuilder(
      workflowId,
      "Default Research Workflow",
      "Standard research workflow from project creation to publication"
    )
      .setVersion("1.0.0")
      .setExecutionMode("sequential")
      .addStages(DEFAULT_RESEARCH_WORKFLOW_STAGES)
      .setConfig({
        ...DEFAULT_WORKFLOW_CONFIG,
        autoApprove: false,
      })
      .setTags(["research", "standard", "publication"])
      .build();
  }

  /**
   * Serialize a workflow definition to JSON
   */
  serialize(workflow: WorkflowDefinition): string {
    return JSON.stringify(workflow, null, 2);
  }

  /**
   * Deserialize a workflow definition from JSON
   */
  deserialize(json: string): WorkflowDefinition {
    return JSON.parse(json);
  }

  /**
   * Clone a workflow definition with a new ID
   */
  clone(original: WorkflowDefinition, newId?: string): WorkflowDefinition {
    const clone = {
      ...original,
      id: newId || `workflow-${uuidv4()}`,
      version: this.incrementVersion(original.version),
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      config: { ...original.config },
    };

    // Deep clone stages
    clone.stages = original.stages.map(stage => ({
      ...stage,
      config: stage.config ? { ...stage.config } : undefined,
    }));

    return clone;
  }

  /**
   * Increment a semantic version
   */
  private incrementVersion(version: string): string {
    const parts = version.split(".");
    if (parts.length >= 3) {
      const patch = parseInt(parts[2], 10) + 1;
      return `${parts[0]}.${parts[1]}.${patch}`;
    }
    return version;
  }
}
