/**
 * AI Infrastructure Errors
 * 
 * Typed error classes for AI infrastructure operations.
 */

// Base AI Error
export class AIError extends Error {
  public readonly code: string;
  public readonly provider?: string;
  public readonly cause?: Error;

  constructor(message: string, code: string, provider?: string, cause?: Error) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.provider = provider;
    this.cause = cause;
  }
}

// Authentication Error
export class AuthenticationError extends AIError {
  constructor(provider: string, message = 'Invalid or missing API key') {
    super(message, 'AUTH_ERROR', provider);
    this.name = 'AuthenticationError';
  }
}

// Quota Error
export class QuotaError extends AIError {
  public readonly dailyUsed?: number;
  public readonly dailyLimit?: number;

  constructor(
    provider: string, 
    dailyUsed?: number, 
    dailyLimit?: number,
    message = 'API quota exceeded'
  ) {
    super(message, 'QUOTA_ERROR', provider);
    this.name = 'QuotaError';
    this.dailyUsed = dailyUsed;
    this.dailyLimit = dailyLimit;
  }
}

// Timeout Error
export class TimeoutError extends AIError {
  public readonly timeoutMs: number;

  constructor(provider: string, timeoutMs: number, message = `Request timed out after ${timeoutMs}ms`) {
    super(message, 'TIMEOUT_ERROR', provider);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// Provider Offline Error
export class ProviderOfflineError extends AIError {
  constructor(provider: string, message = 'Provider is currently offline') {
    super(message, 'PROVIDER_OFFLINE', provider);
    this.name = 'ProviderOfflineError';
  }
}

// Invalid Model Error
export class InvalidModelError extends AIError {
  public readonly modelName: string;

  constructor(provider: string, modelName: string, message = `Model ${modelName} is not available`) {
    super(message, 'INVALID_MODEL', provider);
    this.name = 'InvalidModelError';
    this.modelName = modelName;
  }
}

// Invalid Configuration Error
export class InvalidConfigurationError extends AIError {
  constructor(provider: string, message = 'Invalid provider configuration') {
    super(message, 'INVALID_CONFIG', provider);
    this.name = 'InvalidConfigurationError';
  }
}

// Rate Limit Error
export class RateLimitError extends AIError {
  public readonly retryAfter?: number;

  constructor(provider: string, retryAfter?: number, message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT', provider);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

// Capability Missing Error
export class CapabilityMissingError extends AIError {
  public readonly capability: string;

  constructor(model: string, capability: string, message = `Model ${model} does not support ${capability}`) {
    super(message, 'CAPABILITY_MISSING', undefined);
    this.name = 'CapabilityMissingError';
    this.capability = capability;
  }
}

// Privacy Restriction Error
export class PrivacyRestrictionError extends AIError {
  constructor(message = 'Privacy restrictions prevent using this provider') {
    super(message, 'PRIVACY_RESTRICTION');
    this.name = 'PrivacyRestrictionError';
  }
}

// Hardware Limitation Error
export class HardwareLimitationError extends AIError {
  constructor(message = 'Hardware limitations prevent local AI execution') {
    super(message, 'HARDWARE_LIMITATION');
    this.name = 'HardwareLimitationError';
  }
}

// Error Type Guard
export function isAIAError(error: unknown): error is AIError {
  return error instanceof AIError;
}

// Error Handler
export function handleAIError(error: unknown): AIError {
  if (error instanceof AIError) {
    return error;
  }
  if (error instanceof Error) {
    return new AIError(error.message, 'UNKNOWN_ERROR', undefined, error);
  }
  return new AIError(String(error), 'UNKNOWN_ERROR');
}