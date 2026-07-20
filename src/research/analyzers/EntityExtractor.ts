/**
 * Entity Extractor
 * 
 * Extracts entities (concepts, variables, theories) from text.
 */

import type { ExtractedEntity, EntityType } from '../types';

export class EntityExtractor {
  private static instance: EntityExtractor;

  private constructor() {}

  static getInstance(): EntityExtractor {
    if (!EntityExtractor.instance) {
      EntityExtractor.instance = new EntityExtractor();
    }
    return EntityExtractor.instance;
  }

  /**
   * Extract entities from text
   */
  extract(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    
    // Extract concepts (noun phrases)
    const concepts = this._extractConcepts(text);
    concepts.forEach(c => entities.push({ type: 'concept', value: c, confidence: 0.7 }));
    
    // Extract variables (X affects Y patterns)
    const variables = this._extractVariables(text);
    variables.forEach(v => entities.push({ type: 'variable', value: v, confidence: 0.8 }));
    
    // Extract theories (Named theory patterns)
    const theories = this._extractTheories(text);
    theories.forEach(t => entities.push({ type: 'theory', value: t, confidence: 0.9 }));
    
    return entities;
  }

  private _extractConcepts(text: string): string[] {
    const concepts: string[] = [];
    const patterns = [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(theory|model|framework|approach)\b/gi,
      /\b(quantum|neural|machine|deep|statistical|regression)\s+([a-z]+)\b/gi
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        concepts.push(match[0]);
      }
    }

    return [...new Set(concepts)];
  }

  private _extractVariables(text: string): string[] {
    const variables: string[] = [];
    const patterns = [
      /\b([a-z]+)\s+(?:is affected by|influences|causes|correlates with)\s+([a-z]+)\b/gi,
      /\b(effect|impact|influence)\s+of\s+([a-z]+)\b/gi
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[2]) variables.push(match[2]);
      }
    }

    return [...new Set(variables)];
  }

  private _extractTheories(text: string): string[] {
    const theories: string[] = [];
    const theoryPatterns = [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Theory|Model))\b/g,
      /\b(Game Theory|Social Capital Theory|Planned Behavior)\b/g
    ];

    for (const pattern of theoryPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        theories.push(match[0]);
      }
    }

    return [...new Set(theories)];
  }
}