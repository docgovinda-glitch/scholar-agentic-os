export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const fallbackLogger: Logger = {
  debug: (...args: unknown[]) => console.debug(...args),
  info: (...args: unknown[]) => console.info(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

export function createLogger(scope = "app"): Logger {
  const prefix = `[${scope}]`;
  return {
    debug: (...args: unknown[]) => fallbackLogger.debug(prefix, ...args),
    info: (...args: unknown[]) => fallbackLogger.info(prefix, ...args),
    warn: (...args: unknown[]) => fallbackLogger.warn(prefix, ...args),
    error: (...args: unknown[]) => fallbackLogger.error(prefix, ...args),
  };
}

export const logger = createLogger("ScholarOS");

