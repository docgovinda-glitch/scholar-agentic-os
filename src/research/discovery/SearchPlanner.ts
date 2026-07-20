/**
 * Search Planner
 * 
 * Generates optimized search strategies for literature discovery.
 */

import type { SearchQuery } from './types';

export class SearchPlanner {
  private static instance: SearchPlanner;

  private constructor() {}

  static getInstance(): SearchPlanner {
    if (!SearchPlanner.instance) {
      SearchPlanner.instance = new SearchPlanner();
    }
    return SearchPlanner.instance;
  }

  /**
   * Plan search queries for a topic
   */
  plan(topic: string): SearchQuery[] {
    const queries: SearchQuery[] = [];
    const keywords = this._expandKeywords(topic);

    // Create multiple search strategies
    for (const keyword of keywords) {
      queries.push({
        text: keyword,
        limit: 20
      });
    }

    // Remove duplicates
    return queries.filter((q, i, arr) => 
      arr.findIndex(q2 => q2.text === q.text) === i
    );
  }

  _expandKeywords(topic: string): string[] {
    const lowerTopic = topic.toLowerCase();
    
    // Base topic
    const keywords = [lowerTopic];
    
    // Add variations
    if (lowerTopic.includes('artificial intelligence') || lowerTopic.includes('ai')) {
      keywords.push('machine learning', 'neural network', 'deep learning');
    }
    if (lowerTopic.includes('adoption')) {
      keywords.push('implementation', 'acceptance', 'diffusion');
    }
    if (lowerTopic.includes('university') || lowerTopic.includes('higher education')) {
      keywords.push('academic', 'institution', 'college', 'faculty');
    }
    if (lowerTopic.includes('technology')) {
      keywords.push('digital transformation', 'digital innovation');
    }

    return [...new Set(keywords)];
  }
}