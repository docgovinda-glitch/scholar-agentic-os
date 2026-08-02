/**
 * Gate Evaluation Service — Stage 0 Instrumentation
 *
 * Provides telemetry-instrumented gate checking. Every gate evaluation
 * records whether it passed/failed for metrics collection.
 */

import telemetry from './telemetryService';
import type { SubmissionQualityGate } from '../types/submissionTypes';

/**
 * Evaluate a gate and record the result for telemetry
 * Returns true if gate passes, false otherwise
 */
export function evaluateGate(gate: SubmissionQualityGate, project: any): boolean {
  const passed = gate.check(project);

  telemetry.recordGateEvaluation(
    gate.id,
    gate.name,
    passed,
    {
      description: gate.description,
      severity: gate.severity,
      message: gate.message,
    }
  );

  return passed;
}

/**
 * Evaluate all gates and collect results with telemetry
 */
export function evaluateAllGates(
  gates: SubmissionQualityGate[],
  project: any
): Array<{ gate: SubmissionQualityGate; passed: boolean }> {
  return gates.map((gate) => ({
    gate,
    passed: evaluateGate(gate, project),
  }));
}

/**
 * Get a summary of which gates are blocking submission
 * Useful for the readiness view in document 13
 */
export function getBlockingGates(
  gates: SubmissionQualityGate[],
  project: any
): SubmissionQualityGate[] {
  return gates.filter((gate) => gate.severity === 'error' && !gate.check(project));
}
