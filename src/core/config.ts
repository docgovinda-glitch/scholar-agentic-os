export interface AppConfig {
  appName: string;
  apiBaseUrl: string;
  enableDebugLogs: boolean;
}

export function getAppConfig(): AppConfig {
  return {
    appName: import.meta.env.VITE_APP_NAME || "Scholar Agentic OS",
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "",
    enableDebugLogs: import.meta.env.DEV,
  };
}

