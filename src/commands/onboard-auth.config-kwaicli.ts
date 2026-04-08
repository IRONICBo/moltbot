/**
 * KwaiCLI auth config helpers
 */

import type { OpenClawConfig } from "../config/config.js";
import {
  buildKwaiCLIModelDefinition,
  KWAICLI_BASE_URL,
  KWAICLI_DEFAULT_MODEL_ID,
} from "./onboard-auth.models-kwaicli.js";

export async function setKwaiCLIApiKey(apiKey: string, agentDir?: string): Promise<void> {
  const { resolveOpenClawAgentDir } = await import("../agents/agent-paths.js");
  const { upsertAuthProfile } = await import("../agents/auth-profiles.js");

  upsertAuthProfile({
    profileId: "kwaicli:default",
    credential: {
      type: "api_key",
      provider: "kwaicli",
      key: apiKey,
    },
    agentDir: agentDir ?? resolveOpenClawAgentDir(),
  });
}

export function applyKwaiCLIConfig(config: OpenClawConfig): OpenClawConfig {
  return {
    ...config,
    agents: {
      ...config.agents,
      defaults: {
        ...config.agents?.defaults,
        model: {
          ...(typeof config.agents?.defaults?.model === "object"
            ? config.agents.defaults.model
            : {}),
          primary: KWAICLI_DEFAULT_MODEL_ID,
        },
      },
    },
  };
}

export function applyKwaiCLIProviderConfig(config: OpenClawConfig): OpenClawConfig {
  const existingKwaiCLI = config.models?.providers?.kwaicli;
  const models =
    existingKwaiCLI && typeof existingKwaiCLI === "object" && "models" in existingKwaiCLI
      ? existingKwaiCLI.models
      : [];

  const hasDefault = Array.isArray(models)
    ? models.some((m) => m.id === KWAICLI_DEFAULT_MODEL_ID)
    : false;

  return {
    ...config,
    models: {
      ...config.models,
      providers: {
        ...config.models?.providers,
        kwaicli: {
          baseUrl: KWAICLI_BASE_URL,
          models: hasDefault
            ? models
            : [
                ...(Array.isArray(models) ? models : []),
                buildKwaiCLIModelDefinition(KWAICLI_DEFAULT_MODEL_ID),
              ],
        },
      },
    },
  };
}
