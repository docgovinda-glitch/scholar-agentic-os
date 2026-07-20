/**
 * WritingKernel - Entry point for Writing Operating System
 */

import type { KnowledgeObject } from '../knowledge/types/KnowledgeObject';

export interface WritingKernelHealth {
  status: 'healthy' | 'degraded' | 'offline';
  services: Record<string, { status: string; latencyMs?: number }>;
}

export interface WritingKernelConfig {
  templates?: string[];
  defaultTemplate?: string;
  enableAIAssistance?: boolean;
}

export class WritingKernel {
  private static instance: WritingKernel | null = null;
  private config: WritingKernelConfig;
  private initialized = false;

  private constructor(config?: WritingKernelConfig) {
    this.config = config || {};
  }

  static getInstance(config?: WritingKernelConfig): WritingKernel {
    if (!WritingKernel.instance) {
      WritingKernel.instance = new WritingKernel(config);
    }
    return WritingKernel.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  health(): WritingKernelHealth {
    return {
      status: this.initialized ? 'healthy' : 'offline',
      services: {
        workspace: { status: this.initialized ? 'online' : 'offline' },
        outline: { status: this.initialized ? 'online' : 'offline' },
        citation: { status: this.initialized ? 'online' : 'offline' }
      }
    };
  }

  configuration(): WritingKernelConfig {
    return this.config;
  }

  async generateOutline(topic: string, template?: string): Promise<WritingOutline> {
    return {
      id: crypto.randomUUID(),
      title: topic,
      template: template || this.config.defaultTemplate || 'journal-article',
      sections: this._getDefaultOutline(template || 'journal-article'),
      createdAt: new Date().toISOString()
    };
  }

  private _getDefaultOutline(template: string): WritingSection[] {
    const sections: Record<string, string[]> = {
      'journal-article': ['Introduction', 'Literature Review', 'Methodology', 'Results', 'Discussion', 'Conclusion'],
      'thesis': ['Abstract', 'Introduction', 'Literature Review', 'Methodology', 'Findings', 'Conclusion', 'References']
    };
    return (sections[template] || sections['journal-article']).map((s, i) => ({
      id: `${i}`,
      title: s,
      content: '',
      order: i
    }));
  }
}

export interface WritingOutline {
  id: string;
  title: string;
  template: string;
  sections: WritingSection[];
  createdAt: string;
}

export interface WritingSection {
  id: string;
  title: string;
  content: string;
  order: number;
  references?: string[];
}