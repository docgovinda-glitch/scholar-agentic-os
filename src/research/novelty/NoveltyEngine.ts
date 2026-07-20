/**
 * Novelty Engine
 * 
 * Assesses novelty of research ideas and detects gaps.
 */

import type { ResearchDomain } from '../types';

export interface NoveltyScore {
  overall: number;
  theoreticalScore: number;
  practicalScore: number;
  methodologicalScore: number;
  confidence: number;
}

export interface ResearchGap {
  id: string;
  description: string;
  relevance: number;
  feasibility: number;
  novelty: number;
}

export class NoveltyEngine {
  private static instance: NoveltyEngine;

  private constructor() {}

  static getInstance(): NoveltyEngine {
    if (!NoveltyEngine.instance) {
      NoveltyEngine.instance = new NoveltyEngine();
    }
    return NoveltyEngine.instance;
  }

  /**
   * Assess novelty of a research idea
   */
  assess(text: string, domain: ResearchDomain): NoveltyScore {
    const words = text.toLowerCase().split(/\s+/);
    
    // Check for novel indicators
    const novelIndicators = ['novel', 'new', 'innovative', 'first', 'pioneering', 'unexplored'];
    const scores = novelIndicators.map(indicator => 
      words.includes(indicator) ? 0.8 : 0.3
    );

    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    return {
      overall: avgScore,
      theoreticalScore: avgScore * 0.9,
      practicalScore: avgScore * 0.8,
      methodologicalScore: avgScore * 0.7,
      confidence: 0.75
    };
  }

  /**
   * Detect gaps in existing research
   */
  detectGaps(existingWorks: string[]): ResearchGap[] {
    return existingWorks.map((work, i) => ({
      id: `gap-${i + 1}`,
      description: `Gap related to ${work.substring(0, 50)}...`,
      relevance: 0.7 + Math.random() * 0.3,
      feasibility: 0.6 + Math.random() * 0.4,
      novelty: 0.5 + Math.random() * 0.5
    }));
  }
}