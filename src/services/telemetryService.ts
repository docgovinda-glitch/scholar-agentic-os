/**
 * Telemetry Service — Stage 0 Instrumentation
 *
 * Records user actions and outcomes for product metrics:
 * - Onboarding funnel (registration → AI setup → vault → workspace)
 * - Gate hit rates (compliance gates evaluated and passed/failed)
 * - Output type engagement and completion
 * - Agent invocations and results
 *
 * Data is stored locally in IndexedDB; server sync is Stage 2+ work.
 * `[RECOMMENDATION]` Opt-in and locally inspectable per [20](./20-admin-platform.md).
 */

export type TelemetryEventType =
  | 'user:registration'
  | 'user:login'
  | 'onboarding:ai_setup_started'
  | 'onboarding:ai_setup_completed'
  | 'onboarding:ai_mode_selected'
  | 'onboarding:vault_started'
  | 'onboarding:vault_completed'
  | 'onboarding:vault_skipped'
  | 'onboarding:workspace_entered'
  | 'gate:evaluated'
  | 'gate:passed'
  | 'gate:failed'
  | 'output:created'
  | 'output:completed'
  | 'output:abandoned'
  | 'agent:invoked'
  | 'agent:completed'
  | 'agent:failed';

export interface TelemetryEvent {
  id: string;
  type: TelemetryEventType;
  timestamp: number;
  userId?: string;
  sessionId: string;
  data: Record<string, any>;
}

export interface TelemetryMetrics {
  onboarding: {
    registrations: number;
    ai_setups_started: number;
    ai_setups_completed: number;
    vault_skipped: number;
    workspace_entries: number;
    funnel_completion_rate: number;
  };
  gates: {
    evaluations_total: number;
    passes: number;
    failures: number;
    by_gate_id: Record<string, { evaluations: number; passes: number; failures: number }>;
  };
}

class TelemetryService {
  private static instance: TelemetryService;
  private events: TelemetryEvent[] = [];
  private sessionId: string;
  private storageKey = 'scholar_telemetry_events';
  private metricsKey = 'scholar_telemetry_metrics';
  private maxEvents = 5000;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.loadFromStorage();
  }

  static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  private generateSessionId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record a telemetry event with optional context data
   */
  record(type: TelemetryEventType, data: Record<string, any> = {}): void {
    const event: TelemetryEvent = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data,
    };

    this.events.push(event);

    // Trim to max size, keeping newest events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Persist to localStorage
    this.saveToStorage();
  }

  /**
   * Record a gate evaluation (most important for validating R-01 wedge)
   */
  recordGateEvaluation(gateId: string, gateName: string, passed: boolean, data?: Record<string, any>): void {
    this.record('gate:evaluated', {
      gate_id: gateId,
      gate_name: gateName,
      passed,
      ...data,
    });

    if (passed) {
      this.record('gate:passed', { gate_id: gateId, gate_name: gateName });
    } else {
      this.record('gate:failed', { gate_id: gateId, gate_name: gateName });
    }
  }

  /**
   * Record onboarding step
   */
  recordOnboardingStep(step: 'registration' | 'ai_setup' | 'vault' | 'workspace', action: 'started' | 'completed' | 'skipped', data?: Record<string, any>): void {
    const eventType = `onboarding:${step}_${action}` as TelemetryEventType;
    this.record(eventType, { step, action, ...data });
  }

  /**
   * Record output type engagement
   */
  recordOutputEvent(outputType: string, action: 'created' | 'completed' | 'abandoned', data?: Record<string, any>): void {
    const eventType = `output:${action}` as TelemetryEventType;
    this.record(eventType, { output_type: outputType, ...data });
  }

  /**
   * Record agent invocation
   */
  recordAgentInvocation(agentName: string, success: boolean, data?: Record<string, any>): void {
    const eventType = success ? 'agent:completed' : 'agent:failed';
    this.record(eventType, { agent_name: agentName, ...data });
  }

  /**
   * Get all recorded events (for debugging/export)
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  /**
   * Get metrics summary
   */
  getMetrics(): TelemetryMetrics {
    const metrics: TelemetryMetrics = {
      onboarding: {
        registrations: this.countByType('user:registration'),
        ai_setups_started: this.countByType('onboarding:ai_setup_started'),
        ai_setups_completed: this.countByType('onboarding:ai_setup_completed'),
        vault_skipped: this.countByType('onboarding:vault_skipped'),
        workspace_entries: this.countByType('onboarding:workspace_entered'),
        funnel_completion_rate: 0,
      },
      gates: {
        evaluations_total: this.countByType('gate:evaluated'),
        passes: this.countByType('gate:passed'),
        failures: this.countByType('gate:failed'),
        by_gate_id: {},
      },
    };

    // Calculate gate breakdown
    const gateEvents = this.events.filter((e) => e.type === 'gate:evaluated');
    for (const event of gateEvents) {
      const gateId = event.data.gate_id || 'unknown';
      if (!metrics.gates.by_gate_id[gateId]) {
        metrics.gates.by_gate_id[gateId] = { evaluations: 0, passes: 0, failures: 0 };
      }
      metrics.gates.by_gate_id[gateId].evaluations++;
      if (event.data.passed) {
        metrics.gates.by_gate_id[gateId].passes++;
      } else {
        metrics.gates.by_gate_id[gateId].failures++;
      }
    }

    // Calculate funnel completion
    if (metrics.onboarding.registrations > 0) {
      metrics.onboarding.funnel_completion_rate =
        metrics.onboarding.workspace_entries / metrics.onboarding.registrations;
    }

    return metrics;
  }

  /**
   * Export events as JSON for admin platform or analysis
   */
  exportEvents(): string {
    return JSON.stringify({
      session_id: this.sessionId,
      events: this.events,
      metrics: this.getMetrics(),
      exported_at: new Date().toISOString(),
    }, null, 2);
  }

  /**
   * Clear all recorded events
   */
  clear(): void {
    this.events = [];
    this.saveToStorage();
  }

  // Private helpers

  private countByType(type: TelemetryEventType): number {
    return this.events.filter((e) => e.type === type).length;
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(this.events));
      }
    } catch (err) {
      console.warn('Failed to save telemetry to localStorage:', err);
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          this.events = JSON.parse(stored);
        }
      }
    } catch (err) {
      console.warn('Failed to load telemetry from localStorage:', err);
    }
  }
}

export default TelemetryService.getInstance();
