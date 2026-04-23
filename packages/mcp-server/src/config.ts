export type McpServerConfig = {
  apiUrl: string | null;
  apiToken: string | null;
};

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function loadConfig(): McpServerConfig {
  return {
    apiUrl: readOptionalEnv("API_URL"),
    apiToken: readOptionalEnv("API_TOKEN"),
  };
}
