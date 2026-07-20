/**
 * Methodology Advisor
 * 
 * Recommends research design and methodology approaches.
 */

export interface MethodologyRecommendation {
  approach: string;
  design: string;
  sampling: string;
  dataCollection: string;
  analysis: string;
  validity: string;
  reliability: string;
  ethics: string;
  rationale: string;
}

export class MethodologyAdvisor {
  private static instance: MethodologyAdvisor;

  private constructor() {}

  static getInstance(): MethodologyAdvisor {
    if (!MethodologyAdvisor.instance) {
      MethodologyAdvisor.instance = new MethodologyAdvisor();
    }
    return MethodologyAdvisor.instance;
  }

  /**
   * Recommend methodology for research
   */
  recommend(
    domain: string,
    hasHypothesis: boolean,
    dataAvailability: 'existing' | 'primary' | 'experimental'
  ): MethodologyRecommendation {
    const isQuantitative = this._isQuantitativeDomain(domain);
    
    return {
      approach: isQuantitative ? 'quantitative' : 'qualitative',
      design: hasHypothesis ? 'experimental' : 'exploratory',
      sampling: isQuantitative ? 'random' : 'purposive',
      dataCollection: dataAvailability === 'existing' ? 'secondary' : 'primary',
      analysis: isQuantitative ? 'statistical' : 'thematic',
      validity: 'triangulation',
      reliability: 'test-retest',
      ethics: 'irb-approved',
      rationale: `Recommended ${isQuantitative ? 'quantitative' : 'qualitative'} approach for ${domain}`
    };
  }

  private _isQuantitativeDomain(domain: string): boolean {
    const quantitativeDomains = [
      'computer-science',
      'economics',
      'psychology',
      'biology',
      'medicine',
      'engineering'
    ];
    return quantitativeDomains.includes(domain);
  }
}