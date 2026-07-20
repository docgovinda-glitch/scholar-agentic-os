/**
 * Research Roadmap Generator
 * 
 * Generates research timeline and milestones.
 */

import type { ResearchTask } from '../types';

export interface ResearchMilestone {
  id: string;
  title: string;
  description: string;
  durationWeeks: number;
  dependencies: string[];
  deliverables: string[];
}

export interface ResearchRoadmap {
  milestones: ResearchMilestone[];
  totalDurationWeeks: number;
  estimatedCompletion: string;
}

export class RoadmapGenerator {
  private static instance: RoadmapGenerator;

  private constructor() {}

  static getInstance(): RoadmapGenerator {
    if (!RoadmapGenerator.instance) {
      RoadmapGenerator.instance = new RoadmapGenerator();
    }
    return RoadmapGenerator.instance;
  }

  /**
   * Generate a research roadmap from tasks
   */
  generate(tasks: ResearchTask[]): ResearchRoadmap {
    const milestones: ResearchMilestone[] = [];
    
    const taskMap = new Map<ResearchTask['type'], ResearchTask[]>();
    for (const task of tasks) {
      const existing = taskMap.get(task.type) || [];
      existing.push(task);
      taskMap.set(task.type, existing);
    }

    // Create milestones based on task types
    const phaseMap: Record<string, { weeks: number; title: string }> = {
      'literature-review': { weeks: 4, title: 'Literature Review' },
      'hypothesis-generation': { weeks: 2, title: 'Hypothesis Development' },
      'framework-analysis': { weeks: 3, title: 'Framework Development' },
      'methodology-design': { weeks: 4, title: 'Methodology Design' },
      'data-analysis': { weeks: 6, title: 'Data Collection & Analysis' },
      'manuscript-writing': { weeks: 4, title: 'Writing & Submission' }
    };

    let totalWeeks = 0;
    let prevId = '';

    for (const [type, taskList] of taskMap.entries()) {
      const phase = phaseMap[type];
      if (phase) {
        const milestone: ResearchMilestone = {
          id: `milestone-${milestones.length + 1}`,
          title: phase.title,
          description: `${taskList.length} ${type} tasks`,
          durationWeeks: phase.weeks,
          dependencies: prevId ? [prevId] : [],
          deliverables: taskList.map(t => t.description.substring(0, 50))
        };
        
        milestones.push(milestone);
        totalWeeks += phase.weeks;
        prevId = milestone.id;
      }
    }

    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + totalWeeks * 7);

    return {
      milestones,
      totalDurationWeeks: totalWeeks,
      estimatedCompletion: completionDate.toISOString()
    };
  }
}