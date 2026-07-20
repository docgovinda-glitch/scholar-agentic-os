/**
 * Relationship Engine - Manages knowledge object relationships
 */

import type { KnowledgeObject, KnowledgeRelationship } from '../types/KnowledgeObject';
import { KnowledgeGraph } from '../graph/KnowledgeGraph';

export class RelationshipEngine {
  private static instance: RelationshipEngine;
  private graph: KnowledgeGraph;

  private constructor() {
    this.graph = new KnowledgeGraph();
  }

  static getInstance(): RelationshipEngine {
    if (!RelationshipEngine.instance) {
      RelationshipEngine.instance = new RelationshipEngine();
    }
    return RelationshipEngine.instance;
  }

  async addRelationship(
    source: KnowledgeObject,
    targetId: string,
    type: string,
    confidence?: number
  ): Promise<void> {
    // Add to graph
    await this.graph.addEdge(source.identity.id, targetId, type);
    
    // Update object
    const rel: KnowledgeRelationship = {
      type,
      targetId,
      targetType: 'concept', // Would be resolved from target
      confidence,
      createdAt: new Date().toISOString()
    };
    source.relationships.push(rel);
  }

  async getRelationships(obj: KnowledgeObject, type?: string): Promise<KnowledgeObject[]> {
    return this.graph.getNeighbors(obj.identity.id, type);
  }

  async validateRelationship(sourceId: string, rel: KnowledgeRelationship): Promise<boolean> {
    // Basic validation - both objects must exist
    return !!sourceId && !!rel.targetId && !!rel.type;
  }
}