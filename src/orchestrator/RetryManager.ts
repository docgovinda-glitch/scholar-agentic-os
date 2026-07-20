import type { RetryConfig } from "./types";

export interface RetryState {
  attempt: number;
  nextDelayMs: number;
  lastError: unknown;
}

export class RetryManager {
  private retryStates: Map<string, RetryState> = new Map();

  shouldRetry(
    error: unknown,
    executionId: string,
    config?: RetryConfig
  ): { retry: boolean; delayMs: number } {
    if (!config || config.maxRetries <= 0) {
      return { retry: false, delayMs: 0 };
    }

    const current = this.retryStates.get(executionId) ?? {
      attempt: 0,
      nextDelayMs: config.initialDelayMs,
      lastError: error,
    };

    if (current.attempt >= config.maxRetries) {
      this.retryStates.delete(executionId);
      return { retry: false, delayMs: 0 };
    }

    const errorStr = error instanceof Error ? error.message : String(error);
    if (
      config.retryOnErrors &&
      config.retryOnErrors.length > 0 &&
      !config.retryOnErrors.some((e) => errorStr.includes(e))
    ) {
      this.retryStates.delete(executionId);
      return { retry: false, delayMs: 0 };
    }

    current.attempt++;
    const delay = this.computeDelay(current.attempt, config);
    current.nextDelayMs = delay;
    current.lastError = error;
    this.retryStates.set(executionId, current);

    return { retry: true, delayMs: delay };
  }

  async wait(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (delayMs <= 0) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      }
    });
  }

  getRetryState(executionId: string): RetryState | undefined {
    return this.retryStates.get(executionId);
  }

  resetRetryState(executionId: string): void {
    this.retryStates.delete(executionId);
  }

  private computeDelay(attempt: number, config: RetryConfig): number {
    let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

    if (config.maxDelayMs) {
      delay = Math.min(delay, config.maxDelayMs);
    }

    if (config.jitter?.enabled) {
      const jitterRange = config.jitter.max - config.jitter.min;
      const jitter = Math.random() * jitterRange + config.jitter.min;
      delay = delay * (1 + jitter / 100);
    }

    return Math.round(delay);
  }
}
