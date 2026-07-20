/**
 * Knowledge Registry - Central registry for all Knowledge Objects
 */

import type { KnowledgeObject, KnowledgeObjectType } from '../types/KnowledgeObject';

export class KnowledgeRegistry {
  private static instance: KnowledgeRegistry;
  private registry: Map<string, KnowledgeObject> = new Map();
  private typeIndex: Map<KnowledgeObjectType, Set<string>> = new Map();

  private constructor() {}

  static getInstance(): KnowledgeRegistry {
    if (!KnowledgeRegistry.instance) {
      KnowledgeRegistry.instance = new KnowledgeRegistry();
    }
    return KnowledgeRegistry.instance;
  }

  register(obj: KnowledgeObject): void {
    this.registry.set(obj.identity.id, obj);
    const type = obj.identity.type;
    if (!this.typeIndex.has(type)) {
      this.typeIndex.set(type, new Set());
    }
    this.typeIndex.get(type)!.add(obj.identity.id);
  }

  get(id: string): KnowledgeObject | undefined {
    return this.registry.get(id);
  }

  delete(id: string): boolean {
    const obj = this.registry.get(id);
    if (obj) {
      const type = obj.identity.type;
      const typeSet = this.typeIndex.get(type);
      if (typeSet) {
        typeSet.delete(id);
      }
    }
    return this.registry.delete(id);
  }

  listByType(type: KnowledgeObjectType): KnowledgeObject[] {
    const ids = this.typeIndex.get(type);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.registry.get(id))
      .filter((obj): obj is KnowledgeObject => obj !== undefined);
  }

  listAll(): KnowledgeObject[] {
    return Array.from(this.registry.values());
  }
}