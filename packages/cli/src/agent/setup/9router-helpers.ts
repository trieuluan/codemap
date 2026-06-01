import { execSync, spawn } from "node:child_process";

// ── Constants ─────────────────────────────────────────────────────────

export const NINE_ROUTER_LOCAL_PORT = 20128;
export const NINE_ROUTER_LOCAL_BASE_URL = `http://localhost:${NINE_ROUTER_LOCAL_PORT}/v1`;

// ── Types ─────────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  data: ModelInfo[];
  object: string;
}

// ── Model fetching ────────────────────────────────────────────────────

export async function fetchModels(
  baseUrl: string,
  apiKey?: string,
): Promise<ModelInfo[]> {
  const url = `${baseUrl}/models`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as ModelsResponse;
    return data.data || [];
  } catch {
    return [];
  }
}

// ── 9router helpers ───────────────────────────────────────────────────

export function is9RouterInstalled(): boolean {
  try {
    execSync("which 9router", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function install9Router(): Promise<void> {
  execSync("npm install -g 9router", { stdio: "inherit" });
}

export async function is9RouterRunning(): Promise<boolean> {
  try {
    await fetch(`http://localhost:${NINE_ROUTER_LOCAL_PORT}/v1/models`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return true;
  } catch {
    return false;
  }
}

export function start9Router(): void {
  const child = spawn("9router", ["--port", String(NINE_ROUTER_LOCAL_PORT)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
