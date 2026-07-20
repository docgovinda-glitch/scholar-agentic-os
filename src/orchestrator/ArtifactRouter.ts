import type { AnyArtifact, ArtifactType, ArtifactStatus } from "./types";
import { v4 as uuidv4 } from "uuid";

export interface RouteValidationResult {
  valid: boolean;
  artifactId: string;
  errors: string[];
}

export interface RouterConfig {
  requireSchemaVersion?: boolean;
  requireProvenance?: boolean;
  validateProducerConsumer?: boolean;
  rejectUnapproved?: boolean;
}

const DEFAULT_CONFIG: RouterConfig = {
  requireSchemaVersion: false,
  requireProvenance: false,
  validateProducerConsumer: false,
  rejectUnapproved: false,
};

const SCHEMA_VERSION = "1.0.0";

export class ArtifactRouter {
  private config: RouterConfig;
  private routes: Map<string, string[]> = new Map();

  constructor(config?: RouterConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  registerRoute(producerType: ArtifactType, consumerTypes: ArtifactType[]): void {
    this.routes.set(producerType, consumerTypes);
  }

  routeArtifacts(input: AnyArtifact[], opts?: { consumerAgentId?: string }): AnyArtifact[] {
    return input.map((artifact) => {
      const validated = this.validateArtifact(artifact);
      if (!validated.valid) {
        return this.createErrorArtifact(artifact, validated.errors);
      }

      if (opts?.consumerAgentId) {
        const errors = this.validateRoute(artifact, opts.consumerAgentId);
        if (errors.length > 0) {
          return this.createErrorArtifact(artifact, errors);
        }
      }

      return this.enrichArtifact(artifact);
    });
  }

  validateArtifact(artifact: AnyArtifact): RouteValidationResult {
    const errors: string[] = [];

    if (this.config.requireSchemaVersion && !artifact.metadata?.version) {
      errors.push("Missing artifact schema version");
    }

    if (!artifact.metadata?.id) {
      errors.push("Missing artifact ID");
    }

    if (!artifact.metadata?.type) {
      errors.push("Missing artifact type");
    }

    if (!artifact.metadata?.originatingAgent) {
      errors.push("Missing originating agent (producer)");
    }

    if (this.config.requireProvenance) {
      if (!artifact.provenance) {
        errors.push("Missing provenance information");
      } else {
        if (!artifact.provenance.executionId) {
          errors.push("Missing execution ID in provenance");
        }
        if (!artifact.provenance.workflowId) {
          errors.push("Missing workflow ID in provenance");
        }
      }
    }

    if (this.config.rejectUnapproved && artifact.metadata?.approvalStatus === "rejected") {
      errors.push("Artifact was rejected and cannot be routed");
    }

    return {
      valid: errors.length === 0,
      artifactId: artifact.metadata?.id ?? "unknown",
      errors,
    };
  }

  private validateRoute(artifact: AnyArtifact, consumerAgentId: string): string[] {
    const errors: string[] = [];
    const producerType = artifact.metadata.type as ArtifactType;
    const allowedConsumers = this.routes.get(producerType);

    if (allowedConsumers && allowedConsumers.length > 0) {
      const consumerCapability = this.getConsumerCapability(consumerAgentId);
      if (consumerCapability && !allowedConsumers.includes(consumerCapability.outputType)) {
        errors.push(
          `Artifact type "${producerType}" cannot be routed to consumer "${consumerAgentId}"`
        );
      }
    }

    return errors;
  }

  private getConsumerCapability(agentId: string): { outputType: string } | undefined {
    // Return undefined for now - in real implementation would look up agent capabilities
    return undefined;
  }

  private enrichArtifact(artifact: AnyArtifact): AnyArtifact {
    const now = new Date().toISOString();
    
    // Create enriched artifact - just add audit trail entry
    const enriched = {
      ...artifact,
      metadata: {
        ...artifact.metadata,
        modifiedAt: now,
      },
      auditTrail: [
        ...(artifact.auditTrail ?? []),
        {
          timestamp: now,
          action: "routed",
          agentId: "artifact-router",
          details: { version: SCHEMA_VERSION },
        },
      ],
    };

    return enriched as unknown as AnyArtifact;
  }

  private createErrorArtifact(artifact: AnyArtifact, errors: string[]): AnyArtifact {
    const now = new Date().toISOString();
    return {
      metadata: {
        id: `error-${uuidv4()}`,
        type: "error",
        version: SCHEMA_VERSION,
        status: "failed" as ArtifactStatus,
        createdAt: now,
        modifiedAt: now,
        originatingAgent: "artifact-router",
        verificationStatus: "failed",
      },
      data: {
        errorId: `route-err-${uuidv4()}`,
        stageId: "",
        agentId: "artifact-router",
        errorType: "ROUTING_ERROR",
        message: errors.join("; "),
        timestamp: now,
      },
      provenance: {
        executionId: artifact.provenance?.executionId,
        workflowId: artifact.provenance?.workflowId,
        previousArtifacts: artifact.metadata?.id ? [artifact.metadata.id] : [],
        transformations: [],
      },
      auditTrail: [
        {
          timestamp: now,
          action: "routing_failed",
          agentId: "artifact-router",
          details: { errors, originalArtifactId: artifact.metadata?.id },
        },
      ],
    } as unknown as AnyArtifact;
  }

  getRoutes(): Map<string, string[]> {
    return new Map(this.routes);
  }

  /**
   * Get all registered producer types
   */
  getProducerTypes(): ArtifactType[] {
    return Array.from(this.routes.keys()) as ArtifactType[];
  }

  /**
   * Get all registered consumer types for a producer type
   */
  getConsumersForProducer(producerType: ArtifactType): ArtifactType[] {
    return (this.routes.get(producerType) ?? []) as ArtifactType[];
  }

  /**
   * Validate a route exists between producer and consumer
   */
  hasRoute(producerType: ArtifactType, consumerType: ArtifactType): boolean {
    const consumers = this.routes.get(producerType);
    return consumers?.includes(consumerType) ?? false;
  }

  clear(): void {
    this.routes.clear();
  }
}