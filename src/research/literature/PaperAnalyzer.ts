/**
 * Paper Analyzer
 * 
 * Analyzes academic papers and extracts key information.
 */

import type { ExtractedEntity } from '../types';
import { AIKernel } from '../../ai/core/AIKernel';

export interface PaperAnalysis {
  title: string;
  abstract: string;
  keywords: string[];
  entities: ExtractedEntity[];
  summary: string;
  methodology?: string;
  findings?: string;
  limitations?: string;
}

export class PaperAnalyzer {
  private static instance: PaperAnalyzer;
  private kernel: AIKernel;

  private constructor() {
    this.kernel = AIKernel.getInstance();
  }

  static getInstance(): PaperAnalyzer {
    if (!PaperAnalyzer.instance) {
      PaperAnalyzer.instance = new PaperAnalyzer();
    }
    return PaperAnalyzer.instance;
  }

  /**
   * Analyze a paper's text
   */
  async analyze(text: string): Promise<PaperAnalysis> {
    // Extract title (first line or heading)
    const titleMatch = text.match(/^# ([^\n]+)/m) || text.match(/^(.{1,200})\n\n/);
    const title = titleMatch ? titleMatch[1] : 'Unknown';

    // Extract abstract
    const abstractMatch = text.match(/## Abstract\s*\n([\s\S]*?)(?=\n##|$)/i);
    const abstract = abstractMatch ? abstractMatch[1].trim() : '';

    // Extract keywords
    const keywordsMatch = text.match(/## Keywords?\s*\n([\s\S]*?)(?=\n##|$)/i);
    const keywords = keywordsMatch 
      ? keywordsMatch[1].split(/,|\n/).map(k => k.trim()).filter(k => k)
      : [];

    // Generate summary through AI
    const summary = await this._generateSummary(text);

    return {
      title,
      abstract,
      keywords,
      entities: this._extractEntities(text),
      summary,
      methodology: this._extractMethodology(text),
      findings: this._extractFindings(text),
      limitations: this._extractLimitations(text)
    };
  }

  private async _generateSummary(text: string): Promise<string> {
    try {
      const truncated = text.substring(0, 4000);
      // Would use AIKernel.generate for actual summary
      return `Summary of ${text.length} characters`;
    } catch {
      return 'Unable to generate summary';
    }
  }

  private _extractEntities(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    
    // Extract methods
    const methodPatterns = [
      /\b(quantitative|qualitative|experimental|theoretical|simulation)\s+(study|analysis|research)\b/gi,
      /\b(survey|interview|regression|experiment|case study)\b/gi
    ];
    
    for (const pattern of methodPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        entities.push({ type: 'method', value: match[0].toLowerCase(), confidence: 0.6 });
      }
    }

    return [...new Set(entities.map(e => JSON.stringify(e)))].map(s => JSON.parse(s));
  }

  private _extractMethodology(text: string): string | undefined {
    const methodMatch = text.match(/## (Method|Methodology)\s*\n([\s\S]*?)(?=\n##|$)/i);
    return methodMatch ? methodMatch[2].trim().substring(0, 500) : undefined;
  }

  private _extractFindings(text: string): string | undefined {
    const findingsMatch = text.match(/## (Results|Findings)\s*\n([\s\S]*?)(?=\n##|$)/i);
    return findingsMatch ? findingsMatch[2].trim().substring(0, 500) : undefined;
  }

  private _extractLimitations(text: string): string | undefined {
    const limitMatch = text.match(/## (Limitations|Constraints)\s*\n([\s\S]*?)(?=\n##|$)/i);
    return limitMatch ? limitMatch[2].trim().substring(0, 300) : undefined;
  }
}