/**
 * Intent Analyzer
 * 
 * Analyzes research intent from user queries.
 */

import type { ResearchIntent } from '../types';
import { AIKernel } from '../../ai/core/AIKernel';

export class IntentAnalyzer {
  private static instance: IntentAnalyzer;
  private kernel: AIKernel;

  private constructor() {
    this.kernel = AIKernel.getInstance();
  }

  static getInstance(): IntentAnalyzer {
    if (!IntentAnalyzer.instance) {
      IntentAnalyzer.instance = new IntentAnalyzer();
    }
    return IntentAnalyzer.instance;
  }

  /**
   * Analyze user query to determine research intent
   */
  async analyze(query: string): Promise<ResearchIntent> {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('literature') || lowerQuery.includes('review') || lowerQuery.includes('prior work')) {
      return 'literature-review';
    }
    if (lowerQuery.includes('hypothesis') || lowerQuery.includes('proposed theory')) {
      return 'hypothesis-generation';
    }
    if (lowerQuery.includes('method') || lowerQuery.includes('design') || lowerQuery.includes('approach')) {
      return 'methodology-design';
    }
    if (lowerQuery.includes('data') || lowerQuery.includes('analysis')) {
      return 'data-analysis';
    }
    if (lowerQuery.includes('write') || lowerQuery.includes('draft') || lowerQuery.includes('manuscript')) {
      return 'manuscript-writing';
    }
    if (lowerQuery.includes('novel') || lowerQuery.includes('new') || lowerQuery.includes('innovative')) {
      return 'novelty-assessment';
    }
    if (lowerQuery.includes('framework') || lowerQuery.includes('theory') || lowerQuery.includes('conceptual')) {
      return 'framework-analysis';
    }
    if (lowerQuery.includes('gap') || lowerQuery.includes('missing')) {
      return 'gap-detection';
    }
    
    return 'literature-review';
  }
}