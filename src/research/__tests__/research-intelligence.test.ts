/**
 * Research Intelligence Tests
 */

import { describe, it, expect } from 'vitest';
import { ResearchIntelligenceEngine } from '../ResearchIntelligenceEngine';
import { IntentAnalyzer } from '../analyzers/IntentAnalyzer';
import { EntityExtractor } from '../analyzers/EntityExtractor';
import { DisciplineClassifier } from '../analyzers/DisciplineClassifier';

describe('Research Intelligence', () => {
  describe('ResearchIntelligenceEngine', () => {
    it('should create a project', () => {
      const engine = ResearchIntelligenceEngine.getInstance();
      const project = engine.createProject('Test Project', 'A test research project', 'computer-science');
      
      expect(project.id).toBeDefined();
      expect(project.title).toBe('Test Project');
      expect(project.domain).toBe('computer-science');
    });

    it('should retrieve a project', () => {
      const engine = ResearchIntelligenceEngine.getInstance();
      const project = engine.createProject('Test Project 2', 'Another test', 'biology');
      
      const retrieved = engine.getProject(project.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Test Project 2');
    });
  });

  describe('IntentAnalyzer', () => {
    it('should detect literature review intent', async () => {
      const analyzer = IntentAnalyzer.getInstance();
      const intent = await analyzer.analyze('I need a literature review on machine learning');
      expect(intent).toBe('literature-review');
    });

    it('should detect hypothesis generation intent', async () => {
      const analyzer = IntentAnalyzer.getInstance();
      const intent = await analyzer.analyze('Generate a hypothesis for my study');
      expect(intent).toBe('hypothesis-generation');
    });
  });

  describe('EntityExtractor', () => {
    it('should extract entities from text', () => {
      const extractor = EntityExtractor.getInstance();
      const entities = extractor.extract('Game Theory is used in neural network research');
      
      expect(entities.length).toBeGreaterThan(0);
      expect(entities.some(e => e.type === 'concept')).toBe(true);
    });
  });

  describe('DisciplineClassifier', () => {
    it('should classify computer science', () => {
      const classifier = DisciplineClassifier.getInstance();
      const result = classifier.classify('machine learning and artificial intelligence');
      
      expect(result.domain).toBe('computer-science');
    });

    it('should classify science', () => {
      const classifier = DisciplineClassifier.getInstance();
      const result = classifier.classify('quantum physics theory');
      
      expect(result.domain).toBe('physics');
    });
  });
});