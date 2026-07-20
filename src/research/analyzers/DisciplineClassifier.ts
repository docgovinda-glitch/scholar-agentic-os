/**
 * Discipline Classifier
 * 
 * Classifies research text into disciplines and subdisciplines.
 */

import type { ResearchDomain, ResearchSubdiscipline } from '../types';

export class DisciplineClassifier {
  private static instance: DisciplineClassifier;

  private constructor() {}

  static getInstance(): DisciplineClassifier {
    if (!DisciplineClassifier.instance) {
      DisciplineClassifier.instance = new DisciplineClassifier();
    }
    return DisciplineClassifier.instance;
  }

  /**
   * Classify text into a discipline
   */
  classify(text: string): { domain: ResearchDomain; subdiscipline?: ResearchSubdiscipline } {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('machine learning') || lowerText.includes('artificial intelligence') || lowerText.includes('neural network')) {
      return { domain: 'computer-science', subdiscipline: 'artificial-intelligence' };
    }
    if (lowerText.includes('software') || lowerText.includes('algorithm')) {
      return { domain: 'computer-science', subdiscipline: 'software-engineering' };
    }
    if (lowerText.includes('bio') || lowerText.includes('gene') || lowerText.includes('protein')) {
      return { domain: 'biology', subdiscipline: 'molecular-biology' };
    }
    if (lowerText.includes('psychology') || lowerText.includes('cognitive')) {
      return { domain: 'psychology', subdiscipline: 'cognitive-psychology' };
    }
    if (lowerText.includes('economic') || lowerText.includes('finance')) {
      return { domain: 'economics', subdiscipline: 'econometrics' };
    }
    if (lowerText.includes('quantum') || lowerText.includes('physics')) {
      return { domain: 'physics', subdiscipline: 'quantum-physics' };
    }
    if (lowerText.includes('sociology') || lowerText.includes('social')) {
      return { domain: 'sociology', subdiscipline: 'social-theory' };
    }
    if (lowerText.includes('medicine') || lowerText.includes('clinical') || lowerText.includes('medical')) {
      return { domain: 'medicine', subdiscipline: 'clinical-research' };
    }
    if (lowerText.includes('engineering') || lowerText.includes('mechanical')) {
      return { domain: 'engineering', subdiscipline: 'mechanical-engineering' };
    }
    
    return { domain: 'other' };
  }
}