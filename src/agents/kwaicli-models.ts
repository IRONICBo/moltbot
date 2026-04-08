import type { ModelDefinitionConfig } from "../config/types.models.js";

/**
 * KwaiCLI base configuration
 * Points to local proxy server that wraps the CLI
 */
export const KWAICLI_BASE_URL = "http://127.0.0.1:27849/v1";

/**
 * KwaiCLI model catalog
 * These models are available through the KwaiCLI subprocess
 */
export const KWAICLI_MODEL_CATALOG = [
  {
    id: "kwaicli-code-latest",
    name: "KwaiCLI Code Latest",
    description: "Latest coding model from KwaiCLI",
    reasoning: false,
    vision: false,
  },
  {
    id: "kwaicli-chat",
    name: "KwaiCLI Chat",
    description: "General purpose chat model",
    reasoning: false,
    vision: false,
  },
  {
    id: "kwaicli-vision",
    name: "KwaiCLI Vision",
    description: "Vision-capable model",
    reasoning: false,
    vision: true,
  },
] as const;

/**
 * Default KwaiCLI model configuration
 */
const KWAICLI_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const KWAICLI_DEFAULT_CONTEXT_WINDOW = 128000;
const KWAICLI_DEFAULT_MAX_TOKENS = 4096;

/**
 * Build model definition for KwaiCLI
 */
export function buildKwaiCLIModelDefinition(
  model: (typeof KWAICLI_MODEL_CATALOG)[number],
): ModelDefinitionConfig {
  return {
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    input: model.vision ? ["text", "image"] : ["text"],
    cost: KWAICLI_DEFAULT_COST,
    contextWindow: KWAICLI_DEFAULT_CONTEXT_WINDOW,
    maxTokens: KWAICLI_DEFAULT_MAX_TOKENS,
  };
}

/**
 * Discover available KwaiCLI models
 * This would check if kwaicli CLI is available and what models it supports
 */
export async function discoverKwaiCLIModels(): Promise<ModelDefinitionConfig[]> {
  // Skip discovery in test environments
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return [];
  }

  try {
    // For now, return the static catalog
    // In the future, this could query `kwaicli models` or similar
    return KWAICLI_MODEL_CATALOG.map(buildKwaiCLIModelDefinition);
  } catch (error) {
    console.warn(`Failed to discover KwaiCLI models: ${String(error)}`);
    return [];
  }
}

/**
 * Check if KwaiCLI is available on the system
 */
export async function isKwaiCLIAvailable(): Promise<boolean> {
  try {
    const { spawn } = await import("node:child_process");
    return new Promise((resolve) => {
      const child = spawn("kwaicli", ["--version"], {
        stdio: "ignore",
      });
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    });
  } catch {
    return false;
  }
}
