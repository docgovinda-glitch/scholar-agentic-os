/**
 * Framework Engine
 * 
 * Generates conceptual frameworks and theories for research.
 */

import type { ResearchOntology, ResearchRelationship } from '../types';

export interface ConceptualFramework {
  id: string;
  name: string;
  constructs: string[];
  relationships: ResearchRelationship[];
  diagram?: string;
}

export class FrameworkEngine {
  private static instance: FrameworkEngine;

  private constructor() {}

  static getInstance(): FrameworkEngine {
    if (!FrameworkEngine.instance) {
      FrameworkEngine.instance = new FrameworkEngine();
    }
    return FrameworkEngine.instance;
  }

  /**
   * Generate conceptual framework from ontology
   */
  generate(ontology: ResearchOntology): ConceptualFramework {
    const framework: ConceptualFramework = {
      id: crypto.randomUUID(),
      name: 'Generated Framework',
      constructs: [...ontology.concepts, ...ontology.theories, ...ontology.variables],
      relationships: ontology.relationships
    };

    return framework;
  }

  /**
   * Suggest theories based on domain
   */
  suggestTheories(domain: string, keywords: string[]): string[] {
    const theorySuggestions: Record<string, string[]> = {
      'computer-science': ['Computational Theory', 'Information Theory', 'Game Theory'],
      'psychology': ['Social Cognitive Theory', 'Behaviorism', 'Cognitive Load Theory'],
      'economics': ['Behavioral Economics', 'Game Theory', 'General Equilibrium'],
      'sociology': ['Social Capital Theory', 'Conflict Theory', 'Symbolic Interactionism'],
      'biology': ['Evolutionary Theory', 'Cell Theory', 'Gene Theory']
    };

    return theorySuggestions[domain] || ['General Systems Theory'];
  }
}